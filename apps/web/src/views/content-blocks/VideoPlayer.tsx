"use client";

// Плеер уроков на Vidstack: полный экран, PiP, громкость, клавиатура, меню
// скорости и (при нескольких ренишенах) выбор качества. Источники — массив
// прогрессивных MP4 с width/height (Vidstack строит из них меню качества).

import { MediaPlayer, MediaProvider, type MediaSrc } from "@vidstack/react";
import {
  DefaultVideoLayout,
  defaultLayoutIcons,
  type DefaultLayoutTranslations,
} from "@vidstack/react/player/layouts/default";
import "@vidstack/react/player/styles/default/theme.css";
import "@vidstack/react/player/styles/default/layouts/video.css";

export type VideoPlayerSource = { src: string; type: string; width?: number; height?: number };

// Полная локализация интерфейса Vidstack на русский (тип гарантирует, что ни
// один ключ DefaultLayoutWord не пропущен — TS подсветит недостающие).
const RU_VIDEO_TRANSLATIONS: DefaultLayoutTranslations = {
  Announcements: "Объявления",
  Accessibility: "Специальные возможности",
  AirPlay: "AirPlay",
  Audio: "Аудио",
  Auto: "Авто",
  Boost: "Усиление",
  Captions: "Субтитры",
  "Caption Styles": "Стиль субтитров",
  "Captions look like this": "Субтитры выглядят так",
  Chapters: "Главы",
  "Closed-Captions Off": "Субтитры выкл.",
  "Closed-Captions On": "Субтитры вкл.",
  Connected: "Подключено",
  Continue: "Продолжить",
  Connecting: "Подключение…",
  Default: "По умолчанию",
  Disabled: "Отключено",
  Disconnected: "Не подключено",
  "Display Background": "Фон области",
  Download: "Скачать",
  "Enter Fullscreen": "Во весь экран",
  "Enter PiP": "Картинка в картинке",
  "Exit Fullscreen": "Выйти из полноэкранного режима",
  "Exit PiP": "Выйти из картинки в картинке",
  Font: "Шрифт",
  Family: "Гарнитура",
  Fullscreen: "Полный экран",
  "Google Cast": "Google Cast",
  "Keyboard Animations": "Анимации клавиатуры",
  LIVE: "ЭФИР",
  Loop: "Повтор",
  Mute: "Выключить звук",
  Normal: "Обычная",
  Off: "Выкл.",
  Pause: "Пауза",
  Play: "Воспроизвести",
  Playback: "Воспроизведение",
  PiP: "Картинка в картинке",
  Quality: "Качество",
  Replay: "Повторить",
  Reset: "Сбросить",
  "Seek Backward": "Перемотать назад",
  "Seek Forward": "Перемотать вперёд",
  Seek: "Перемотка",
  Settings: "Настройки",
  "Skip To Live": "К прямому эфиру",
  Speed: "Скорость",
  Size: "Размер",
  Color: "Цвет",
  Opacity: "Прозрачность",
  Shadow: "Тень",
  Text: "Текст",
  "Text Background": "Фон текста",
  Track: "Дорожка",
  Unmute: "Включить звук",
  Volume: "Громкость",
};

export function VideoPlayer({ sources, title }: { sources: VideoPlayerSource[]; title?: string }) {
  // type у нас — обычная строка (mp4/исходный mime), а Vidstack типизирует её
  // как VideoMimeType. На границе с библиотекой приводим тип.
  const src = sources as unknown as MediaSrc[];
  return (
    <MediaPlayer
      className="eco-video-player"
      title={title}
      src={src}
      playsInline
      load="visible"
      aspectRatio="16/9"
    >
      <MediaProvider />
      <DefaultVideoLayout icons={defaultLayoutIcons} translations={RU_VIDEO_TRANSLATIONS} />
    </MediaPlayer>
  );
}
