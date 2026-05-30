import { BadRequestException, Injectable, Logger, Optional } from "@nestjs/common";
import { createHash } from "crypto";
import { MIN_PASSWORD_LENGTH } from "@ecoplatform/shared";
import { PlatformSettingsService } from "../admin/settings/platform-settings.service";

const PWNED_PASSWORDS_RANGE_URL = "https://api.pwnedpasswords.com/range";
const PWNED_PASSWORDS_TIMEOUT_MS = 1500;
const PWNED_PASSWORDS_CACHE_TTL_MS = 60 * 60 * 1000;

type CachedRange = {
  expiresAt: number;
  counts: Map<string, number>;
};

@Injectable()
export class PasswordPolicyService {
  private readonly logger = new Logger(PasswordPolicyService.name);
  private readonly rangeCache = new Map<string, CachedRange>();

  // settings опционален: в рантайме внедряется глобальный модуль настроек,
  // а юнит-тесты создают сервис как `new PasswordPolicyService()`.
  constructor(@Optional() private readonly settings?: PlatformSettingsService) {}

  async assertAcceptablePassword(password: string): Promise<void> {
    if (password.length < MIN_PASSWORD_LENGTH) {
      throw new BadRequestException(`Пароль должен быть не короче ${MIN_PASSWORD_LENGTH} символов.`);
    }

    if (await this.isPwnedPassword(password)) {
      throw new BadRequestException("Этот пароль найден в базе утекших паролей. Выберите другой пароль.");
    }
  }

  private async isPwnedPassword(password: string): Promise<boolean> {
    // Жёсткий kill-switch для офлайна/интеграционных тестов.
    if (process.env.PWNED_PASSWORDS_CHECK_ENABLED === "0") {
      return false;
    }
    // Тумблер из админки (Настройки → Безопасность). `?? true` — поведение по
    // умолчанию (проверка включена), в т.ч. когда settings не внедрён в тестах.
    const checkEnabled = (await this.settings?.getValue("security.pwned_check_enabled")) ?? true;
    if (!checkEnabled) {
      return false;
    }

    const hash = createHash("sha1").update(password, "utf8").digest("hex").toUpperCase();
    const prefix = hash.slice(0, 5);
    const suffix = hash.slice(5);
    const range = await this.loadRange(prefix);
    if (!range) {
      return false;
    }
    return (range.get(suffix) ?? 0) > 0;
  }

  private async loadRange(prefix: string): Promise<Map<string, number> | null> {
    const cached = this.rangeCache.get(prefix);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.counts;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs());
    try {
      const response = await fetch(`${this.endpointUrl()}/${prefix}`, {
        method: "GET",
        headers: {
          "Add-Padding": "true",
          "User-Agent": process.env.PWNED_PASSWORDS_USER_AGENT ?? "EcoPlatform/1.0",
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        this.logger.warn(`Pwned Passwords API вернул ${response.status}; проверка пароля пропущена.`);
        return null;
      }

      const counts = this.parseRangeResponse(await response.text());
      this.rangeCache.set(prefix, {
        counts,
        expiresAt: Date.now() + PWNED_PASSWORDS_CACHE_TTL_MS,
      });
      return counts;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Не удалось проверить пароль через Pwned Passwords: ${message}`);
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  private parseRangeResponse(body: string): Map<string, number> {
    const counts = new Map<string, number>();
    for (const line of body.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }

      const [suffix, countRaw] = trimmed.split(":");
      if (!suffix || countRaw === undefined) {
        continue;
      }

      const count = Number.parseInt(countRaw, 10);
      if (Number.isFinite(count)) {
        counts.set(suffix.toUpperCase(), count);
      }
    }
    return counts;
  }

  private endpointUrl(): string {
    return (process.env.PWNED_PASSWORDS_RANGE_URL ?? PWNED_PASSWORDS_RANGE_URL).replace(/\/+$/, "");
  }

  private timeoutMs(): number {
    const raw = Number(process.env.PWNED_PASSWORDS_TIMEOUT_MS);
    return Number.isFinite(raw) && raw > 0 ? raw : PWNED_PASSWORDS_TIMEOUT_MS;
  }
}
