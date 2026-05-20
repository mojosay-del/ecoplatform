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
});
