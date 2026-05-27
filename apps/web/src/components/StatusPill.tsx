"use client";

import type { CSSProperties, ReactNode } from "react";
import type { StatusPillVariant } from "./status-pill-variants";

export type { StatusPillVariant } from "./status-pill-variants";
export {
  companyStatusPillVariant,
  moderationStatusPillVariant,
  subscriptionStatusPillVariant,
  supportStatusPillVariant,
  userStatusPillVariant,
} from "./status-pill-variants";

type StatusPillProps = {
  as?: "span" | "p";
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  variant?: StatusPillVariant;
};

export function StatusPill({ as = "span", children, className, style, variant = "neutral" }: StatusPillProps) {
  const classNames = ["status-pill", `status-pill-${variant}`, className].filter(Boolean).join(" ");

  if (as === "p") {
    return (
      <p className={classNames} style={style}>
        {children}
      </p>
    );
  }

  return (
    <span className={classNames} style={style}>
      {children}
    </span>
  );
}
