import { AdminSortButton } from "../../../components/AdminSortButton";
import type { SortState } from "../../../components/admin-table-utils";
import { StaffRow } from "./staff-row";
import type { StaffItem, StaffPatch, StaffSortKey } from "./types";

type StaffTableProps = {
  staff: StaffItem[];
  sort: SortState<StaffSortKey>;
  onSort: (sort: SortState<StaffSortKey>) => void;
  onUpdateStaff: (userId: string, patch: StaffPatch) => void;
  onResetPassword: (staff: StaffItem) => void;
};

export function StaffTable({ staff, sort, onSort, onUpdateStaff, onResetPassword }: StaffTableProps) {
  return (
    <div className="admin-table-scroll">
      <table className="admin-table">
        <thead>
          <tr>
            <th scope="col">
              <AdminSortButton label="Сотрудник" sort={sort} sortKey="name" onSort={onSort} />
            </th>
            <th scope="col">
              <AdminSortButton label="Статус" sort={sort} sortKey="status" onSort={onSort} />
            </th>
            <th scope="col">
              <AdminSortButton label="Роли" sort={sort} sortKey="role" onSort={onSort} />
            </th>
            <th scope="col">
              <AdminSortButton label="Email" sort={sort} sortKey="email" onSort={onSort} />
            </th>
            <th scope="col">
              <AdminSortButton defaultDirection="desc" label="Создан" sort={sort} sortKey="createdAt" onSort={onSort} />
            </th>
            <th scope="col">Действия</th>
          </tr>
        </thead>
        <tbody>
          {staff.map((item) => (
            <StaffRow key={item.id} staff={item} onUpdateStaff={onUpdateStaff} onResetPassword={onResetPassword} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
