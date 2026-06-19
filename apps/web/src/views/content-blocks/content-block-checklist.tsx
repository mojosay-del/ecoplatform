import { Ban, Check, CircleDot, type LucideIcon } from "lucide-react";
import type { ChecklistPayload, ContentBlocksVariant } from "./content-block-types";
import "./checklist.css";

export function ChecklistBlock({ payload, variant }: { payload: ChecklistPayload; variant: ContentBlocksVariant }) {
  const isKnowledge = variant === "knowledge";
  const isRejected = isRejectChecklist(payload);
  const Icon = isKnowledge ? checklistIcon(payload, isRejected) : null;
  const knowledgeClass = isKnowledge ? ` checklist-knowledge${isRejected ? " checklist-reject" : ""}` : "";

  return (
    <div className={`checklist-block checklist-${payload.style}${knowledgeClass}`}>
      <h3>
        {Icon ? (
          <span className="checklist-title-icon" aria-hidden="true">
            <Icon size={17} strokeWidth={2.4} />
          </span>
        ) : null}
        <span>{payload.title}</span>
      </h3>
      <ul>
        {payload.items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function checklistIcon(payload: ChecklistPayload, isRejected: boolean): LucideIcon {
  if (isRejected || payload.style === "negative") return Ban;
  if (payload.style === "positive") return Check;
  return CircleDot;
}

function isRejectChecklist(payload: ChecklistPayload): boolean {
  return payload.title.trim().toLowerCase().includes("не принимается");
}

export function HeadingIcon({ kind }: { kind: "heading" | "subheading" }) {
  if (kind === "subheading") {
    return (
      <svg className="content-block-heading-icon is-subheading" viewBox="0 0 26 26" aria-hidden="true">
        <path d="M6.5 5.5h9.4l4.6 4.6v10.4H8.5c-1.1 0-2-.9-2-2z" />
        <path d="M15.9 5.7v4.5h4.4M10.3 13.6h7M10.3 17h5.2" fill="none" />
      </svg>
    );
  }

  return (
    <svg className="content-block-heading-icon" viewBox="0 0 28 28" aria-hidden="true">
      <path d="M7 6.5h11.4c2.2 0 4 1.8 4 4v11H11c-2.2 0-4-1.8-4-4z" />
      <path d="M11 12h7.2M11 16.4h5.2" fill="none" />
    </svg>
  );
}
