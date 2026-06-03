"use client";

// Рендер content-blocks для новостей, уроков и статей базы знаний.
// Раньше жил в DataViews.tsx; вынесен отдельно, чтобы все view (news, learning,
// knowledge-base) могли его импортировать без циркулярных ссылок.

import { useEffect, useMemo, useState } from "react";
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
          return (
            <figure className="media-block" key={index}>
              {asset?.publicUrl ? <video controls preload="metadata" src={asset.publicUrl} /> : <MissingAsset />}
              {payload.caption ? <figcaption>{payload.caption}</figcaption> : null}
            </figure>
          );
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

function MatchingPlayer({ payload }: { payload: MatchingPayload }) {
  const pairs = payload.pairs ?? [];
  // Правый столбец показываем в перемешанном порядке. Перемешиваем после
  // монтирования (useEffect), чтобы не было рассинхрона SSR/клиента.
  const [rightOptions, setRightOptions] = useState<string[]>(() => pairs.map((pair) => pair.right));
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const shuffled = [...pairs.map((pair) => pair.right)];
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
    }
    setRightOptions(shuffled);
  }, [payload]);

  const allAnswered = pairs.length > 0 && pairs.every((_, index) => answers[index]);
  const allCorrect = pairs.every((pair, index) => answers[index] === pair.right);

  return (
    <div className="matching-block">
      {payload.instruction ? <p className="matching-instruction">{payload.instruction}</p> : null}
      <div className="matching-rows">
        {pairs.map((pair, index) => {
          const chosen = answers[index] ?? "";
          const correct = checked && chosen === pair.right;
          const wrong = checked && Boolean(chosen) && chosen !== pair.right;
          return (
            <div className={`matching-row${correct ? " is-correct" : ""}${wrong ? " is-wrong" : ""}`} key={index}>
              <span className="matching-left">{pair.left}</span>
              <span className="matching-arrow" aria-hidden>
                ↔
              </span>
              <select
                className="matching-select"
                value={chosen}
                onChange={(event) => {
                  setChecked(false);
                  setAnswers((prev) => ({ ...prev, [index]: event.target.value }));
                }}
              >
                <option value="">— выберите —</option>
                {rightOptions.map((right, optionIndex) => (
                  <option key={optionIndex} value={right}>
                    {right}
                  </option>
                ))}
              </select>
            </div>
          );
        })}
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
