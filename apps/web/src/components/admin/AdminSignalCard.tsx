import type { LucideIcon } from "lucide-react";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import type { CSSProperties } from "react";

export type AdminSignalTone = "danger" | "warning" | "info" | "neutral";

type AdminSignalCardProps = {
  icon: LucideIcon;
  label: string;
  hint: string;
  value: number;
  href: string;
  tone?: AdminSignalTone;
  /** Индекс для каскадной анимации появления. */
  index?: number;
};

/**
 * Кликабельная карточка-сигнал блока «Требует внимания» командного центра.
 * Показывает метрику, ведёт на соответствующий раздел. Тон подсвечивает
 * срочность (danger/warning/info).
 */
export function AdminSignalCard({
  icon: Icon,
  label,
  hint,
  value,
  href,
  tone = "neutral",
  index = 0,
}: AdminSignalCardProps) {
  return (
    <Link
      className={`admin-signal-card admin-signal-card-${tone}`}
      href={href}
      style={{ "--signal-delay": `${index * 45}ms` } as CSSProperties}
    >
      <span className="admin-signal-card-icon" aria-hidden>
        <Icon size={19} />
      </span>
      <span className="admin-signal-card-copy">
        <span className="admin-signal-card-label">{label}</span>
        <span className="admin-signal-card-hint">{hint}</span>
      </span>
      <span className="admin-signal-card-value">{value.toLocaleString("ru-RU")}</span>
      <ArrowRight className="admin-signal-card-arrow" aria-hidden size={16} />
    </Link>
  );
}
