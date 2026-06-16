import { describe, expect, it } from "vitest";
import { setupIntegrationContext } from "./test/integration-context";

const ctx = setupIntegrationContext();
const { loginAdmin, registerCompany, createPublishedKnowledgeArticle } = ctx;

describe("Content lifecycle: knowledge base", () => {
  it("publish → виден публично, unpublish → исчезает, delete → 404 на slug", async () => {
    const adminToken = await loginAdmin();
    const reader = await registerCompany("0800002");
    const article = await createPublishedKnowledgeArticle(adminToken, "lifecycle");

    const tree = await ctx.http.get("/api/knowledge-base").set("Authorization", `Bearer ${reader.token}`);
    expect(tree.body.find((item: { id: string }) => item.id === article.id)).toBeTruthy();

    const unpublish = await ctx.http
      .post(`/api/admin/content/knowledge-base/${article.id}/unpublish`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ reason: "тест" });
    expect(unpublish.status).toBe(201);

    const afterUnpublish = await ctx.http.get("/api/knowledge-base").set("Authorization", `Bearer ${reader.token}`);
    expect(afterUnpublish.body.find((item: { id: string }) => item.id === article.id)).toBeUndefined();

    const del = await ctx.http
      .delete(`/api/admin/content/knowledge-base/${article.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ reason: "тест" });
    expect(del.status).toBe(200);

    const slugLookup = await ctx.http
      .get(`/api/knowledge-base/${article.slug}`)
      .set("Authorization", `Bearer ${reader.token}`);
    expect(slugLookup.status).toBe(404);
  });

  it("PATCH статьи заменяет блоки и пишет в audit log", async () => {
    const adminToken = await loginAdmin();
    const draft = await ctx.http
      .post("/api/admin/content/knowledge-base")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        title: "Статья для PATCH",
        position: 0,
        blocks: [{ type: "paragraph", payload: { html: "<p>Старый текст.</p>" } }],
      });
    expect(draft.status).toBe(201);

    const patched = await ctx.http
      .patch(`/api/admin/content/knowledge-base/${draft.body.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        title: "Статья после PATCH",
        position: 0,
        blocks: [
          { type: "heading", payload: { text: "Новый заголовок" } },
          { type: "paragraph", payload: { html: "<p>Новый текст.</p>" } },
        ],
      });
    expect(patched.status).toBe(200);
    expect(patched.body.title).toBe("Статья после PATCH");
    expect(patched.body.blocks).toHaveLength(2);
    expect(patched.body.blocks[0].type).toBe("heading");

    const log = await ctx.prisma.adminActionLog.findFirst({
      where: { entityId: draft.body.id, action: "knowledge.update" },
    });
    expect(log).toBeTruthy();
  });

  it("создаёт и публикует категорию базы знаний с пустыми блоками", async () => {
    const adminToken = await loginAdmin();
    const reader = await registerCompany("0800003");

    const category = await ctx.http
      .post("/api/admin/content/knowledge-base")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        title: "Категория БЗ без блоков",
        position: 0,
        iconType: "category",
        displayIcon: "Newspaper",
        blocks: [],
      });
    expect(category.status).toBe(201);
    expect(category.body.displayIcon).toBe("Newspaper");

    const publish = await ctx.http
      .post(`/api/admin/content/knowledge-base/${category.body.id}/publish`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(publish.status).toBe(201);
    expect(publish.body.status).toBe("published");

    const tree = await ctx.http.get("/api/knowledge-base?depth=1").set("Authorization", `Bearer ${reader.token}`);
    const categoryNode = tree.body.find((item: { id: string }) => item.id === category.body.id);
    expect(categoryNode).toBeTruthy();
    expect(categoryNode.displayIcon).toBe("Newspaper");
  });

  it("сохраняет пустой материал как черновик, но запрещает публикацию без блоков", async () => {
    const adminToken = await loginAdmin();
    const category = await ctx.http
      .post("/api/admin/content/knowledge-base")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        title: "Категория для пустого материала",
        position: 0,
        iconType: "category",
        blocks: [],
      });
    expect(category.status).toBe(201);

    const material = await ctx.http
      .post("/api/admin/content/knowledge-base")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        parentId: category.body.id,
        title: "Пустой черновик БЗ",
        position: 0,
        blocks: [],
      });
    expect(material.status).toBe(201);
    expect(material.body.status).toBe("draft");

    const publish = await ctx.http
      .post(`/api/admin/content/knowledge-base/${material.body.id}/publish`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(publish.status).toBe(403);
  });

  it("перемещает материалы внутри одной категории и отдаёт новый порядок", async () => {
    const adminToken = await loginAdmin();
    const category = await ctx.http
      .post("/api/admin/content/knowledge-base")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        title: "Категория для сортировки материалов",
        position: 0,
        iconType: "category",
        blocks: [],
      });
    expect(category.status).toBe(201);

    const first = await ctx.http
      .post("/api/admin/content/knowledge-base")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        parentId: category.body.id,
        title: "Материал БЗ 1",
        position: 0,
        blocks: [{ type: "paragraph", payload: { html: "<p>Первый.</p>" } }],
      });
    expect(first.status).toBe(201);

    const second = await ctx.http
      .post("/api/admin/content/knowledge-base")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        parentId: category.body.id,
        title: "Материал БЗ 2",
        position: 1,
        blocks: [{ type: "paragraph", payload: { html: "<p>Второй.</p>" } }],
      });
    expect(second.status).toBe(201);

    const move = await ctx.http
      .patch(`/api/admin/content/knowledge-base/${second.body.id}/move`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ parentId: category.body.id, position: 0 });
    expect(move.status).toBe(200);

    const list = await ctx.http
      .get("/api/admin/content/knowledge-base?limit=200")
      .set("Authorization", `Bearer ${adminToken}`);
    const materials = list.body.items
      .filter((item: { parentId: string | null }) => item.parentId === category.body.id)
      .sort((a: { position: number }, b: { position: number }) => a.position - b.position);
    expect(materials.map((item: { id: string }) => item.id)).toEqual([second.body.id, first.body.id]);
    expect(materials.map((item: { position: number }) => item.position)).toEqual([0, 1]);
  });
});
