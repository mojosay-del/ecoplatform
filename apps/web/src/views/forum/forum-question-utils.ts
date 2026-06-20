import { errorText } from "../../lib/api";

const VIEW_RECORD_WINDOW_MS = 10_000;
const recentlyRecordedViews = new Map<string, number>();

export function pluralAnswers(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return "ответ";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "ответа";
  return "ответов";
}

export function shouldRecordQuestionView(questionId: string): boolean {
  const now = Date.now();
  const lastRecordedAt = recentlyRecordedViews.get(questionId);
  if (lastRecordedAt && now - lastRecordedAt < VIEW_RECORD_WINDOW_MS) {
    return false;
  }
  recentlyRecordedViews.set(questionId, now);
  return true;
}

export function messageFrom(error: unknown): string {
  return errorText(error, "Не удалось выполнить действие");
}
