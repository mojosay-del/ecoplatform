import { notFound, redirect } from "next/navigation";
import { normalizeAccountSection } from "../../../src/components/app-shell-nav";
import { AccountView } from "../../../src/views/account-view";

export default async function AccountSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (
    section === "security" ||
    section === "company" ||
    section === "billing" ||
    section === "sessions" ||
    section === "notifications" ||
    section === "support"
  ) {
    redirect("/account/profile");
  }

  const normalized = normalizeAccountSection(section);
  if (!normalized) notFound();

  return <AccountView section={normalized} />;
}
