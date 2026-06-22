import { matchingBlockSchema, quizBlockSchema } from "@ecoplatform/shared";
import type { MatchingPayload } from "./MatchingPlayer";
import type { QuizPayload } from "./QuizPlayer";

type InteractiveBlockParseResult<TPayload> = { ok: true; payload: TPayload } | { ok: false };

export function parseQuizPayload(payload: unknown): InteractiveBlockParseResult<QuizPayload> {
  const parsed = quizBlockSchema.safeParse({ type: "quiz", payload });

  if (!parsed.success) {
    return { ok: false };
  }

  return { ok: true, payload: parsed.data.payload };
}

export function parseMatchingPayload(payload: unknown): InteractiveBlockParseResult<MatchingPayload> {
  const parsed = matchingBlockSchema.safeParse({ type: "matching", payload });

  if (!parsed.success) {
    return { ok: false };
  }

  return { ok: true, payload: parsed.data.payload };
}
