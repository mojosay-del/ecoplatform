"use client";

// Обложка с скелетоном загрузки: пока картинка не догрузилась, поверх показываем
// пульсирующую серую плитку (тот же шиммер, что у page-skeleton), затем картинка
// плавно проявляется. Убирает «зелёный фон-заглушку» на плашках обучения/новостей,
// пока грузится изображение. Вставляется внутрь контейнера с position: relative
// и заданным aspect-ratio (.education-card-cover, .news-tile-cover и т.п.).

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import "./cover.css";

export function CoverImage({
  src,
  alt,
  sizes,
  eager = false,
  priority = false,
  onLoadSettled,
}: {
  src: string;
  alt: string;
  sizes?: string;
  eager?: boolean;
  priority?: boolean;
  onLoadSettled?: () => void;
}) {
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const ref = useRef<HTMLImageElement>(null);
  const settledSrcRef = useRef<string | null>(null);
  const onLoadSettledRef = useRef(onLoadSettled);
  const loaded = loadedSrc === src;

  useEffect(() => {
    onLoadSettledRef.current = onLoadSettled;
  }, [onLoadSettled]);

  const settleImage = useCallback(() => {
    setLoadedSrc(src);
    if (settledSrcRef.current === src) return;
    settledSrcRef.current = src;
    onLoadSettledRef.current?.();
  }, [src]);

  // Картинка из кеша могла догрузиться ещё до навешивания onLoad (особенно при
  // гидрации) — тогда событие не сработает и обложка осталась бы скрытой.
  // Проверяем complete на маунте, чтобы такой случай не «завис» на скелетоне.
  useEffect(() => {
    if (ref.current?.complete) {
      settleImage();
    }
  }, [settleImage]);

  return (
    <>
      {!loaded ? <span className="cover-skeleton" aria-hidden="true" /> : null}
      <Image
        ref={ref}
        alt={alt}
        src={src}
        fill
        sizes={sizes}
        // priority и loading взаимоисключающие в next/image.
        {...(priority ? { priority: true } : { loading: eager ? "eager" : "lazy" })}
        onLoad={settleImage}
        onError={settleImage}
        className={`cover-image u-object-cover${loaded ? " is-loaded" : ""}`}
      />
    </>
  );
}
