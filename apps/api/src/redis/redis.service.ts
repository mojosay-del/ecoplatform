import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import Redis from "ioredis";
import type { Redis as RedisClient } from "ioredis";

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: RedisClient | null = null;
  private warnedUnavailable = false;

  get isConfigured(): boolean {
    return Boolean(process.env.REDIS_URL);
  }

  get isReady(): boolean {
    return this.client?.status === "ready";
  }

  get status(): string {
    return this.client?.status ?? "not_configured";
  }

  async onModuleInit() {
    const url = process.env.REDIS_URL;
    if (!url) return;

    this.client = new Redis(url, {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      connectTimeout: 1_000,
      commandTimeout: 1_000,
      retryStrategy: (times) => Math.min(times * 100, 2_000),
    });

    this.client.on("ready", () => {
      this.warnedUnavailable = false;
      this.logger.log("Redis connected.");
    });
    this.client.on("close", () => {
      this.logger.warn("Redis connection closed. Falling back to direct DB/in-memory paths until it reconnects.");
    });
    this.client.on("error", (error) => {
      if (!this.warnedUnavailable) {
        this.warnedUnavailable = true;
        this.logger.warn(`Redis unavailable: ${error.message}`);
      }
    });

    void this.client.connect().catch((error) => {
      this.warnedUnavailable = true;
      this.logger.warn(`Redis initial connection failed: ${messageOf(error)}. Fallback mode is active.`);
    });
  }

  async onModuleDestroy() {
    if (!this.client) return;
    if (this.client.status !== "ready") {
      this.client.disconnect();
      return;
    }
    try {
      await this.client.quit();
    } catch {
      this.client.disconnect();
    }
  }

  getClient(): RedisClient | null {
    return this.isReady ? this.client : null;
  }

  async getJson<T>(key: string): Promise<T | null> {
    const value = await this.safe((client) => client.get(key), null);
    if (!value) return null;
    try {
      return JSON.parse(value) as T;
    } catch {
      await this.del(key);
      return null;
    }
  }

  async setJson(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    await this.safe((client) => client.set(key, JSON.stringify(value), "EX", ttlSeconds), undefined);
  }

  async del(...keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    await this.safe((client) => client.del(...keys), undefined);
  }

  async sadd(key: string, members: string[], ttlSeconds: number): Promise<void> {
    if (members.length === 0) return;
    await this.safe(async (client) => {
      await client.sadd(key, ...members);
      await client.expire(key, ttlSeconds);
    }, undefined);
  }

  async smembers(key: string): Promise<string[]> {
    return this.safe((client) => client.smembers(key), []);
  }

  async ping(): Promise<string | null> {
    return this.safe((client) => client.ping(), null);
  }

  private async safe<T>(operation: (client: RedisClient) => Promise<T>, fallback: T): Promise<T> {
    const client = this.getClient();
    if (!client) return fallback;
    try {
      return await operation(client);
    } catch (error) {
      if (!this.warnedUnavailable) {
        this.warnedUnavailable = true;
        this.logger.warn(`Redis command failed: ${messageOf(error)}. Fallback mode is active.`);
      }
      return fallback;
    }
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
