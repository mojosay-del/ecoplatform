import { redirect } from "next/navigation";
import { getLegacyAccountTabHref } from "../../src/components/app-shell-nav";

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ tab?: string | string[] }> }) {
  const params = await searchParams;
  const tab = Array.isArray(params.tab) ? params.tab[0] : params.tab;
  redirect(getLegacyAccountTabHref(tab) ?? "/account/profile");
}
