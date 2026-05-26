import { Controller, Get, Headers, Res, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import type { Response } from "express";
import { authorizeMetricsRequest } from "./metrics-auth";
import { MetricsService } from "./metrics.service";

@Controller("metrics")
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get()
  @SkipThrottle({ short: true, long: true, auth: true })
  async scrape(
    @Headers("authorization") authorization: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<string> {
    const decision = authorizeMetricsRequest(authorization);
    if (decision === "misconfigured") {
      throw new ServiceUnavailableException("Метрики не настроены: задайте METRICS_BASIC_USER/PASSWORD.");
    }
    if (decision === "unauthorized") {
      response.setHeader("WWW-Authenticate", 'Basic realm="ecoplatform-metrics", charset="UTF-8"');
      throw new UnauthorizedException("Нужна авторизация для метрик.");
    }

    response.setHeader("Content-Type", this.metrics.contentType);
    response.setHeader("Cache-Control", "no-store");
    return this.metrics.render();
  }
}
