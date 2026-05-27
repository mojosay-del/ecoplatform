export const NEWS_VISIBLE_TAG_LIMIT = 10;
export const NEWS_ALL_TAG_LIMIT = 100;

export function normaliseNewsTagSelection(values: readonly string[]) {
  const seen = new Set<string>();
  const tags: string[] = [];

  for (const value of values) {
    const tag = value.trim();
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    tags.push(tag);
  }

  return tags;
}

export function addNewsTagSelection(current: readonly string[], tag: string) {
  return normaliseNewsTagSelection([...current, tag]);
}

export function toggleNewsTagSelection(current: readonly string[], tag: string) {
  const cleanTag = tag.trim();
  if (!cleanTag) return normaliseNewsTagSelection(current);

  return current.includes(cleanTag)
    ? current.filter((currentTag) => currentTag !== cleanTag)
    : addNewsTagSelection(current, cleanTag);
}

export function getVisibleNewsTagNames(allTagNames: readonly string[], selectedTags: readonly string[]) {
  return normaliseNewsTagSelection([...selectedTags, ...allTagNames.slice(0, NEWS_VISIBLE_TAG_LIMIT)]);
}

export function buildNewsUrl(currentSearch: string, selectedTags: readonly string[], postSlug?: string | null) {
  const params = new URLSearchParams(currentSearch);
  params.delete("tag");
  params.delete("post");

  for (const tag of normaliseNewsTagSelection(selectedTags)) {
    params.append("tag", tag);
  }

  if (postSlug) {
    params.set("post", postSlug);
  }

  const query = params.toString();
  return query ? `/news?${query}` : "/news";
}
