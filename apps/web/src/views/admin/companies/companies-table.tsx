import { AdminSortButton } from "../../../components/AdminSortButton";
import type { SortState } from "../../../components/admin-table-utils";
import { AdminCompanyRow } from "./company-row";
import type { AdminCompanyListItem, CompanySortKey } from "./types";

type AdminCompaniesTableProps = {
  companies: AdminCompanyListItem[];
  sort: SortState<CompanySortKey>;
  selectedCompanyId: string | null;
  onOpenCompany: (id: string) => void;
  onSort: (sort: SortState<CompanySortKey>) => void;
};

export function AdminCompaniesTable({
  companies,
  sort,
  selectedCompanyId,
  onOpenCompany,
  onSort,
}: AdminCompaniesTableProps) {
  return (
    <div className="admin-table-scroll">
      <table className="admin-table">
        <thead>
          <tr>
            <th scope="col">
              <AdminSortButton label="Компания" sort={sort} sortKey="name" onSort={onSort} />
            </th>
            <th scope="col">
              <AdminSortButton label="Статус" sort={sort} sortKey="status" onSort={onSort} />
            </th>
            <th scope="col">
              <AdminSortButton label="Тариф" sort={sort} sortKey="plan" onSort={onSort} />
            </th>
            <th scope="col">
              <AdminSortButton label="Польз." sort={sort} sortKey="users" onSort={onSort} />
            </th>
            <th scope="col">
              <AdminSortButton label="Тикеты" sort={sort} sortKey="tickets" onSort={onSort} />
            </th>
            <th scope="col">
              <AdminSortButton label="Подписки" sort={sort} sortKey="subscriptions" onSort={onSort} />
            </th>
            <th scope="col">
              <AdminSortButton
                defaultDirection="desc"
                label="Создана"
                sort={sort}
                sortKey="createdAt"
                onSort={onSort}
              />
            </th>
          </tr>
        </thead>
        <tbody>
          {companies.map((company) => (
            <AdminCompanyRow
              company={company}
              isActive={selectedCompanyId === company.id}
              key={company.id}
              onOpen={onOpenCompany}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
