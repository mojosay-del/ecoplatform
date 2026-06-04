import Link from "next/link";
import type { LegalDocumentSummary } from "@ecoplatform/shared";
import { LEGAL_PUBLIC_ROUTES } from "./constants";

export function ConsentRow({
  document,
  checked,
  onChange,
  required,
}: {
  document: LegalDocumentSummary;
  checked: boolean;
  onChange: () => void;
  required?: boolean;
}) {
  const route = LEGAL_PUBLIC_ROUTES[document.type];
  return (
    <label className="consent-row">
      <input className="consent-input" type="checkbox" checked={checked} onChange={onChange} required={required} />
      <span className="consent-box" aria-hidden="true" />
      <span className="consent-copy">
        Я ознакомлен(а) и согласен(на) с{" "}
        {route ? (
          <Link href={route} target="_blank" rel="noopener noreferrer">
            {document.title}
          </Link>
        ) : (
          <strong>{document.title}</strong>
        )}
        {required ? (
          <span className="consent-required" aria-label="обязательно">
            {" "}
            *
          </span>
        ) : null}
      </span>
    </label>
  );
}
