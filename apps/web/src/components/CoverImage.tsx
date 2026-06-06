"use client";

// Обложка с скелетоном загрузки: пока картинка не догрузилась, поверх показываем
// пульсирующую серую плитку (тот же шиммер, что у page-skeleton), затем картинка
// плавно проявляется. Убирает «зелёный фон-заглушку» на плашках обучения/новостей,
// пока грузится изображение. Вставляется внутрь контейнера с position: relative
// и заданным aspect-ratio (.education-card-cover, .news-tile-cover и т.п.).

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

export function CoverImage({
  src,
  alt,
  sizes,
  eager = false,
  priority = false,
}: {
  src: string;
  alt: string;
  sizes?: string;
  eager?: boolean;
  priority?: boolean;
}) {
  const [loaded, setLoaded] = useState(false);
  const ref = useRef<HTMLImageElement>(null);

  // Картинка из кеша могла догрузиться ещё до навешивания onLoad (особенно при
  // гидрации) — тогда событие не сработает и обложка осталась бы скрытой.
  // Проверяем complete на маунте, чтобы такой случай не «завис» на скелетоне.
  useEffect(() => {
    if (ref.current?.complete) {
      setLoaded(true);
    }
  }, []);

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
        onLoad={() => setLoaded(true)}
        onError={() => setLoaded(true)}
        className={`cover-image${loaded ? " is-loaded" : ""}`}
        style={{ objectFit: "cover" }}
      />
    </>
  );
}
