"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";

const ROTATE_INTERVAL_MS = 5000;
const ANIMATION_MS = 460;

export function AnimatedSearchPlaceholder({
  className,
  examples,
  iconSize = 20,
  prefix = "Например:",
}: {
  className: string;
  examples: string[];
  iconSize?: number;
  prefix?: string;
}) {
  const normalizedExamples = useMemo(() => examples.map((example) => example.trim()).filter(Boolean), [examples]);
  const examplesKey = normalizedExamples.join("\u001f");
  const [activeIndex, setActiveIndex] = useState(0);
  const [previousIndex, setPreviousIndex] = useState<number | null>(null);
  const cleanupAnimationRef = useRef<number | null>(null);

  useEffect(() => {
    setActiveIndex(0);
    setPreviousIndex(null);
  }, [examplesKey]);

  useEffect(() => {
    if (normalizedExamples.length <= 1) return undefined;

    const intervalId = window.setInterval(() => {
      setActiveIndex((currentIndex) => {
        const nextIndex = (currentIndex + 1) % normalizedExamples.length;
        setPreviousIndex(currentIndex);
        if (cleanupAnimationRef.current !== null) window.clearTimeout(cleanupAnimationRef.current);
        cleanupAnimationRef.current = window.setTimeout(() => {
          setPreviousIndex(null);
          cleanupAnimationRef.current = null;
        }, ANIMATION_MS);
        return nextIndex;
      });
    }, ROTATE_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
      if (cleanupAnimationRef.current !== null) window.clearTimeout(cleanupAnimationRef.current);
    };
  }, [examplesKey, normalizedExamples.length]);

  if (normalizedExamples.length === 0) return null;

  return (
    <span className={`${className} animated-search-placeholder`} aria-hidden="true">
      <span className="animated-search-placeholder-window">
        {previousIndex !== null ? (
          <span className="animated-search-placeholder-item is-exiting">
            <Search size={iconSize} />
            <span className="animated-search-placeholder-prefix">{prefix}</span>
            <span className="animated-search-placeholder-example">{normalizedExamples[previousIndex]}</span>
          </span>
        ) : null}
        <span className="animated-search-placeholder-item is-entering" key={`${examplesKey}:${activeIndex}`}>
          <Search size={iconSize} />
          <span className="animated-search-placeholder-prefix">{prefix}</span>
          <span className="animated-search-placeholder-example">{normalizedExamples[activeIndex]}</span>
        </span>
      </span>
    </span>
  );
}
