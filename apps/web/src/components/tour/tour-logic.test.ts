import { describe, expect, it } from "vitest";
import { isTourAutoRunEligible, pageTourKeyForPathname, resolveAutoTour, selectRunnableSteps } from "./tour-logic";

function companyUser(completed: string[] = []) {
  return { platformRoles: [], onboardingToursCompleted: completed };
}

const none = new Set<string>();

describe("pageTourKeyForPathname", () => {
  it("сопоставляет только точные страницы каталогов", () => {
    expect(pageTourKeyForPathname("/indices")).toBe("indices");
    expect(pageTourKeyForPathname("/account/profile")).toBe("account");
    expect(pageTourKeyForPathname("/calculators/retail")).toBe("calculator-retail");
    expect(pageTourKeyForPathname("/education/course-1")).toBeNull();
    expect(pageTourKeyForPathname("/forum/ask")).toBeNull();
    expect(pageTourKeyForPathname("/news")).toBeNull();
    expect(pageTourKeyForPathname("/marketplace")).toBeNull();
  });
});

describe("isTourAutoRunEligible", () => {
  it("туры автозапускаются только для пользователей компаний", () => {
    expect(isTourAutoRunEligible(companyUser())).toBe(true);
    expect(isTourAutoRunEligible({ platformRoles: ["admin"], onboardingToursCompleted: [] })).toBe(false);
    expect(isTourAutoRunEligible(null)).toBe(false);
    expect(isTourAutoRunEligible(undefined)).toBe(false);
  });
});

describe("resolveAutoTour", () => {
  it("первый вход: сперва общий тур по платформе, независимо от страницы", () => {
    expect(resolveAutoTour({ pathname: "/news", user: companyUser(), sessionCompleted: none })).toBe("platform");
    expect(resolveAutoTour({ pathname: "/indices", user: companyUser(), sessionCompleted: none })).toBe("platform");
  });

  it("после платформенного тура запускается тур текущей страницы", () => {
    expect(resolveAutoTour({ pathname: "/indices", user: companyUser(["platform"]), sessionCompleted: none })).toBe(
      "indices",
    );
    expect(resolveAutoTour({ pathname: "/news", user: companyUser(["platform"]), sessionCompleted: none })).toBeNull();
  });

  it("пройденные туры не перезапускаются; оптимистичная отметка сессии равнозначна серверной", () => {
    expect(
      resolveAutoTour({ pathname: "/indices", user: companyUser(["platform", "indices"]), sessionCompleted: none }),
    ).toBeNull();
    expect(
      resolveAutoTour({
        pathname: "/indices",
        user: companyUser(),
        sessionCompleted: new Set(["platform", "indices"]),
      }),
    ).toBeNull();
  });

  it("staff не получает автозапуск", () => {
    expect(
      resolveAutoTour({
        pathname: "/indices",
        user: { platformRoles: ["admin"], onboardingToursCompleted: [] },
        sessionCompleted: none,
      }),
    ).toBeNull();
  });
});

describe("selectRunnableSteps", () => {
  const steps = [{ anchor: "a" }, { anchor: "b", optional: true }, { anchor: "c" }];

  it("стартует только когда все обязательные якоря в DOM", () => {
    expect(selectRunnableSteps(steps, new Set(["a", "b"]))).toBeNull();
    expect(selectRunnableSteps(steps, new Set(["a", "c"]))).toEqual([{ anchor: "a" }, { anchor: "c" }]);
  });

  it("опциональные шаги включаются по наличию якоря", () => {
    expect(selectRunnableSteps(steps, new Set(["a", "b", "c"]))).toEqual(steps);
  });

  it("пустой набор шагов не запускается", () => {
    expect(selectRunnableSteps([], new Set())).toBeNull();
  });
});
