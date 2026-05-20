import type { CompanyAccessSnapshot, PlatformRole } from "@ecoplatform/shared";

export type RequestUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  companyId: string | null;
  platformRoles: PlatformRole[];
  company: CompanyAccessSnapshot | null;
  sessionId: string;
};
