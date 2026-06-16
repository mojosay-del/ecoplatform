// Доменные типы экрана «Индексы цен»: единый плоский список номенклатуры →
// индекс с историей цен. Общий тип функции-мутатора, который контейнер
// прокидывает во все под-компоненты.

export type Nomenclature = {
  id: string;
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

export type Selection = { kind: "none" } | { kind: "nomenclature"; id: string };

// POST/PATCH/DELETE на API с перезагрузкой списка; true — успех.
export type MutateFn = (path: string, method: "POST" | "PATCH" | "DELETE", body?: unknown) => Promise<boolean>;
