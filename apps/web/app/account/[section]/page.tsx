import { notFound, redirect } from "next/navigation";
import { getLegacyAccountTabHref, normalizeAccountSection } from "../../../src/components/app-shell-nav";
import { AccountView } from "../../../src/views/account";

export default async function AccountSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  const normalized = normalizeAccountSection(section);
  if (!normalized) {
    const legacyHref = getLegacyAccountTabHref(section);
    if (legacyHref) redirect(legacyHref);
    notFound();
  }

  return <AccountView section={normalized} />;
}
