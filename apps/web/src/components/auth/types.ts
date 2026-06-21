import type { ReactNode } from "react";

export type AuthMode = "login" | "register";

export type AuthIcon = {
  key: string;
  hold: number;
  caption: string;
  node: ReactNode;
};

export type RegisterStep = "company" | "person" | "verification";

export type RegisterFormValues = {
  organizationName: string;
  companyType: string;
  lastName: string;
  firstName: string;
  phoneCountryId: PhoneCountryId;
  phoneDigits: string;
  email: string;
  password: string;
};

export type SetRegisterField = <K extends keyof RegisterFormValues>(field: K, value: RegisterFormValues[K]) => void;

export type PhoneCountry = {
  id: string;
  name: string;
  dialCode: string;
  nationalLength: number;
  groups: number[];
  placeholder: string;
};

export type PhoneCountryId = "ru" | "by" | "kz" | "am" | "kg" | "uz" | "tj" | "az" | "md" | "tm";

export type VerificationPhase = "typing" | "checking" | "success" | "error";
