import type { IncomingMessage } from "http";
import { expect } from "vitest";

// Обязательные юр-документы, которые сидятся перед каждым тестом
// (см. integration-context.seedBaseline). Регистрация в тестах подставляет их
// как acceptedDocumentIds, повторяя прод-проверку согласий.
export const REQUIRED_DOC_IDS_FOR_TESTS = ["test-doc-privacy", "test-doc-terms", "test-doc-pd"];
export const TEST_EMAIL_VERIFICATION_CODE = "1234";

// supertest .parse для бинарных ответов (скачивание файлов/экспорт): собираем
// чанки в один Buffer.
export function parseBinary(res: IncomingMessage, callback: (error: Error | null, body?: Buffer) => void) {
  const chunks: Buffer[] = [];
  res.on("data", (chunk: Buffer | string) => {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  });
  res.on("end", () => callback(null, Buffer.concat(chunks)));
  res.on("error", (error) => callback(error));
}

export function expectPaginatedEnvelope(body: { items?: unknown; total?: unknown; hasMore?: unknown }) {
  expect(Array.isArray(body.items)).toBe(true);
  expect(typeof body.total).toBe("number");
  expect(typeof body.hasMore).toBe("boolean");
}

export function responseCookieParts(response: { headers: Record<string, string | string[] | undefined> }) {
  const setCookie = response.headers["set-cookie"];
  const cookies = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  return cookies.map((cookie) => cookie.split(";")[0]!);
}

export function responseCookiePart(response: { headers: Record<string, string | string[] | undefined> }, name: string) {
  return responseCookieParts(response).find((cookie) => cookie.startsWith(`${name}=`));
}

export function responseCookieFull(response: { headers: Record<string, string | string[] | undefined> }, name: string) {
  const setCookie = response.headers["set-cookie"];
  const cookies = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  return cookies.find((cookie) => cookie.startsWith(`${name}=`));
}

export function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}

export async function withEnv(updates: Record<string, string | undefined>, action: () => Promise<void>) {
  const previous = Object.fromEntries(Object.keys(updates).map((name) => [name, process.env[name]]));
  for (const [name, value] of Object.entries(updates)) {
    restoreEnv(name, value);
  }

  try {
    await action();
  } finally {
    for (const [name, value] of Object.entries(previous)) {
      restoreEnv(name, value);
    }
  }
}
