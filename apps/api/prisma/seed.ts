import { config as loadEnv } from "dotenv";
import { resolve } from "path";

// Сид может запускаться отдельно от приложения, поэтому загружаем .env здесь же.
loadEnv({ path: resolve(__dirname, "../../../.env") });

import {
  CompanyStatus,
  CompanyType,
  ContentStatus,
  ForumQuestionStatus,
  LearningAccessLevel,
  LegalDocumentType,
  PlatformRole,
  PrismaClient,
  UserGender,
} from "@prisma/client";
import { hash } from "bcryptjs";
import { MIN_PASSWORD_LENGTH, slugify } from "@ecoplatform/shared";

const prisma = new PrismaClient();

const ADMIN_EMAIL = "admin@ecoplatform.local";
const DEMO_EMAIL = "demo@ecoplatform.local";

type SeedPasswordSource = "env" | "unchanged";

type SeedPasswordResolution = {
  envName: string;
  passwordHash?: string;
  source: SeedPasswordSource;
};

function readSeedPassword(envName: string) {
  const value = process.env[envName]?.trim();
  if (!value) return null;
  if (value.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`${envName} должен быть не короче ${MIN_PASSWORD_LENGTH} символов.`);
  }
  if (/replace-with|change-me|example/i.test(value) || value === "Admin12345" || value === "Demo12345") {
    throw new Error(`${envName} похож на placeholder. Укажите реальный локальный пароль в .env.`);
  }
  return value;
}

async function resolveSeedPassword(envName: string, email: string): Promise<SeedPasswordResolution> {
  const password = readSeedPassword(envName);
  if (password) {
    return { envName, passwordHash: await hash(password, 12), source: "env" };
  }

  const existingUser = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existingUser) {
    return { envName, source: "unchanged" };
  }

  throw new Error(`${envName} обязателен для первого создания ${email}. Задайте его в локальном .env.`);
}

function requireSeedPasswordHash(resolution: SeedPasswordResolution, email: string) {
  if (!resolution.passwordHash) {
    throw new Error(`Не удалось создать ${email}: отсутствует пароль для новой учётки.`);
  }
  return resolution.passwordHash;
}

function printSeedAccount(label: string, email: string, resolution: SeedPasswordResolution) {
  const source =
    resolution.source === "env" ? `пароль взят из ${resolution.envName}` : `учётка уже существовала, пароль не менялся`;
  console.log(`${label}: ${email} (${source})`);
}

async function main() {
  const adminPassword = await resolveSeedPassword("SEED_ADMIN_PASSWORD", ADMIN_EMAIL);
  const demoPassword = await resolveSeedPassword("SEED_DEMO_PASSWORD", DEMO_EMAIL);

  const admin = await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: adminPassword.passwordHash ? { passwordHash: adminPassword.passwordHash } : {},
    create: {
      email: ADMIN_EMAIL,
      phone: "+79990000001",
      firstName: "Админ",
      lastName: "Платформы",
      gender: UserGender.male,
      passwordHash: requireSeedPasswordHash(adminPassword, ADMIN_EMAIL),
      platformStaff: {
        create: {
          roles: [PlatformRole.admin, PlatformRole.content_manager, PlatformRole.moderator],
        },
      },
    },
  });

  // Демо-длительность в seed специально берём с большим запасом (30 дней),
  // чтобы локальные сценарии не падали из-за истёкшего демо. Реальное
  // значение пробного доступа тянется из настройки `demo.duration_hours`.
  // subscriptionPlan намеренно null — в статусе demo тариф ещё не активирован,
  // и UI кабинета не должен показывать «basic» при активной демо-фазе.
  const seedDemoEndsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const company = await prisma.company.upsert({
    where: { id: "demo-company" },
    update: {
      status: CompanyStatus.demo,
      type: CompanyType.collector,
      demoEndsAt: seedDemoEndsAt,
      subscriptionPlan: null,
    },
    create: {
      id: "demo-company",
      organizationName: "ООО ВторРесурс Demo",
      type: CompanyType.collector,
      status: CompanyStatus.demo,
      demoEndsAt: seedDemoEndsAt,
    },
  });

  const demoUser = await prisma.user.upsert({
    where: { email: DEMO_EMAIL },
    update: demoPassword.passwordHash ? { passwordHash: demoPassword.passwordHash } : {},
    create: {
      email: DEMO_EMAIL,
      phone: "+79990000002",
      firstName: "Иван",
      lastName: "Заготовитель",
      gender: UserGender.male,
      passwordHash: requireSeedPasswordHash(demoPassword, DEMO_EMAIL),
      companyId: company.id,
    },
  });

  // Единый плоский список номенклатуры. Коды детерминированные, чтобы при
  // повторном seed не дублировались записи (upsert по code). Порядок в массиве
  // задаёт глобальную позицию (position) в выдаче /indices и в админке.
  const nomenclatureSeed: Array<{ code: string; name: string }> = [
    { code: "МКР-КРТ-001", name: "Гофрокартон" },
    { code: "МКЛ-001", name: "Картон" },
    { code: "МКЛ-002", name: "Бумага" },
    { code: "МКЛ-003", name: "Архив" },
    { code: "МКЛ-004", name: "Газета" },
    { code: "МКЛ-005", name: "МС6-Б" },
    { code: "МКЛ-006", name: "МС9-В" },
    { code: "МКЛ-007", name: "МС11-В" },
    { code: "МКЛ-008", name: "МС13-В" },
    { code: "ПЛН-001", name: "Стрейч первичный" },
    { code: "ПЛН-002", name: "Стрейч вторичный" },
    { code: "ПЛН-003", name: "ПВД прозрачный" },
    { code: "ПЛН-004", name: "ПВД цветной" },
    { code: "ПЛН-005", name: "Микс прозрачный" },
    { code: "ПЛН-006", name: "Микс цветной" },
    { code: "ПЛН-007", name: "ПНД плёнка" },
    { code: "ПЛН-008", name: "ПП плёнка" },
    { code: "ПЛН-009", name: "БОПП" },
    { code: "ПЛС-001", name: "Труба ГОСТ" },
    { code: "ПЛС-002", name: "Биг-Бэг 2" },
    { code: "ПЛС-003", name: "Биг-Бэг 4" },
    { code: "ПЛС-004", name: "Биг-Бэг микс" },
    { code: "ПЛС-005", name: "Канистра" },
    { code: "ПЛС-006", name: "Флакон" },
    { code: "ПЛС-007", name: "ПЭТ бутылка" },
    { code: "ПЛС-008", name: "ПЭТ масло" },
    { code: "ПЛС-009", name: "ПЭТ молочный" },
    { code: "ПЛС-010", name: "Преформа голубая" },
    { code: "ПЛС-011", name: "Преформа зелёная" },
    { code: "ПЛС-012", name: "Преформа коричневая" },
    { code: "ПЛС-013", name: "Преформа прозрачная" },
    { code: "ПЛС-014", name: "ПП Ящик" },
    { code: "ПЛС-015", name: "ПНД Ящик" },
    { code: "ПЛС-016", name: "Капля однолетняя" },
  ];

  const nomenclatureByCode: Record<string, { id: string }> = {};
  for (let position = 0; position < nomenclatureSeed.length; position += 1) {
    const item = nomenclatureSeed[position]!;
    const created = await prisma.nomenclature.upsert({
      where: { code: item.code },
      update: { name: item.name, position },
      create: {
        code: item.code,
        name: item.name,
        unit: "₽/т",
        position,
      },
    });
    nomenclatureByCode[item.code] = created;
  }

  // Демо-индексы с историей, чтобы публичные /indices сразу что-то показывали.
  // Реальные индексы для остальных номенклатур заводит контент-менеджер через CMS.
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
              html: "<p>Компания «ВторРесурс» будет приостанавливать работу перерабатывающего завода с 1 по 10 мая включительно. После возобновления работы графики поставок будут восстановлены.</p>",
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
                          payload: {
                            html: "<p>Проверьте вид сырья, влажность, засор, форму поставки и документы.</p>",
                          },
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
                          payload: {
                            html: "<p>Отделяйте мокрое сырьё от сухого, а спорные партии маркируйте отдельно.</p>",
                          },
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
          {
            position: 1,
            type: "paragraph",
            payload: {
              html: "<p>Ориентируйтесь на внутренние регламенты приёмки и требования конкретного завода.</p>",
            },
          },
          {
            position: 2,
            type: "checklist",
            payload: {
              title: "Принимается",
              style: "positive",
              items: ["Сухой чистый картон", "Без плёнки", "Прессованные кипы"],
            },
          },
          {
            position: 3,
            type: "checklist",
            payload: {
              title: "Риски",
              style: "warning",
              items: ["Повышенная влажность", "Снижение цены за засор", "Пересортировка на складе"],
            },
          },
          { position: 4, type: "heading", payload: { text: "Нюансы и лайфхаки" } },
          {
            position: 5,
            type: "paragraph",
            payload: { html: "<p>Поддерживайте влажность до 12% и отделяйте картон с плёнкой до прессования.</p>" },
          },
        ],
      },
    },
  });

  await seedForum(admin.id, demoUser.id, company.id);

  await seedLegalDocuments();

  console.log("Seed completed");
  printSeedAccount("Admin", ADMIN_EMAIL, adminPassword);
  printSeedAccount("Demo user", DEMO_EMAIL, demoPassword);
  console.log(`Learning module seeded: ${module.title}`);
}

// Placeholder-версии всех обязательных юр-документов на dev-стенде, чтобы
// регистрация и страницы /legal/* работали сразу после миграции. Реальный
// текст контент-менеджер опубликует через админский CMS позже.
type LegalDocSeed = {
  type: LegalDocumentType;
  title: string;
  summary: string;
  body: string;
  isRequired: boolean;
};

const LEGAL_DOCUMENT_SEEDS: LegalDocSeed[] = [
  {
    type: LegalDocumentType.privacy_policy,
    title: "Политика конфиденциальности",
    summary: "Какие персональные данные мы собираем, как храним и зачем используем.",
    body: "<p>Текст Политики конфиденциальности находится в подготовке. Финальная редакция будет опубликована до запуска платных тарифов.</p>",
    isRequired: true,
  },
  {
    type: LegalDocumentType.terms_of_service,
    title: "Пользовательское соглашение",
    summary: "Правила использования платформы и взаимные обязательства сторон.",
    body: "<p>Текст Пользовательского соглашения находится в подготовке.</p>",
    isRequired: true,
  },
  {
    type: LegalDocumentType.personal_data_consent,
    title: "Согласие на обработку персональных данных (152-ФЗ)",
    summary: "Согласие на обработку персональных данных в соответствии с 152-ФЗ.",
    body: "<p>Текст Согласия на обработку персональных данных находится в подготовке.</p>",
    isRequired: true,
  },
  {
    type: LegalDocumentType.cookie_policy,
    title: "Политика использования cookies",
    summary: "Какие cookies мы используем и как ими управлять.",
    body: "<p>Текст Политики использования cookies находится в подготовке.</p>",
    isRequired: false,
  },
  {
    type: LegalDocumentType.offer_agreement,
    title: "Публичная оферта",
    summary: "Условия покупки подписки и предоставления услуг.",
    body: "<p>Текст Публичной оферты находится в подготовке.</p>",
    isRequired: false,
  },
];

// Демо-контент форума: пара значений «Вид сырья» (типы вопроса сидируются
// миграцией) + один решённый вопрос с принятым ответом, чтобы раздел не пустовал
// на dev. Идемпотентно по фиксированным id/label.
async function seedForum(adminUserId: string, demoUserId: string, companyId: string) {
  const rawMaterial = await prisma.forumRawMaterial.upsert({
    where: { label: "Макулатура МС-5Б" },
    update: {},
    create: { id: "forum-rm-makulatura", label: "Макулатура МС-5Б", position: 0 },
  });
  await prisma.forumRawMaterial.upsert({
    where: { label: "ПЭТ и пластик" },
    update: {},
    create: { id: "forum-rm-pet", label: "ПЭТ и пластик", position: 1 },
  });
  const questionType = await prisma.forumQuestionType.upsert({
    where: { label: "Логистика" },
    update: {},
    create: { id: "forum-qt-logistics", label: "Логистика", position: 1 },
  });

  const question = await prisma.forumQuestion.upsert({
    where: { id: "forum-demo-q1" },
    update: {},
    create: {
      id: "forum-demo-q1",
      authorId: demoUserId,
      authorCompanyId: companyId,
      title: "Какие документы нужны для межрегиональной перевозки макулатуры?",
      body: "Вожу МС-5Б из области в соседний регион на переработку. Что реально должно быть у водителя в кабине?",
      rawMaterialId: rawMaterial.id,
      questionTypeId: questionType.id,
      status: ForumQuestionStatus.solved,
      answersCount: 1,
      views: 42,
      solvedAt: new Date(),
    },
  });

  const answer = await prisma.forumAnswer.upsert({
    where: { id: "forum-demo-a1" },
    update: {},
    create: {
      id: "forum-demo-a1",
      questionId: question.id,
      authorId: adminUserId,
      body: "Для МС-5Б лицензия не нужна: достаточно договора с покупателем и ТТН с маркой, весом и сторонами.",
      votesCount: 14,
      isAccepted: true,
    },
  });

  await prisma.forumQuestion.update({
    where: { id: question.id },
    data: { acceptedAnswerId: answer.id },
  });

  console.log("Forum demo content seeded (1 solved question)");
}

async function seedLegalDocuments() {
  const initialVersion = "1.0.0";
  for (const seed of LEGAL_DOCUMENT_SEEDS) {
    await prisma.legalDocument.upsert({
      where: { type_version: { type: seed.type, version: initialVersion } },
      update: {},
      create: {
        type: seed.type,
        version: initialVersion,
        title: seed.title,
        summary: seed.summary,
        body: seed.body,
        isRequired: seed.isRequired,
        isActive: true,
        publishedAt: new Date(),
      },
    });
  }
  console.log(`Legal documents seeded (${LEGAL_DOCUMENT_SEEDS.length} active v${initialVersion})`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
