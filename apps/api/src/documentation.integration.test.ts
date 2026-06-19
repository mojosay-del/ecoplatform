import { describe, expect, it } from "vitest";
import { FileAccessLevel } from "@prisma/client";
import { setupIntegrationContext } from "./test/integration-context";
import { withEnv } from "./test/integration-helpers";

const ctx = setupIntegrationContext();
const { loginAdmin, loginContentManager, registerCompany } = ctx;

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

async function createDocFileAsset(uploadedById: string, name: string, sizeBytes = 2048) {
  return ctx.prisma.fileAsset.create({
    data: {
      originalName: name,
      mimeType: "application/octet-stream",
      sizeBytes,
      storageKey: `test/${name}`,
      accessLevel: FileAccessLevel.public,
      uploadedById,
    },
  });
}

type DocInput = {
  title: string;
  parentId?: string | null;
  iconType?: string;
  displayIcon?: string | null;
  subtitle?: string | null;
  fileAssetId?: string | null;
  version?: string | null;
  isPinned?: boolean;
  effectiveDate?: string | null;
  blocks?: Array<{ type: string; payload: Record<string, unknown> }>;
  position?: number;
};

async function createDraftDocument(adminToken: string, input: DocInput) {
  const res = await ctx.http
    .post("/api/admin/content/documentation")
    .set(auth(adminToken))
    .send({ position: 0, blocks: [], ...input });
  expect(res.status).toBe(201);
  return res.body as { id: string; slug: string; status: string; displayIcon: string | null };
}

async function publishDocument(adminToken: string, id: string) {
  const res = await ctx.http.post(`/api/admin/content/documentation/${id}/publish`).set(auth(adminToken));
  expect(res.status).toBe(201);
  return res.body;
}

async function adminId() {
  const admin = await ctx.prisma.user.findUniqueOrThrow({ where: { email: "admin@test.local" } });
  return admin.id;
}

describe("Documentation: lifecycle", () => {
  it("publish → виден в дереве, unpublish → исчезает, delete → 404 на slug", async () => {
    const adminToken = await loginAdmin();
    const reader = await registerCompany("0810001");
    // Без прикреплённого файла: delete опубликованного документа не должен дёргать
    // S3-удаление осиротевшего файла (мету/скачивание файла проверяют другие тесты).
    const draft = await createDraftDocument(adminToken, {
      title: "Регламент по обращению с отходами",
      blocks: [{ type: "paragraph", payload: { html: "<p>Текст регламента.</p>" } }],
    });
    await publishDocument(adminToken, draft.id);

    const tree = await ctx.http.get("/api/documentation").set(auth(reader.token));
    expect(tree.status).toBe(200);
    expect(tree.body.find((node: { id: string }) => node.id === draft.id)).toBeTruthy();

    const unpublish = await ctx.http
      .post(`/api/admin/content/documentation/${draft.id}/unpublish`)
      .set(auth(adminToken))
      .send({ reason: "тест" });
    expect(unpublish.status).toBe(201);

    const afterUnpublish = await ctx.http.get("/api/documentation").set(auth(reader.token));
    expect(afterUnpublish.body.find((node: { id: string }) => node.id === draft.id)).toBeUndefined();

    const del = await ctx.http
      .delete(`/api/admin/content/documentation/${draft.id}`)
      .set(auth(adminToken))
      .send({ reason: "тест" });
    expect(del.status).toBe(200);

    const slugLookup = await ctx.http.get(`/api/documentation/${draft.slug}`).set(auth(reader.token));
    expect(slugLookup.status).toBe(404);
  });

  it("карточка документа отдаёт формат и размер прикреплённого файла", async () => {
    const adminToken = await loginAdmin();
    const reader = await registerCompany("0810002");
    const file = await createDocFileAsset(await adminId(), "dogovor-postavki.docx", 4096);
    const draft = await createDraftDocument(adminToken, {
      title: "Договор поставки вторсырья",
      subtitle: "Базовый шаблон",
      fileAssetId: file.id,
    });
    await publishDocument(adminToken, draft.id);

    const tree = await ctx.http.get("/api/documentation").set(auth(reader.token));
    const node = tree.body.find((item: { id: string }) => item.id === draft.id);
    expect(node).toBeTruthy();
    expect(node.subtitle).toBe("Базовый шаблон");
    expect(node.file).toMatchObject({ fileName: "dogovor-postavki.docx", format: "docx", sizeBytes: 4096 });

    const detail = await ctx.http.get(`/api/documentation/${draft.slug}`).set(auth(reader.token));
    expect(detail.status).toBe(200);
    expect(detail.body.file.format).toBe("docx");
    expect(detail.body.breadcrumbs).toEqual([]);
  });

  it("publish документа без файла и описания отбивается 403; раздел без блоков публикуется с иконкой", async () => {
    const adminToken = await loginAdmin();
    const reader = await registerCompany("0810003");

    const emptyDoc = await createDraftDocument(adminToken, { title: "Пустой документ" });
    const publishEmpty = await ctx.http
      .post(`/api/admin/content/documentation/${emptyDoc.id}/publish`)
      .set(auth(adminToken));
    expect(publishEmpty.status).toBe(403);

    const category = await createDraftDocument(adminToken, {
      title: "Раздел без блоков",
      iconType: "category",
      displayIcon: "Scale",
    });
    expect(category.displayIcon).toBe("Scale");

    const publishCategory = await ctx.http
      .post(`/api/admin/content/documentation/${category.id}/publish`)
      .set(auth(adminToken));
    expect(publishCategory.status).toBe(201);
    expect(publishCategory.body.status).toBe("published");
    expect(publishCategory.body.displayIcon).toBe("Scale");

    const tree = await ctx.http.get("/api/documentation?depth=1").set(auth(reader.token));
    const categoryNode = tree.body.find((node: { id: string }) => node.id === category.id);
    expect(categoryNode).toBeTruthy();
    expect(categoryNode.displayIcon).toBe("Scale");
  });

  it("отклоняет неизвестную иконку раздела документации", async () => {
    const adminToken = await loginAdmin();

    const res = await ctx.http.post("/api/admin/content/documentation").set(auth(adminToken)).send({
      title: "Раздел с неверной иконкой",
      position: 0,
      iconType: "category",
      displayIcon: "Recycle",
      blocks: [],
    });

    expect(res.status).toBe(400);
  });

  it("PATCH документа заменяет блоки и пишет audit log", async () => {
    const adminToken = await loginAdmin();
    const draft = await createDraftDocument(adminToken, {
      title: "Справка ФККО",
      blocks: [{ type: "paragraph", payload: { html: "<p>Старый текст.</p>" } }],
    });

    const patched = await ctx.http
      .patch(`/api/admin/content/documentation/${draft.id}`)
      .set(auth(adminToken))
      .send({
        title: "Справка ФККО (ред.)",
        position: 0,
        blocks: [
          { type: "heading", payload: { text: "Классификатор" } },
          { type: "paragraph", payload: { html: "<p>Новый текст.</p>" } },
        ],
      });
    expect(patched.status).toBe(200);
    expect(patched.body.title).toBe("Справка ФККО (ред.)");
    expect(patched.body.blocks).toHaveLength(2);
    expect(patched.body.blocks[0].type).toBe("heading");

    const log = await ctx.prisma.adminActionLog.findFirst({
      where: { entityId: draft.id, action: "documentation.update" },
    });
    expect(log).toBeTruthy();
  });
});

describe("Documentation: pinned & recent", () => {
  it("«Часто нужные» возвращает только закреплённые опубликованные документы", async () => {
    const adminToken = await loginAdmin();
    const reader = await registerCompany("0810010");
    const uploader = await adminId();

    const pinnedFile = await createDocFileAsset(uploader, "akt.xlsx");
    const pinned = await createDraftDocument(adminToken, {
      title: "Акт приёма-передачи",
      fileAssetId: pinnedFile.id,
      isPinned: true,
    });
    await publishDocument(adminToken, pinned.id);

    const plainFile = await createDocFileAsset(uploader, "spec.pdf");
    const plain = await createDraftDocument(adminToken, { title: "Спецификация", fileAssetId: plainFile.id });
    await publishDocument(adminToken, plain.id);

    const res = await ctx.http.get("/api/documentation/pinned").set(auth(reader.token));
    expect(res.status).toBe(200);
    const ids = res.body.map((node: { id: string }) => node.id);
    expect(ids).toContain(pinned.id);
    expect(ids).not.toContain(plain.id);
  });

  it("«Недавно обновлено» сортирует по дате обновления и помечает обновление", async () => {
    const adminToken = await loginAdmin();
    const reader = await registerCompany("0810011");
    const uploader = await adminId();

    const fileA = await createDocFileAsset(uploader, "a.pdf");
    const docA = await createDraftDocument(adminToken, { title: "Документ A", fileAssetId: fileA.id });
    await publishDocument(adminToken, docA.id);
    const fileB = await createDocFileAsset(uploader, "b.pdf");
    const docB = await createDraftDocument(adminToken, { title: "Документ B", fileAssetId: fileB.id });
    await publishDocument(adminToken, docB.id);

    // Фиксируем даты, чтобы порядок был детерминированным (B новее A).
    await ctx.prisma.documentationArticle.update({
      where: { id: docA.id },
      data: { firstPublishedAt: new Date("2026-01-01"), revisedAt: new Date("2026-01-01") },
    });
    await ctx.prisma.documentationArticle.update({
      where: { id: docB.id },
      data: { firstPublishedAt: new Date("2026-02-01"), revisedAt: new Date("2026-02-01") },
    });

    const before = await ctx.http.get("/api/documentation/recent").set(auth(reader.token));
    const beforeIds = before.body.map((node: { id: string }) => node.id);
    expect(beforeIds.indexOf(docB.id)).toBeLessThan(beforeIds.indexOf(docA.id));

    // Отмечаем A как обновлённый → revisedAt = now > firstPublishedAt(2026-01-01).
    const patched = await ctx.http
      .patch(`/api/admin/content/documentation/${docA.id}`)
      .set(auth(adminToken))
      .send({ title: "Документ A", position: 0, fileAssetId: fileA.id, markRevised: true, blocks: [] });
    expect(patched.status).toBe(200);

    const after = await ctx.http.get("/api/documentation/recent").set(auth(reader.token));
    expect(after.body[0].id).toBe(docA.id);
    const updatedNode = after.body[0];
    expect(new Date(updatedNode.revisedAt).getTime()).toBeGreaterThan(new Date(updatedNode.firstPublishedAt).getTime());
  });
});

describe("Documentation: smart search", () => {
  it("ищет по названию, подзаголовку, имени файла, описанию и опечаткам", async () => {
    const adminToken = await loginAdmin();
    const reader = await registerCompany("0810030");
    const uploader = await adminId();

    const file = await createDocFileAsset(uploader, "dogovor-perevozki-makulatury.docx");
    const titleMatch = await createDraftDocument(adminToken, {
      title: "Договор перевозки макулатуры",
      subtitle: "Шаблон для рейсов между регионами",
      fileAssetId: file.id,
    });
    await publishDocument(adminToken, titleMatch.id);

    const descriptionMatch = await createDraftDocument(adminToken, {
      title: "Акт приёма-передачи",
      fileAssetId: await createDocFileAsset(uploader, "akt.xlsx").then((asset) => asset.id),
      blocks: [
        { type: "heading", payload: { text: "Сопроводительные документы" } },
        { type: "paragraph", payload: { html: "<p>Текст про лицензии и маршрутный лист.</p>" } },
      ],
    });
    await publishDocument(adminToken, descriptionMatch.id);

    const subtitleMatch = await createDraftDocument(adminToken, {
      title: "Справка ФККО",
      subtitle: "Классификатор отходов для вторсырья",
      blocks: [{ type: "paragraph", payload: { html: "<p>Описание справки.</p>" } }],
    });
    await publishDocument(adminToken, subtitleMatch.id);

    const titleSearch = await ctx.http
      .get("/api/documentation/search")
      .query({ q: "макулатуры перевозки" })
      .set(auth(reader.token));
    expect(titleSearch.status).toBe(200);
    expect(titleSearch.body[0]).toMatchObject({ id: titleMatch.id, searchSnippet: { source: "title" } });
    expect(titleSearch.body[0].searchSnippet.highlights.length).toBeGreaterThan(0);

    const descriptionSearch = await ctx.http
      .get("/api/documentation/search")
      .query({ q: "лицензия маршрутный" })
      .set(auth(reader.token));
    expect(descriptionSearch.status).toBe(200);
    expect(descriptionSearch.body.map((item: { id: string }) => item.id)).toContain(descriptionMatch.id);
    const descriptionItem = descriptionSearch.body.find((item: { id: string }) => item.id === descriptionMatch.id);
    expect(descriptionItem.searchSnippet.source).toBe("description");

    const fileSearch = await ctx.http
      .get("/api/documentation/search")
      .query({ q: "dogovor perevozki" })
      .set(auth(reader.token));
    expect(fileSearch.status).toBe(200);
    expect(fileSearch.body.map((item: { id: string }) => item.id)).toContain(titleMatch.id);

    const subtitleSearch = await ctx.http
      .get("/api/documentation/search")
      .query({ q: "вторсырье" })
      .set(auth(reader.token));
    expect(subtitleSearch.status).toBe(200);
    expect(subtitleSearch.body.map((item: { id: string }) => item.id)).toContain(subtitleMatch.id);

    const typoSearch = await ctx.http.get("/api/documentation/search").query({ q: "лицензща" }).set(auth(reader.token));
    expect(typoSearch.status).toBe(200);
    expect(typoSearch.body.map((item: { id: string }) => item.id)).toContain(descriptionMatch.id);
  });

  it("не отдаёт черновики и документы внутри чернового раздела", async () => {
    const adminToken = await loginAdmin();
    const reader = await registerCompany("0810031");
    const uploader = await adminId();

    const draft = await createDraftDocument(adminToken, {
      title: "sekretnyydoc отдельный черновик",
      fileAssetId: await createDocFileAsset(uploader, "draft.pdf").then((asset) => asset.id),
    });

    const parent = await createDraftDocument(adminToken, {
      title: "Черновой раздел",
      iconType: "category",
      displayIcon: "FolderOpen",
    });
    const child = await createDraftDocument(adminToken, {
      title: "sekretnyydoc внутри чернового раздела",
      parentId: parent.id,
      fileAssetId: await createDocFileAsset(uploader, "child.pdf").then((asset) => asset.id),
    });
    await publishDocument(adminToken, child.id);

    const search = await ctx.http.get("/api/documentation/search").query({ q: "sekretnyydoc" }).set(auth(reader.token));
    expect(search.status).toBe(200);
    const ids = search.body.map((item: { id: string }) => item.id);
    expect(ids).not.toContain(draft.id);
    expect(ids).not.toContain(child.id);
  });
});

describe("Documentation: download & roles", () => {
  it("download: 200 с файлом, 404 без файла, 404 для черновика обычному пользователю", async () => {
    const adminToken = await loginAdmin();
    const reader = await registerCompany("0810020");
    const uploader = await adminId();

    const file = await createDocFileAsset(uploader, "passport.pdf");
    const withFile = await createDraftDocument(adminToken, { title: "Паспорт отхода", fileAssetId: file.id });
    await publishDocument(adminToken, withFile.id);

    const ok = await ctx.http.get(`/api/documentation/${withFile.id}/download`).set(auth(reader.token));
    expect(ok.status).toBe(200);
    expect(ok.body).toHaveProperty("url");

    await withEnv(
      {
        S3_PUBLIC_BASE_URL: undefined,
        S3_ENDPOINT: undefined,
        S3_BUCKET: undefined,
        S3_ACCESS_KEY_ID: undefined,
        S3_SECRET_ACCESS_KEY: undefined,
      },
      async () => {
        const unavailable = await ctx.http.get(`/api/documentation/${withFile.id}/download`).set(auth(reader.token));
        expect(unavailable.status).toBe(503);
        expect(unavailable.body.message).toContain("Файловое хранилище временно недоступно");
      },
    );

    const noFile = await createDraftDocument(adminToken, {
      title: "Только описание",
      blocks: [{ type: "paragraph", payload: { html: "<p>Текст.</p>" } }],
    });
    await publishDocument(adminToken, noFile.id);
    const noFileDownload = await ctx.http.get(`/api/documentation/${noFile.id}/download`).set(auth(reader.token));
    expect(noFileDownload.status).toBe(404);

    const draftFile = await createDocFileAsset(uploader, "draft.pdf");
    const draft = await createDraftDocument(adminToken, { title: "Черновик с файлом", fileAssetId: draftFile.id });
    const draftDownload = await ctx.http.get(`/api/documentation/${draft.id}/download`).set(auth(reader.token));
    expect(draftDownload.status).toBe(404);
  });

  it("content_manager создаёт и публикует, но удаление — только admin", async () => {
    const adminToken = await loginAdmin();
    const managerToken = await loginContentManager();

    const draft = await createDraftDocument(managerToken, {
      title: "Документ контент-менеджера",
      blocks: [{ type: "paragraph", payload: { html: "<p>Тело.</p>" } }],
    });
    await publishDocument(managerToken, draft.id);

    const category = await createDraftDocument(managerToken, {
      title: "Раздел контент-менеджера",
      iconType: "category",
      displayIcon: "FolderOpen",
    });
    const patchedCategory = await ctx.http
      .patch(`/api/admin/content/documentation/${category.id}`)
      .set(auth(managerToken))
      .send({
        title: "Раздел контент-менеджера",
        position: 0,
        iconType: "category",
        displayIcon: "Landmark",
        blocks: [],
      });
    expect(patchedCategory.status).toBe(200);
    expect(patchedCategory.body.displayIcon).toBe("Landmark");

    const managerDelete = await ctx.http
      .delete(`/api/admin/content/documentation/${draft.id}`)
      .set(auth(managerToken))
      .send({ reason: "тест" });
    expect(managerDelete.status).toBe(403);

    const adminDelete = await ctx.http
      .delete(`/api/admin/content/documentation/${draft.id}`)
      .set(auth(adminToken))
      .send({ reason: "тест" });
    expect(adminDelete.status).toBe(200);
  });
});
