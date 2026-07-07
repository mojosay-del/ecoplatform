"use client";

// Состояние и поведение формы объявления: загрузка/префилл при правке, подсказки
// адреса (debounce через backend-геокодер), черновые загрузки медиа, сборка DTO и
// сохранение/публикация. Презентация — в ListingFormView/listing-form-sections.tsx.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import type { BillingStatus, MarketplaceAddressSuggestion, MarketplaceListingDetail } from "@ecoplatform/shared";
import { LISTING_MIN_WEIGHT_KG } from "@ecoplatform/shared";
import type { PhoneCountryId } from "../../components/auth/types";
import { ApiError, api, apiDeleteFile } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { addressCountryCodeFromName, companyAddressToDraft } from "../../lib/company-address";
import { invalidateQueryFamilies, queryKeys } from "../../lib/query";
import { useApiQuery } from "../shared";
import { formatWeight, useNomenclatureOptions } from "./listing-ui";
import {
  ADDRESS_SUGGEST_DEBOUNCE_MS,
  ADDRESS_SUGGEST_MIN_LENGTH,
  type AddressSuggestState,
  buildListingDto,
  clientValidationError,
  emptyPosition,
  type ListingFormValues,
  type MediaItem,
  NO_PACKAGING,
  parsePackaging,
  parsePhone,
  type PositionForm,
  type SelectOption,
  totalPositionWeightKg,
  uniqueOptions,
} from "./listing-form.helpers";

function kgToTonsInput(kg: number | null | undefined): string {
  return kg == null ? "" : String(kg / 1000);
}

export function useListingForm(listingId?: string) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const nomenclature = useNomenclatureOptions();
  const isCollector = user?.company?.type === "collector";

  const { data: existing, state } = useApiQuery(
    listingId ? queryKeys.marketplace.detail(listingId) : null,
    () => api.marketplace.get(listingId as string),
    null as MarketplaceListingDetail | null,
  );
  const { data: billingStatus } = useApiQuery<BillingStatus | null>(
    listingId ? null : queryKeys.billing.status(),
    () => api.billing.status(),
    null,
  );

  const [positions, setPositions] = useState<PositionForm[]>([emptyPosition()]);
  const [city, setCity] = useState("");
  const [region, setRegion] = useState("");
  const [street, setStreet] = useState("");
  const [building, setBuilding] = useState("");
  const [postcode, setPostcode] = useState("");
  const [phoneCountry, setPhoneCountry] = useState<PhoneCountryId>("ru");
  const [phoneDigits, setPhoneDigits] = useState("");
  const [readyNow, setReadyNow] = useState(true);
  const [readinessDate, setReadinessDate] = useState("");
  const [description, setDescription] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");
  const [typicalLoadMinTons, setTypicalLoadMinTons] = useState("");
  const [typicalLoadMaxTons, setTypicalLoadMaxTons] = useState("");
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [prefilled, setPrefilled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addressQuery, setAddressQuery] = useState("");
  // Страна поиска адреса: РФ (вкл. новые территории) или Беларусь. DaData находит
  // белорусские адреса только при явном фильтре BY (см. AddressGeocoderService).
  const [addressCountry, setAddressCountry] = useState<"RU" | "BY">("RU");
  const [addressSuggestions, setAddressSuggestions] = useState<MarketplaceAddressSuggestion[]>([]);
  const [addressSuggestState, setAddressSuggestState] = useState<AddressSuggestState>("idle");

  const addressSuggestRequestRef = useRef(0);
  const draftUploadFileIdsRef = useRef<Set<string>>(new Set());
  const cleanupDraftUploadsRef = useRef(true);
  const categoryOptions = uniqueOptions(
    nomenclature.map((option) => ({ value: option.category, label: option.category })),
  );
  const totalWeightKg = totalPositionWeightKg(positions);
  const hasMinimumWeight = totalWeightKg >= LISTING_MIN_WEIGHT_KG;
  const weightHintText = `Вес: ${formatWeight(totalWeightKg)} / минимум ${formatWeight(LISTING_MIN_WEIGHT_KG)} для публикации.`;

  function registerDraftUpload(fileId: string) {
    draftUploadFileIdsRef.current.add(fileId);
  }

  async function cleanupDraftUpload(fileId: string) {
    if (!draftUploadFileIdsRef.current.has(fileId)) return;
    draftUploadFileIdsRef.current.delete(fileId);
    try {
      await apiDeleteFile(fileId);
    } catch {
      // Если файл уже привязан к сущности или сеть оборвалась, его подхватит
      // ночная orphan-cleanup; пользователю это действие не должно мешать.
    }
  }

  useEffect(() => {
    const draftUploadFileIds = draftUploadFileIdsRef.current;
    return () => {
      if (!cleanupDraftUploadsRef.current) return;
      const fileIds = Array.from(draftUploadFileIds);
      draftUploadFileIds.clear();
      fileIds.forEach((fileId) => {
        void apiDeleteFile(fileId).catch(() => undefined);
      });
    };
  }, []);

  // Подсказки адреса идут через backend-геокодер: закрытый ключ Яндекса не
  // попадает в браузер, а форма не зависит от загрузки внешнего JS-виджета.
  useEffect(() => {
    const query = addressQuery.trim();
    const requestId = addressSuggestRequestRef.current + 1;
    addressSuggestRequestRef.current = requestId;

    if (query.length < ADDRESS_SUGGEST_MIN_LENGTH) {
      setAddressSuggestions([]);
      setAddressSuggestState("idle");
      return;
    }

    let cancelled = false;
    setAddressSuggestState("loading");
    const timer = window.setTimeout(() => {
      api.marketplace
        .addressSuggest(query, addressCountry)
        .then((suggestions) => {
          if (cancelled || addressSuggestRequestRef.current !== requestId) return;
          setAddressSuggestions(suggestions);
          setAddressSuggestState(suggestions.length > 0 ? "open" : "empty");
        })
        .catch(() => {
          if (cancelled || addressSuggestRequestRef.current !== requestId) return;
          setAddressSuggestions([]);
          setAddressSuggestState("failed");
        });
    }, ADDRESS_SUGGEST_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [addressQuery, addressCountry]);

  function applyAddressSuggestion(suggestion: MarketplaceAddressSuggestion) {
    setAddressQuery(suggestion.value);
    setAddressSuggestions([]);
    setAddressSuggestState("idle");
    setAddressCountry(addressCountryCodeFromName(suggestion.address.country));
    setRegion(suggestion.address.region ?? "");
    setCity(suggestion.address.city);
    setStreet(suggestion.address.street ?? "");
    setBuilding(suggestion.address.building ?? "");
    setPostcode(suggestion.address.postcode ?? "");
  }

  // Префилл при редактировании — один раз, когда подгрузилось объявление.
  useEffect(() => {
    if (!existing || prefilled) return;
    setPositions(
      existing.positions.length > 0
        ? existing.positions.map((position) => ({
            category: "",
            nomenclatureId: position.nomenclatureId,
            weightTons: String(position.weightKg / 1000),
            form: position.form,
            moistureCondition: position.moistureCondition ?? "",
            contaminationCondition: position.contaminationCondition ?? "",
            packaging: parsePackaging(position.packaging),
          }))
        : [emptyPosition()],
    );
    setCity(existing.address?.city ?? existing.city ?? "");
    setRegion(existing.address?.region ?? existing.region ?? "");
    setStreet(existing.address?.street ?? "");
    setBuilding(existing.address?.building ?? "");
    setPostcode(existing.address?.postcode ?? "");
    setAddressCountry(addressCountryCodeFromName(existing.address?.country));
    setAddressQuery(existing.address?.formatted ?? "");
    const parsedPhone = parsePhone(existing.contactPhone ?? "");
    setPhoneCountry(parsedPhone.countryId);
    setPhoneDigits(parsedPhone.digits);
    setReadyNow(existing.readyNow);
    setReadinessDate(existing.readinessDate ? existing.readinessDate.slice(0, 10) : "");
    setDescription(existing.description ?? "");
    setPaymentTerms(existing.paymentTerms ?? "");
    setTypicalLoadMinTons(kgToTonsInput(existing.typicalLoadMinKg ?? existing.typicalLoadKg));
    setTypicalLoadMaxTons(kgToTonsInput(existing.typicalLoadMaxKg ?? existing.typicalLoadKg));
    setMedia(existing.media.map((item) => ({ fileId: item.fileId, kind: item.kind === "video" ? "video" : "photo" })));
    setPrefilled(true);
  }, [existing, prefilled]);

  // Новое объявление получает адрес компании как стартовое значение, но только
  // пока пользователь сам не начал вводить адрес отгрузки.
  useEffect(() => {
    if (listingId || prefilled || city.trim() || addressQuery.trim()) return;
    const draft = companyAddressToDraft(billingStatus?.factualAddress);
    if (!draft.city.trim()) return;
    setAddressCountry(draft.countryCode);
    setAddressQuery(draft.query);
    setRegion(draft.region);
    setCity(draft.city);
    setStreet(draft.street);
    setBuilding(draft.building);
    setPostcode(draft.postcode);
    setPrefilled(true);
  }, [addressQuery, billingStatus?.factualAddress, city, listingId, prefilled]);

  function updatePosition(index: number, patch: Partial<PositionForm>) {
    setPositions((prev) => prev.map((position, i) => (i === index ? { ...position, ...patch } : position)));
  }

  function selectedNomenclatureOption(position: PositionForm) {
    return nomenclature.find((option) => option.id === position.nomenclatureId) ?? null;
  }

  function selectedCategory(position: PositionForm) {
    return position.category || selectedNomenclatureOption(position)?.category || "";
  }

  function changePositionCategory(index: number, category: string) {
    setPositions((prev) =>
      prev.map((position, i) => {
        if (i !== index) return position;
        const option = selectedNomenclatureOption(position);
        return {
          ...position,
          category,
          nomenclatureId: option?.category === category ? position.nomenclatureId : "",
        };
      }),
    );
  }

  function togglePositionPackaging(index: number, option: string) {
    setPositions((prev) =>
      prev.map((position, positionIndex) => {
        if (positionIndex !== index) return position;
        if (option === NO_PACKAGING) return { ...position, packaging: [NO_PACKAGING] };
        const withoutNone = position.packaging.filter((value) => value !== NO_PACKAGING);
        const next = withoutNone.includes(option)
          ? withoutNone.filter((value) => value !== option)
          : [...withoutNone, option];
        return { ...position, packaging: next.length > 0 ? next : [NO_PACKAGING] };
      }),
    );
  }

  function addPosition() {
    setPositions((prev) => [...prev, emptyPosition()]);
  }

  function removePosition(index: number) {
    setPositions((prev) => prev.filter((_, i) => i !== index));
  }

  // Опции номенклатуры для конкретной позиции (фильтр по выбранной категории).
  function positionOptions(position: PositionForm): SelectOption[] {
    const category = selectedCategory(position);
    return nomenclature
      .filter((option) => !category || option.category === category)
      .map((option) => ({ value: option.id, label: option.name }));
  }

  function currentValues(): ListingFormValues {
    return {
      positions,
      addressCountry,
      city,
      region,
      street,
      building,
      postcode,
      phoneCountry,
      phoneDigits,
      readyNow,
      readinessDate,
      description,
      paymentTerms,
      typicalLoadMinTons,
      typicalLoadMaxTons,
      media,
    };
  }

  async function save(publish: boolean) {
    const values = currentValues();
    const validationError = clientValidationError(values, publish);
    if (validationError) {
      setError(validationError);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const dto = buildListingDto(values);
      const saved = listingId ? await api.marketplace.update(listingId, dto) : await api.marketplace.create(dto);
      cleanupDraftUploadsRef.current = false;
      draftUploadFileIdsRef.current.clear();
      if (publish) {
        await api.marketplace.publish(saved.id);
      }
      await invalidateQueryFamilies(queryClient, ["files", "marketplace"]);
      router.push(`/marketplace/${saved.id}`);
    } catch (saveError) {
      setError(saveError instanceof ApiError ? saveError.message : "Не удалось сохранить объявление.");
      setSaving(false);
    }
  }

  return {
    // Загрузка/доступ
    user,
    isCollector,
    existing,
    state,
    // Позиции
    positions,
    nomenclature,
    categoryOptions,
    hasMinimumWeight,
    weightHintText,
    selectedCategory,
    positionOptions,
    updatePosition,
    changePositionCategory,
    togglePositionPackaging,
    addPosition,
    removePosition,
    // Адрес
    addressQuery,
    setAddressQuery,
    addressCountry,
    setAddressCountry,
    addressSuggestions,
    addressSuggestState,
    setAddressSuggestState,
    applyAddressSuggestion,
    city,
    region,
    street,
    building,
    postcode,
    // Готовность и контакты
    readyNow,
    setReadyNow,
    readinessDate,
    setReadinessDate,
    phoneCountry,
    setPhoneCountry,
    phoneDigits,
    setPhoneDigits,
    // Дополнительно
    description,
    setDescription,
    paymentTerms,
    setPaymentTerms,
    typicalLoadMinTons,
    setTypicalLoadMinTons,
    typicalLoadMaxTons,
    setTypicalLoadMaxTons,
    // Медиа
    media,
    setMedia,
    registerDraftUpload,
    cleanupDraftUpload,
    // Действия
    saving,
    error,
    save,
  };
}

export type ListingFormController = ReturnType<typeof useListingForm>;
