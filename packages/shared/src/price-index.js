"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.summarizePriceIndex = summarizePriceIndex;
exports.filterPriceIndexPoints = filterPriceIndexPoints;
function toDateOnly(value) {
    const date = new Date(value);
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}
function byDateAsc(a, b) {
    return toDateOnly(a.date).getTime() - toDateOnly(b.date).getTime();
}
function summarizePriceIndex(points, now = new Date(), stagnationThreshold = 1) {
    const today = toDateOnly(now).getTime();
    const actualPoints = points
        .filter((point) => toDateOnly(point.date).getTime() <= today)
        .sort(byDateAsc);
    if (actualPoints.length === 0) {
        return null;
    }
    const current = actualPoints[actualPoints.length - 1];
    if (!current) {
        return null;
    }
    const currentDate = toDateOnly(current.date);
    const weekAgo = currentDate.getTime() - 7 * 24 * 60 * 60 * 1000;
    const twoWeeksAgo = currentDate.getTime() - 14 * 24 * 60 * 60 * 1000;
    // Если точного значения неделю назад нет, берём ближайшую более раннюю точку
    // в 14-дневном окне. Это отражает продуктовую договорённость по индексам.
    const previous = [...actualPoints]
        .reverse()
        .find((point) => {
        const time = toDateOnly(point.date).getTime();
        return time <= weekAgo && time >= twoWeeksAgo;
    });
    if (!previous) {
        return {
            currentPrice: current.price,
            currentDate,
            weeklyChange: null,
            trend: null,
        };
    }
    const weeklyChange = Number((((current.price - previous.price) / previous.price) * 100).toFixed(1));
    const trend = weeklyChange > stagnationThreshold ? "growth" : weeklyChange < -stagnationThreshold ? "fall" : "stagnation";
    return {
        currentPrice: current.price,
        currentDate,
        weeklyChange,
        trend,
    };
}
function filterPriceIndexPoints(points, periodDays, now = new Date()) {
    const today = toDateOnly(now).getTime();
    const since = today - periodDays * 24 * 60 * 60 * 1000;
    return points
        .filter((point) => {
        const time = toDateOnly(point.date).getTime();
        return time >= since && time <= today;
    })
        .sort(byDateAsc);
}
