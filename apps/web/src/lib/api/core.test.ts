import { afterEach, describe, expect, it, vi } from "vitest";
import { apiFetch, clearAccessToken, getAccessToken, tryRestoreSession } from "./core";

describe("apiFetch", () => {
  afterEach(() => {
    clearAccessToken();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("sends bearer token and JSON body", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ csrfToken: "csrf-token" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await apiFetch<{ ok: true }>("/test", {
      method: "POST",
      token: "access-token",
      body: { hello: "world" },
    });

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "http://localhost:4000/api/auth/csrf",
      expect.objectContaining({
        method: "GET",
        credentials: "include",
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://localhost:4000/api/test",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: JSON.stringify({ hello: "world" }),
        headers: expect.objectContaining({
          Authorization: "Bearer access-token",
          "Content-Type": "application/json",
          "X-CSRF-Token": "csrf-token",
        }),
      }),
    );
  });

  it("throws API error text", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("Нет доступа", { status: 403 })));

    await expect(apiFetch("/closed")).rejects.toMatchObject({ message: "Нет доступа", status: 403 });
  });

  it("refreshes an expired access token and retries the original request", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("Токен недействителен.", { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ csrfToken: "csrf-token" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ accessToken: "new-access-token" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await apiFetch<{ ok: true }>("/protected", { token: "old-access-token" });

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://localhost:4000/api/auth/csrf",
      expect.objectContaining({
        method: "GET",
        credentials: "include",
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "http://localhost:4000/api/auth/refresh",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        headers: expect.objectContaining({
          "X-CSRF-Token": "csrf-token",
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      "http://localhost:4000/api/protected",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer new-access-token",
        }),
      }),
    );
  });

  it("restores access token through refresh cookie after page reload", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ csrfToken: "csrf-token" }), { status: 200 }))
      .mockResolvedValue(new Response(JSON.stringify({ accessToken: "restored-token" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(tryRestoreSession()).resolves.toBe(true);

    expect(getAccessToken()).toBe("restored-token");
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "http://localhost:4000/api/auth/csrf",
      expect.objectContaining({
        method: "GET",
        credentials: "include",
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://localhost:4000/api/auth/refresh",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        headers: expect.objectContaining({
          "X-CSRF-Token": "csrf-token",
        }),
      }),
    );
  });
});
