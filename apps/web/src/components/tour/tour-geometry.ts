// Чистая геометрия спотлайта: без DOM, покрыта юнит-тестами (tour-geometry.test.ts).

export type TourRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export function domRectToTourRect(rect: Pick<DOMRect, "x" | "y" | "width" | "height">): TourRect {
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
}

// Вырез спотлайта: цель + равный отступ со всех сторон.
export function inflateTourRect(rect: TourRect, padding: number): TourRect {
  return {
    x: rect.x - padding,
    y: rect.y - padding,
    width: Math.max(0, rect.width + padding * 2),
    height: Math.max(0, rect.height + padding * 2),
  };
}

// rAF-слежение шлёт колбэк только при реальном изменении — субпиксельный
// шум getBoundingClientRect отфильтровываем допуском.
export function tourRectsAlmostEqual(a: TourRect | null, b: TourRect | null, epsilon = 0.5): boolean {
  if (!a || !b) return a === b;
  return (
    Math.abs(a.x - b.x) < epsilon &&
    Math.abs(a.y - b.y) < epsilon &&
    Math.abs(a.width - b.width) < epsilon &&
    Math.abs(a.height - b.height) < epsilon
  );
}

// Нужен ли прокрут к цели. topInset учитывает липкий топбар: цель «под шапкой»
// считается невидимой. Цель выше вьюпорта (сайдбар, длинная секция) не
// «доскроллить» до полной видимости — достаточно пересечения с вьюпортом.
export function isRectComfortablyInViewport(
  rect: TourRect,
  viewportWidth: number,
  viewportHeight: number,
  topInset = 84,
  edgeInset = 12,
): boolean {
  if (rect.height >= viewportHeight - topInset - edgeInset) {
    return rect.y < viewportHeight && rect.y + rect.height > 0 && rect.x < viewportWidth && rect.x + rect.width > 0;
  }
  return (
    rect.y >= topInset &&
    rect.y + rect.height <= viewportHeight - edgeInset &&
    rect.x >= 0 &&
    rect.x + rect.width <= viewportWidth
  );
}
