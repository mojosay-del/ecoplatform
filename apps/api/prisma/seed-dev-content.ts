import { config as loadEnv } from "dotenv";
import { resolve } from "path";

// Запускается отдельно, поэтому окружение грузим здесь.
loadEnv({ path: resolve(__dirname, "../../../.env") });

import { ContentStatus, FileAccessLevel, LearningAccessLevel, PrismaClient } from "@prisma/client";
import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { slugify } from "@ecoplatform/shared";

// ─────────────────────────────────────────────────────────────────────────
// Генератор ДЕВ-контента для локального тестирования. Берёт реальные картинки
// из dev-бакета S3 (они пережили потерю строк БД — файлы в S3 целы) и заводит
// под них FileAsset + демонстрационные новости / обучение / базу знаний по
// сырью / документацию. Идемпотентен: FileAsset по детерминированному id,
// контент по slug/маркеру. НЕ трогает прод (только локальная БД + чтение S3).
//
// Запуск:  pnpm --filter @ecoplatform/api exec ts-node prisma/seed-dev-content.ts
// ─────────────────────────────────────────────────────────────────────────

const prisma = new PrismaClient();
const ADMIN_EMAIL = "admin@ecoplatform.local";

type S3Image = { key: string; size: number };

function mimeFromKey(key: string): string {
  const ext = key.split(".").pop()?.toLowerCase();
  if (ext === "png") return "image/png";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "avif") return "image/avif";
  return "image/webp";
}

async function listBucketImages(): Promise<S3Image[]> {
  const client = new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID as string,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY as string,
    },
    forcePathStyle: true,
  });
  const out: S3Image[] = [];
  let token: string | undefined;
  do {
    const res = await client.send(
      new ListObjectsV2Command({ Bucket: process.env.S3_BUCKET, MaxKeys: 1000, ContinuationToken: token }),
    );
    for (const o of res.Contents ?? []) {
      if (o.Key && /\.(webp|png|jpe?g)$/i.test(o.Key)) out.push({ key: o.Key, size: o.Size ?? 0 });
    }
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
  // Стабильный порядок, чтобы прогоны были воспроизводимы.
  out.sort((a, b) => a.key.localeCompare(b.key));
  return out;
}

// Детерминированный короткий id из ключа — для идемпотентного upsert FileAsset.
function fileIdFor(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i += 1) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return `devimg${h.toString(36)}`;
}

async function main() {
  const admin = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL }, select: { id: true } });
  if (!admin) throw new Error(`Нет ${ADMIN_EMAIL} — сначала прогоните основной seed.`);

  const images = await listBucketImages();
  if (images.length === 0) throw new Error("В dev-бакете не нашлось картинок — нечего использовать.");
  console.log(`Найдено ${images.length} картинок в dev-бакете.`);

  // 1) FileAsset под каждую картинку (public → отдаётся прямым publicUrl).
  const assetIds: string[] = [];
  for (const img of images) {
    const id = fileIdFor(img.key);
    await prisma.fileAsset.upsert({
      where: { id },
      update: { storageKey: img.key, sizeBytes: img.size, mimeType: mimeFromKey(img.key) },
      create: {
        id,
        originalName: img.key.split("/").pop() ?? img.key,
        mimeType: mimeFromKey(img.key),
        sizeBytes: img.size,
        storageKey: img.key,
        accessLevel: FileAccessLevel.public,
        uploadedById: admin.id,
      },
    });
    assetIds.push(id);
  }
  console.log(`FileAsset upsert: ${assetIds.length}.`);

  // Круговой выборщик картинок — чтобы разные материалы получали разные обложки.
  let cursor = 0;
  const pick = () => assetIds[cursor++ % assetIds.length]!;

  const paragraph = (html: string) => ({ type: "paragraph", payload: { html } });
  const heading = (text: string) => ({ type: "heading", payload: { text } });
  const subheading = (text: string) => ({ type: "subheading", payload: { text } });
  const imageBlock = (fileId: string, caption: string) => ({
    type: "image",
    payload: { fileId, caption, altText: caption },
  });

  const linkFile = (fileId: string, entityType: string, entityId: string) =>
    prisma.fileReference.upsert({
      where: { fileId_entityType_entityId: { fileId, entityType, entityId } },
      update: {},
      create: { fileId, entityType, entityId },
    });

  // ── 2) НОВОСТИ ──────────────────────────────────────────────────────────
  const newsSeed = [
    {
      title: "Цены на гофрокартон выросли на 8% за месяц",
      lead: "Спрос со стороны переработчиков подтолкнул закупочные ставки вверх по всем регионам.",
      tags: ["рынок", "макулатура"],
    },
    {
      title: "Новые требования к прессованию вторсырья с 2027 года",
      lead: "Регулятор уточнил стандарты плотности тюков для межрегиональной перевозки.",
      tags: ["регуляторика"],
    },
    {
      title: "Как отличить МС-5Б от МС-6Б: практический разбор",
      lead: "Разбираем визуальные и лабораторные признаки марок макулатуры на реальных образцах.",
      tags: ["макулатура", "качество"],
    },
    {
      title: "Стрейч-плёнка: вторичный рынок стабилизировался",
      lead: "После весенней волатильности индекс вторичного стрейча вернулся к сезонной норме.",
      tags: ["пластик", "рынок"],
    },
    {
      title: "Логистика вторсырья: как считать выгоду рейса",
      lead: "Показываем на примере, когда догруз попутным сырьём окупает лишний километр.",
      tags: ["логистика"],
    },
    {
      title: "Склад под вторсырьё: пожарные нормы и практика хранения",
      lead: "Чек-лист по организации площадки временного накопления без нарушений.",
      tags: ["склад", "безопасность"],
    },
  ];

  let newsCount = 0;
  for (const item of newsSeed) {
    const slug = slugify(item.title);
    const cover = pick();
    const inlineImg = pick();
    const existing = await prisma.newsPost.findUnique({ where: { slug }, select: { id: true } });
    if (existing) continue;
    const post = await prisma.newsPost.create({
      data: {
        title: item.title,
        lead: item.lead,
        slug,
        coverImageId: cover,
        status: ContentStatus.published,
        firstPublishedAt: new Date(Date.now() - newsCount * 36 * 3600 * 1000),
        createdById: admin.id,
        blocks: {
          create: [
            { position: 0, ...heading("Что произошло") },
            {
              position: 1,
              ...paragraph(
                `<p>${item.lead} Материал подготовлен редакцией ЭкоПлатформы на основе данных рынка вторичного сырья.</p>`,
              ),
            },
            { position: 2, ...imageBlock(inlineImg, item.title) },
            { position: 3, ...subheading("Что это значит для участников рынка") },
            {
              position: 4,
              ...paragraph(
                "<p>Заготовителям стоит пересмотреть закупочные ставки, а переработчикам — заранее законтрактовать объёмы. Следите за обновлениями индексов в соответствующем разделе.</p>",
              ),
            },
          ],
        },
      },
    });
    await linkFile(cover, "news_post", post.id);
    await linkFile(inlineImg, "news_post", post.id);
    for (const tagName of item.tags) {
      const tag = await prisma.newsTag.upsert({
        where: { name: tagName },
        update: {},
        create: { name: tagName, slug: slugify(tagName) },
      });
      await prisma.newsPostTag.upsert({
        where: { newsPostId_newsTagId: { newsPostId: post.id, newsTagId: tag.id } },
        update: {},
        create: { newsPostId: post.id, newsTagId: tag.id },
      });
    }
    newsCount += 1;
  }
  console.log(`Новостей создано: ${newsCount}.`);

  // ── 3) ОБУЧЕНИЕ (модули → главы → уроки) ────────────────────────────────
  const modulesSeed = [
    {
      title: "Прессование и хранение вторсырья",
      summary: "Как получать плотные тюки и не терять в качестве при хранении.",
      description: "Практический модуль для операторов пресса и кладовщиков.",
      whatYouWillLearn: ["Настройка пресса под марку сырья", "Нормы плотности тюка", "Организация склада накопления"],
      chapters: [
        { title: "Основы прессования", lessons: ["Типы прессов и их выбор", "Плотность тюка под перевозку"] },
        { title: "Хранение", lessons: ["Пожарные требования", "Ротация партий на складе"] },
      ],
    },
    {
      title: "Логистика и экономика рейса",
      summary: "Считаем выгоду перевозки вторсырья без табличного хаоса.",
      description: "Модуль для логистов и собственников автопарка заготовителя.",
      whatYouWillLearn: ["Себестоимость километра", "Догруз попутным сырьём", "Точка безубыточности рейса"],
      chapters: [
        { title: "Себестоимость", lessons: ["Из чего складывается стоимость рейса", "Топливо и амортизация"] },
        { title: "Оптимизация", lessons: ["Когда догруз окупается", "Маршрутизация нескольких точек"] },
      ],
    },
  ];

  let moduleCount = 0;
  for (let m = 0; m < modulesSeed.length; m += 1) {
    const ms = modulesSeed[m]!;
    const exists = await prisma.learningModule.findFirst({ where: { title: ms.title }, select: { id: true } });
    if (exists) continue;
    const cover = pick();
    const module = await prisma.learningModule.create({
      data: {
        title: ms.title,
        summary: ms.summary,
        description: ms.description,
        coverImageId: cover,
        accessLevel: m === 0 ? LearningAccessLevel.basic : LearningAccessLevel.extended,
        position: m + 1,
        status: ContentStatus.published,
        firstPublishedAt: new Date(),
        createdById: admin.id,
        preview: {
          create: { promotionalDescription: ms.summary, whatYouWillLearn: ms.whatYouWillLearn },
        },
      },
    });
    await linkFile(cover, "learning_module", module.id);
    for (let c = 0; c < ms.chapters.length; c += 1) {
      const ch = ms.chapters[c]!;
      const chapter = await prisma.chapter.create({
        data: { moduleId: module.id, title: ch.title, position: c, createdById: admin.id },
      });
      for (let l = 0; l < ch.lessons.length; l += 1) {
        const lessonCover = pick();
        await prisma.lesson.create({
          data: {
            chapterId: chapter.id,
            title: ch.lessons[l]!,
            coverImageId: lessonCover,
            coverSubtitle: ms.title,
            position: l,
            status: ContentStatus.published,
            firstPublishedAt: new Date(),
            createdById: admin.id,
            blocks: {
              create: [
                { position: 0, ...heading(ch.lessons[l]!) },
                {
                  position: 1,
                  ...paragraph(
                    "<p>В этом уроке разбираем тему на практических примерах из работы заготовителя вторсырья. Материал демонстрационный — для проверки интерфейса обучения.</p>",
                  ),
                },
                { position: 2, ...imageBlock(pick(), ch.lessons[l]!) },
                {
                  position: 3,
                  ...paragraph("<p>Закрепите материал и переходите к следующему уроку главы.</p>"),
                },
              ],
            },
          },
        });
      }
    }
    moduleCount += 1;
  }
  console.log(`Модулей обучения создано: ${moduleCount}.`);

  // ── 4) БАЗА ЗНАНИЙ ПО СЫРЬЮ (дерево: категория → образцы) ────────────────
  const knowledgeTree = [
    {
      category: "Макулатура",
      children: ["Гофрокартон (МС-5Б)", "Книжно-журнальная (МС-7Б)", "Газета (МС-8В)"],
    },
    { category: "Полимеры", children: ["Стрейч-плёнка", "ПЭТ-бутылка", "ПНД-канистра"] },
    { category: "Металлолом", children: ["Алюминиевая банка", "Стальной лом"] },
    { category: "Стекло", children: ["Стеклобой бесцветный"] },
  ];

  let kbCount = 0;
  let kbPos = 0;
  for (const node of knowledgeTree) {
    const catSlug = slugify(`сырьё ${node.category}`);
    let category = await prisma.knowledgeBaseArticle.findUnique({ where: { slug: catSlug }, select: { id: true } });
    if (!category) {
      category = await prisma.knowledgeBaseArticle.create({
        data: {
          title: node.category,
          subtitle: `Раздел каталога сырья: ${node.category}`,
          slug: catSlug,
          position: kbPos++,
          iconType: "category",
          status: ContentStatus.published,
          firstPublishedAt: new Date(),
          createdById: admin.id,
        },
        select: { id: true },
      });
      kbCount += 1;
    }
    let childPos = 0;
    for (const childTitle of node.children) {
      const childSlug = slugify(`${node.category} ${childTitle}`);
      const childExists = await prisma.knowledgeBaseArticle.findUnique({
        where: { slug: childSlug },
        select: { id: true },
      });
      if (childExists) continue;
      const cover = pick();
      const article = await prisma.knowledgeBaseArticle.create({
        data: {
          parentId: category.id,
          title: childTitle,
          subtitle: `Образец сырья категории «${node.category}»`,
          coverImageId: cover,
          slug: childSlug,
          position: childPos++,
          status: ContentStatus.published,
          firstPublishedAt: new Date(),
          createdById: admin.id,
          blocks: {
            create: [
              { position: 0, ...heading("Описание") },
              {
                position: 1,
                ...paragraph(
                  `<p><strong>${childTitle}</strong> — образец сырья из категории «${node.category}». Ниже приведены признаки, по которым материал принимают и сортируют.</p>`,
                ),
              },
              { position: 2, ...imageBlock(pick(), childTitle) },
              { position: 3, ...subheading("Как принимать") },
              {
                position: 4,
                ...paragraph(
                  "<p>Проверяйте влажность, засорённость и однородность партии. Демонстрационная статья — для проверки раздела «Сырьё».</p>",
                ),
              },
            ],
          },
        },
      });
      await linkFile(cover, "knowledge_base_article", article.id);
      kbCount += 1;
    }
  }
  console.log(`Статей базы знаний создано: ${kbCount}.`);

  // ── 5) ДОКУМЕНТАЦИЯ (категория → документы с прикреплённым файлом) ───────
  const docTree = [
    { category: "Договоры", docs: ["Договор поставки вторсырья (шаблон)", "Спецификация к договору"] },
    { category: "Регламенты", docs: ["Регламент приёмки сырья", "Инструкция по прессованию"] },
  ];

  let docCount = 0;
  let docPos = 0;
  for (const node of docTree) {
    const catSlug = slugify(`док ${node.category}`);
    let category = await prisma.documentationArticle.findUnique({ where: { slug: catSlug }, select: { id: true } });
    if (!category) {
      category = await prisma.documentationArticle.create({
        data: {
          title: node.category,
          subtitle: `Раздел документации: ${node.category}`,
          slug: catSlug,
          position: docPos++,
          iconType: "category",
          status: ContentStatus.published,
          firstPublishedAt: new Date(),
          createdById: admin.id,
        },
        select: { id: true },
      });
      docCount += 1;
    }
    let childPos = 0;
    for (const docTitle of node.docs) {
      const docSlug = slugify(`${node.category} ${docTitle}`);
      const exists = await prisma.documentationArticle.findUnique({ where: { slug: docSlug }, select: { id: true } });
      if (exists) continue;
      // NB: в dev-бакете только картинки, поэтому «файл документа» — это image
      // FileAsset (скачивание работает, отдаётся картинка). Замените на реальные
      // PDF при наличии.
      const fileId = pick();
      const doc = await prisma.documentationArticle.create({
        data: {
          parentId: category.id,
          title: docTitle,
          subtitle: `Документ раздела «${node.category}»`,
          slug: docSlug,
          position: childPos++,
          status: ContentStatus.published,
          firstPublishedAt: new Date(),
          createdById: admin.id,
          fileAssetId: fileId,
          version: "1.0.0",
          effectiveDate: new Date(),
          isPinned: childPos === 1,
          revisedAt: new Date(),
          blocks: {
            create: [
              { position: 0, ...heading("Назначение документа") },
              {
                position: 1,
                ...paragraph(
                  `<p><strong>${docTitle}</strong> — демонстрационный документ раздела «${node.category}». Прикреплённый файл можно скачать через квиток справа.</p>`,
                ),
              },
            ],
          },
        },
      });
      await linkFile(fileId, "documentation_article", doc.id);
      docCount += 1;
    }
  }
  console.log(`Документов создано: ${docCount}.`);

  console.log("Дев-контент сгенерирован.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
