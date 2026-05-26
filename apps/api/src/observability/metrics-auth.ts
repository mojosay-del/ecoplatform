import { timingSafeEqual } from "crypto";

export type MetricsAuthDecision = "allowed" | "misconfigured" | "unauthorized";

type MetricsAuthEnv = Partial<Record<"NODE_ENV" | "METRICS_BASIC_USER" | "METRICS_BASIC_PASSWORD", string>>;

export function authorizeMetricsRequest(
  authorization: string | undefined,
  env: MetricsAuthEnv = process.env,
): MetricsAuthDecision {
  if (env.NODE_ENV !== "production") {
    return "allowed";
  }

  const expectedUser = env.METRICS_BASIC_USER?.trim();
  const expectedPassword = env.METRICS_BASIC_PASSWORD;
  if (!expectedUser || !expectedPassword) {
    return "misconfigured";
  }

  const credentials = parseBasicCredentials(authorization);
  if (!credentials) {
    return "unauthorized";
  }

  return safeEquals(credentials.username, expectedUser) && safeEquals(credentials.password, expectedPassword)
    ? "allowed"
    : "unauthorized";
}

function parseBasicCredentials(authorization: string | undefined): { username: string; password: string } | null {
  if (!authorization?.startsWith("Basic ")) {
    return null;
  }

  try {
    const decoded = Buffer.from(authorization.slice("Basic ".length), "base64").toString("utf8");
    const separatorIndex = decoded.indexOf(":");
    if (separatorIndex === -1) return null;
    return {
      username: decoded.slice(0, separatorIndex),
      password: decoded.slice(separatorIndex + 1),
    };
  } catch {
    return null;
  }
}

function safeEquals(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length) {
    timingSafeEqual(expectedBuffer, expectedBuffer);
    return false;
  }
  return timingSafeEqual(actualBuffer, expectedBuffer);
}
