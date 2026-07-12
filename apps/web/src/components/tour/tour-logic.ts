import type { AuthMeUser, OnboardingTourKey } from "@ecoplatform/shared";

// Чистая логика автозапуска туров (без DOM) — покрыта tour-logic.test.ts.

type TourUser = Pick<AuthMeUser, "platformRoles" | "onboardingToursCompleted"> | null | undefined;

// Страницы-каталоги с собственным туром. Совпадение ТОЧНОЕ: внутренние
// страницы (курс, вопрос форума, статья) тур не запускают — его якоря живут
// только на каталоге раздела. Новости и Торговая площадка тура не имеют.
export const TOUR_PAGE_ROUTES: ReadonlyArray<readonly [string, OnboardingTourKey]> = [
  ["/account/profile", "account"],
  ["/education", "education"],
  ["/indices", "indices"],
  ["/knowledge-base", "knowledge-base"],
  ["/documentation", "documentation"],
  ["/forum", "forum"],
  ["/calculators/retail", "calculator-retail"],
];

export function pageTourKeyForPathname(pathname: string): OnboardingTourKey | null {
  const match = TOUR_PAGE_ROUTES.find(([route]) => route === pathname);
  return match ? match[1] : null;
}

// Автозапуск — только для пользователей компаний. Платформенный staff смотрит
// сайт глазами админ-панели, туры ему не нужны; «?»-активаторы при этом
// работают для всех.
export function isTourAutoRunEligible(user: TourUser): boolean {
  return Boolean(user) && (user?.platformRoles?.length ?? 0) === 0;
}

// sessionCompleted — оптимистичные отметки текущей сессии: тур не должен
// перезапускаться, даже если POST на бэк ещё в полёте или упал.
export function isTourCompleted(
  user: TourUser,
  sessionCompleted: ReadonlySet<string>,
  key: OnboardingTourKey,
): boolean {
  return sessionCompleted.has(key) || Boolean(user?.onboardingToursCompleted?.includes(key));
}

// Какой тур запускать автоматически: сперва общий по платформе (первый вход),
// затем — тур текущей страницы. Оба pending на одной странице → платформа
// первым, страничный подхватится следующим прогоном после её завершения.
export function resolveAutoTour(input: {
  pathname: string;
  user: TourUser;
  sessionCompleted: ReadonlySet<string>;
}): OnboardingTourKey | null {
  if (!isTourAutoRunEligible(input.user)) return null;
  if (!isTourCompleted(input.user, input.sessionCompleted, "platform")) return "platform";

  const pageKey = pageTourKeyForPathname(input.pathname);
  if (pageKey && !isTourCompleted(input.user, input.sessionCompleted, pageKey)) return pageKey;

  return null;
}

// Выбрать шаги, с которыми тур может стартовать: все обязательные якоря должны
// быть в DOM, опциональные включаются по наличию. null → запускать рано/нечего.
export function selectRunnableSteps<T extends { anchor: string; optional?: boolean }>(
  steps: readonly T[],
  presentAnchors: ReadonlySet<string>,
): T[] | null {
  const requiredPresent = steps.every((step) => step.optional || presentAnchors.has(step.anchor));
  if (!requiredPresent) return null;

  const present = steps.filter((step) => presentAnchors.has(step.anchor));
  return present.length > 0 ? present : null;
}
