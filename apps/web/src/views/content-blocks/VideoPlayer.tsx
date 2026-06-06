"use client";

// Плеер уроков на Vidstack: полный экран, PiP, громкость, клавиатура, меню
// скорости и (при нескольких ренишенах) выбор качества. Источники — массив
// прогрессивных MP4 с width/height (Vidstack строит из них меню качества).

import { MediaPlayer, MediaProvider, type MediaSrc } from "@vidstack/react";
import { DefaultVideoLayout, defaultLayoutIcons } from "@vidstack/react/player/layouts/default";
import "@vidstack/react/player/styles/default/theme.css";
import "@vidstack/react/player/styles/default/layouts/video.css";

export type VideoPlayerSource = { src: string; type: string; width?: number; height?: number };

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
      <DefaultVideoLayout icons={defaultLayoutIcons} />
    </MediaPlayer>
  );
}
