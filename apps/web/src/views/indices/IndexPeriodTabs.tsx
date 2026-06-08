"use client";

import { useEffect, useRef } from "react";
import { INDEX_PERIOD_LABELS, INDEX_PERIOD_SHORT_LABELS } from "./constants";
import type { IndexPeriod } from "./types";

type IndexPeriodTabsProps = {
  ariaLabel: string;
  className?: string;
  onChange: (period: IndexPeriod) => void;
  period: IndexPeriod;
};

export function IndexPeriodTabs({ ariaLabel, className, onChange, period }: IndexPeriodTabsProps) {
  const tabsRef = useRef<HTMLDivElement | null>(null);
  const activeTabRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const tabs = tabsRef.current;
    const activeTab = activeTabRef.current;
    if (!tabs || !activeTab || tabs.scrollWidth <= tabs.clientWidth) return;

    const nextScrollLeft = activeTab.offsetLeft - (tabs.clientWidth - activeTab.offsetWidth) / 2;
    tabs.scrollTo({
      left: Math.max(0, Math.min(nextScrollLeft, tabs.scrollWidth - tabs.clientWidth)),
    });
  }, [period]);

  const classes = ["index-period-tabs", className].filter(Boolean).join(" ");

  return (
    <div className={classes} aria-label={ariaLabel} ref={tabsRef} role="group">
      {(Object.keys(INDEX_PERIOD_LABELS) as IndexPeriod[]).map((value) => (
        <button
          aria-label={INDEX_PERIOD_LABELS[value]}
          aria-pressed={period === value}
          className={`index-period-tab ${period === value ? "active" : ""}`}
          key={value}
          onClick={() => onChange(value)}
          ref={period === value ? activeTabRef : undefined}
          type="button"
        >
          <span aria-hidden="true" className="index-period-label-full">
            {INDEX_PERIOD_LABELS[value]}
          </span>
          <span aria-hidden="true" className="index-period-label-short">
            {INDEX_PERIOD_SHORT_LABELS[value]}
          </span>
        </button>
      ))}
    </div>
  );
}
