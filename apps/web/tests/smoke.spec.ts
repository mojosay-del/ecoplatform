import { expect, test, type Locator, type Page } from "@playwright/test";

const EMAIL_DOMAIN = process.env.SMOKE_TEST_EMAIL_DOMAIN ?? "example.com";

type SmokeUser = {
  organizationName: string;
  billingInn: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  password: string;
};

test.describe("production smoke", () => {
  test("registers, logs in, checks news and indices, then logs out", async ({ page }) => {
    const user = createSmokeUser();

    await registerSmokeUser(page, user);
    await logout(page);
    await login(page, user);
    await expectNewsFeed(page, { navigate: false });
    await expectIndices(page);
    await logout(page);
  });
});

async function registerSmokeUser(page: Page, user: SmokeUser) {
  await page.goto("/register");
  await acceptNecessaryCookies(page);

  await expect(page.getByRole("heading", { name: "Создать аккаунт" })).toBeVisible();
  const form = page.locator("form.auth-card");
  await form.locator("input[name='organizationName']").fill(user.organizationName);
  await form.locator("select[name='companyType']").selectOption("collector");
  await form.locator("input[name='billingInn']").fill(user.billingInn);
  await page.getByRole("button", { name: "Далее" }).click();
  await expect(page.getByText("Шаг 2 из 2")).toBeVisible();
  await page.getByRole("button", { name: "Назад" }).click();
  await expect(page.getByText("Шаг 1 из 2")).toBeVisible();
  await expect(form.locator("input[name='organizationName']")).toHaveValue(user.organizationName);
  await expect(form.locator("input[name='billingInn']")).toHaveValue(user.billingInn);
  await page.getByRole("button", { name: "Далее" }).click();
  await expect(page.getByText("Шаг 2 из 2")).toBeVisible();
  await form.locator("input[name='lastName']").fill(user.lastName);
  await form.locator("input[name='firstName']").fill(user.firstName);
  await form.locator("select[name='gender']").selectOption("male");
  await form.locator("input[type='tel']").fill(user.phone);
  await form.locator("input[name='email']").fill(user.email);
  await form.locator("input[name='password']").fill(user.password);

  const requiredConsents = page.getByRole("group", { name: "Согласия" }).locator("input[type='checkbox'][required]");
  await expectAtLeastOne(requiredConsents);
  for (let index = 0; index < (await requiredConsents.count()); index += 1) {
    await requiredConsents.nth(index).check();
  }

  await page.getByRole("button", { name: "Создать аккаунт" }).click();
  await expect(page).toHaveURL(/\/news(?:\?|$)/);
  await expectNewsFeed(page, { navigate: false });
}

async function login(page: Page, user: SmokeUser) {
  await page.goto("/login");
  await acceptNecessaryCookies(page);

  await expect(page.getByRole("heading", { name: "Войти в аккаунт" })).toBeVisible();
  const form = page.locator("form.auth-card");
  await form.locator("input[name='email']").fill(user.email);
  await form.locator("input[name='password']").fill(user.password);
  await page.getByRole("button", { name: "Войти" }).click();

  await expect(page).toHaveURL(/\/news(?:\?|$)/);
}

async function expectNewsFeed(page: Page, options: { navigate?: boolean } = {}) {
  if (options.navigate !== false) {
    await page.goto("/news");
  }
  await expect(page.getByRole("heading", { name: "Новости рынка" })).toBeVisible();
  await expectAtLeastOne(page.locator(".news-tile"));
}

async function expectIndices(page: Page) {
  await page.goto("/indices");
  await expect(page.getByRole("heading", { name: "Индексы цен на вторсырьё" })).toBeVisible();

  const cards = page.locator(".index-card");
  await expectAtLeastOne(cards);
  await expect(cards.first().locator("svg").first()).toBeVisible();
}

async function logout(page: Page) {
  await page.goto("/account");
  await page.getByRole("button", { name: /^Выйти$/ }).click();
  await expect(page).toHaveURL(/\/login(?:\?|$)/);
  await expect(page.getByRole("heading", { name: "Войти в аккаунт" })).toBeVisible();
}

async function acceptNecessaryCookies(page: Page) {
  await page
    .getByRole("button", { name: "Только необходимые" })
    .click({ timeout: 3_000 })
    .catch(() => undefined);
}

async function expectAtLeastOne(locator: Locator) {
  await expect.poll(async () => locator.count()).toBeGreaterThan(0);
  await expect(locator.first()).toBeVisible();
}

function createSmokeUser(): SmokeUser {
  const runId = `${Date.now()}${Math.random().toString(36).slice(2, 8)}`.toLowerCase();
  const phoneSuffix = String(Date.now()).slice(-9);

  return {
    organizationName: `Smoke Test ${runId}`,
    billingInn: "7707083893",
    firstName: "Smoke",
    lastName: "Tester",
    phone: `9${phoneSuffix}`,
    email: `smoke+${runId}@${EMAIL_DOMAIN}`,
    password: `EcoSmoke${runId}A1`,
  };
}
