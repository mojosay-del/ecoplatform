import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../common/jwt-auth.guard";
import { Roles } from "../../common/roles.decorator";
import { RolesGuard } from "../../common/roles.guard";
import { parseBody } from "../../common/zod";
import { adminJournalsQuerySchema } from "./admin-journals.schemas";
import { AdminJournalsService } from "./admin-journals.service";

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("admin")
@Controller("admin/journals")
export class AdminJournalsController {
  constructor(private readonly service: AdminJournalsService) {}

  @Get()
  async list(@Query() query: Record<string, string>) {
    return this.service.listEntries(parseBody(adminJournalsQuerySchema, query));
  }
}
