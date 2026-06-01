import { Body, Controller, ForbiddenException, Get, Headers, Patch, Post, Query, UseGuards } from "@nestjs/common";
import {
  companyProfileUpdateDtoSchema,
  manualSubscriptionDtoSchema,
  selfSubscriptionDtoSchema,
} from "@ecoplatform/shared";
import { CurrentUser } from "../common/current-user.decorator";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { Roles } from "../common/roles.decorator";
import { RolesGuard } from "../common/roles.guard";
import type { RequestUser } from "../common/request-user";
import { parseBody } from "../common/zod";
import { adminBillingCompaniesQuerySchema } from "./billing.schemas";
import { BillingService } from "./billing.service";

@UseGuards(JwtAuthGuard)
@Controller()
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get("billing/status")
  async ownStatus(@CurrentUser() user: RequestUser) {
    // У платформенного стаффа companyId=null. Раньше тут был non-null assertion
    // и запрос падал 500-кой; теперь возвращаем 403 с понятным сообщением.
    if (!user.companyId) {
      throw new ForbiddenException("Биллинг доступен только пользователям компаний.");
    }
    return this.billing.getOwnStatus(user.companyId);
  }

  @Patch("billing/company")
  async updateCompanyProfile(@CurrentUser() user: RequestUser, @Body() body: unknown) {
    if (!user.companyId) {
      throw new ForbiddenException("Профиль компании доступен только пользователям компаний.");
    }
    const input = parseBody(companyProfileUpdateDtoSchema, body);
    return this.billing.updateOwnProfile(user.companyId, input);
  }

  @Post("billing/subscriptions")
  async activateOwnSubscription(
    @Body() body: unknown,
    @CurrentUser() user: RequestUser,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
  ) {
    if (!user.companyId) {
      throw new ForbiddenException("Подписка доступна только пользователям компаний.");
    }
    const input = parseBody(selfSubscriptionDtoSchema, body);
    return this.billing.activateSelf(input, user.id, user.companyId, idempotencyKey);
  }

  @UseGuards(RolesGuard)
  @Roles("admin")
  @Get("admin/billing/companies")
  async companies(@Query() query: Record<string, string>) {
    return this.billing.listCompanies(parseBody(adminBillingCompaniesQuerySchema, query));
  }

  @UseGuards(RolesGuard)
  @Roles("admin")
  @Post("admin/billing/manual-subscriptions")
  async activate(
    @Body() body: unknown,
    @CurrentUser() user: RequestUser,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
  ) {
    const input = parseBody(manualSubscriptionDtoSchema, body);
    return this.billing.activateManually(input, user.id, idempotencyKey);
  }
}
