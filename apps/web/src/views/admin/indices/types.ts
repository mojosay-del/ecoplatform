// Доменные типы экрана «Индексы цен» (категория → номенклатура → индекс с
// историей цен) и общий тип функции-мутатора, который контейнер прокидывает
// во все под-компоненты.

export type Category = {
  id: string;
  name: string;
  position: number;
  isActive: boolean;
  nomenclatures: Nomenclature[];
};

export type Nomenclature = {
  id: string;
  categoryId: string;
  code: string;
  name: string;
  unit: string;
  description: string | null;
  position: number;
  isActive: boolean;
  priceIndex: PriceIndex | null;
};

export type PriceIndex = {
  id: string;
  description: string | null;
  status: "draft" | "published";
  firstPublishedAt: string | null;
  values: { id: string; date: string; price: string | number }[];
};

export type Selection = { kind: "none" } | { kind: "category"; id: string } | { kind: "nomenclature"; id: string };

// POST/PATCH/DELETE на API с перезагрузкой списка; true — успех.
export type MutateFn = (path: string, method: "POST" | "PATCH" | "DELETE", body?: unknown) => Promise<boolean>;
