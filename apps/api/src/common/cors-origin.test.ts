import type { CustomOrigin } from "@nestjs/common/interfaces/external/cors-options.interface";
import { describe, expect, it } from "vitest";
import { createCorsOriginValidator, resolveAllowedCorsOrigins } from "./cors-origin";

function validateOrigin(validator: CustomOrigin, requestOrigin?: string) {
  let called = false;
  let error: Error | null = null;
  let origin: unknown;

  validator(requestOrigin, (callbackError, callbackOrigin) => {
    called = true;
    error = callbackError;
    origin = callbackOrigin;
  });

  expect(called).toBe(true);
  return { error, origin };
}

describe("CORS origin allowlist", () => {
  it("parses multiple WEB_ORIGINS entries", () => {
    expect(
      resolveAllowedCorsOrigins({
        WEB_ORIGINS: "https://ecoplatform.pro, https://www.ecoplatform.pro/",
      }),
    ).toEqual(["https://ecoplatform.pro", "https://www.ecoplatform.pro"]);
  });

  it("trims and deduplicates WEB_ORIGINS entries", () => {
    expect(
      resolveAllowedCorsOrigins({
        WEB_ORIGINS: " https://ecoplatform.pro ,https://ecoplatform.pro/, http://localhost:3000 ",
      }),
    ).toEqual(["https://ecoplatform.pro", "http://localhost:3000"]);
  });

  it("rejects origins with path, query, hash or non-http protocol", () => {
    expect(() => resolveAllowedCorsOrigins({ WEB_ORIGINS: "https://ecoplatform.pro/admin" })).toThrow(
      "path/query/hash",
    );
    expect(() => resolveAllowedCorsOrigins({ WEB_ORIGINS: "https://ecoplatform.pro?preview=1" })).toThrow(
      "path/query/hash",
    );
    expect(() => resolveAllowedCorsOrigins({ WEB_ORIGINS: "https://ecoplatform.pro#section" })).toThrow(
      "path/query/hash",
    );
    expect(() => resolveAllowedCorsOrigins({ WEB_ORIGINS: "ftp://ecoplatform.pro" })).toThrow("http/https");
  });

  it("requires WEB_ORIGINS in production", () => {
    expect(() => resolveAllowedCorsOrigins({ NODE_ENV: "production" })).toThrow("WEB_ORIGINS обязательна в production");
  });

  it("falls back to local web origin outside production", () => {
    expect(resolveAllowedCorsOrigins({ NODE_ENV: "development" })).toEqual(["http://localhost:3000"]);
    expect(resolveAllowedCorsOrigins({ NODE_ENV: "test" })).toEqual(["http://localhost:3000"]);
  });

  it("allows known origins, denies unknown origins, and passes requests without Origin", () => {
    const validator = createCorsOriginValidator(["https://ecoplatform.pro"]);

    expect(validateOrigin(validator, "https://ecoplatform.pro")).toEqual({ error: null, origin: true });
    expect(validateOrigin(validator, "https://evil.example")).toEqual({ error: null, origin: false });
    expect(validateOrigin(validator)).toEqual({ error: null, origin: true });
  });
});
