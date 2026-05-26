import { describe, expect, it } from "vitest";
import { authorizeMetricsRequest } from "./metrics-auth";

function basic(value: string): string {
  return `Basic ${Buffer.from(value).toString("base64")}`;
}

describe("metrics basic auth", () => {
  it("разрешает /metrics без basic-auth вне production", () => {
    expect(authorizeMetricsRequest(undefined, { NODE_ENV: "development" })).toBe("allowed");
  });

  it("закрывает production /metrics, если не заданы credentials", () => {
    expect(authorizeMetricsRequest(undefined, { NODE_ENV: "production" })).toBe("misconfigured");
  });

  it("проверяет production basic-auth без раскрытия секрета", () => {
    const env = {
      NODE_ENV: "production",
      METRICS_BASIC_USER: "prometheus",
      METRICS_BASIC_PASSWORD: "very-long-secret",
    };

    expect(authorizeMetricsRequest(undefined, env)).toBe("unauthorized");
    expect(authorizeMetricsRequest(basic("prometheus:wrong-secret"), env)).toBe("unauthorized");
    expect(authorizeMetricsRequest(basic("prometheus:very-long-secret"), env)).toBe("allowed");
  });
});
