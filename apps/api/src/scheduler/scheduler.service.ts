import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { CompanyStatus, Prisma } from "@prisma/client";
import { BillingNotificationsService } from "../billing/billing-notifications.service";
import { FilesService } from "../files/files.service";
import { VideoTranscodeService } from "../files/video-transcode.service";
import { MarketplaceListingsService } from "../marketplace/services/marketplace-listings.service";
import { MarketplaceOffersService } from "../marketplace/services/marketplace-offers.service";
import { PrismaService } from "../prisma/prisma.service";

const BILLING_HOURLY_LOCK_KEY = "cron:billing-hourly-check";
const ACCOUNT_DELETION_CLEANUP_LOCK_KEY = "cron:cleanup-deleted-accounts";
const ORPHAN_FILE_CLEANUP_LOCK_KEY = "cron:cleanup-orphan-files";
const EMAIL_CHALLENGE_CLEANUP_LOCK_KEY = "cron:cleanup-email-challenges";
const STALE_RECORD_CLEANUP_LOCK_KEY = "cron:cleanup-stale-records";
const MARKETPLACE_ARCHIVE_LOCK_KEY = "cron:marketplace-archive-expired";
const MARKETPLACE_OFFER_RESOLVE_LOCK_KEY = "cron:marketplace-resolve-offers";
const CRON_LOCK_TRANSACTION_TIMEOUT_MS = 15 * 60 * 1000;
// Регистрационный challenge хранит хэш пароля + ПДн (телефон, ФИО, тип компании)
// до подтверждения кода. После истечения (TTL 15 минут) или успешной верификации
// эти данные больше не нужны: они либо «мёртвые», либо уже перенесены в созданного
// User со своим собственным passwordHash. Держим сутки про запас (поддержка,
// отладка спорных регистраций), затем физически удаляем — минимизация ПДн по
// 152-ФЗ и защита таблицы от бесконечного роста.
const EMAIL_CHALLENGE_RETENTION_MS = 24 * 60 * 60 * 1000;
const ACCOUNT_DELETION_GRACE_MS = 30 * 24 * 60 * 60 * 1000;
const ACCOUNT_DELETION_BATCH_SIZE = 500;
// Файл считается «осиротевшим» только спустя неделю после загрузки — большой
// грейс защищает незавершённые черновики, над которыми работают подолгу
// (залили картинку, но ещё не сохранили урок/статью в эту сессию).
const ORPHAN_FILE_GRACE_MS = 7 * 24 * 60 * 60 * 1000;
// За один прогон чистим ограниченную пачку: проверка ссылок на файл тяжёлая
// (сканирует payload всех блоков), а задача суточная — backlog растворится за
// несколько дней без риска упереться в таймаут lock-транзакции.
const ORPHAN_FILE_BATCH_SIZE = 100;
// Ретеншен «копящихся» таблиц (крон cleanup-stale-records, ночью в 02:00).
// Эти таблицы росли без ограничений — храним разумное окно и физически удаляем.
//  - Session: после expiresAt refresh-токен мёртв; держим неделю про запас.
const SESSION_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
//  - IdempotencyKey: окно повторной обработки запроса давно прошло (30 дней).
const IDEMPOTENCY_KEY_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
//  - NotificationDelivery: к 90 дням все доставки терминальные; связанные
//    InAppNotification не теряются (FK onDelete: SetNull лишь обнулит ссылку).
const NOTIFICATION_DELIVERY_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
//  - AdminActionLog: журнал нужен для расследований и аудита, но не должен
//    расти бесконечно; храним два года.
const ADMIN_ACTION_LOG_RETENTION_MS = 730 * 24 * 60 * 60 * 1000;
//  - InAppNotification: непрочитанные активные уведомления не трогаем, старые
//    прочитанные/архивные удаляем через полгода.
const IN_APP_NOTIFICATION_RETENTION_MS = 180 * 24 * 60 * 60 * 1000;

type AdvisoryLockRow = {
  ok: boolean;
};

type AccountDeletionCandidate = {
  id: string;
  companyId: string | null;
};

type AccountDeletionCleanupResult = {
  deletedUsers: number;
  deletedCompanies: number;
};

/**
 * Координатор регулярных фоновых задач:
 *  - раз в час BillingNotificationsService проверяет компании и шлёт
 *    уведомления о скором/случившемся истечении демо и подписки;
 *  - ночью чистятся аккаунты, прошедшие грейс удаления;
 *  - ночью удаляются осиротевшие загрузки (файлы без единой ссылки);
 *  - ночью удаляются отработавшие регистрационные challenge (хэш пароля + ПДн);
 *  - ночью чистятся «копящиеся» таблицы: истёкшие сессии, старые ключи
 *    идемпотентности, журналы действий/нотификаций и осиротевшие адреса
 *    (cleanup-stale-records).
 *
 * Запуск задач можно полностью отключить переменной SCHEDULER_DISABLED=1
 * (актуально для integration-тестов — для биллинг-логики используется
 * прямой вызов runHourlyCheck() с подменённым `now`).
 */
@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    private readonly billing: BillingNotificationsService,
    private readonly prisma: PrismaService,
    private readonly files: FilesService,
    private readonly videoTranscode: VideoTranscodeService,
    private readonly marketplace: MarketplaceListingsService,
    private readonly marketplaceOffers: MarketplaceOffersService,
  ) {}

  private get disabled(): boolean {
    return process.env.SCHEDULER_DISABLED === "1";
  }

  // Подбираем видео, не успевшие перекодироваться (упал процесс/был занят
  // транскодер при загрузке). Сам сервис гонит ffmpeg строго по одному (running),
  // поэтому отдельный advisory-lock не нужен на единственном инстансе API.
  @Cron(CronExpression.EVERY_5_MINUTES, { name: "process-video-renditions" })
  async handleVideoRenditions() {
    if (this.disabled) return;
    try {
      await this.videoTranscode.processPending();
    } catch (error) {
      this.logger.error("Video renditions processing failed", error as Error);
    }
  }

  @Cron(CronExpression.EVERY_HOUR, { name: "billing-hourly-check" })
  async handleHourlyBillingCheck() {
    if (this.disabled) return;
    try {
      await this.runWithPostgresAdvisoryLock(BILLING_HOURLY_LOCK_KEY, () => this.billing.runHourlyCheck());
    } catch (error) {
      this.logger.error("Hourly billing check failed", error as Error);
    }
  }

  // Авто-архив объявлений торговой площадки: активные с истёкшим сроком (14
  // дней) переводятся в archived. Раз в час достаточно — задержка до часа после
  // истечения некритична. Под advisory-lock: вторая реплика пропустит tick.
  @Cron(CronExpression.EVERY_HOUR, { name: "marketplace-archive-expired" })
  async handleListingAutoArchive() {
    if (this.disabled) return;
    try {
      await this.runWithPostgresAdvisoryLock(MARKETPLACE_ARCHIVE_LOCK_KEY, async () => {
        const count = await this.marketplace.archiveExpired();
        if (count > 0) {
          this.logger.log(`Marketplace auto-archive: archived ${count} expired listings`);
        }
      });
    } catch (error) {
      this.logger.error("Marketplace listing auto-archive failed", error as Error);
    }
  }

  // Авто-разрешение принятых предложений без решения за 24ч: объявление в архив
  // (not_settled), предложения закрываются. Раз в час под advisory-lock.
  @Cron(CronExpression.EVERY_HOUR, { name: "marketplace-resolve-offers" })
  async handleOfferAutoResolve() {
    if (this.disabled) return;
    try {
      await this.runWithPostgresAdvisoryLock(MARKETPLACE_OFFER_RESOLVE_LOCK_KEY, async () => {
        const count = await this.marketplaceOffers.autoResolveExpiredAcceptances();
        if (count > 0) {
          this.logger.log(`Marketplace offer auto-resolve: resolved ${count} expired acceptances`);
        }
      });
    } catch (error) {
      this.logger.error("Marketplace offer auto-resolve failed", error as Error);
    }
  }

  @Cron("0 3 * * *", { name: "cleanup-deleted-accounts" })
  async handleAccountDeletionCleanup() {
    if (this.disabled) return;
    try {
      await this.runWithPostgresAdvisoryLock(ACCOUNT_DELETION_CLEANUP_LOCK_KEY, (tx) =>
        this.cleanupDeletedAccountsInTransaction(tx, new Date()),
      );
    } catch (error) {
      this.logger.error("Account deletion cleanup failed", error as Error);
    }
  }

  async cleanupDeletedAccounts(now = new Date()): Promise<AccountDeletionCleanupResult> {
    return this.prisma.$transaction((tx) => this.cleanupDeletedAccountsInTransaction(tx, now));
  }

  @Cron("30 3 * * *", { name: "cleanup-orphan-files" })
  async handleOrphanFileCleanup() {
    if (this.disabled) return;
    try {
      // Advisory lock держится до конца прогона: вторая реплика просто
      // пропустит свой tick и не будет удалять те же файлы параллельно.
      await this.runWithPostgresAdvisoryLock(ORPHAN_FILE_CLEANUP_LOCK_KEY, () => this.cleanupOrphanFiles());
    } catch (error) {
      this.logger.error("Orphan file cleanup failed", error as Error);
    }
  }

  /**
   * Удаляет «осиротевшие» загрузки — FileAsset без единой FileReference,
   * созданные больше недели назад. Это файлы, которые залили в редактор, но
   * так и не сохранили в контент (закрыли черновик): ссылок на них нет и
   * больше не появится, поэтому штатные триггеры удаления (замена обложки,
   * правка блоков, удаление сущности) их не трогают.
   *
   * Делегируем удаление в files.deleteIfUnreferenced: он ещё раз перепроверяет
   * ВСЕ виды ссылок (FileReference + обложки/вложения + payload блоков) и
   * физически стирает объект из S3 только если на файл реально никто не
   * ссылается. Поэтому фильтр `references: none` здесь — лишь дешёвый
   * предотбор кандидатов, а не финальное решение: добавление новых типов
   * ссылок в будущем не приведёт к потере нужных файлов.
   */
  async cleanupOrphanFiles(now = new Date()): Promise<{ scanned: number; deleted: number }> {
    const cutoff = new Date(now.getTime() - ORPHAN_FILE_GRACE_MS);
    const candidates = await this.prisma.fileAsset.findMany({
      where: { createdAt: { lt: cutoff }, references: { none: {} } },
      select: { id: true },
      orderBy: { createdAt: "asc" },
      take: ORPHAN_FILE_BATCH_SIZE,
    });

    if (candidates.length === 0) {
      return { scanned: 0, deleted: 0 };
    }

    const deleted = await this.files.deleteIfUnreferenced(candidates.map((candidate) => candidate.id));
    this.logger.log(`Orphan file cleanup: scanned ${candidates.length}, deleted ${deleted}`);
    return { scanned: candidates.length, deleted };
  }

  @Cron("0 4 * * *", { name: "cleanup-email-challenges" })
  async handleEmailChallengeCleanup() {
    if (this.disabled) return;
    try {
      await this.runWithPostgresAdvisoryLock(EMAIL_CHALLENGE_CLEANUP_LOCK_KEY, () =>
        this.cleanupExpiredEmailChallenges(),
      );
    } catch (error) {
      this.logger.error("Email challenge cleanup failed", error as Error);
    }
  }

  /**
   * Физически удаляет отработавшие EmailVerificationChallenge: записи, чей
   * `expiresAt` старше суток. Под этот фильтр попадают все три «мёртвых»
   * случая, потому что TTL challenge — всего 15 минут:
   *  - неподтверждённые просроченные (код так и не ввели);
   *  - вытесненные новой попыткой регистрации (их expiresAt принудительно
   *    выставляется в момент вытеснения);
   *  - успешно верифицированные (verifiedAt проставлен, данные уже в User).
   *
   * Сутки грейса задаёт `EMAIL_CHALLENGE_RETENTION_MS`. Фильтр по `expiresAt`
   * опирается на существующий индекс `@@index([expiresAt])`.
   */
  async cleanupExpiredEmailChallenges(now = new Date()): Promise<{ deleted: number }> {
    const cutoff = new Date(now.getTime() - EMAIL_CHALLENGE_RETENTION_MS);
    const { count } = await this.prisma.emailVerificationChallenge.deleteMany({
      where: { expiresAt: { lt: cutoff } },
    });

    if (count > 0) {
      this.logger.log(`Email challenge cleanup: deleted ${count} expired/verified challenges`);
    }
    return { deleted: count };
  }

  @Cron("0 2 * * *", { name: "cleanup-stale-records" })
  async handleStaleRecordCleanup() {
    if (this.disabled) return;
    try {
      // Все удаления под одним advisory lock: вторая реплика пропустит tick.
      await this.runWithPostgresAdvisoryLock(STALE_RECORD_CLEANUP_LOCK_KEY, async () => {
        await this.cleanupExpiredSessions();
        await this.cleanupStaleIdempotencyKeys();
        await this.cleanupStaleNotificationDeliveries();
        await this.cleanupStaleInAppNotifications();
        await this.cleanupStaleAdminActionLogs();
        await this.cleanupOrphanAddresses();
      });
    } catch (error) {
      this.logger.error("Stale record cleanup failed", error as Error);
    }
  }

  /**
   * Удаляет истёкшие сессии: после `expiresAt` refresh-токен мёртв, строка
   * нужна лишь как недавний след выхода. Без очистки таблица растёт на каждый
   * логин. Грейс — неделя (`SESSION_RETENTION_MS`), фильтр опирается на
   * `@@index([expiresAt])`. Отозванные, но ещё не истёкшие сессии удалятся
   * этим же кроном после своего `expiresAt`.
   */
  async cleanupExpiredSessions(now = new Date()): Promise<{ deleted: number }> {
    const cutoff = new Date(now.getTime() - SESSION_RETENTION_MS);
    const { count } = await this.prisma.session.deleteMany({
      where: { expiresAt: { lt: cutoff } },
    });
    if (count > 0) {
      this.logger.log(`Session cleanup: deleted ${count} expired sessions`);
    }
    return { deleted: count };
  }

  /**
   * Удаляет отработавшие ключи идемпотентности: окно повторной обработки
   * запроса давно прошло, через 30 дней (`IDEMPOTENCY_KEY_RETENTION_MS`) ключ
   * бесполезен. Фильтр опирается на `@@index([createdAt])`.
   */
  async cleanupStaleIdempotencyKeys(now = new Date()): Promise<{ deleted: number }> {
    const cutoff = new Date(now.getTime() - IDEMPOTENCY_KEY_RETENTION_MS);
    const { count } = await this.prisma.idempotencyKey.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    if (count > 0) {
      this.logger.log(`Idempotency key cleanup: deleted ${count} stale keys`);
    }
    return { deleted: count };
  }

  /**
   * Удаляет старые записи журнала доставки нотификаций: к 90 дням
   * (`NOTIFICATION_DELIVERY_RETENTION_MS`) все доставки терминальные
   * (delivered/failed/dead_lettered). Связанные InAppNotification не теряются —
   * FK `onDelete: SetNull` лишь обнулит ссылку `deliveryId`. Фильтр опирается
   * на `@@index([createdAt])`.
   */
  async cleanupStaleNotificationDeliveries(now = new Date()): Promise<{ deleted: number }> {
    const cutoff = new Date(now.getTime() - NOTIFICATION_DELIVERY_RETENTION_MS);
    const { count } = await this.prisma.notificationDelivery.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    if (count > 0) {
      this.logger.log(`Notification delivery cleanup: deleted ${count} old deliveries`);
    }
    return { deleted: count };
  }

  /**
   * Удаляет старые пользовательские уведомления, которые уже не требуют
   * внимания: прочитаны или отправлены в архив больше 180 дней назад. Активные
   * непрочитанные уведомления, даже старые, остаются видимыми пользователю.
   */
  async cleanupStaleInAppNotifications(now = new Date()): Promise<{ deleted: number }> {
    const cutoff = new Date(now.getTime() - IN_APP_NOTIFICATION_RETENTION_MS);
    const { count } = await this.prisma.inAppNotification.deleteMany({
      where: {
        OR: [{ readAt: { lt: cutoff } }, { archivedAt: { lt: cutoff } }],
      },
    });
    if (count > 0) {
      this.logger.log(`In-app notification cleanup: deleted ${count} old read/archived notifications`);
    }
    return { deleted: count };
  }

  /**
   * Удаляет старые записи admin audit log. Два года оставляют запас для
   * расследований и клиентских вопросов, но ограничивают бесконечный рост
   * append-only таблицы.
   */
  async cleanupStaleAdminActionLogs(now = new Date()): Promise<{ deleted: number }> {
    const cutoff = new Date(now.getTime() - ADMIN_ACTION_LOG_RETENTION_MS);
    const { count } = await this.prisma.adminActionLog.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    if (count > 0) {
      this.logger.log(`Admin action log cleanup: deleted ${count} old entries`);
    }
    return { deleted: count };
  }

  /**
   * Удаляет Address без владельца: не фактический/юридический адрес компании и
   * не адрес-снимок объявления. Такие строки остаются после каскадного удаления
   * объявлений или замены/отвязки адресов и дальше никем не используются.
   */
  async cleanupOrphanAddresses(): Promise<{ deleted: number }> {
    const { count } = await this.prisma.address.deleteMany({
      where: {
        companyAsFactual: { is: null },
        companyAsLegal: { is: null },
        marketplaceListing: { is: null },
      },
    });
    if (count > 0) {
      this.logger.log(`Address cleanup: deleted ${count} orphan addresses`);
    }
    return { deleted: count };
  }

  private async cleanupDeletedAccountsInTransaction(
    tx: Prisma.TransactionClient,
    now: Date,
  ): Promise<AccountDeletionCleanupResult> {
    const cutoff = new Date(now.getTime() - ACCOUNT_DELETION_GRACE_MS);
    // Row lock закрывает гонку с одновременной отменой удаления аккаунта.
    const candidates = await tx.$queryRaw<AccountDeletionCandidate[]>`
      SELECT id, "companyId"
      FROM "User"
      WHERE "deletionRequestedAt" < ${cutoff}
      ORDER BY "deletionRequestedAt" ASC
      LIMIT ${ACCOUNT_DELETION_BATCH_SIZE}
      FOR UPDATE
    `;

    if (candidates.length === 0) {
      return { deletedUsers: 0, deletedCompanies: 0 };
    }

    const userIds = candidates.map((user) => user.id);
    const companyIds = Array.from(new Set(candidates.map((user) => user.companyId).filter(Boolean))) as string[];

    // Удаляем только неиспользуемые FileAsset metadata. Если файл уже
    // привязан к опубликованному контенту через FileReference, связь с
    // пользователем уйдёт при delete User, а сам публичный контент не сломаем.
    await tx.fileAsset.deleteMany({
      where: {
        uploadedById: { in: userIds },
        references: { none: {} },
      },
    });

    const deletedUsers = await tx.user.deleteMany({ where: { id: { in: userIds } } });
    let deletedCompanies = 0;

    for (const companyId of companyIds) {
      const company = await tx.company.findUnique({
        where: { id: companyId },
        select: {
          status: true,
          statusBeforeDeletion: true,
          factualAddressId: true,
          structuredLegalAddressId: true,
        },
      });
      const remainingUsers = await tx.user.count({ where: { companyId } });
      const remainingPendingUsers = await tx.user.count({
        where: { companyId, deletionRequestedAt: { not: null } },
      });

      if (!company) continue;

      if (remainingUsers === 0) {
        const detachedAddressIds = [company.factualAddressId, company.structuredLegalAddressId].filter(
          (id): id is string => Boolean(id),
        );
        const deleted = await tx.company.deleteMany({
          where: { id: companyId, status: CompanyStatus.pending_deletion },
        });
        if (deleted.count > 0 && detachedAddressIds.length > 0) {
          await tx.address.deleteMany({ where: { id: { in: detachedAddressIds } } });
        }
        deletedCompanies += deleted.count;
        continue;
      }

      if (company.status === CompanyStatus.pending_deletion && remainingPendingUsers === 0) {
        await tx.company.update({
          where: { id: companyId },
          data: {
            status: company.statusBeforeDeletion ?? CompanyStatus.demo,
            statusBeforeDeletion: null,
          },
        });
      }
    }

    return { deletedUsers: deletedUsers.count, deletedCompanies };
  }

  private async runWithPostgresAdvisoryLock(
    lockKey: string,
    task: (tx: Prisma.TransactionClient) => Promise<unknown>,
  ): Promise<boolean> {
    return this.prisma.$transaction(
      async (tx) => {
        const [lock] = await tx.$queryRaw<AdvisoryLockRow[]>`
          SELECT pg_try_advisory_xact_lock(hashtext(${lockKey})) AS ok
        `;

        if (!lock?.ok) {
          this.logger.debug(`Cron lock "${lockKey}" is already held; skipping tick`);
          return false;
        }

        await task(tx);
        return true;
      },
      { maxWait: 5_000, timeout: CRON_LOCK_TRANSACTION_TIMEOUT_MS },
    );
  }
}
