import { AdminSortButton } from "../../../components/AdminSortButton";
import { StatusPill, userStatusPillVariant } from "../../../components/StatusPill";
import type { SortState } from "../../../components/admin-table-utils";
import { USER_STATUS_LABELS, formatPlatformRoles } from "../../../lib/display-labels";
import type { AdminUserListItem, UserSortKey } from "./types";

type AdminUsersTableProps = {
  users: AdminUserListItem[];
  sort: SortState<UserSortKey>;
  selectedUserId: string | null;
  onOpenUser: (id: string) => void;
  onSort: (sort: SortState<UserSortKey>) => void;
};

export function AdminUsersTable({ users, sort, selectedUserId, onOpenUser, onSort }: AdminUsersTableProps) {
  return (
    <div className="admin-table-scroll">
      <table className="admin-table">
        <thead>
          <tr>
            <th scope="col">
              <AdminSortButton label="Пользователь" sort={sort} sortKey="name" onSort={onSort} />
            </th>
            <th scope="col">
              <AdminSortButton label="Статус" sort={sort} sortKey="status" onSort={onSort} />
            </th>
            <th scope="col">
              <AdminSortButton label="Компания" sort={sort} sortKey="company" onSort={onSort} />
            </th>
            <th scope="col">
              <AdminSortButton label="Роли" sort={sort} sortKey="role" onSort={onSort} />
            </th>
            <th scope="col">
              <AdminSortButton label="Телефон" sort={sort} sortKey="phone" onSort={onSort} />
            </th>
            <th scope="col">
              <AdminSortButton defaultDirection="desc" label="Создан" sort={sort} sortKey="createdAt" onSort={onSort} />
            </th>
          </tr>
        </thead>
        <tbody>
          {users.map((item) => (
            <tr className={selectedUserId === item.id ? "active" : ""} key={item.id}>
              <td>
                <div className="admin-table-cell-main">
                  <button className="admin-row-button" onClick={() => onOpenUser(item.id)} type="button">
                    {item.firstName} {item.lastName}
                  </button>
                  <span className="admin-table-muted">{item.email}</span>
                </div>
              </td>
              <td>
                <StatusPill variant={userStatusPillVariant(item.status)}>{USER_STATUS_LABELS[item.status]}</StatusPill>
              </td>
              <td>{item.company?.organizationName ?? "Без компании"}</td>
              <td>{formatPlatformRoles(item.platformStaff?.isActive ? item.platformStaff.roles : [])}</td>
              <td>{item.phone}</td>
              <td>{new Date(item.createdAt).toLocaleDateString("ru-RU")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
