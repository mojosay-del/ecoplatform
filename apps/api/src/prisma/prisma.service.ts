import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Prisma, PrismaClient } from "@prisma/client";
import { observePrismaQueryDuration } from "../observability/metrics.registry";

const DEFAULT_CONNECTION_LIMIT = 20;

export function withPrismaConnectionLimit(databaseUrl: string | undefined, limit = DEFAULT_CONNECTION_LIMIT) {
  if (!databaseUrl) {
    return undefined;
  }

  try {
    const url = new URL(databaseUrl);
    if (!url.searchParams.has("connection_limit")) {
      url.searchParams.set("connection_limit", String(limit));
    }
    return url.toString();
  } catch {
    return databaseUrl;
  }
}

export function prismaClientOptions(env: NodeJS.ProcessEnv = process.env): Prisma.PrismaClientOptions {
  const databaseUrl = withPrismaConnectionLimit(env.DATABASE_URL);

  return {
    errorFormat: "minimal",
    log: [{ emit: "event", level: "query" }, "warn", "error"],
    ...(databaseUrl ? { datasources: { db: { url: databaseUrl } } } : {}),
  };
}

type PrismaClientWithQueryEvents = PrismaClient<{
  log: [{ emit: "event"; level: "query" }];
}>;

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super(prismaClientOptions());
    (this as unknown as PrismaClientWithQueryEvents).$on("query", (event) => {
      observePrismaQueryDuration(event.duration, event.target);
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
