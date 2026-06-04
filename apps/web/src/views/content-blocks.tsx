"use client";

// Рендер content-blocks для новостей, уроков и статей базы знаний.
// Раньше жил в DataViews.tsx; вынесен отдельно, чтобы все view (news, learning,
// knowledge-base) могли его импортировать без циркулярных ссылок.

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { api, type FileAsset } from "../lib/api";
import { useAuth } from "../lib/auth";
import { sanitizeParagraphHtml } from "../lib/sanitize-html";

// Известные типы блоков из shared/content-blocks. Используем минимальные
// shape-типы вместо BaseContentBlock — здесь только то, что реально рендерим.
type RenderableBlock =
  | { type: "heading" | "subheading"; payload: { text: string } }
  | { type: "paragraph"; payload: { html: string } }
  | { type: "image"; payload: { fileId: string; caption?: string; altText?: string } }
  | { type: "gallery"; payload: { images: Array<{ fileId: string; caption?: string; altText?: string }> } }
  | { type: "video"; payload: { fileId?: string; caption?: string } }
  | { type: "audio"; payload: { fileId: string; episodeTitle?: string; caption?: string; durationSeconds?: number } }
  | { type: "file"; payload: { fileId: string; displayName: string; description?: string } }
  | { type: "checklist"; payload: { title: string; style: string; items: string[] } }
  | {
      type: "image_checklist";
      payload: {
        title: string;
        style: string;
        image: { fileId: string; caption?: string; altText?: string };
        items: string[];
      };
    }
  | { type: string; payload: Record<string, unknown> };

export function ContentBlocks({ blocks }: { blocks: RenderableBlock[] }) {
  const assets = useFileAssets(blocks);

  return (
    <div className="content-blocks">
      {blocks.map((block, index) => {
        if (block.type === "heading") {
          return <h2 key={index}>{(block.payload as { text: string }).text}</h2>;
        }
        if (block.type === "subheading") {
          return <h3 key={index}>{(block.payload as { text: string }).text}</h3>;
        }
        if (block.type === "paragraph") {
          const html = (block.payload as { html: string }).html;
          return (
            <div
              className="rendered-html"
              key={index}
              dangerouslySetInnerHTML={{ __html: sanitizeParagraphHtml(html) }}
            />
          );
        }
        if (block.type === "image") {
          const payload = block.payload as { fileId: string; caption?: string; altText?: string };
          return (
            <ImageBlock
              asset={assets.get(payload.fileId)}
              altText={payload.altText}
              caption={payload.caption}
              key={index}
            />
          );
        }
        if (block.type === "gallery") {
          const payload = block.payload as { images: Array<{ fileId: string; caption?: string; altText?: string }> };
          return (
            <div className="gallery-block" key={index}>
              {payload.images.map((image, imageIndex) => (
                <ImageBlock
                  asset={assets.get(image.fileId)}
                  altText={image.altText}
                  caption={image.caption}
                  key={`${image.fileId}-${imageIndex}`}
                />
              ))}
            </div>
          );
        }
        if (block.type === "video") {
          const payload = block.payload as { fileId?: string; caption?: string };
          const asset = payload.fileId ? assets.get(payload.fileId) : null;
          return <VideoBlock asset={asset} caption={payload.caption} key={index} />;
        }
        if (block.type === "audio") {
          const payload = block.payload as { fileId: string; episodeTitle?: string; caption?: string };
          const asset = assets.get(payload.fileId);
          return (
            <figure className="media-block" key={index}>
              {payload.episodeTitle ? <h3>{payload.episodeTitle}</h3> : null}
              {asset?.publicUrl ? <audio controls src={asset.publicUrl} /> : <MissingAsset />}
              {payload.caption ? <figcaption>{payload.caption}</figcaption> : null}
            </figure>
          );
        }
        if (block.type === "file") {
          const payload = block.payload as { fileId: string; displayName: string; description?: string };
          const asset = assets.get(payload.fileId);
          return (
            <div className="file-block" key={index}>
              <div>
                <strong>{payload.displayName}</strong>
                {payload.description ? <p>{payload.description}</p> : null}
              </div>
              {asset?.publicUrl ? (
                <a className="button secondary" href={asset.publicUrl} rel="noreferrer" target="_blank">
                  Скачать
                </a>
              ) : (
                <MissingAsset />
              )}
            </div>
          );
        }
        if (block.type === "checklist") {
          const payload = block.payload as { title: string; style: string; items: string[] };
          return (
            <div className={`checklist-block checklist-${payload.style}`} key={index}>
              <h3>{payload.title}</h3>
              <ul>
                {payload.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          );
        }
        if (block.type === "image_checklist") {
          const payload = block.payload as {
            title: string;
            style: string;
            image: { fileId: string; caption?: string; altText?: string };
            items: string[];
          };
          return (
            <div className="image-checklist-block" key={index}>
              <ImageBlock
                asset={assets.get(payload.image.fileId)}
                altText={payload.image.altText}
                caption={payload.image.caption}
              />
              <div className={`checklist-block checklist-${payload.style}`}>
                <h3>{payload.title}</h3>
                <ul>
                  {payload.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>
          );
        }
        if (block.type === "quiz") {
          return <QuizPlayer key={index} payload={block.payload as unknown as QuizPayload} />;
        }
        if (block.type === "matching") {
          return <MatchingPlayer key={index} payload={block.payload as unknown as MatchingPayload} />;
        }
        return null;
      })}
    </div>
  );
}

function useFileAssets(blocks: RenderableBlock[]) {
  const { token } = useAuth();
  const [assets, setAssets] = useState<Map<string, FileAsset>>(new Map());
  const ids = useMemo(() => collectFileIds(blocks), [blocks]);
  const idsKey = ids.join(",");

  useEffect(() => {
    if (!token || ids.length === 0) {
      setAssets(new Map());
      return;
    }

    api.files
      .listByIds(ids)
      .then((result) => setAssets(new Map(result.map((asset) => [asset.id, asset]))))
      .catch(() => setAssets(new Map()));
  }, [ids.length, idsKey, token]);

  return assets;
}

function collectFileIds(blocks: RenderableBlock[]) {
  const ids = new Set<string>();
  for (const block of blocks) {
    const payload = block.payload as Record<string, unknown>;
    if (typeof payload.fileId === "string" && payload.fileId) {
      ids.add(payload.fileId);
    }
    if (Array.isArray(payload.images)) {
      for (const image of payload.images) {
        if (typeof image === "object" && image && "fileId" in image && typeof image.fileId === "string") {
          ids.add(image.fileId);
        }
      }
    }
    if (
      typeof payload.image === "object" &&
      payload.image &&
      "fileId" in payload.image &&
      typeof payload.image.fileId === "string"
    ) {
      ids.add(payload.image.fileId);
    }
  }

  return Array.from(ids).sort();
}

function ImageBlock({ asset, altText, caption }: { asset: FileAsset | undefined; altText?: string; caption?: string }) {
  return (
    <figure className="media-block">
      {asset?.publicUrl ? <img alt={altText ?? asset.originalName} src={asset.publicUrl} /> : <MissingAsset />}
      {caption ? <figcaption>{caption}</figcaption> : null}
    </figure>
  );
}

function MissingAsset() {
  return <p className="page-subtitle">Файл недоступен.</p>;
}

function VideoBlock({ asset, caption }: { asset: FileAsset | null | undefined; caption?: string }) {
  const [failed, setFailed] = useState(false);
  const url = asset?.publicUrl ?? asset?.downloadUrl ?? null;

  return (
    <figure className="media-block">
      {!url ? (
        <MissingAsset />
      ) : failed ? (
        // Браузер не смог проиграть файл (частый случай — видео с iPhone в
        // формате .mov/HEVC, которое Chrome и Firefox не декодируют). Вместо
        // перечёркнутой кнопки показываем понятное сообщение и ссылку на скачивание.
        <div className="video-fallback">
          <p className="video-fallback-text">Это видео не воспроизводится в браузере.</p>
          <a className="button secondary" href={url} target="_blank" rel="noreferrer">
            Скачать видео
          </a>
        </div>
      ) : (
        <div className="video-player">
          <video
            controls
            playsInline
            preload="metadata"
            src={url}
            onError={() => setFailed(true)}
          />
        </div>
      )}
      {caption ? <figcaption>{caption}</figcaption> : null}
    </figure>
  );
}

// --- Интерактивные блоки для ученика (проверка на клиенте) ------------------

type QuizPayload = {
  question: string;
  multiple?: boolean;
  options: Array<{ text: string; correct: boolean }>;
  explanation?: string;
};

function QuizPlayer({ payload }: { payload: QuizPayload }) {
  const options = payload.options ?? [];
  const multiple = Boolean(payload.multiple);
  const [selected, setSelected] = useState<number[]>([]);
  const [checked, setChecked] = useState(false);

  function toggle(index: number) {
    setChecked(false);
    setSelected((prev) => {
      if (multiple) return prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index];
      return [index];
    });
  }

  const isCorrect = useMemo(() => {
    const correct = options.map((option, index) => (option.correct ? index : -1)).filter((i) => i >= 0);
    return correct.length === selected.length && correct.every((i) => selected.includes(i));
  }, [options, selected]);

  return (
    <div className="quiz-block">
      <p className="quiz-question">{payload.question}</p>
      <div className="quiz-options">
        {options.map((option, index) => {
          const isSelected = selected.includes(index);
          let state = "";
          if (checked) {
            if (option.correct) state = "is-correct";
            else if (isSelected) state = "is-wrong";
          } else if (isSelected) {
            state = "is-selected";
          }
          return (
            <button
              type="button"
              key={index}
              className={`quiz-option ${state}`}
              onClick={() => toggle(index)}
              aria-pressed={isSelected}
            >
              <span className={`quiz-option-marker${multiple ? " is-multiple" : ""}`} aria-hidden />
              <span>{option.text}</span>
            </button>
          );
        })}
      </div>
      <div className="quiz-actions">
        <button className="button" type="button" disabled={selected.length === 0} onClick={() => setChecked(true)}>
          Проверить
        </button>
        {checked ? (
          <span className={`quiz-verdict ${isCorrect ? "is-correct" : "is-wrong"}`}>
            {isCorrect ? "Верно!" : "Не совсем — попробуйте ещё раз"}
          </span>
        ) : null}
      </div>
      {checked && payload.explanation ? <p className="quiz-explanation">{payload.explanation}</p> : null}
    </div>
  );
}

type MatchingPayload = {
  instruction?: string;
  pairs: Array<{ left: string; right: string }>;
};

type MatchingRightOption = {
  id: string;
  text: string;
  pairIndex: number;
};

type MatchingLine = {
  leftIndex: number;
  rightId: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  state: "idle" | "correct" | "wrong";
};

function MatchingPlayer({ payload }: { payload: MatchingPayload }) {
  const pairs = payload.pairs ?? [];
  const pairsKey = useMemo(() => pairs.map((pair) => `${pair.left}\u0001${pair.right}`).join("\u0002"), [pairs]);
  const [rightOptions, setRightOptions] = useState<MatchingRightOption[]>(() => createMatchingOptions(pairs));
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [activeLeft, setActiveLeft] = useState<number | null>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [lines, setLines] = useState<MatchingLine[]>([]);
  const [previewLine, setPreviewLine] = useState<Omit<MatchingLine, "rightId" | "state"> | null>(null);
  const [checked, setChecked] = useState(false);
  const boardRef = useRef<HTMLDivElement | null>(null);
  const leftRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const rightRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  useEffect(() => {
    setRightOptions(shuffleMatchingOptions(createMatchingOptions(pairs)));
    setAnswers({});
    setActiveLeft(null);
    setDragFrom(null);
    setPreviewLine(null);
    setChecked(false);
  }, [pairsKey]);

  const rightOptionById = useMemo(() => new Map(rightOptions.map((option) => [option.id, option])), [rightOptions]);
  const rightToLeft = useMemo(() => {
    const map = new Map<string, number>();
    Object.entries(answers).forEach(([leftIndex, rightId]) => {
      map.set(rightId, Number(leftIndex));
    });
    return map;
  }, [answers]);

  const connect = useCallback((leftIndex: number, rightId: string) => {
    setChecked(false);
    setAnswers((prev) => {
      const next: Record<number, string> = {};
      Object.entries(prev).forEach(([key, value]) => {
        const existingLeftIndex = Number(key);
        if (existingLeftIndex !== leftIndex && value !== rightId) {
          next[existingLeftIndex] = value;
        }
      });
      next[leftIndex] = rightId;
      return next;
    });
    setActiveLeft(null);
    setDragFrom(null);
    setPreviewLine(null);
  }, []);

  const buildPreviewLine = useCallback((leftIndex: number, clientX: number, clientY: number) => {
    const board = boardRef.current;
    const leftNode = leftRefs.current[leftIndex];
    if (!board || !leftNode) return null;
    const boardRect = board.getBoundingClientRect();
    const leftRect = leftNode.getBoundingClientRect();
    const dragBelowCard = clientY > leftRect.bottom;
    const start = matchingLeftAnchor(boardRect, leftRect, dragBelowCard);
    return {
      leftIndex,
      x1: start.x,
      y1: start.y,
      x2: clientX - boardRect.left,
      y2: clientY - boardRect.top,
    };
  }, []);

  const updateLines = useCallback(() => {
    const board = boardRef.current;
    if (!board) {
      setLines([]);
      return;
    }
    const boardRect = board.getBoundingClientRect();
    const next: MatchingLine[] = Object.entries(answers).flatMap(([leftIndexText, rightId]) => {
      const leftIndex = Number(leftIndexText);
      const leftNode = leftRefs.current[leftIndex];
      const rightNode = rightRefs.current[rightId];
      const option = rightOptionById.get(rightId);
      if (!leftNode || !rightNode || !option) return [];

      const leftRect = leftNode.getBoundingClientRect();
      const rightRect = rightNode.getBoundingClientRect();
      const stacked = rightRect.top > leftRect.bottom && rightRect.left < leftRect.right;
      const start = matchingLeftAnchor(boardRect, leftRect, stacked);
      const end = matchingRightAnchor(boardRect, rightRect, stacked);
      return [
        {
          leftIndex,
          rightId,
          x1: start.x,
          y1: start.y,
          x2: end.x,
          y2: end.y,
          state: checked ? (option.pairIndex === leftIndex ? "correct" : "wrong") : "idle",
        },
      ];
    });
    setLines(next);
  }, [answers, checked, rightOptionById]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(updateLines);
    const board = boardRef.current;
    if (!board || typeof ResizeObserver === "undefined") {
      return () => window.cancelAnimationFrame(frame);
    }

    const observer = new ResizeObserver(updateLines);
    observer.observe(board);
    leftRefs.current.forEach((node) => {
      if (node) observer.observe(node);
    });
    Object.values(rightRefs.current).forEach((node) => {
      if (node) observer.observe(node);
    });

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [rightOptions, updateLines]);

  useEffect(() => {
    if (dragFrom === null) return;
    const sourceLeftIndex = dragFrom;

    function onPointerMove(event: PointerEvent) {
      setPreviewLine(buildPreviewLine(sourceLeftIndex, event.clientX, event.clientY));
    }

    function onPointerUp(event: PointerEvent) {
      const target = document.elementFromPoint(event.clientX, event.clientY);
      const rightNode = target?.closest<HTMLElement>("[data-matching-right-id]");
      const rightId = rightNode?.dataset.matchingRightId;
      if (rightId) {
        connect(sourceLeftIndex, rightId);
      } else {
        setDragFrom(null);
        setPreviewLine(null);
      }
    }

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp, { once: true });
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [buildPreviewLine, connect, dragFrom]);

  const allAnswered = pairs.length > 0 && pairs.every((_, index) => answers[index]);
  const allCorrect = pairs.every((_, index) => rightOptionById.get(answers[index] ?? "")?.pairIndex === index);

  function startDrag(leftIndex: number, event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    setChecked(false);
    setActiveLeft(leftIndex);
    setDragFrom(leftIndex);
    setPreviewLine(buildPreviewLine(leftIndex, event.clientX, event.clientY));
  }

  function selectLeft(leftIndex: number) {
    setChecked(false);
    setActiveLeft(leftIndex);
  }

  function selectRight(rightId: string) {
    if (activeLeft !== null) {
      connect(activeLeft, rightId);
      return;
    }
    const alreadyConnectedLeft = rightToLeft.get(rightId);
    if (alreadyConnectedLeft !== undefined) {
      setChecked(false);
      setActiveLeft(alreadyConnectedLeft);
    }
  }

  return (
    <div className="matching-block">
      {payload.instruction ? <p className="matching-instruction">{payload.instruction}</p> : null}
      <div className="matching-board" ref={boardRef}>
        <svg className="matching-lines" aria-hidden focusable="false">
          {lines.map((line) => (
            <path
              className={`matching-line is-${line.state}`}
              d={matchingPath(line)}
              key={`${line.leftIndex}-${line.rightId}`}
            />
          ))}
          {previewLine ? <path className="matching-line is-preview" d={matchingPath(previewLine)} /> : null}
        </svg>
        <div className="matching-column">
          {pairs.map((pair, index) => {
            const rightId = answers[index];
            const chosen = rightId ? rightOptionById.get(rightId) : null;
            const correct = checked && chosen?.pairIndex === index;
            const wrong = checked && Boolean(chosen) && chosen?.pairIndex !== index;
            return (
              <button
                aria-label={`Левый вариант: ${pair.left}`}
                aria-pressed={activeLeft === index}
                className={`matching-card matching-left-card${activeLeft === index ? " is-active" : ""}${
                  chosen ? " has-answer" : ""
                }${correct ? " is-correct" : ""}${wrong ? " is-wrong" : ""}`}
                data-matching-left-index={index}
                key={`${pair.left}-${index}`}
                onClick={() => selectLeft(index)}
                onPointerDown={(event) => startDrag(index, event)}
                ref={(node) => {
                  leftRefs.current[index] = node;
                }}
                type="button"
              >
                <span>{pair.left}</span>
                <span className="matching-card-dot" aria-hidden />
              </button>
            );
          })}
        </div>
        <div className="matching-column">
          {rightOptions.map((option) => {
            const selectedBy = rightToLeft.get(option.id);
            const selected = selectedBy !== undefined;
            const correct = checked && selected && option.pairIndex === selectedBy;
            const wrong = checked && selected && option.pairIndex !== selectedBy;
            return (
              <button
                aria-label={`Правый вариант: ${option.text}`}
                aria-pressed={selected}
                className={`matching-card matching-right-card${selected ? " is-selected" : ""}${
                  activeLeft !== null ? " is-targetable" : ""
                }${correct ? " is-correct" : ""}${wrong ? " is-wrong" : ""}`}
                data-matching-right-id={option.id}
                key={option.id}
                onClick={() => selectRight(option.id)}
                ref={(node) => {
                  rightRefs.current[option.id] = node;
                }}
                type="button"
              >
                <span className="matching-card-dot" aria-hidden />
                <span>{option.text}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="quiz-actions">
        <button className="button" type="button" disabled={!allAnswered} onClick={() => setChecked(true)}>
          Проверить
        </button>
        {checked ? (
          <span className={`quiz-verdict ${allCorrect ? "is-correct" : "is-wrong"}`}>
            {allCorrect ? "Всё верно!" : "Есть ошибки — поправьте пары"}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function createMatchingOptions(pairs: MatchingPayload["pairs"]): MatchingRightOption[] {
  return pairs.map((pair, index) => ({
    id: `right-${index}-${pair.right}`,
    text: pair.right,
    pairIndex: index,
  }));
}

function shuffleMatchingOptions(options: MatchingRightOption[]) {
  const shuffled = [...options];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex]!, shuffled[index]!];
  }
  return shuffled;
}

function matchingPath(line: Pick<MatchingLine, "x1" | "y1" | "x2" | "y2">) {
  const distance = Math.abs(line.x2 - line.x1);
  const direction = line.x2 >= line.x1 ? 1 : -1;
  const control = Math.max(34, distance * 0.45);
  return `M ${line.x1} ${line.y1} C ${line.x1 + control * direction} ${line.y1}, ${
    line.x2 - control * direction
  } ${line.y2}, ${line.x2} ${line.y2}`;
}

function matchingLeftAnchor(boardRect: DOMRect, leftRect: DOMRect, stacked: boolean) {
  if (stacked) {
    return {
      x: leftRect.left - boardRect.left + leftRect.width / 2,
      y: leftRect.bottom - boardRect.top,
    };
  }

  return {
    x: leftRect.right - boardRect.left,
    y: leftRect.top - boardRect.top + leftRect.height / 2,
  };
}

function matchingRightAnchor(boardRect: DOMRect, rightRect: DOMRect, stacked: boolean) {
  if (stacked) {
    return {
      x: rightRect.left - boardRect.left + rightRect.width / 2,
      y: rightRect.top - boardRect.top,
    };
  }

  return {
    x: rightRect.left - boardRect.left,
    y: rightRect.top - boardRect.top + rightRect.height / 2,
  };
}
