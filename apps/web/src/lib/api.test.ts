import { afterEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "./api";

describe("apiFetch", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("sends bearer token and JSON body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await apiFetch<{ ok: true }>("/test", {
      method: "POST",
      token: "access-token",
      body: { hello: "world" },
    });

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:4000/api/test",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: JSON.stringify({ hello: "world" }),
        headers: expect.objectContaining({
          Authorization: "Bearer access-token",
          "Content-Type": "application/json",
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
      .mockResolvedValueOnce(new Response(JSON.stringify({ accessToken: "new-access-token" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await apiFetch<{ ok: true }>("/protected", { token: "old-access-token" });

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://localhost:4000/api/auth/refresh",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "http://localhost:4000/api/protected",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer new-access-token",
        }),
      }),
    );
  });
});
