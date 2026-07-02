// Оценка длительности урока по контент-блокам. Точные длительности нигде не
// хранятся (у видео их нет вовсе), поэтому считаем эвристикой: чтение текста
// ~180 слов/мин (русский), медиа и интерактив — фиксированные добавки.
// Payload приходит как Prisma Json — форму не гарантируем, сужаем через
// typeof-проверки; битый payload просто даёт 0 секунд, а не ошибку.

type EstimatableBlock = { type: string; payload: unknown };

const READING_WORDS_PER_MINUTE = 180;

const FIXED_SECONDS: Record<string, number> = {
  heading: 5,
  subheading: 5,
  image: 10,
  file: 15,
};

// Видео-блоки не хранят длительность файла — берём консервативные 5 минут.
const VIDEO_FALLBACK_SECONDS = 300;
const AUDIO_FALLBACK_SECONDS = 180;

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function countWords(html: string): number {
  const text = html
    .replace(/<[^>]*>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, " ")
    .trim();
  return text.length === 0 ? 0 : text.split(/\s+/).length;
}

function estimateBlockSeconds(block: EstimatableBlock): number {
  const payload = asRecord(block.payload);
  const fixed = FIXED_SECONDS[block.type];
  if (typeof fixed === "number") {
    return fixed;
  }

  switch (block.type) {
    case "paragraph": {
      const html = payload && typeof payload.html === "string" ? payload.html : "";
      return (countWords(html) / READING_WORDS_PER_MINUTE) * 60;
    }
    case "gallery":
      return asArray(payload?.images).length * 10;
    case "audio": {
      const duration = payload?.durationSeconds;
      return typeof duration === "number" && duration > 0 ? duration : AUDIO_FALLBACK_SECONDS;
    }
    case "video":
      return VIDEO_FALLBACK_SECONDS;
    case "quiz":
      return 45 + asArray(payload?.options).length * 10;
    case "matching":
      return 30 + asArray(payload?.pairs).length * 15;
    case "checklist":
    case "image_checklist":
      return asArray(payload?.items).length * 8;
    case "lesson_tasks":
      return asArray(payload?.tasks).length * 60;
    default:
      return 0;
  }
}

export function estimateLessonSeconds(blocks: EstimatableBlock[]): number {
  return blocks.reduce((sum, block) => sum + estimateBlockSeconds(block), 0);
}

// Минуты для UI: округляем вверх, минимум 1 минута для непустого урока.
export function estimateLessonMinutes(blocks: EstimatableBlock[]): number {
  const seconds = estimateLessonSeconds(blocks);
  return seconds <= 0 ? 1 : Math.max(1, Math.ceil(seconds / 60));
}
