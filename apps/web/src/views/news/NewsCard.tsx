import { MessageCircle, ThumbsUp } from "lucide-react";
import type { NewsListItem } from "@ecoplatform/shared";
import { preferredFileAssetImageUrl, type FileAsset } from "../../lib/api";
import { CoverImage } from "../../components/CoverImage";
import { NewsMetaItem, formatNewsDate } from "../shared";

export function NewsCard({
  cover,
  href,
  index,
  onOpen,
  onSelectTag,
  post,
  selectedTags,
}: {
  cover: FileAsset | null;
  href: string;
  index: number;
  onOpen: (slug: string) => void;
  onSelectTag: (tag: string) => void;
  post: NewsListItem;
  selectedTags: string[];
}) {
  const coverUrl = preferredFileAssetImageUrl(cover);
  const hasCover = Boolean(coverUrl);
  const publishedDate = post.firstPublishedAt ? new Date(post.firstPublishedAt) : null;

  return (
    // Раньше тут был <button>, что ломало SEO и Ctrl/Cmd-click. Основное тело осталось shareable-ссылкой.
    <article className={`news-tile ${hasCover ? "news-tile-with-cover" : "news-tile-text"}`}>
      <a
        className="news-tile-main"
        href={href}
        onClick={(event) => {
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
          event.preventDefault();
          onOpen(post.slug);
        }}
      >
        {hasCover ? (
          <div className="news-tile-cover">
            <CoverImage
              alt={cover?.originalName ?? post.title}
              src={coverUrl!}
              eager={index < 4}
              sizes="(max-width: 640px) 100vw, (max-width: 880px) 50vw, (max-width: 1024px) 40vw, (max-width: 1360px) 25vw, 20vw"
            />
          </div>
        ) : null}
        <div className="news-tile-body">
          <span className="news-tile-category">Новости</span>
          <h2 className="news-tile-title">{post.title}</h2>
          <p className="news-tile-lead">{post.lead}</p>
          <div className="news-tile-meta">
            <NewsMetaItem count={post._count?.likes ?? 0} icon={ThumbsUp} label="Лайки" />
            <NewsMetaItem count={post._count?.comments ?? 0} icon={MessageCircle} label="Комментарии" />
            {publishedDate ? (
              <time className="news-tile-date" dateTime={publishedDate.toISOString()}>
                {formatNewsDate(publishedDate)}
              </time>
            ) : null}
          </div>
        </div>
      </a>
      <NewsCardTags tags={post.tags} selectedTags={selectedTags} onSelectTag={onSelectTag} />
    </article>
  );
}

function NewsCardTags({
  tags,
  selectedTags,
  onSelectTag,
}: {
  tags: NewsListItem["tags"];
  selectedTags: string[];
  onSelectTag: (tag: string) => void;
}) {
  if (tags.length === 0) return null;

  return (
    <div className="news-tile-tags" aria-label="Теги новости">
      {tags.map(({ newsTag }) => {
        const isActive = selectedTags.includes(newsTag.name);
        return (
          <button
            aria-pressed={isActive}
            className={`news-tile-tag ${isActive ? "is-active" : ""}`}
            key={newsTag.id}
            onClick={() => onSelectTag(newsTag.name)}
            type="button"
          >
            {newsTag.name}
          </button>
        );
      })}
    </div>
  );
}
