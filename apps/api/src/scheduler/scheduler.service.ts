import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { CompanyStatus, Prisma } from "@prisma/client";
import { BillingNotificationsService } from "../billing/billing-notifications.service";
import { FilesService } from "../files/files.service";
import { PrismaService } from "../prisma/prisma.service";

const BILLING_HOURLY_LOCK_KEY = "cron:billing-hourly-check";
const ACCOUNT_DELETION_CLEANUP_LOCK_KEY = "cron:cleanup-deleted-accounts";
const ORPHAN_FILE_CLEANUP_LOCK_KEY = "cron:cleanup-orphan-files";
const CRON_LOCK_TRANSACTION_TIMEOUT_MS = 15 * 60 * 1000;
const ACCOUNT_DELETION_GRACE_MS = 30 * 24 * 60 * 60 * 1000;
const ACCOUNT_DELETION_BATCH_SIZE = 500;
// Файл считается «осиротевшим» только спустя сутки после загрузки — грейс
// защищает свежие незавершённые черновики (залили картинку, ещё не сохранили).
const ORPHAN_FILE_GRACE_MS = 24 * 60 * 60 * 1000;
// За один прогон чистим ограниченную пачку: проверка ссылок на файл тяжёлая
// (сканирует payload всех блоков), а задача суточная — backlog растворится за
// несколько дней без риска упереться в таймаут lock-транзакции.
const ORPHAN_FILE_BATCH_SIZE = 100;

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
 *  - ночью удаляются осиротевшие загрузки (файлы без единой ссылки).
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
  ) {}

  private get disabled(): boolean {
    return process.env.SCHEDULER_DISABLED === "1";
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
   * созданные больше суток назад. Это файлы, которые залили в редактор, но
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
