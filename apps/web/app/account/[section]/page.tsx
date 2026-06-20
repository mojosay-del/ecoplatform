import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import {
  getLegacyAccountTabHref,
  normalizeAccountSection,
  type AccountSectionId,
} from "../../../src/components/app-shell-nav";
import { createPageMetadata } from "../../../src/lib/seo";
import { AccountView } from "../../../src/views/account";

const ACCOUNT_SECTION_TITLES: Record<AccountSectionId, string> = {
  profile: "Профиль",
  "data-privacy": "Данные и приватность",
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ section: string }>;
}): Promise<Metadata> {
  const { section } = await params;
  const normalized = normalizeAccountSection(section);
  return createPageMetadata({
    title: normalized ? ACCOUNT_SECTION_TITLES[normalized] : "Настройки",
    description: "Личный кабинет на ЭкоПлатформе.",
    path: "/account/profile",
    noIndex: true,
  });
}

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
