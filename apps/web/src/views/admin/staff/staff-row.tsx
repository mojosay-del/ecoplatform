import Image from "next/image";
import { UserRound } from "lucide-react";
import { StatusPill } from "../../../components/StatusPill";
import { PLATFORM_ROLE_SHORT_LABELS, STAFF_STATUS_LABELS, formatPlatformRoles } from "../../../lib/display-labels";
import { allStaffRoles } from "./constants";
import type { StaffItem, StaffPatch } from "./types";

type StaffRowProps = {
  staff: StaffItem;
  onUpdateStaff: (userId: string, patch: StaffPatch) => void;
};

export function StaffRow({ staff, onUpdateStaff }: StaffRowProps) {
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
        <div className="admin-table-actions">
          {allStaffRoles.map((role) => {
            const hasRole = staff.roles.includes(role);
            return (
              <button
                className={`button ${hasRole ? "secondary" : ""}`}
                key={role}
                onClick={() =>
                  onUpdateStaff(staff.userId, {
                    roles: hasRole ? staff.roles.filter((item) => item !== role) : [...staff.roles, role],
                  })
                }
                type="button"
              >
                {hasRole ? `Снять ${PLATFORM_ROLE_SHORT_LABELS[role]}` : `Дать ${PLATFORM_ROLE_SHORT_LABELS[role]}`}
              </button>
            );
          })}
          <button
            className="button secondary"
            onClick={() => onUpdateStaff(staff.userId, { isActive: !staff.isActive })}
            type="button"
          >
            {staff.isActive ? "Деактивировать" : "Активировать"}
          </button>
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
