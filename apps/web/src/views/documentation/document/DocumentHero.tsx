"use client";

// «Паспорт документа»: путь-крошки, реестровый код, крупный заголовок, штампы
// (версия / «действует с» / «обновлён») и эмблема формата справа.

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import type { DocumentationDetail } from "@ecoplatform/shared";
import { documentationDisplayIconForNode } from "../../documentation-icons";
import { FreshnessBadge, fmtStyle } from "../doc-badges";
import { formatLabel } from "../documentFormats";
import { formatRuDate, freshness } from "../doc-helpers";

const EASE = [0.22, 1, 0.36, 1] as const;

export function DocumentHero({
  active,
  breadcrumbs,
  indexCode,
}: {
  active: DocumentationDetail;
  breadcrumbs: Array<{ title: string; slug: string }>;
  indexCode?: string;
}) {
  const reducedMotion = useReducedMotion();
  const Icon = documentationDisplayIconForNode(active);
  const effective = formatRuDate(active.effectiveDate);
  const revised = formatRuDate(active.revisedAt);
  const fresh = freshness(active);

  return (
    <motion.header
      animate={{ opacity: 1, y: 0 }}
      className="doc-passport"
      initial={reducedMotion ? false : { opacity: 0, y: 12 }}
      style={fmtStyle(active.file?.format)}
      transition={{ duration: 0.4, ease: EASE }}
    >
      <span aria-hidden="true" className="doc-passport-spine" />
      <div className="doc-passport-body">
        <nav aria-label="Путь по реестру" className="doc-passport-path">
          <Link href="/documentation">Документация</Link>
          {breadcrumbs.map((crumb) => (
            <span key={crumb.slug}>
              <span aria-hidden="true" className="doc-passport-path-divider">
                /
              </span>
              <Link href={`/documentation/${crumb.slug}`}>{crumb.title}</Link>
            </span>
          ))}
        </nav>
        <h1 className="doc-passport-title">{active.title}</h1>
        {active.subtitle ? <p className="doc-passport-subtitle">{active.subtitle}</p> : null}
        <div className="doc-passport-stamps">
          {indexCode ? <span className="doc-passport-code">№ {indexCode}</span> : null}
          {active.isPinned ? <span className="doc-stamp doc-stamp-pin">Закреплено</span> : null}
          {active.version ? <span className="doc-stamp">Версия {active.version}</span> : null}
          {effective ? <span className="doc-stamp doc-stamp-date">Действует с {effective}</span> : null}
          {!fresh && revised ? <span className="doc-stamp">Обновлён {revised}</span> : null}
          {fresh ? <FreshnessBadge kind={fresh} /> : null}
        </div>
      </div>
      <div aria-hidden="true" className="doc-passport-emblem">
        <Icon size={30} strokeWidth={1.7} />
        <span className="doc-passport-emblem-format">{active.file ? formatLabel(active.file.format) : "ДЕЛО"}</span>
      </div>
    </motion.header>
  );
}
