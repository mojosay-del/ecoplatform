"use client";

// Отображаемые куски предложений: статус-бейдж и подписи условий цены.

import type { OfferStatus, PriceCondition } from "@ecoplatform/shared";

export const OFFER_STATUS_LABEL: Record<OfferStatus, string> = {
  active: "На рассмотрении",
  withdrawn: "Отозвано",
  accepted: "Принято",
  declined: "Отклонено",
};

export const PRICE_CONDITION_LABEL: Record<PriceCondition, string> = {
  from_place: "Цена с места",
  at_gate: "Цена на воротах",
};

export function OfferStatusBadge({ status }: { status: OfferStatus }) {
  return <span className={`mp-badge mp-offer-${status}`}>{OFFER_STATUS_LABEL[status]}</span>;
}

export function formatPrice(pricePerTonRub: number | null): string {
  return pricePerTonRub == null ? "не интересует" : `${pricePerTonRub.toLocaleString("ru-RU")} ₽/т`;
}
