import { Injectable } from "@nestjs/common";
import type { RequestUser } from "../common/request-user";
import { RedisService } from "./redis.service";

const SESSION_TTL_SECONDS = 60;
const SESSION_PREFIX = "auth:session:";
const USER_SESSIONS_PREFIX = "auth:user-sessions:";
const COMPANY_SESSIONS_PREFIX = "auth:company-sessions:";

@Injectable()
export class SessionCacheService {
  constructor(private readonly redis: RedisService) {}

  async get(sessionId: string): Promise<RequestUser | null> {
    return this.redis.getJson<RequestUser>(sessionKey(sessionId));
  }

  async set(user: RequestUser): Promise<void> {
    await this.redis.setJson(sessionKey(user.sessionId), user, SESSION_TTL_SECONDS);
    await this.redis.sadd(userSessionsKey(user.id), [user.sessionId], SESSION_TTL_SECONDS);
    if (user.companyId) {
      await this.redis.sadd(companySessionsKey(user.companyId), [user.sessionId], SESSION_TTL_SECONDS);
    }
  }

  async invalidateSession(sessionId: string): Promise<void> {
    await this.redis.del(sessionKey(sessionId));
  }

  async invalidateUser(userId: string): Promise<void> {
    const key = userSessionsKey(userId);
    const sessionIds = await this.redis.smembers(key);
    await this.redis.del(...sessionIds.map(sessionKey), key);
  }

  async invalidateCompany(companyId: string): Promise<void> {
    const key = companySessionsKey(companyId);
    const sessionIds = await this.redis.smembers(key);
    await this.redis.del(...sessionIds.map(sessionKey), key);
  }
}

function sessionKey(sessionId: string): string {
  return `${SESSION_PREFIX}${sessionId}`;
}

function userSessionsKey(userId: string): string {
  return `${USER_SESSIONS_PREFIX}${userId}`;
}

function companySessionsKey(companyId: string): string {
  return `${COMPANY_SESSIONS_PREFIX}${companyId}`;
}
