import type {
  AcceptCompanyInvitationDto,
  CompanyInvitationInfo,
  CompanyInviteDto,
  CompanyMemberSectionsDto,
  CompanyMembersView,
} from "@ecoplatform/shared";
import { enc } from "./endpoint-utils";
import { apiFetch } from "./requests";

// Кабинет «Сотрудники» (управление — только владелец) + публичный приём приглашения.
export const companyMembersApi = {
  list: () => apiFetch<CompanyMembersView>("/company/members"),
  invite: (dto: CompanyInviteDto) =>
    apiFetch<CompanyMembersView>("/company/members/invitations", { method: "POST", body: dto }),
  revokeInvitation: (id: string) =>
    apiFetch<CompanyMembersView>(`/company/members/invitations/${enc(id)}`, { method: "DELETE" }),
  setSections: (userId: string, dto: CompanyMemberSectionsDto) =>
    apiFetch<CompanyMembersView>(`/company/members/${enc(userId)}/sections`, { method: "PATCH", body: dto }),
  removeMember: (userId: string) =>
    apiFetch<CompanyMembersView>(`/company/members/${enc(userId)}`, { method: "DELETE" }),
  invitationInfo: (token: string) => apiFetch<CompanyInvitationInfo>(`/company/invitations/${enc(token)}`),
  accept: (token: string, dto: AcceptCompanyInvitationDto) =>
    apiFetch<{ ok: true; email: string }>(`/company/invitations/${enc(token)}/accept`, {
      method: "POST",
      body: dto,
    }),
};
