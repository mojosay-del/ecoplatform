import { AdminJsonEditor } from "../../../src/components/AdminJsonEditor";

const sample = {
  companyId: "ID компании",
  plan: "basic",
  endsAt: "2026-06-20T00:00:00.000Z",
  reason: "Ручная активация на первом dev-этапе без платёжного шлюза",
};

export default function AdminBillingPage() {
  return (
    <AdminJsonEditor
      title="Админ / Ручная подписка"
      endpoint="/admin/billing/manual-subscriptions"
      listEndpoint="/admin/billing/companies"
      listTitleKey="organizationName"
      sample={sample}
    />
  );
}
