import type { Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { PrismaService } from "../prisma/prisma.service";

export const CRON_LOCK_TRANSACTION_TIMEOUT_MS = 15 * 60 * 1000;

type AdvisoryLockRow = {
  ok: boolean;
};

export async function runWithPostgresAdvisoryLock(
  prisma: PrismaService,
  logger: Pick<Logger, "debug">,
  lockKey: string,
  task: (tx: Prisma.TransactionClient) => Promise<unknown>,
): Promise<boolean> {
  return prisma.$transaction(
    async (tx) => {
      const [lock] = await tx.$queryRaw<AdvisoryLockRow[]>`
        SELECT pg_try_advisory_xact_lock(hashtext(${lockKey})) AS ok
      `;

      if (!lock?.ok) {
        logger.debug(`Cron lock "${lockKey}" is already held; skipping tick`);
        return false;
      }

      await task(tx);
      return true;
    },
    { maxWait: 5_000, timeout: CRON_LOCK_TRANSACTION_TIMEOUT_MS },
  );
}
