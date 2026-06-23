import { Loader2 } from "lucide-react";
import type { Ref } from "react";

type AdminInfiniteFooterProps = {
  /** Callback- или object-ref для IntersectionObserver-sentinel. */
  sentinelRef: Ref<HTMLDivElement>;
  isLoadingMore: boolean;
  hasMore: boolean;
  hasItems: boolean;
  /** Текст, когда подгружены все записи (например, «Это все пользователи»). */
  endLabel?: string;
};

/**
 * Подвал бесконечной прокрутки: sentinel для IntersectionObserver +
 * индикатор подгрузки / сообщение об окончании списка. Заменяет повтор в
 * users/companies/staff/journals/billing.
 */
export function AdminInfiniteFooter({
  sentinelRef,
  isLoadingMore,
  hasMore,
  hasItems,
  endLabel = "Это все записи.",
}: AdminInfiniteFooterProps) {
  return (
    <div className="admin-infinite-footer">
      <div ref={sentinelRef} aria-hidden="true" />
      {isLoadingMore ? (
        <span className="admin-infinite-footer-spinner">
          <Loader2 aria-hidden size={15} />
          Загружаем ещё…
        </span>
      ) : null}
      {!hasMore && hasItems ? <span>{endLabel}</span> : null}
    </div>
  );
}
