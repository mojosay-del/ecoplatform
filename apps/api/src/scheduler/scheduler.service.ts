import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { Prisma } from "@prisma/client";
import { BillingNotificationsService } from "../billing/billing-notifications.service";
import { FilesService } from "../files/files.service";
import { VideoTranscodeService } from "../files/video-transcode.service";
import { ForumNudgeService } from "../forum/forum-nudge.service";
import { MarketplaceListingsService } from "../marketplace/services/marketplace-listings.service";
import { MarketplaceOffersService } from "../marketplace/services/marketplace-offers.service";
import { PrismaService } from "../prisma/prisma.service";
import {
  cleanupDeletedAccountsInTransaction as cleanupDeletedAccountsInTransactionHelper,
  cleanupExpiredAccountContactChangeChallenges as cleanupExpiredAccountContactChangeChallengesHelper,
  cleanupExpiredEmailChallenges as cleanupExpiredEmailChallengesHelper,
  cleanupExpiredSessions as cleanupExpiredSessionsHelper,
  cleanupOrphanAddresses as cleanupOrphanAddressesHelper,
  cleanupOrphanFiles as cleanupOrphanFilesHelper,
  cleanupStaleAdminActionLogs as cleanupStaleAdminActionLogsHelper,
  cleanupStaleIdempotencyKeys as cleanupStaleIdempotencyKeysHelper,
  cleanupStaleInAppNotifications as cleanupStaleInAppNotificationsHelper,
  cleanupStaleNotificationDeliveries as cleanupStaleNotificationDeliveriesHelper,
  type AccountDeletionCleanupResult,
} from "./scheduler-cleanup.helpers";
import { runWithPostgresAdvisoryLock as runWithPostgresAdvisoryLockHelper } from "./scheduler-lock.helpers";

const BILLING_HOURLY_LOCK_KEY = "cron:billing-hourly-check";
const ACCOUNT_DELETION_CLEANUP_LOCK_KEY = "cron:cleanup-deleted-accounts";
const ORPHAN_FILE_CLEANUP_LOCK_KEY = "cron:cleanup-orphan-files";
const EMAIL_CHALLENGE_CLEANUP_LOCK_KEY = "cron:cleanup-email-challenges";
const STALE_RECORD_CLEANUP_LOCK_KEY = "cron:cleanup-stale-records";
const MARKETPLACE_ARCHIVE_LOCK_KEY = "cron:marketplace-archive-expired";
const MARKETPLACE_OFFER_RESOLVE_LOCK_KEY = "cron:marketplace-resolve-offers";
const FORUM_UNANSWERED_LOCK_KEY = "cron:forum-unanswered-nudge";

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
    private readonly forumNudge: ForumNudgeService,
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

  // Пинг контент-менеджерам/админам о вопросах форума без ответа дольше 24 ч.
  // Раз в час под advisory-lock; дедуп — на уровне createInApp (domainEventId).
  @Cron(CronExpression.EVERY_HOUR, { name: "forum-unanswered-nudge" })
  async handleForumUnansweredNudge() {
    if (this.disabled) return;
    try {
      await this.runWithPostgresAdvisoryLock(FORUM_UNANSWERED_LOCK_KEY, () => this.forumNudge.notifyStaleUnanswered());
    } catch (error) {
      this.logger.error("Forum unanswered nudge failed", error as Error);
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
   * ВСЕ виды ссылок (FileReference + структурированные поля вроде обложек,
   * вложений, файлов документации, медиа объявлений и аватаров) и физически
   * стирает объект из S3 только если на файл реально никто не ссылается.
   * Поэтому фильтр `references: none` здесь — лишь дешёвый предотбор
   * кандидатов, а не финальное решение: добавление новых типов ссылок
   * в будущем не приведёт к потере нужных файлов.
   */
  async cleanupOrphanFiles(now = new Date()): Promise<{ scanned: number; deleted: number }> {
    return cleanupOrphanFilesHelper(this.prisma, this.files, this.logger, now);
  }

  @Cron("0 4 * * *", { name: "cleanup-email-challenges" })
  async handleEmailChallengeCleanup() {
    if (this.disabled) return;
    try {
      await this.runWithPostgresAdvisoryLock(EMAIL_CHALLENGE_CLEANUP_LOCK_KEY, async () => {
        await this.cleanupExpiredEmailChallenges();
        await this.cleanupExpiredAccountContactChangeChallenges();
      });
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
   * Грейс — сутки. Фильтр по `expiresAt` опирается на существующий индекс
   * `@@index([expiresAt])`.
   */
  async cleanupExpiredEmailChallenges(now = new Date()): Promise<{ deleted: number }> {
    return cleanupExpiredEmailChallengesHelper(this.prisma, this.logger, now);
  }

  async cleanupExpiredAccountContactChangeChallenges(now = new Date()): Promise<{ deleted: number }> {
    return cleanupExpiredAccountContactChangeChallengesHelper(this.prisma, this.logger, now);
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
   * логин. Грейс — неделя, фильтр опирается на `@@index([expiresAt])`.
   * Отозванные, но ещё не истёкшие сессии удалятся этим же кроном после
   * своего `expiresAt`.
   */
  async cleanupExpiredSessions(now = new Date()): Promise<{ deleted: number }> {
    return cleanupExpiredSessionsHelper(this.prisma, this.logger, now);
  }

  /**
   * Удаляет отработавшие ключи идемпотентности: окно повторной обработки
   * запроса давно прошло, через 30 дней ключ бесполезен. Фильтр опирается на
   * `@@index([createdAt])`.
   */
  async cleanupStaleIdempotencyKeys(now = new Date()): Promise<{ deleted: number }> {
    return cleanupStaleIdempotencyKeysHelper(this.prisma, this.logger, now);
  }

  /**
   * Удаляет старые записи журнала доставки нотификаций: к 90 дням все доставки
   * терминальные (delivered/failed/dead_lettered). Связанные InAppNotification
   * не теряются — FK `onDelete: SetNull` лишь обнулит ссылку `deliveryId`.
   * Фильтр опирается на `@@index([createdAt])`.
   */
  async cleanupStaleNotificationDeliveries(now = new Date()): Promise<{ deleted: number }> {
    return cleanupStaleNotificationDeliveriesHelper(this.prisma, this.logger, now);
  }

  /**
   * Удаляет старые пользовательские уведомления, которые уже не требуют
   * внимания: прочитаны или отправлены в архив больше 180 дней назад. Активные
   * непрочитанные уведомления, даже старые, остаются видимыми пользователю.
   */
  async cleanupStaleInAppNotifications(now = new Date()): Promise<{ deleted: number }> {
    return cleanupStaleInAppNotificationsHelper(this.prisma, this.logger, now);
  }

  /**
   * Удаляет старые записи admin audit log. Два года оставляют запас для
   * расследований и клиентских вопросов, но ограничивают бесконечный рост
   * append-only таблицы.
   */
  async cleanupStaleAdminActionLogs(now = new Date()): Promise<{ deleted: number }> {
    return cleanupStaleAdminActionLogsHelper(this.prisma, this.logger, now);
  }

  /**
   * Удаляет Address без владельца: не фактический/юридический адрес компании и
   * не адрес-снимок объявления. Такие строки остаются после каскадного удаления
   * объявлений или замены/отвязки адресов и дальше никем не используются.
   */
  async cleanupOrphanAddresses(): Promise<{ deleted: number }> {
    return cleanupOrphanAddressesHelper(this.prisma, this.logger);
  }

  private async cleanupDeletedAccountsInTransaction(
    tx: Prisma.TransactionClient,
    now: Date,
  ): Promise<AccountDeletionCleanupResult> {
    return cleanupDeletedAccountsInTransactionHelper(tx, now);
  }

  private async runWithPostgresAdvisoryLock(
    lockKey: string,
    task: (tx: Prisma.TransactionClient) => Promise<unknown>,
  ): Promise<boolean> {
    return runWithPostgresAdvisoryLockHelper(this.prisma, this.logger, lockKey, task);
  }
}
