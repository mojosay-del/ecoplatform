import type { PhoneCountry, PhoneCountryId, RegisterFormValues } from "./types";

// Трейдер и Переработчик пока отключены: видны в поповере, но выбрать нельзя
// (метка «скоро»). Единственный доступный тип — Заготовитель (дефолт формы).
export const companyTypeOptions = [
  { value: "collector", label: "Заготовитель" },
  { value: "trader", label: "Трейдер", disabled: true, hint: "скоро" },
  { value: "processor", label: "Переработчик", disabled: true, hint: "скоро" },
];

export const PHONE_COUNTRIES: PhoneCountry[] = [
  {
    id: "ru",
    name: "Россия",
    dialCode: "+7",
    nationalLength: 10,
    groups: [3, 3, 2, 2],
    placeholder: "999 123-45-67",
  },
  {
    id: "by",
    name: "Беларусь",
    dialCode: "+375",
    nationalLength: 9,
    groups: [2, 3, 2, 2],
    placeholder: "29 123-45-67",
  },
  {
    id: "kz",
    name: "Казахстан",
    dialCode: "+7",
    nationalLength: 10,
    groups: [3, 3, 2, 2],
    placeholder: "700 123-45-67",
  },
  {
    id: "uz",
    name: "Узбекистан",
    dialCode: "+998",
    nationalLength: 9,
    groups: [2, 3, 2, 2],
    placeholder: "90 123-45-67",
  },
];

export const DEFAULT_PHONE_COUNTRY = PHONE_COUNTRIES[0]!;
export const ORGANIZATION_NAME_EXAMPLES = ["ИП Иванов И.И.", "ООО Экология"];
export const ORGANIZATION_TYPE_DELAY = 150;
export const ORGANIZATION_ERASE_DELAY = 90;
export const ORGANIZATION_HOLD_DELAY = 1800;
export const ORGANIZATION_EMPTY_DELAY = 600;
export const REGISTER_STEP_TOTAL = 3;
export const VERIFICATION_CODE_LENGTH = 4;
export const VERIFICATION_AUTO_SUBMIT_DELAY_MS = 140;
export const VERIFICATION_ERROR_RESET_DELAY_MS = 850;
export const VERIFICATION_SUCCESS_REDIRECT_DELAY_MS = 1000;

export const INITIAL_REGISTER_VALUES: RegisterFormValues = {
  organizationName: "",
  companyType: "collector",
  lastName: "",
  firstName: "",
  phoneCountryId: DEFAULT_PHONE_COUNTRY.id as PhoneCountryId,
  phoneDigits: "",
  email: "",
  password: "",
};

export const REGISTER_STEPS: { n: number; label: string }[] = [
  { n: 1, label: "О компании" },
  { n: 2, label: "О вас" },
  { n: 3, label: "Почта" },
];

export const LEGAL_PUBLIC_ROUTES: Record<string, string> = {
  privacy_policy: "/legal/privacy",
  terms_of_service: "/legal/terms",
  personal_data_consent: "/legal/personal-data",
  cookie_policy: "/legal/cookies",
  offer_agreement: "/legal/offer",
};
