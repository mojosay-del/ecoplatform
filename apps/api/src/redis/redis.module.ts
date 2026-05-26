import { Global, Module } from "@nestjs/common";
import { RedisThrottlerStorageService } from "./redis-throttler-storage.service";
import { RedisService } from "./redis.service";
import { SessionCacheService } from "./session-cache.service";

@Global()
@Module({
  providers: [RedisService, RedisThrottlerStorageService, SessionCacheService],
  exports: [RedisService, RedisThrottlerStorageService, SessionCacheService],
})
export class RedisModule {}
