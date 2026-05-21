import { config as loadEnv } from "dotenv";
import { resolve } from "path";

// Сид может запускаться отдельно от приложения, поэтому загружаем .env здесь же.
loadEnv({ path: resolve(__dirname, "../../../.env") });

import { PrismaClient, CompanyStatus, ContentStatus, LearningAccessLevel, PlatformRole } from "@prisma/client";
import { hash } from "bcryptjs";
import { slugify } from "@ecoplatform/shared";

const prisma = new PrismaClient();

async function main() {
  const adminPasswordHash = await hash("Admin12345", 12);
  const userPasswordHash = await hash("Demo12345", 12);

  const admin = await prisma.user.upsert({
    where: { email: "admin@ecoplatform.local" },
    update: {},
    create: {
      email: "admin@ecoplatform.local",
      phone: "+79990000001",
      firstName: "Админ",
      lastName: "Платформы",
      passwordHash: adminPasswordHash,
      platformStaff: {
        create: {
          roles: [PlatformRole.admin, PlatformRole.content_manager, PlatformRole.moderator],
        },
      },
    },
  });

  // Демо-длительность в seed специально берём с большим запасом (30 дней),
  // чтобы локальные сценарии не падали из-за истёкшего демо. Реальное
  // значение для регистраций тянется из настройки `demo.duration_hours`.
  // subscriptionPlan намеренно null — в статусе demo тариф ещё не активирован,
  // и UI кабинета не должен показывать «basic» при активной демо-фазе.
  const seedDemoEndsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const company = await prisma.company.upsert({
    where: { id: "demo-company" },
    update: {
      status: CompanyStatus.demo,
      demoEndsAt: seedDemoEndsAt,
      subscriptionPlan: null,
    },
    create: {
      id: "demo-company",
      organizationName: "ООО ВторРесурс Demo",
      status: CompanyStatus.demo,
      demoEndsAt: seedDemoEndsAt,
    },
  });

  await prisma.user.upsert({
    where: { email: "demo@ecoplatform.local" },
    update: {},
    create: {
      email: "demo@ecoplatform.local",
      phone: "+79990000002",
      firstName: "Иван",
      lastName: "Заготовитель",
      passwordHash: userPasswordHash,
      companyId: company.id,
    },
  });

  // Категории номенклатуры и их позиции в выдаче.
  // Все категории upsert по slug, чтобы повторный seed не падал.
  const paperCategory = await prisma.nomenclatureCategory.upsert({
    where: { slug: "makulatura" },
    update: { name: "Макулатура", position: 0 },
    create: { name: "Макулатура", slug: "makulatura", position: 0 },
  });

  const filmsCategory = await prisma.nomenclatureCategory.upsert({
    where: { slug: "plenki" },
    update: { name: "Плёнки", position: 1 },
    create: { name: "Плёнки", slug: "plenki", position: 1 },
  });

  const plasticsCategory = await prisma.nomenclatureCategory.upsert({
    where: { slug: "plastiki" },
    update: { name: "Пластики", position: 2 },
    create: { name: "Пластики", slug: "plastiki", position: 2 },
  });

  // Полная номенклатура трёх категорий. Коды детерминированные, чтобы при
  // повторном seed не дублировались записи (upsert по code).
  const nomenclatureSeed: Array<{ code: string; name: string; categoryId: string }> = [
    // Макулатура
    { code: "МКР-КРТ-001", name: "Гофрокартон", categoryId: paperCategory.id },
    { code: "МКЛ-001", name: "Картон", categoryId: paperCategory.id },
    { code: "МКЛ-002", name: "Бумага", categoryId: paperCategory.id },
    { code: "МКЛ-003", name: "Архив", categoryId: paperCategory.id },
    { code: "МКЛ-004", name: "Газета", categoryId: paperCategory.id },
    { code: "МКЛ-005", name: "МС6-Б", categoryId: paperCategory.id },
    { code: "МКЛ-006", name: "МС9-В", categoryId: paperCategory.id },
    { code: "МКЛ-007", name: "МС11-В", categoryId: paperCategory.id },
    { code: "МКЛ-008", name: "МС13-В", categoryId: paperCategory.id },
    // Плёнки
    { code: "ПЛН-001", name: "Стрейч первичный", categoryId: filmsCategory.id },
    { code: "ПЛН-002", name: "Стрейч вторичный", categoryId: filmsCategory.id },
    { code: "ПЛН-003", name: "ПВД прозрачный", categoryId: filmsCategory.id },
    { code: "ПЛН-004", name: "ПВД цветной", categoryId: filmsCategory.id },
    { code: "ПЛН-005", name: "Микс прозрачный", categoryId: filmsCategory.id },
    { code: "ПЛН-006", name: "Микс цветной", categoryId: filmsCategory.id },
    { code: "ПЛН-007", name: "ПНД плёнка", categoryId: filmsCategory.id },
    { code: "ПЛН-008", name: "ПП плёнка", categoryId: filmsCategory.id },
    { code: "ПЛН-009", name: "БОПП", categoryId: filmsCategory.id },
    // Пластики
    { code: "ПЛС-001", name: "Труба ГОСТ", categoryId: plasticsCategory.id },
    { code: "ПЛС-002", name: "Биг-Бэг 2", categoryId: plasticsCategory.id },
    { code: "ПЛС-003", name: "Биг-Бэг 4", categoryId: plasticsCategory.id },
    { code: "ПЛС-004", name: "Биг-Бэг микс", categoryId: plasticsCategory.id },
    { code: "ПЛС-005", name: "Канистра", categoryId: plasticsCategory.id },
    { code: "ПЛС-006", name: "Флакон", categoryId: plasticsCategory.id },
    { code: "ПЛС-007", name: "ПЭТ бутылка", categoryId: plasticsCategory.id },
    { code: "ПЛС-008", name: "ПЭТ масло", categoryId: plasticsCategory.id },
    { code: "ПЛС-009", name: "ПЭТ молочный", categoryId: plasticsCategory.id },
    { code: "ПЛС-010", name: "Преформа голубая", categoryId: plasticsCategory.id },
    { code: "ПЛС-011", name: "Преформа зелёная", categoryId: plasticsCategory.id },
    { code: "ПЛС-012", name: "Преформа коричневая", categoryId: plasticsCategory.id },
    { code: "ПЛС-013", name: "Преформа прозрачная", categoryId: plasticsCategory.id },
    { code: "ПЛС-014", name: "ПП Ящик", categoryId: plasticsCategory.id },
    { code: "ПЛС-015", name: "ПНД Ящик", categoryId: plasticsCategory.id },
    { code: "ПЛС-016", name: "Капля однолетняя", categoryId: plasticsCategory.id },
  ];

  const nomenclatureByCode: Record<string, { id: string }> = {};
  for (const item of nomenclatureSeed) {
    const created = await prisma.nomenclature.upsert({
      where: { code: item.code },
      update: { name: item.name, categoryId: item.categoryId },
      create: {
        code: item.code,
        name: item.name,
        unit: "₽/т",
        categoryId: item.categoryId,
      },
    });
    nomenclatureByCode[item.code] = created;
  }

  // Демо-индексы с историей — по одному в каждой категории, чтобы публичные
  // /indices сразу что-то показывали. Реальные индексы для остальных
  // номенклатур заводит контент-менеджер через CMS.
  type DemoIndex = { code: string; basePrice: number; description: string };
  const demoIndexes: DemoIndex[] = [
    { code: "МКР-КРТ-001", basePrice: 12000, description: "Гофрокартон — рыночный индекс закупки." },
    { code: "ПЛН-001", basePrice: 65000, description: "Стрейч первичный — рыночный индекс закупки." },
    { code: "ПЛС-007", basePrice: 28000, description: "ПЭТ бутылка — рыночный индекс закупки." },
  ];

  // Генерируем историю с ~365 дней назад, плавный синусоидальный дрейф плюс
  // линейный тренд — выглядит правдоподобно как в дизайнерском макете.
  for (const demo of demoIndexes) {
    const nomenclature = nomenclatureByCode[demo.code];
    if (!nomenclature) continue;
    const priceIndex = await prisma.priceIndex.upsert({
      where: { nomenclatureId: nomenclature.id },
      update: { description: demo.description },
      create: {
        nomenclatureId: nomenclature.id,
        description: demo.description,
        status: ContentStatus.published,
        firstPublishedAt: new Date(),
        createdById: admin.id,
      },
    });

    for (let offset = 365; offset >= 0; offset -= 7) {
      const date = new Date();
      date.setUTCDate(date.getUTCDate() - offset);
      date.setUTCHours(0, 0, 0, 0);
      const trend = (365 - offset) * (demo.basePrice * 0.0003);
      const wave = Math.sin((365 - offset) / 24) * demo.basePrice * 0.04;
      const price = Math.round(demo.basePrice + trend + wave);
      await prisma.priceIndexValue.upsert({
        where: { priceIndexId_date: { priceIndexId: priceIndex.id, date } },
        update: { price },
        create: {
          priceIndexId: priceIndex.id,
          date,
          price,
          createdById: admin.id,
        },
      });
    }
  }

  const newsSlug = slugify("Завод приостанавливает работу на майские праздники");
  const news = await prisma.newsPost.upsert({
    where: { slug: newsSlug },
    update: {},
    create: {
      title: "Завод приостанавливает работу на майские праздники",
      lead: "Компания предупредила поставщиков о временной остановке приёмки сырья.",
      slug: newsSlug,
      status: ContentStatus.published,
      firstPublishedAt: new Date(),
      createdById: admin.id,
      blocks: {
        create: [
          {
            position: 0,
            type: "paragraph",
            payload: {
              markdown:
                "Компания «ВторРесурс» будет приостанавливать работу перерабатывающего завода с 1 по 10 мая включительно. После возобновления работы графики поставок будут восстановлены.",
            },
          },
        ],
      },
    },
  });

  const tag = await prisma.newsTag.upsert({
    where: { name: "рынок" },
    update: {},
    create: { name: "рынок", slug: "rynok" },
  });

  await prisma.newsPostTag.upsert({
    where: { newsPostId_newsTagId: { newsPostId: news.id, newsTagId: tag.id } },
    update: {},
    create: { newsPostId: news.id, newsTagId: tag.id },
  });

  const existingPurchaseModule = await prisma.learningModule.findFirst({ where: { title: "Закупка сырья" } });
  const module =
    existingPurchaseModule ??
    (await prisma.learningModule.create({
      data: {
        title: "Закупка сырья",
        summary: "Базовые правила закупки вторсырья без типичных ошибок новичков.",
        description: "Практический модуль для сотрудников, которые принимают и оценивают сырьё.",
        accessLevel: LearningAccessLevel.basic,
        status: ContentStatus.published,
        firstPublishedAt: new Date(),
        createdById: admin.id,
        preview: {
          create: {
            promotionalDescription: "В модуле собраны практические правила закупки сырья.",
            whatYouWillLearn: ["Оценивать качество партии", "Понимать риски влажности и засора"],
          },
        },
        chapters: {
          create: [
            {
              title: "Основы приёмки",
              position: 0,
              lessons: {
                create: [
                  {
                    title: "Что проверить до покупки",
                    position: 0,
                    status: ContentStatus.published,
                    firstPublishedAt: new Date(),
                    blocks: {
                      create: [
                        {
                          position: 0,
                          type: "paragraph",
                          payload: { markdown: "Проверьте вид сырья, влажность, засор, форму поставки и документы." },
                        },
                      ],
                    },
                  },
                ],
              },
            },
          ],
        },
      },
    }));

  const existingWarehouseModule = await prisma.learningModule.findFirst({ where: { title: "Склад" } });

  if (!existingWarehouseModule) {
    await prisma.learningModule.create({
      data: {
        title: "Склад",
        summary: "Как организовать склад, сортировку и хранение сырья.",
        description: "Модуль про складские процессы, тюки, россыпь и подготовку к отгрузке.",
        accessLevel: LearningAccessLevel.basic,
        status: ContentStatus.published,
        firstPublishedAt: new Date(),
        createdById: admin.id,
        preview: {
          create: {
            promotionalDescription: "Складской модуль помогает снизить потери на приёмке и хранении.",
            whatYouWillLearn: ["Разделять потоки сырья", "Готовить партии к продаже"],
          },
        },
        chapters: {
          create: [
            {
              title: "Организация склада",
              position: 0,
              lessons: {
                create: [
                  {
                    title: "Зоны хранения",
                    position: 0,
                    status: ContentStatus.published,
                    firstPublishedAt: new Date(),
                    blocks: {
                      create: [
                        {
                          position: 0,
                          type: "paragraph",
                          payload: { markdown: "Отделяйте мокрое сырьё от сухого, а спорные партии маркируйте отдельно." },
                        },
                      ],
                    },
                  },
                ],
              },
            },
          ],
        },
      },
    });
  }

  await prisma.knowledgeBaseArticle.upsert({
    where: { slug: "gofrokarton" },
    update: {},
    create: {
      title: "Гофрокартон",
      subtitle: "Гофрированный картон, коробки, ящики",
      slug: "gofrokarton",
      position: 0,
      iconType: "paper",
      status: ContentStatus.published,
      firstPublishedAt: new Date(),
      createdById: admin.id,
      blocks: {
        create: [
          { position: 0, type: "heading", payload: { text: "ГОСТы" } },
          { position: 1, type: "paragraph", payload: { markdown: "Ориентируйтесь на внутренние регламенты приёмки и требования конкретного завода." } },
          { position: 2, type: "checklist", payload: { title: "Принимается", style: "positive", items: ["Сухой чистый картон", "Без плёнки", "Прессованные кипы"] } },
          { position: 3, type: "checklist", payload: { title: "Риски", style: "warning", items: ["Повышенная влажность", "Снижение цены за засор", "Пересортировка на складе"] } },
          { position: 4, type: "heading", payload: { text: "Нюансы и лайфхаки" } },
          { position: 5, type: "paragraph", payload: { markdown: "Поддерживайте влажность до 12% и отделяйте картон с плёнкой до прессования." } },
        ],
      },
    },
  });

  console.log("Seed completed");
  console.log("Admin: admin@ecoplatform.local / Admin12345");
  console.log("Demo user: demo@ecoplatform.local / Demo12345");
  console.log(`Learning module seeded: ${module.title}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
