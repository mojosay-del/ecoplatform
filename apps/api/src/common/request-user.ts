import type { CompanyRole } from "@prisma/client";
import type { CompanyAccessSnapshot, PlatformRole } from "@ecoplatform/shared";

export type RequestUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  companyId: string | null;
  companyRole: CompanyRole;
  platformRoles: PlatformRole[];
  company: CompanyAccessSnapshot | null;
  sessionId: string;
};
