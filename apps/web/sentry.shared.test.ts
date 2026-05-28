import type { ErrorEvent } from "@sentry/nextjs";
import { describe, expect, it } from "vitest";
import { beforeSendWebEvent, resolveSentryTraceSampleRate, sanitizeSentryEvent } from "./sentry.shared";

describe("web sentry helpers", () => {
  it("drops browser and server 4xx events but keeps 5xx events", () => {
    expect(beforeSendWebEvent({ extra: { statusCode: 404 } } as unknown as ErrorEvent, {})).toBeNull();
    expect(beforeSendWebEvent({ extra: { statusCode: 500 } } as unknown as ErrorEvent, {})).not.toBeNull();
  });

  it("redacts secrets and personal fields before sending events", () => {
    const event = sanitizeSentryEvent({
      message: "browser error phone=+70000000000",
      request: {
        url: "https://app.test/account?email=user@example.test&token=abc&phone=+70000000000&inn=1234567890&bankAccount=40702810900000000001&visible=ok",
        headers: {
          authorization: "Bearer abc",
          cookie: "csrf=abc",
          "x-request-id": "trace-1",
        },
        data: { password: "secret", nested: { accessToken: "abc" }, visible: "ok" },
      },
      user: { id: "user-1", email: "user@example.test" },
      extra: { phone: "+70000000000", visible: "yes" },
    } as unknown as ErrorEvent);

    expect(event.message).toBe("browser error phone=[Filtered]");
    expect(event.request?.url).toBe(
      "https://app.test/account?email=[Filtered]&token=[Filtered]&phone=[Filtered]&inn=[Filtered]&bankAccount=[Filtered]&visible=ok",
    );
    expect(event.request?.headers?.authorization).toBe("[Filtered]");
    expect(event.request?.headers?.cookie).toBe("[Filtered]");
    expect(event.request?.headers?.["x-request-id"]).toBe("trace-1");
    expect(event.request?.data).toEqual({
      password: "[Filtered]",
      nested: { accessToken: "[Filtered]" },
      visible: "ok",
    });
    expect(event.user).toEqual({ id: "user-1" });
    expect(event.extra).toEqual({ phone: "[Filtered]", visible: "yes" });
  });

  it("accepts only trace sample rates in the 0..1 range", () => {
    expect(resolveSentryTraceSampleRate("0.1")).toBe(0.1);
    expect(resolveSentryTraceSampleRate("-1")).toBe(0);
    expect(resolveSentryTraceSampleRate("bad")).toBe(0);
  });
});
