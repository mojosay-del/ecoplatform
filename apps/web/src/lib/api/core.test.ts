import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch, clearAccessToken, errorText, getAccessToken, tryRestoreSession } from "./core";
import { extractApiErrorMessage } from "./errors";

describe("errorText", () => {
  it("возвращает message из ApiError (контракт сервера долетает до UI)", () => {
    expect(errorText(new ApiError("Нет доступа", 403), "fallback")).toBe("Нет доступа");
  });

  it("возвращает message из обычного Error (сетевой сбой)", () => {
    expect(errorText(new Error("Load failed"), "fallback")).toBe("Load failed");
  });

  it("возвращает fallback для не-Error значений", () => {
    expect(errorText("строка", "fallback")).toBe("fallback");
    expect(errorText(undefined, "fallback")).toBe("fallback");
    expect(errorText({ message: "ad-hoc" }, "fallback")).toBe("fallback");
  });
});

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

  it("extracts standardized API error payloads", () => {
    expect(
      extractApiErrorMessage(JSON.stringify({ message: "Нет доступа", error: "Forbidden", statusCode: 403 })),
    ).toBe("Нет доступа");
    expect(
      extractApiErrorMessage(
        JSON.stringify({
          message: ["Поле email обязательно", "Пароль слишком короткий"],
          error: "Bad Request",
          statusCode: 400,
        }),
      ),
    ).toBe("Поле email обязательно; Пароль слишком короткий");
  });

  it("does not add JSON content type to GET requests without body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiFetch<{ ok: true }>("/legal/documents")).resolves.toEqual({ ok: true });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:4000/api/legal/documents",
      expect.objectContaining({
        method: "GET",
        headers: expect.not.objectContaining({
          "Content-Type": "application/json",
        }),
      }),
    );
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
