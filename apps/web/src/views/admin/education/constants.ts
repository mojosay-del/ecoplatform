import type { AtomicBlockKind } from "../../../lib/editor/block-mapping";
import type { LearningModule } from "./types";

// Атомарные блоки, доступные в уроках (текстовые блоки всегда доступны через
// панель и меню «/»). Аудио/файл/чек-листы в уроки не добавляем — для
// материалов есть отдельная секция вложений. Задания урока добавляются из
// нижнего блока материалов рядом с вложениями.
export const LESSON_ATOMIC_KINDS: AtomicBlockKind[] = ["image", "gallery", "video", "quiz", "matching"];

export const MODULE_ACCESS_OPTIONS: LearningModule["accessLevel"][] = ["basic", "extended", "one_time"];
