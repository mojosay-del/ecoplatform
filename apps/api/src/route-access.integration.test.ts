import { CompanyType } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { setupIntegrationContext } from "./test/integration-context";

const ctx = setupIntegrationContext();
const { loginAdmin, loginContentManager, loginModerator, registerCompany, registerWithBody } = ctx;

type Actor = "admin" | "contentManager" | "moderator" | "collector" | "anonymous";
type ApiProbe = {
  label: string;
  path: string;
  allowed: Actor[];
  method?: "get" | "post";
};

async function registerCompanyByType(companyType: CompanyType, suffix: string): Promise<string> {
  return registerWithBody({
    organizationName: `ООО ${companyType} ${suffix}`,
    companyType,
    firstName: "Иван",
    lastName: "Тестов",
    gender: "male",
    phone: `+7920${suffix}`,
    email: `${companyType}-${suffix}@test.local`,
    password: "User12345678",
  });
}

async function requestProbe(path: string, token: string | null, method: ApiProbe["method"] = "get") {
  const request = method === "post" ? ctx.http.post(path) : ctx.http.get(path);
  return token ? request.set("Authorization", `Bearer ${token}`) : request;
}

async function expectProbeMatrix(probes: ApiProbe[], tokens: Record<Actor, string | null>) {
  for (const probe of probes) {
    for (const actor of Object.keys(tokens) as Actor[]) {
      const response = await requestProbe(probe.path, tokens[actor], probe.method);
      if (probe.allowed.includes(actor)) {
        expect(response.status, `${probe.label}: ${actor}`).toBe(probe.method === "post" ? 201 : 200);
      } else {
        expect(response.status, `${probe.label}: ${actor}`).toBe(actor === "anonymous" ? 401 : 403);
      }
    }
  }
}

async function createPublishedLearningModule(adminToken: string, suffix: string) {
  const moduleRes = await ctx.http
    .post("/api/admin/content/education/modules")
    .set("Authorization", `Bearer ${adminToken}`)
    .send({
      title: `Маршрутный модуль ${suffix}`,
      summary: "Кратко",
      description: "Полное описание",
      accessLevel: "basic",
      preview: { promotionalDescription: "Превью", whatYouWillLearn: [] },
      chapters: [],
    });
  expect(moduleRes.status).toBe(201);

  const chapterRes = await ctx.http
    .post(`/api/admin/content/education/modules/${moduleRes.body.id}/chapters`)
    .set("Authorization", `Bearer ${adminToken}`)
    .send({ title: "Глава 1", position: 0 });
  expect(chapterRes.status).toBe(201);

  const lessonRes = await ctx.http
    .post(`/api/admin/content/education/chapters/${chapterRes.body.id}/lessons`)
    .set("Authorization", `Bearer ${adminToken}`)
    .send({
      title: "Урок 1",
      position: 0,
      blocks: [{ type: "paragraph", payload: { html: "<p>Тело урока.</p>" } }],
      attachments: [],
    });
  expect(lessonRes.status).toBe(201);

  const publish = await ctx.http
    .post(`/api/admin/content/education/modules/${moduleRes.body.id}/publish`)
    .set("Authorization", `Bearer ${adminToken}`);
  expect(publish.status).toBe(201);

  return { moduleId: moduleRes.body.id as string, lessonId: lessonRes.body.id as string };
}

describe("Route access matrix", () => {
  it("/calculators/retail keeps trip calculator data collector-only", async () => {
    const collector = await registerCompany("1200001");
    const traderToken = await registerCompanyByType(CompanyType.trader, "1200002");
    const processorToken = await registerCompanyByType(CompanyType.processor, "1200003");
    const adminToken = await loginAdmin();
    const contentManagerToken = await loginContentManager();

    const actors = [
      { label: "collector", token: collector.token, expected: 200 },
      { label: "trader", token: traderToken, expected: 403 },
      { label: "processor", token: processorToken, expected: 403 },
      { label: "admin", token: adminToken, expected: 403 },
      { label: "contentManager", token: contentManagerToken, expected: 403 },
      { label: "anonymous", token: null, expected: 401 },
    ] as const;

    for (const actor of actors) {
      const response = await requestProbe("/api/trip-calculator/settings", actor.token);
      expect(response.status, actor.label).toBe(actor.expected);
    }
  });

  it("/education and nested learning pages expose data only to collectors and platform staff", async () => {
    const adminToken = await loginAdmin();
    const contentManagerToken = await loginContentManager();
    const moderatorToken = await loginModerator();
    const collector = await registerCompany("1200011");
    const traderToken = await registerCompanyByType(CompanyType.trader, "1200012");
    const processorToken = await registerCompanyByType(CompanyType.processor, "1200013");
    const { moduleId, lessonId } = await createPublishedLearningModule(adminToken, "access");

    const tokens: Record<Actor, string | null> = {
      admin: adminToken,
      contentManager: contentManagerToken,
      moderator: moderatorToken,
      collector: collector.token,
      anonymous: null,
    };
    const deniedTokens = [
      { label: "trader", token: traderToken },
      { label: "processor", token: processorToken },
    ];
    const probes: ApiProbe[] = [
      {
        label: "education list",
        path: "/api/education/modules?limit=10",
        allowed: ["admin", "contentManager", "moderator", "collector"],
      },
      {
        label: "education module",
        path: `/api/education/modules/${moduleId}`,
        allowed: ["admin", "contentManager", "moderator", "collector"],
      },
      {
        label: "lesson complete",
        path: `/api/education/lessons/${lessonId}/complete`,
        allowed: ["admin", "contentManager", "moderator", "collector"],
        method: "post",
      },
    ];

    await expectProbeMatrix(probes, tokens);

    for (const probe of probes) {
      for (const actor of deniedTokens) {
        const response = await requestProbe(probe.path, actor.token, probe.method);
        expect(response.status, `${probe.label}: ${actor.label}`).toBe(403);
      }
    }
  });

  it("/admin/* API probes match the staff role navigation matrix", async () => {
    const adminToken = await loginAdmin();
    const contentManagerToken = await loginContentManager();
    const moderatorToken = await loginModerator();
    const collector = await registerCompany("1200021");
    const tokens: Record<Actor, string | null> = {
      admin: adminToken,
      contentManager: contentManagerToken,
      moderator: moderatorToken,
      collector: collector.token,
      anonymous: null,
    };

    await expectProbeMatrix(
      [
        {
          label: "/admin",
          path: "/api/admin/overview",
          allowed: ["admin", "contentManager", "moderator"],
        },
        {
          label: "/admin/analytics",
          path: "/api/admin/dashboard",
          allowed: ["admin"],
        },
        {
          label: "/admin/content/news",
          path: "/api/admin/content/news?limit=1",
          allowed: ["admin", "contentManager"],
        },
        {
          label: "/admin/content/indices",
          path: "/api/admin/content/indices?limit=1",
          allowed: ["admin", "contentManager"],
        },
        {
          label: "/admin/content/education",
          path: "/api/admin/content/education?limit=1",
          allowed: ["admin", "contentManager"],
        },
        {
          label: "/admin/content/knowledge-base",
          path: "/api/admin/content/knowledge-base?limit=1",
          allowed: ["admin", "contentManager"],
        },
        {
          label: "/admin/content/documentation",
          path: "/api/admin/content/documentation?limit=1",
          allowed: ["admin", "contentManager"],
        },
        {
          label: "/admin/users",
          path: "/api/admin/users?limit=1",
          allowed: ["admin"],
        },
        {
          label: "/admin/companies",
          path: "/api/admin/companies?limit=1",
          allowed: ["admin"],
        },
        {
          label: "/admin/staff",
          path: "/api/admin/staff?limit=1",
          allowed: ["admin"],
        },
        {
          label: "/admin/support",
          path: "/api/admin/support/tickets?limit=1",
          allowed: ["admin"],
        },
        {
          label: "/admin/billing",
          path: "/api/admin/billing/companies?limit=1",
          allowed: ["admin"],
        },
        {
          label: "/admin/moderation",
          path: "/api/admin/moderation/cases?limit=1",
          allowed: ["admin", "moderator"],
        },
        {
          label: "/admin/journals",
          path: "/api/admin/journals?limit=1",
          allowed: ["admin"],
        },
        {
          label: "/admin/settings",
          path: "/api/admin/settings",
          allowed: ["admin"],
        },
      ],
      tokens,
    );
  });
});
