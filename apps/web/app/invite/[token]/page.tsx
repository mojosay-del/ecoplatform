import { InviteAcceptForm } from "../../../src/components/auth/invite-accept-form";
import { createPageMetadata } from "../../../src/lib/seo";

export const metadata = createPageMetadata({
  title: "Приглашение в компанию",
  description: "Принятие приглашения сотрудника на ЭкоПлатформе.",
  path: "/invite",
  noIndex: true,
});

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <InviteAcceptForm token={token} />;
}
