import { Controller, Get, Query } from "@nestjs/common";
import { parseBody } from "../common/zod";
import { SeoService } from "./seo.service";
import { seoPageQuerySchema } from "./seo.schemas";

@Controller("seo")
export class SeoController {
  constructor(private readonly seo: SeoService) {}

  @Get("sitemap")
  async sitemap() {
    return this.seo.sitemap();
  }

  @Get("pages")
  async page(@Query() query: Record<string, unknown>) {
    const input = parseBody(seoPageQuerySchema, query);
    return this.seo.page(input.path);
  }
}
