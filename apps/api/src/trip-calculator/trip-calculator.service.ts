import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  tripCalculatorSettingsSchema,
  type TripCalculatorSettings,
  type TripCalculatorSettingsGetResponse,
} from "@ecoplatform/shared";
import { assertCompanyTypeIn } from "../common/access-policy";
import { PrismaService } from "../prisma/prisma.service";
import type { RequestUser } from "../common/request-user";

@Injectable()
export class TripCalculatorService {
  constructor(private readonly prisma: PrismaService) {}

  // Калькулятор рейса — инструмент заготовителя, данные привязаны к компании.
  // Поэтому нужен collector с companyId. Платформенный персонал компании не
  // имеет — для него калькулятор недоступен (пункт меню виден, данных нет).
  // Возвращает companyId для скоупинга запроса.
  private assertCollector(user: RequestUser): string {
    return assertCompanyTypeIn(user, ["collector"], "Калькулятор доступен только компаниям-заготовителям.");
  }

  async getSettings(user: RequestUser): Promise<TripCalculatorSettingsGetResponse> {
    const companyId = this.assertCollector(user);
    const row = await this.prisma.companyTripCalculatorSettings.findUnique({ where: { companyId } });
    if (!row) return { settings: null };
    // Старые записи валидируем мягко: при рассинхроне схемы отдаём null (клиент
    // подставит дефолты), а не 500. Данные писались этой же схемой, так что в
    // норме parse проходит.
    const parsed = tripCalculatorSettingsSchema.safeParse(row.data);
    return { settings: parsed.success ? parsed.data : null };
  }

  async saveSettings(user: RequestUser, input: TripCalculatorSettings): Promise<TripCalculatorSettings> {
    const companyId = this.assertCollector(user);
    const data = input as unknown as Prisma.InputJsonValue;
    const row = await this.prisma.companyTripCalculatorSettings.upsert({
      where: { companyId },
      create: { companyId, data },
      update: { data },
    });
    return tripCalculatorSettingsSchema.parse(row.data);
  }
}
