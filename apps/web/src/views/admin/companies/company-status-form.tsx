import type { FormEvent } from "react";
import { COMPANY_STATUS_LABELS, MODERATION_REASON_LABELS } from "../../../lib/display-labels";
import { COMPANY_STATUS_OPTIONS, companyStatusReasons, type CompanyStatusReason } from "./constants";

type CompanyStatusFormProps = {
  nextStatus: string;
  statusReason: CompanyStatusReason;
  statusComment: string;
  onNextStatusChange: (value: string) => void;
  onStatusReasonChange: (value: CompanyStatusReason) => void;
  onStatusCommentChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

export function CompanyStatusForm({
  nextStatus,
  statusReason,
  statusComment,
  onNextStatusChange,
  onStatusReasonChange,
  onStatusCommentChange,
  onSubmit,
}: CompanyStatusFormProps) {
  return (
    <form className="form" onSubmit={onSubmit}>
      <h3>Сменить статус</h3>
      <select className="select" onChange={(event) => onNextStatusChange(event.target.value)} value={nextStatus}>
        {COMPANY_STATUS_OPTIONS.map((status) => (
          <option key={status} value={status}>
            {COMPANY_STATUS_LABELS[status] ?? status}
          </option>
        ))}
      </select>
      <select
        className="select"
        onChange={(event) => onStatusReasonChange(event.target.value as CompanyStatusReason)}
        value={statusReason}
      >
        {companyStatusReasons.map((value) => (
          <option key={value} value={value}>
            {MODERATION_REASON_LABELS[value] ?? value}
          </option>
        ))}
      </select>
      <textarea
        className="textarea small"
        onChange={(event) => onStatusCommentChange(event.target.value)}
        placeholder="Комментарий (обязателен для «Иное»)"
        value={statusComment}
      />
      <button className="button" type="submit">
        Сохранить статус
      </button>
    </form>
  );
}
