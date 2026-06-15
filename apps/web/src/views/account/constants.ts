import type { AccountSectionId } from "../../components/app-shell-nav";
import type { CompanyEditableField } from "./types";

export const ACCOUNT_SETTINGS_SECTIONS: AccountSectionId[] = ["profile", "data-privacy"];
export const ACCOUNT_SCROLL_OFFSET = 124;

export const COMPANY_FIELD_CONFIG: Record<
  CompanyEditableField,
  {
    detailLabel: string;
    inputLabel: string;
    modalTitle: string;
    placeholder?: string;
    required?: boolean;
    type: "email" | "tel" | "text" | "url";
  }
> = {
  organizationName: {
    detailLabel: "Название",
    inputLabel: "Название организации",
    modalTitle: "Название компании",
    required: true,
    type: "text",
  },
  websiteUrl: {
    detailLabel: "Сайт",
    inputLabel: "Сайт",
    modalTitle: "Сайт компании",
    placeholder: "https://example.ru",
    type: "url",
  },
  corporatePhone: {
    detailLabel: "Телефон",
    inputLabel: "Корпоративный телефон",
    modalTitle: "Корпоративный телефон",
    placeholder: "+74951234567",
    type: "tel",
  },
  corporateEmail: {
    detailLabel: "Email",
    inputLabel: "Корпоративный email",
    modalTitle: "Корпоративный email",
    placeholder: "info@example.ru",
    type: "email",
  },
};
