import { createHash } from "crypto";
import { describe, expect, it } from "vitest";
import { setupIntegrationContext } from "./test/integration-context";
import { bearer } from "./test/marketplace-integration-helpers";

const ctx = setupIntegrationContext();
const { registerCompany, createCompanyMember } = ctx;

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

describe("Company members — сотрудники компании", () => {
  it("владелец приглашает сотрудника; недоступные разделы отсекаются, email в lowercase", async () => {
    const owner = await registerCompany("0009401");
    const invite = await ctx.http
      .post("/api/company/members/invitations")
      .set(bearer(owner.token))
      .send({ email: "Emp1@Test.local", allowedSections: ["news", "forum", "bogus-section"] });
    expect(invite.status).toBe(201);
    expect(invite.body.isOwner).toBe(true);
    expect(invite.body.invitations).toHaveLength(1);
    const [pending] = invite.body.invitations;
    expect(pending.email).toBe("emp1@test.local");
    expect(pending.allowedSections).toEqual(expect.arrayContaining(["news", "forum"]));
    expect(pending.allowedSections).not.toContain("bogus-section");
  });

  it("сотрудник (не владелец) не может управлять сотрудниками", async () => {
    const owner = await registerCompany("0009402");
    const member = await createCompanyMember(owner.companyId, "0009402");
    const forbidden = await ctx.http.get("/api/company/members").set(bearer(member.token));
    expect(forbidden.status).toBe(403);
  });

  it("принятие приглашения создаёт сотрудника-member с выбранными разделами", async () => {
    const owner = await registerCompany("0009403");
    const token = "invite-0009403-abcdefghijklmnopqrstuvwx";
    await ctx.prisma.companyInvitation.create({
      data: {
        companyId: owner.companyId,
        email: "emp3@test.local",
        invitedById: owner.userId,
        role: "member",
        allowedSections: ["news", "knowledge-base"],
        tokenHash: tokenHash(token),
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    });

    const info = await ctx.http.get(`/api/company/invitations/${token}`);
    expect(info.status).toBe(200);
    expect(info.body.email).toBe("emp3@test.local");
    expect(info.body.companyName).toBe("ООО Тест 0009403");

    const requiredDocs = await ctx.prisma.legalDocument.findMany({
      where: { isActive: true, isRequired: true },
      select: { id: true },
    });
    const acceptedDocumentIds = requiredDocs.map((document) => document.id);

    const accept = await ctx.http.post(`/api/company/invitations/${token}/accept`).send({
      firstName: "Пётр",
      lastName: "Новичков",
      phone: "+79995550403",
      password: "MemberPass12345",
      acceptedDocumentIds,
    });
    expect(accept.status).toBe(201);
    expect(accept.body.email).toBe("emp3@test.local");

    const created = await ctx.prisma.user.findUniqueOrThrow({ where: { email: "emp3@test.local" } });
    expect(created.companyId).toBe(owner.companyId);
    expect(created.companyRole).toBe("member");
    expect(created.allowedSections).toEqual(["news", "knowledge-base"]);

    // Авто-логин на фронте — обычным логином теми же кредами; me отдаёт роль/разделы.
    const login = await ctx.http
      .post("/api/auth/login")
      .send({ email: "emp3@test.local", password: "MemberPass12345" });
    expect(login.status).toBe(201);
    const me = await ctx.http.get("/api/auth/me").set(bearer(login.body.accessToken));
    expect(me.body.companyRole).toBe("member");
    expect(me.body.memberSections).toEqual(["news", "knowledge-base"]);

    // Повторное принятие того же токена — недействительно.
    const again = await ctx.http.post(`/api/company/invitations/${token}/accept`).send({
      firstName: "Пётр",
      lastName: "Новичков",
      phone: "+79995550499",
      password: "MemberPass12345",
    });
    expect(again.status).toBe(400);
  });

  it("владелец меняет разделы сотрудника и удаляет его", async () => {
    const owner = await registerCompany("0009404");
    const member = await createCompanyMember(owner.companyId, "0009404");

    const patched = await ctx.http
      .patch(`/api/company/members/${member.userId}/sections`)
      .set(bearer(owner.token))
      .send({ allowedSections: ["news", "forum"] });
    expect(patched.status).toBe(200);
    const updated = await ctx.prisma.user.findUniqueOrThrow({ where: { id: member.userId } });
    expect(updated.allowedSections).toEqual(expect.arrayContaining(["news", "forum"]));

    const removed = await ctx.http.delete(`/api/company/members/${member.userId}`).set(bearer(owner.token));
    expect(removed.status).toBe(200);
    const gone = await ctx.prisma.user.findUnique({ where: { id: member.userId } });
    expect(gone).toBeNull();
  });
});
