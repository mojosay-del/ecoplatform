import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { manualSubscriptionDtoSchema } from "@ecoplatform/shared";
import { CurrentUser } from "../common/current-user.decorator";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { Roles } from "../common/roles.decorator";
import { RolesGuard } from "../common/roles.guard";
import type { RequestUser } from "../common/request-user";
import { parseBody } from "../common/zod";
import { BillingService } from "./billing.service";

@UseGuards(JwtAuthGuard)
@Controller()
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get("billing/status")
  async ownStatus(@CurrentUser() user: RequestUser) {
    return this.billing.getOwnStatus(user.companyId!);
  }

  @UseGuards(RolesGuard)
  @Roles("admin")
  @Get("admin/billing/companies")
  async companies() {
    return this.billing.listCompanies();
  }

  @UseGuards(RolesGuard)
  @Roles("admin")
  @Post("admin/billing/manual-subscriptions")
  async activate(@Body() body: unknown, @CurrentUser() user: RequestUser) {
    const input = parseBody(manualSubscriptionDtoSchema, body);
    return this.billing.activateManually(input, user.id);
  }
}
