import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../common/current-user.decorator";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { Roles } from "../common/roles.decorator";
import { RolesGuard } from "../common/roles.guard";
import type { RequestUser } from "../common/request-user";
import { parseBody } from "../common/zod";
import {
  adminContentListQuerySchema,
  nomenclatureInputSchema,
  nomenclatureMoveInputSchema,
  nomenclatureUpdateInputSchema,
  priceIndexInputSchema,
  priceIndexValueInputSchema,
  publicContentListQuerySchema,
} from "./content.schemas";
import { IndicesService } from "./services/indices.service";

@UseGuards(JwtAuthGuard)
@Controller()
export class ContentIndicesController {
  constructor(private readonly indices: IndicesService) {}

  @Get("indices")
  async indicesList(@CurrentUser() user: RequestUser, @Query() query: Record<string, unknown>) {
    return this.indices.listIndices(user, parseBody(publicContentListQuerySchema, query));
  }

  @UseGuards(RolesGuard)
  @Roles("admin", "content_manager")
  @Get("admin/content/indices")
  async adminIndices(@Query() query: Record<string, unknown>) {
    return this.indices.adminListIndices(parseBody(adminContentListQuerySchema, query));
  }

  @UseGuards(RolesGuard)
  @Roles("admin")
  @Post("admin/content/indices/nomenclature")
  async createNomenclature(@Body() body: unknown, @CurrentUser() user: RequestUser) {
    return this.indices.createNomenclature(parseBody(nomenclatureInputSchema, body), user);
  }

  @UseGuards(RolesGuard)
  @Roles("admin")
  @Patch("admin/content/indices/nomenclature/:id/move")
  async moveNomenclature(@Param("id") id: string, @Body() body: unknown, @CurrentUser() user: RequestUser) {
    return this.indices.moveNomenclature(id, parseBody(nomenclatureMoveInputSchema, body), user);
  }

  @UseGuards(RolesGuard)
  @Roles("admin")
  @Patch("admin/content/indices/nomenclature/:id")
  async updateNomenclature(@Param("id") id: string, @Body() body: unknown, @CurrentUser() user: RequestUser) {
    return this.indices.updateNomenclature(id, parseBody(nomenclatureUpdateInputSchema, body), user);
  }

  @UseGuards(RolesGuard)
  @Roles("admin")
  @Delete("admin/content/indices/nomenclature/:id")
  async deleteNomenclature(
    @Param("id") id: string,
    @Body() body: { reason?: string } | undefined,
    @CurrentUser() user: RequestUser,
  ) {
    return this.indices.deleteNomenclature(id, user, body?.reason);
  }

  @UseGuards(RolesGuard)
  @Roles("admin", "content_manager")
  @Post("admin/content/indices")
  async createPriceIndex(@Body() body: unknown, @CurrentUser() user: RequestUser) {
    return this.indices.createPriceIndex(parseBody(priceIndexInputSchema, body), user);
  }

  @UseGuards(RolesGuard)
  @Roles("admin", "content_manager")
  @Post("admin/content/indices/:id/values")
  async addPriceValue(@Param("id") id: string, @Body() body: unknown, @CurrentUser() user: RequestUser) {
    return this.indices.addPriceValue(id, parseBody(priceIndexValueInputSchema, body), user);
  }

  @UseGuards(RolesGuard)
  @Roles("admin", "content_manager")
  @Delete("admin/content/indices/:id/values/:valueId")
  async deletePriceValue(@Param("id") id: string, @Param("valueId") valueId: string, @CurrentUser() user: RequestUser) {
    return this.indices.deletePriceValue(id, valueId, user);
  }

  @UseGuards(RolesGuard)
  @Roles("admin", "content_manager")
  @Post("admin/content/indices/:id/publish")
  async publishPriceIndex(@Param("id") id: string, @CurrentUser() user: RequestUser) {
    return this.indices.publishPriceIndex(id, user);
  }

  @UseGuards(RolesGuard)
  @Roles("admin")
  @Post("admin/content/indices/:id/unpublish")
  async unpublishPriceIndex(
    @Param("id") id: string,
    @Body() body: { reason?: string } | undefined,
    @CurrentUser() user: RequestUser,
  ) {
    return this.indices.unpublishPriceIndex(id, user, body?.reason);
  }

  @UseGuards(RolesGuard)
  @Roles("admin")
  @Delete("admin/content/indices/:id")
  async deletePriceIndex(
    @Param("id") id: string,
    @Body() body: { reason?: string } | undefined,
    @CurrentUser() user: RequestUser,
  ) {
    return this.indices.deletePriceIndex(id, user, body?.reason);
  }
}
