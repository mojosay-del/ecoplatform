"use client";

import { ImageIcon } from "lucide-react";
import { RowKebab, type ActionItem } from "../../../components/RowKebab";
import { CONTENT_STATUS_LABELS } from "../../../lib/display-labels";
import { formatNewsDate } from "../../shared";
import type { NewsItem } from "./types";

export function NewsRow({
  item,
  isActive,
  coverUrl,
  onEdit,
  onPreview,
  onPublishToggle,
  onRemove,
}: {
  item: NewsItem;
  isActive: boolean;
  coverUrl: string | null;
  onEdit: () => void;
  onPreview: () => void;
  onPublishToggle: () => void;
  onRemove: () => void;
}) {
  const publishedDate = item.firstPublishedAt ? new Date(item.firstPublishedAt) : null;
  const updatedDate = new Date(item.updatedAt);
  const actions: ActionItem[] = [
    { label: "Открыть предпросмотр", onClick: onPreview },
    { label: item.status === "published" ? "Снять с публикации" : "Опубликовать", onClick: onPublishToggle },
    { label: "Удалить", onClick: onRemove, danger: true },
  ];

  return (
    <article className={`news-row${isActive ? " is-active" : ""}`}>
      <button type="button" className="news-row-main" onClick={onEdit}>
        <div className="news-row-thumb">
          {coverUrl ? (
            <img alt="" src={coverUrl} />
          ) : (
            <div className="news-row-thumb-fallback">
              <ImageIcon size={18} />
            </div>
          )}
        </div>
        <div className="news-row-info">
          <div className="news-row-meta">
            <span className={`news-row-status${item.status === "published" ? " is-published" : ""}`}>
              <span className="news-row-dot" aria-hidden />
              {CONTENT_STATUS_LABELS[item.status]}
            </span>
            {publishedDate ? (
              <time className="news-row-date" dateTime={publishedDate.toISOString()}>
                Опубликовано {formatNewsDate(publishedDate)}
              </time>
            ) : (
              <time className="news-row-date" dateTime={updatedDate.toISOString()}>
                Не опубликована · обновлено {formatNewsDate(updatedDate)}
              </time>
            )}
          </div>
          <div className="news-row-line">
            <strong className="news-row-title">{item.title}</strong>
          </div>
          {item.lead ? <p className="news-row-lead">{item.lead}</p> : null}
          {item.tags.length > 0 ? (
            <div className="news-row-tags">
              {item.tags.slice(0, 4).map((t) => (
                <span className="tag-chip is-static" key={t.newsTag.id}>
                  #{t.newsTag.name}
                </span>
              ))}
              {item.tags.length > 4 ? <span className="news-row-tags-more">+{item.tags.length - 4}</span> : null}
            </div>
          ) : null}
        </div>
      </button>
      <RowKebab actions={actions} />
    </article>
  );
}
