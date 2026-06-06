import { describe, expect, it } from "vitest";
import { paginatedResponseByOverfetch, resolvePagination } from "./pagination";

describe("paginatedResponseByOverfetch", () => {
  const pagination = resolvePagination({ limit: 3, offset: 0 }, { defaultLimit: 20, maxLimit: 100 });

  it("обнаруживает следующую страницу по лишней строке и обрезает до лимита", () => {
    const rows = [1, 2, 3, 4]; // выбрали limit+1
    const res = paginatedResponseByOverfetch(rows, pagination);
    expect(res.items).toEqual([1, 2, 3]);
    expect(res.hasMore).toBe(true);
  });

  it("последняя страница: строк не больше лимита — hasMore=false", () => {
    const rows = [1, 2];
    const res = paginatedResponseByOverfetch(rows, pagination);
    expect(res.items).toEqual([1, 2]);
    expect(res.hasMore).toBe(false);
  });

  it("total — нижняя граница (offset + отдано), без count()", () => {
    const offsetPage = resolvePagination({ limit: 3, offset: 6 }, { defaultLimit: 20, maxLimit: 100 });
    const res = paginatedResponseByOverfetch([1, 2, 3, 4], offsetPage);
    expect(res.total).toBe(9);
    expect(res.hasMore).toBe(true);
  });
});
