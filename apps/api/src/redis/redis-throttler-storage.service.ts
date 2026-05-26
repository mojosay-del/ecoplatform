import { Injectable } from "@nestjs/common";
import { ThrottlerStorageService, type ThrottlerStorage } from "@nestjs/throttler";
import { RedisService } from "./redis.service";

type ThrottlerStorageRecord = Awaited<ReturnType<ThrottlerStorage["increment"]>>;

const RATE_LIMIT_LUA = `
local hitsKey = KEYS[1]
local blockKey = KEYS[2]
local ttl = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
local blockDuration = tonumber(ARGV[3])

local blocked = redis.call("EXISTS", blockKey)
if blocked == 1 then
  local total = tonumber(redis.call("GET", hitsKey) or "0")
  local ttlMs = redis.call("PTTL", hitsKey)
  local blockTtlMs = redis.call("PTTL", blockKey)
  if ttlMs < 0 then ttlMs = 0 end
  if blockTtlMs < 0 then blockTtlMs = 0 end
  return { total, math.ceil(ttlMs / 1000), 1, math.ceil(blockTtlMs / 1000) }
end

local total = redis.call("INCR", hitsKey)
local ttlMs = redis.call("PTTL", hitsKey)
if ttlMs < 0 then
  redis.call("PEXPIRE", hitsKey, ttl)
  ttlMs = ttl
end

if total > limit then
  redis.call("SET", blockKey, "1", "PX", blockDuration)
  return { total, math.ceil(ttlMs / 1000), 1, math.ceil(blockDuration / 1000) }
end

return { total, math.ceil(ttlMs / 1000), 0, 0 }
`;

@Injectable()
export class RedisThrottlerStorageService implements ThrottlerStorage {
  private readonly fallback = new ThrottlerStorageService();

  constructor(private readonly redis: RedisService) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const client = this.redis.getClient();
    if (!client) {
      return this.fallback.increment(key, ttl, limit, blockDuration, throttlerName);
    }

    try {
      const redisKey = `throttle:${throttlerName}:${key}`;
      const raw = (await client.eval(
        RATE_LIMIT_LUA,
        2,
        redisKey,
        `${redisKey}:blocked`,
        String(ttl),
        String(limit),
        String(blockDuration),
      )) as Array<number | string>;
      const [totalHits = 0, timeToExpire = 0, isBlocked = 0, timeToBlockExpire = 0] = raw.map(Number);

      return {
        totalHits,
        timeToExpire,
        isBlocked: isBlocked === 1,
        timeToBlockExpire,
      };
    } catch {
      return this.fallback.increment(key, ttl, limit, blockDuration, throttlerName);
    }
  }
}
