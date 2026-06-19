"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import "./quiz.css";

export type MatchingPayload = {
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

export function MatchingPlayer({ payload }: { payload: MatchingPayload }) {
  const pairs = payload.pairs ?? [];
  const pairsKey = useMemo(() => pairs.map((pair) => `${pair.left}${pair.right}`).join(""), [pairs]);
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
