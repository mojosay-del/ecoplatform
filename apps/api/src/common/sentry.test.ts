import { BadRequestException, InternalServerErrorException } from "@nestjs/common";
import type { ErrorEvent } from "@sentry/node";
import { describe, expect, it } from "vitest";
import { beforeSendApiEvent, resolveSentryTraceSampleRate, sanitizeSentryEvent } from "./sentry";

describe("api sentry helpers", () => {
  it("drops handled 4xx events but keeps 5xx events", () => {
    expect(beforeSendApiEvent({} as ErrorEvent, { originalException: new BadRequestException() })).toBeNull();
    expect(
      beforeSendApiEvent({} as ErrorEvent, { originalException: new InternalServerErrorException() }),
    ).not.toBeNull();
  });

  it("redacts secrets and personal fields before sending events", () => {
    const event = sanitizeSentryEvent({
      message: "failed token=abc phone=+70000000000",
      request: {
        url: "https://api.test/auth?email=user@example.test&token=abc&phone=+70000000000&inn=1234567890&bankAccount=40702810900000000001&visible=ok",
        headers: {
          authorization: "Bearer abc",
          cookie: "refresh=abc",
          "x-request-id": "trace-1",
        },
        cookies: { refresh: "abc" },
        data: {
          password: "secret",
          keep: "safe",
          nested: { refreshToken: "abc" },
        },
      },
      user: { id: "user-1", email: "user@example.test" },
      extra: { phone: "+70000000000", safe: "ok" },
      breadcrumbs: [{ message: "Bearer abc", data: { csrf: "token", visible: "yes" } }],
    } as ErrorEvent);

    expect(event.message).toBe("failed token=[Filtered] phone=[Filtered]");
    expect(event.request?.url).toBe(
      "https://api.test/auth?email=[Filtered]&token=[Filtered]&phone=[Filtered]&inn=[Filtered]&bankAccount=[Filtered]&visible=ok",
    );
    expect(event.request?.headers?.authorization).toBe("[Filtered]");
    expect(event.request?.headers?.cookie).toBe("[Filtered]");
    expect(event.request?.headers?.["x-request-id"]).toBe("trace-1");
    expect(event.request?.cookies).toBeUndefined();
    expect(event.request?.data).toEqual({
      password: "[Filtered]",
      keep: "safe",
      nested: { refreshToken: "[Filtered]" },
    });
    expect(event.user).toEqual({ id: "user-1" });
    expect(event.extra).toEqual({ phone: "[Filtered]", safe: "ok" });
    expect(event.breadcrumbs?.[0]?.message).toBe("Bearer [Filtered]");
    expect(event.breadcrumbs?.[0]?.data).toEqual({ csrf: "[Filtered]", visible: "yes" });
  });

  it("accepts only trace sample rates in the 0..1 range", () => {
    expect(resolveSentryTraceSampleRate("0.25")).toBe(0.25);
    expect(resolveSentryTraceSampleRate("2")).toBe(0);
    expect(resolveSentryTraceSampleRate("bad")).toBe(0);
  });
});
