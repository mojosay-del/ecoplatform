import type {
  CompanyRatingSummary,
  CreateListingDto,
  CreateOfferDto,
  CreateReviewDto,
  DealResult,
  ListingOfferItem,
  MarketplaceAddressSuggestion,
  MarketplaceListingDetail,
  MarketplaceListingListItem,
  MarketplaceNomenclatureOption,
  MyMarketplaceListingItem,
  MyOfferItem,
  PaginatedResponse,
  ReviewItem,
  UpdateListingDto,
} from "@ecoplatform/shared";
import { enc, paginationSuffix, type PaginationInput } from "./endpoint-utils";
import { apiFetch } from "./requests";

type MarketplaceFeedInput = PaginationInput & {
  region?: string[];
  nomenclatureId?: string[];
  // Видимая область карты «swLat,swLon,neLat,neLon» («Искать в этой области»).
  bbox?: string;
};

function marketplaceFeedSuffix(input: MarketplaceFeedInput = {}) {
  const query = new URLSearchParams();
  if (input.limit !== undefined) query.set("limit", String(input.limit));
  if (input.offset !== undefined) query.set("offset", String(input.offset));
  input.region?.forEach((region) => query.append("region[]", region));
  input.nomenclatureId?.forEach((id) => query.append("nomenclatureId[]", id));
  if (input.bbox) query.set("bbox", input.bbox);
  return query.toString() ? `?${query.toString()}` : "";
}

export const marketplaceApi = {
  listings: (input: MarketplaceFeedInput = {}) =>
    apiFetch<PaginatedResponse<MarketplaceListingListItem>>(`/marketplace/listings${marketplaceFeedSuffix(input)}`),
  regions: () => apiFetch<string[]>("/marketplace/regions"),
  addressSuggest: (q: string) => apiFetch<MarketplaceAddressSuggestion[]>(`/marketplace/address-suggest?q=${enc(q)}`),
  myListings: (pagination: PaginationInput = {}) =>
    apiFetch<PaginatedResponse<MyMarketplaceListingItem>>(`/marketplace/my/listings${paginationSuffix(pagination)}`),
  nomenclature: () => apiFetch<MarketplaceNomenclatureOption[]>("/marketplace/nomenclature"),
  get: (id: string) => apiFetch<MarketplaceListingDetail>(`/marketplace/listings/${enc(id)}`),
  create: (body: CreateListingDto) =>
    apiFetch<MarketplaceListingDetail>("/marketplace/listings", { method: "POST", body }),
  update: (id: string, body: UpdateListingDto) =>
    apiFetch<MarketplaceListingDetail>(`/marketplace/listings/${enc(id)}`, { method: "PATCH", body }),
  publish: (id: string) =>
    apiFetch<MarketplaceListingDetail>(`/marketplace/listings/${enc(id)}/publish`, { method: "POST" }),
  archive: (id: string) =>
    apiFetch<MarketplaceListingDetail>(`/marketplace/listings/${enc(id)}/archive`, { method: "POST" }),
  republish: (id: string) =>
    apiFetch<MarketplaceListingDetail>(`/marketplace/listings/${enc(id)}/republish`, { method: "POST" }),
  offers: {
    mine: (pagination: PaginationInput = {}) =>
      apiFetch<PaginatedResponse<MyOfferItem>>(`/marketplace/my/offers${paginationSuffix(pagination)}`),
    create: (listingId: string, body: CreateOfferDto) =>
      apiFetch<MyOfferItem>(`/marketplace/listings/${enc(listingId)}/offers`, { method: "POST", body }),
    forListing: (listingId: string) => apiFetch<ListingOfferItem[]>(`/marketplace/listings/${enc(listingId)}/offers`),
    update: (offerId: string, body: CreateOfferDto) =>
      apiFetch<MyOfferItem>(`/marketplace/offers/${enc(offerId)}`, { method: "PATCH", body }),
    withdraw: (offerId: string) =>
      apiFetch<MyOfferItem>(`/marketplace/offers/${enc(offerId)}/withdraw`, { method: "POST" }),
    accept: (offerId: string) =>
      apiFetch<ListingOfferItem>(`/marketplace/offers/${enc(offerId)}/accept`, { method: "POST" }),
    deal: (offerId: string, result: DealResult) =>
      apiFetch<ListingOfferItem>(`/marketplace/offers/${enc(offerId)}/deal`, { method: "POST", body: { result } }),
  },
  reviews: {
    forCompany: (companyId: string) => apiFetch<ReviewItem[]>(`/marketplace/companies/${enc(companyId)}/reviews`),
    rating: (companyId: string) => apiFetch<CompanyRatingSummary>(`/marketplace/companies/${enc(companyId)}/rating`),
    create: (offerId: string, body: CreateReviewDto) =>
      apiFetch<ReviewItem>(`/marketplace/offers/${enc(offerId)}/reviews`, { method: "POST", body }),
    remove: (reviewId: string) => apiFetch<{ ok: true }>(`/marketplace/reviews/${enc(reviewId)}`, { method: "DELETE" }),
    respond: (reviewId: string, text: string) =>
      apiFetch<ReviewItem>(`/marketplace/reviews/${enc(reviewId)}/response`, { method: "POST", body: { text } }),
  },
};
