export function shouldRenderCoveredCardSkeleton({
  coverImageId,
  coverUrl,
  settledCoverUrl,
}: {
  coverImageId?: string | null;
  coverUrl?: string | null;
  settledCoverUrl?: string | null;
}) {
  if (!coverImageId) return false;
  return !coverUrl || settledCoverUrl !== coverUrl;
}
