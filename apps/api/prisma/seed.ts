import { PrismaClient, CompanyStatus, ContentStatus, LearningAccessLevel, PlatformRole, SubscriptionPlan } from "@prisma/client";
import { hash } from "bcryptjs";
import { demoEndsAt, slugify } from "@ecoplatform/shared";

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

  const company = await prisma.company.upsert({
    where: { id: "demo-company" },
    update: {},
    create: {
      id: "demo-company",
      organizationName: "ООО ВторРесурс Demo",
      status: CompanyStatus.demo,
      demoEndsAt: demoEndsAt(),
      subscriptionPlan: SubscriptionPlan.basic,
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

  const category = await prisma.nomenclatureCategory.upsert({
    where: { slug: "makulatura" },
    update: {},
    create: { name: "Макулатура", slug: "makulatura", position: 0 },
  });

  const cardboard = await prisma.nomenclature.upsert({
    where: { code: "МКР-КРТ-001" },
    update: {},
    create: {
      code: "МКР-КРТ-001",
      name: "Гофрокартон",
      unit: "₽/т",
      description: "Гофрированный картон, коробки, ящики.",
      categoryId: category.id,
    },
  });

  const index = await prisma.priceIndex.upsert({
    where: { nomenclatureId: cardboard.id },
    update: {},
    create: {
      nomenclatureId: cardboard.id,
      description: "Демо-индекс для первого экрана.",
      status: ContentStatus.published,
      firstPublishedAt: new Date(),
      createdById: admin.id,
    },
  });

  for (let offset = 90; offset >= 0; offset -= 10) {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() - offset);
    date.setUTCHours(0, 0, 0, 0);
    await prisma.priceIndexValue.upsert({
      where: { priceIndexId_date: { priceIndexId: index.id, date } },
      update: {},
      create: {
        priceIndexId: index.id,
        date,
        price: 12000 + (90 - offset) * 25,
        createdById: admin.id,
      },
    });
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

  const module = await prisma.learningModule.create({
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
  });

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
