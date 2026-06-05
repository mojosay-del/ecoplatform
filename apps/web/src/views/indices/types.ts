export type IndexPeriod = "2W" | "1M" | "3M" | "6M" | "1Y" | "2Y" | "3Y";

export type IndexPoint = {
  date: string | Date;
  price: number;
};
