import { Injectable } from "@nestjs/common";
import { metricsRegistry } from "./metrics.registry";

@Injectable()
export class MetricsService {
  get contentType(): string {
    return metricsRegistry.contentType;
  }

  render(): Promise<string> {
    return metricsRegistry.metrics();
  }
}
