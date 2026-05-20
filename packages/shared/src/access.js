"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEMO_DURATION_HOURS = void 0;
exports.hasPlatformRole = hasPlatformRole;
exports.hasAnyPlatformRole = hasAnyPlatformRole;
exports.isDemoActive = isDemoActive;
exports.isSubscriptionActive = isSubscriptionActive;
exports.canOpenFunctionalSections = canOpenFunctionalSections;
exports.effectivePlan = effectivePlan;
exports.canAccessBasicContent = canAccessBasicContent;
exports.canAccessLearningLevel = canAccessLearningLevel;
exports.demoEndsAt = demoEndsAt;
exports.DEMO_DURATION_HOURS = 24;
function hasPlatformRole(roles, expected) {
    return roles.includes(expected);
}
function hasAnyPlatformRole(roles, expected) {
    return expected.some((role) => roles.includes(role));
}
function isDemoActive(company, now = new Date()) {
    if (company.status !== "demo" || !company.demoEndsAt) {
        return false;
    }
    return new Date(company.demoEndsAt).getTime() > now.getTime();
}
function isSubscriptionActive(company, now = new Date()) {
    if (company.status !== "active" && company.status !== "past_due") {
        return false;
    }
    if (!company.subscriptionEndsAt) {
        return false;
    }
    return new Date(company.subscriptionEndsAt).getTime() > now.getTime() || company.status === "past_due";
}
function canOpenFunctionalSections(company, now = new Date()) {
    return isDemoActive(company, now) || isSubscriptionActive(company, now);
}
function effectivePlan(company, now = new Date()) {
    // Demo считается базовой подпиской, но мы возвращаем отдельное значение,
    // чтобы интерфейс мог честно показать пользователю, что доступ временный.
    if (isDemoActive(company, now)) {
        return "demo_basic";
    }
    if (!isSubscriptionActive(company, now)) {
        return null;
    }
    return company.subscriptionPlan;
}
function canAccessBasicContent(company, now = new Date()) {
    return effectivePlan(company, now) !== null;
}
function canAccessLearningLevel(company, accessLevel, hasOneTimePurchase = false, now = new Date()) {
    const plan = effectivePlan(company, now);
    if (accessLevel === "one_time") {
        return hasOneTimePurchase && company.status !== "blocked" && company.status !== "archived";
    }
    if (accessLevel === "basic") {
        return plan === "demo_basic" || plan === "basic" || plan === "extended";
    }
    return plan === "extended";
}
function demoEndsAt(createdAt = new Date()) {
    return new Date(createdAt.getTime() + exports.DEMO_DURATION_HOURS * 60 * 60 * 1000);
}
