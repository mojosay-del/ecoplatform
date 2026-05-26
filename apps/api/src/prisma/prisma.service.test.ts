import { describe, expect, it } from "vitest";

import { prismaClientOptions, withPrismaConnectionLimit } from "./prisma.service";

describe("PrismaService production options", () => {
  it("adds the default connection limit without dropping existing URL params", () => {
    const result = withPrismaConnectionLimit(
      "postgresql://user:pass@db.example.com:6432/ecoplatform?schema=public&sslmode=require",
    );

    expect(result).toBeDefined();
    const parsed = new URL(result!);
    expect(parsed.searchParams.get("schema")).toBe("public");
    expect(parsed.searchParams.get("sslmode")).toBe("require");
    expect(parsed.searchParams.get("connection_limit")).toBe("20");
  });

  it("keeps an explicit connection limit from DATABASE_URL", () => {
    const result = withPrismaConnectionLimit(
      "postgresql://user:pass@db.example.com:6432/ecoplatform?schema=public&connection_limit=8",
    );

    expect(new URL(result!).searchParams.get("connection_limit")).toBe("8");
  });

  it("configures Prisma Client with minimal errors and production-safe logs", () => {
    const options = prismaClientOptions({
      DATABASE_URL: "postgresql://user:pass@db.example.com:6432/ecoplatform?schema=public",
    } as NodeJS.ProcessEnv);

    expect(options.errorFormat).toBe("minimal");
    expect(options.log).toEqual(["warn", "error"]);
    expect(options.datasources?.db?.url).toContain("connection_limit=20");
  });
});
