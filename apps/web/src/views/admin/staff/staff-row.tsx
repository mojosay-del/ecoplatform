import Image from "next/image";
import { UserRound } from "lucide-react";
import { RowKebab, type ActionItem } from "../../../components/RowKebab";
import { StatusPill } from "../../../components/StatusPill";
import { PLATFORM_ROLE_SHORT_LABELS, STAFF_STATUS_LABELS, formatPlatformRoles } from "../../../lib/display-labels";
import { allStaffRoles } from "./constants";
import type { StaffItem, StaffPatch } from "./types";

type StaffRowProps = {
  staff: StaffItem;
  onUpdateStaff: (userId: string, patch: StaffPatch) => void;
  onResetPassword: (staff: StaffItem) => void;
};

export function StaffRow({ staff, onUpdateStaff, onResetPassword }: StaffRowProps) {
  // Действия строки собраны в одно kebab-меню вместо частокола кнопок:
  // переключение ролей, активность и сброс пароля. Опасные действия (снятие
  // admin, деактивация) подтверждаются.
  const roleActions: ActionItem[] = allStaffRoles.map((role) => {
    const hasRole = staff.roles.includes(role);
    const label = hasRole
      ? `Снять роль: ${PLATFORM_ROLE_SHORT_LABELS[role]}`
      : `Дать роль: ${PLATFORM_ROLE_SHORT_LABELS[role]}`;
    return {
      label,
      danger: hasRole && role === "admin",
      onClick: () => {
        if (hasRole && role === "admin" && !confirm("Снять роль администратора у этого сотрудника?")) return;
        onUpdateStaff(staff.userId, {
          roles: hasRole ? staff.roles.filter((item) => item !== role) : [...staff.roles, role],
        });
      },
    };
  });

  const actions: ActionItem[] = [
    ...roleActions,
    {
      label: staff.isActive ? "Деактивировать" : "Активировать",
      danger: staff.isActive,
      onClick: () => {
        if (staff.isActive && !confirm("Деактивировать сотрудника? Его активные сессии будут сброшены.")) return;
        onUpdateStaff(staff.userId, { isActive: !staff.isActive });
      },
    },
    {
      label: "Сбросить пароль",
      onClick: () => onResetPassword(staff),
    },
  ];

  return (
    <tr>
      <td>
        <div className="staff-profile">
          {staff.user.gender ? (
            <Image
              className="staff-avatar"
              alt=""
              src={resolvePlatformAvatarUrl(staff.roles, staff.user.gender)}
              width={36}
              height={36}
            />
          ) : (
            <span className="staff-avatar staff-avatar-placeholder" aria-hidden="true">
              <UserRound size={18} />
            </span>
          )}
          <div className="admin-table-cell-main">
            <strong>
              {staff.user.firstName} {staff.user.lastName}
            </strong>
            <span className="admin-table-muted">{staff.user.phone}</span>
          </div>
        </div>
      </td>
      <td>
        <StatusPill variant={staff.isActive ? "success" : "danger"}>
          {staff.isActive ? STAFF_STATUS_LABELS.active : STAFF_STATUS_LABELS.inactive}
        </StatusPill>
      </td>
      <td>{formatPlatformRoles(staff.roles)}</td>
      <td>{staff.user.email}</td>
      <td>{new Date(staff.createdAt).toLocaleDateString("ru-RU")}</td>
      <td>
        <div className="admin-table-actions admin-table-actions-end">
          <RowKebab actions={actions} />
        </div>
      </td>
    </tr>
  );
}

function resolvePlatformAvatarUrl(roles: string[], gender: "male" | "female"): string {
  const suffix = gender === "female" ? "woman" : "man";
  const prefix = roles.includes("admin") ? "a" : "m";

  return `/avatars/platform/${prefix}${suffix}.png`;
}
