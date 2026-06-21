import {
  CheckSquare,
  ClipboardList,
  FileAudio,
  Image as ImageIcon,
  Images,
  ListChecks,
  ListOrdered,
  Paperclip,
  Shuffle,
  Video as VideoIcon,
} from "lucide-react";
import type { AtomicBlockKind } from "./block-mapping";

// Человекочитаемые подписи и иконки атомарных блоков для карточек и меню.
export const ATOMIC_BLOCK_LABELS: Record<AtomicBlockKind, string> = {
  image: "Картинка",
  gallery: "Галерея",
  video: "Видео",
  audio: "Аудио",
  file: "Файл",
  checklist: "Чек-лист",
  image_checklist: "Чек-лист с картинкой",
  lesson_tasks: "Задания урока",
  quiz: "Тест",
  matching: "Сопоставление",
};

export const ATOMIC_BLOCK_ICONS: Record<AtomicBlockKind, React.ReactNode> = {
  image: <ImageIcon size={15} />,
  gallery: <Images size={15} />,
  video: <VideoIcon size={15} />,
  audio: <FileAudio size={15} />,
  file: <Paperclip size={15} />,
  checklist: <CheckSquare size={15} />,
  image_checklist: <ListChecks size={15} />,
  lesson_tasks: <ClipboardList size={15} />,
  quiz: <ListOrdered size={15} />,
  matching: <Shuffle size={15} />,
};

// Значения по умолчанию при вставке нового блока (совпадают с zod-схемами).
export function atomicDefaultPayload(kind: AtomicBlockKind): Record<string, unknown> {
  switch (kind) {
    case "image":
      return { fileId: "", caption: "", altText: "" };
    case "gallery":
      return { images: [] };
    case "video":
      return { fileId: "", caption: "" };
    case "audio":
      return { fileId: "", episodeTitle: "", caption: "" };
    case "file":
      return { fileId: "", displayName: "", description: "" };
    case "checklist":
      return { title: "", style: "positive", items: [""] };
    case "image_checklist":
      return { title: "", style: "positive", image: { fileId: "", caption: "", altText: "" }, items: [""] };
    case "lesson_tasks":
      return { tasks: [{ title: "", description: "" }] };
    case "quiz":
      return {
        question: "",
        multiple: false,
        options: [
          { text: "", correct: false },
          { text: "", correct: false },
        ],
        explanation: "",
      };
    case "matching":
      return {
        instruction: "",
        pairs: [
          { left: "", right: "" },
          { left: "", right: "" },
        ],
      };
  }
}
