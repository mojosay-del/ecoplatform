"use client";

// Форма создания/редактирования объявления: позиции (сырьё/вес в тоннах/форма/
// влажность/засор), адрес с подсказками Яндекса, телефон (как в регистрации),
// упаковка (мультивыбор), объём в машину и медиа. Сохранение — черновик;
// «Опубликовать» сохраняет и публикует (бэк проверит 4–10 фото, ≥100 кг).

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  CircleDot,
  ClipboardList,
  CreditCard,
  Droplets,
  FileText,
  Filter,
  GripVertical,
  ImagePlus,
  Layers,
  MapPin,
  Package,
  PackageCheck,
  Scale,
  Truck,
  Upload,
  Video,
  X,
  type LucideIcon,
} from "lucide-react";
import type { CreateListingDto, MarketplaceAddressSuggestion, MarketplaceListingDetail } from "@ecoplatform/shared";
import {
  LISTING_MAX_PHOTOS,
  LISTING_MAX_VIDEOS,
  LISTING_MIN_PHOTOS,
  LISTING_MIN_WEIGHT_KG,
  type ListingContaminationCondition,
  type ListingMoistureCondition,
} from "@ecoplatform/shared";
import { AppShell } from "../../components/AppShell";
import { PHONE_COUNTRIES } from "../../components/auth/constants";
import { PhoneInput } from "../../components/auth/phone-input";
import type { PhoneCountryId } from "../../components/auth/types";
import { formatPhoneFull, getPhoneCountry, normalizePhoneDigits } from "../../components/auth/utils";
import {
  ApiError,
  api,
  apiDeleteFile,
  apiUploadFileWithProgress,
  preferredFileAssetImageUrl,
  preferredFileAssetMediaUrl,
} from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { useFileAssetsByIds } from "../../lib/use-cover-assets";
import { AccessClosed, AuthRequired, ErrorState, useApiQuery } from "../shared";
import { formatWeight, useNomenclatureOptions } from "./listing-ui";

const PACKAGING_OPTIONS = ["Без упаковки", "Палет", "Проложки", "Обмотка"] as const;
const NO_PACKAGING = "Без упаковки";
const MOISTURE_OPTIONS: Array<SelectOption & { value: ListingMoistureCondition }> = [
  { value: "dry", label: "Сухое" },
  { value: "slightly_wet", label: "Немного влажное" },
  { value: "wet", label: "Влажное" },
];
const CONTAMINATION_OPTIONS: Array<SelectOption & { value: ListingContaminationCondition }> = [
  { value: "clean", label: "Без включений" },
  { value: "may_have_inclusions", label: "Могут быть иные включения" },
  { value: "has_inclusions", label: "Есть иные включения" },
];
const ADDRESS_SEARCH_ID = "mp-address-search";
const ADDRESS_SUGGEST_MIN_LENGTH = 3;
const ADDRESS_SUGGEST_DEBOUNCE_MS = 300;

type AddressSuggestState = "idle" | "loading" | "open" | "empty" | "failed";

type PositionForm = {
  category: string;
  nomenclatureId: string;
  weightTons: string;
  form: "pressed" | "loose";
  moistureCondition: ListingMoistureCondition | "";
  contaminationCondition: ListingContaminationCondition | "";
  packaging: string[];
};

type MediaItem = { fileId: string; kind: "photo" | "video" };
type SelectOption = { value: string; label: string };
type MediaUploadProgress = {
  fileName: string;
  fraction: number;
  index: number;
  total: number;
  kind: "photo" | "video";
};

function emptyPosition(): PositionForm {
  return {
    category: "",
    nomenclatureId: "",
    weightTons: "",
    form: "loose",
    moistureCondition: "",
    contaminationCondition: "",
    packaging: [NO_PACKAGING],
  };
}

function fieldClass(value: string | boolean | null | undefined): string {
  return `mp-field${value ? " is-filled" : ""}`;
}

function sectionTitle(Icon: LucideIcon, title: string) {
  return (
    <h2>
      <span className="mp-section-icon">
        <Icon size={17} strokeWidth={2.2} aria-hidden="true" />
      </span>
      {title}
    </h2>
  );
}

function SortableMediaTile({
  item,
  index,
  url,
  onRemove,
}: {
  item: MediaItem;
  index: number;
  url: string | null;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.fileId,
  });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.72 : 1,
    zIndex: isDragging ? 3 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`mp-media-tile mp-photo-tile${index === 0 ? " is-primary" : ""}${isDragging ? " is-dragging" : ""}`}
    >
      {url ? <img src={url} alt="" /> : <div className="mp-media-empty">Фото</div>}
      {index === 0 ? <span className="mp-media-primary-badge">Главное фото</span> : null}
      <button
        className="mp-media-drag-handle"
        type="button"
        aria-label={`Перетащить фото ${index + 1}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical size={14} strokeWidth={2.4} aria-hidden="true" />
      </button>
      <button className="mp-media-remove" type="button" aria-label="Удалить фото" onClick={onRemove}>
        <X size={14} />
      </button>
    </div>
  );
}

function uniqueOptions(options: SelectOption[]): SelectOption[] {
  const seen = new Set<string>();
  return options.filter((option) => {
    if (seen.has(option.value)) return false;
    seen.add(option.value);
    return true;
  });
}

// Разбор полного номера в страну + национальные цифры (для префилла при правке).
function parsePhone(full: string): { countryId: PhoneCountryId; digits: string } {
  const digitsOnly = full.replace(/\D/g, "");
  for (const country of PHONE_COUNTRIES) {
    const dial = country.dialCode.replace(/\D/g, "");
    if (digitsOnly.startsWith(dial)) {
      const local = normalizePhoneDigits(full, country);
      if (local.length === country.nationalLength) return { countryId: country.id as PhoneCountryId, digits: local };
    }
  }
  return { countryId: "ru", digits: normalizePhoneDigits(full, getPhoneCountry("ru")) };
}

function parsePackaging(value: string | null): string[] {
  const allowed = new Set<string>(PACKAGING_OPTIONS);
  const parts = (value ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part && part !== "Тюки" && allowed.has(part));
  return parts.length > 0 ? parts : [NO_PACKAGING];
}

function serializePackaging(value: string[]): string | null {
  const cleaned = value.map((part) => part.trim()).filter(Boolean);
  return cleaned.length > 0 ? cleaned.join(", ") : null;
}

function aggregatePositionPackaging(positions: PositionForm[]): string | null {
  const items = positions
    .flatMap((position) => position.packaging)
    .map((part) => part.trim())
    .filter(Boolean);
  const unique = Array.from(new Set(items));
  return unique.length > 0 ? unique.join(", ") : null;
}

function positionWeightKg(position: PositionForm): number {
  const weightTons = Number(position.weightTons);
  return Number.isFinite(weightTons) && weightTons > 0 ? weightTons * 1000 : 0;
}

function totalPositionWeightKg(positions: PositionForm[]): number {
  return positions.reduce((sum, position) => sum + positionWeightKg(position), 0);
}

function moistureConditionFromPct(value: number | null): ListingMoistureCondition | "" {
  if (value == null) return "";
  if (value <= 5) return "dry";
  if (value <= 20) return "slightly_wet";
  return "wet";
}

function contaminationConditionFromPct(value: number | null): ListingContaminationCondition | "" {
  if (value == null) return "";
  if (value <= 0) return "clean";
  if (value <= 5) return "may_have_inclusions";
  return "has_inclusions";
}

export function ListingFormView({ listingId }: { listingId?: string }) {
  const router = useRouter();
  const { user } = useAuth();
  const nomenclature = useNomenclatureOptions();
  const isCollector = user?.company?.type === "collector";

  const { data: existing, state } = useApiQuery(
    listingId ? `listing-edit-${listingId}` : null,
    () => api.marketplace.get(listingId as string),
    null as MarketplaceListingDetail | null,
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
  const [typicalLoadTons, setTypicalLoadTons] = useState("");
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [prefilled, setPrefilled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addressQuery, setAddressQuery] = useState("");
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
    return () => {
      if (!cleanupDraftUploadsRef.current) return;
      const fileIds = Array.from(draftUploadFileIdsRef.current);
      draftUploadFileIdsRef.current.clear();
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
        .addressSuggest(query)
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
  }, [addressQuery]);

  function applyAddressSuggestion(suggestion: MarketplaceAddressSuggestion) {
    setAddressQuery(suggestion.value);
    setAddressSuggestions([]);
    setAddressSuggestState("idle");
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
            moistureCondition: position.moistureCondition ?? moistureConditionFromPct(position.moisturePct),
            contaminationCondition:
              position.contaminationCondition ?? contaminationConditionFromPct(position.contaminationPct),
            packaging: parsePackaging(position.packaging ?? existing.packaging),
          }))
        : [emptyPosition()],
    );
    setCity(existing.address?.city ?? existing.city ?? "");
    setRegion(existing.address?.region ?? existing.region ?? "");
    setStreet(existing.address?.street ?? "");
    setBuilding(existing.address?.building ?? "");
    setPostcode(existing.address?.postcode ?? "");
    setAddressQuery(existing.address?.formatted ?? "");
    const parsedPhone = parsePhone(existing.contactPhone ?? "");
    setPhoneCountry(parsedPhone.countryId);
    setPhoneDigits(parsedPhone.digits);
    setReadyNow(existing.readyNow);
    setReadinessDate(existing.readinessDate ? existing.readinessDate.slice(0, 10) : "");
    setDescription(existing.description ?? "");
    setPaymentTerms(existing.paymentTerms ?? "");
    setTypicalLoadTons(existing.typicalLoadKg == null ? "" : String(existing.typicalLoadKg / 1000));
    setMedia(existing.media.map((item) => ({ fileId: item.fileId, kind: item.kind === "video" ? "video" : "photo" })));
    setPrefilled(true);
  }, [existing, prefilled]);

  if (user && !isCollector && (user.platformRoles?.length ?? 0) === 0) {
    return <AccessClosed title="Объявление" />;
  }
  if (listingId && state === "unauthenticated") {
    return <AuthRequired title="Объявление" />;
  }
  if (listingId && existing && !existing.isOwner) {
    return <ErrorState title="Объявление" message="Это объявление принадлежит другой компании." />;
  }

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

  function buildDto(): CreateListingDto {
    return {
      positions: positions.map((position) => ({
        nomenclatureId: position.nomenclatureId,
        weightKg: (Number(position.weightTons) || 0) * 1000,
        form: position.form,
        moisturePct: null,
        contaminationPct: null,
        moistureCondition: position.moistureCondition || null,
        contaminationCondition: position.contaminationCondition || null,
        packaging: serializePackaging(position.packaging),
      })),
      address: {
        country: "Россия",
        city: city.trim(),
        region: region.trim() || null,
        street: street.trim() || null,
        building: building.trim() || null,
        postcode: postcode.trim() || null,
      },
      contactPhone: formatPhoneFull(getPhoneCountry(phoneCountry), phoneDigits),
      description: description.trim() || null,
      packaging: aggregatePositionPackaging(positions),
      paymentTerms: paymentTerms.trim() || null,
      typicalLoadKg: typicalLoadTons.trim() === "" ? null : (Number(typicalLoadTons) || 0) * 1000,
      readyNow,
      readinessDate: readyNow ? null : readinessDate ? new Date(readinessDate).toISOString() : null,
      media,
    };
  }

  function clientValidationError(publish: boolean): string | null {
    if (!city.trim()) return "Выберите адрес отгрузки из подсказки Яндекса.";
    if (!formatPhoneFull(getPhoneCountry(phoneCountry), phoneDigits)) return "Укажите контактный телефон полностью.";
    for (const position of positions) {
      if (!position.nomenclatureId) return "Выберите вид сырья во всех позициях.";
      if (!(Number(position.weightTons) > 0)) return "Укажите вес во всех позициях.";
    }
    if (publish && totalWeightKg < LISTING_MIN_WEIGHT_KG) {
      return `Суммарный вес объявления — минимум ${formatWeight(LISTING_MIN_WEIGHT_KG)} для публикации.`;
    }
    return null;
  }

  async function save(publish: boolean) {
    const validationError = clientValidationError(publish);
    if (validationError) {
      setError(validationError);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const dto = buildDto();
      const saved = listingId ? await api.marketplace.update(listingId, dto) : await api.marketplace.create(dto);
      cleanupDraftUploadsRef.current = false;
      draftUploadFileIdsRef.current.clear();
      if (publish) {
        await api.marketplace.publish(saved.id);
      }
      router.push(`/marketplace/${saved.id}`);
    } catch (saveError) {
      setError(saveError instanceof ApiError ? saveError.message : "Не удалось сохранить объявление.");
      setSaving(false);
    }
  }

  return (
    <AppShell>
      <section
        className="page mp-listing-editor-page"
        aria-label={listingId ? "Редактирование объявления" : "Новое объявление"}
      >
        <Link className="mp-form-back" href="/marketplace/my">
          <ArrowLeft size={16} strokeWidth={2.2} aria-hidden="true" />К моим объявлениям
        </Link>

        <div className="mp-form">
          <div className="mp-form-lead-grid">
            <div className="mp-fieldset mp-fieldset-media">
              {sectionTitle(ImagePlus, "Фото и видео")}
              <MediaUploader
                media={media}
                onChange={setMedia}
                onUploaded={registerDraftUpload}
                onRemove={(fileId) => {
                  void cleanupDraftUpload(fileId);
                }}
              />
            </div>

            <div className="mp-fieldset">
              {sectionTitle(ClipboardList, "Позиции")}
              {positions.map((position, index) => {
                const category = selectedCategory(position);
                const positionOptions = nomenclature
                  .filter((option) => !category || option.category === category)
                  .map((option) => ({ value: option.id, label: option.name }));
                return (
                  <div className="mp-position-row" key={index}>
                    <div className="mp-position-header">
                      <span>Позиция {index + 1}</span>
                      <button
                        className="mp-icon-action"
                        type="button"
                        disabled={positions.length === 1}
                        onClick={() => setPositions((prev) => prev.filter((_, i) => i !== index))}
                        aria-label="Удалить позицию"
                        title="Удалить позицию"
                      >
                        <X size={16} strokeWidth={2.4} aria-hidden="true" />
                      </button>
                    </div>

                    <div className="mp-position-pickers">
                      <div className={fieldClass(category)}>
                        <label>Категория</label>
                        <FormSelect
                          icon={Layers}
                          label="Категория сырья"
                          value={category}
                          placeholder="Выберите категорию"
                          options={categoryOptions}
                          disabled={categoryOptions.length === 0}
                          onChange={(value) => changePositionCategory(index, value)}
                        />
                      </div>
                      <div className={fieldClass(position.nomenclatureId)}>
                        <label>Позиция</label>
                        <FormSelect
                          icon={Package}
                          label="Позиция сырья"
                          value={position.nomenclatureId}
                          placeholder={category ? "Выберите позицию" : "Сначала категория"}
                          options={positionOptions}
                          disabled={!category || positionOptions.length === 0}
                          onChange={(value) => updatePosition(index, { nomenclatureId: value })}
                        />
                      </div>
                    </div>

                    <div className="mp-position-details">
                      <div className={fieldClass(position.weightTons)}>
                        <label>
                          <Scale size={14} strokeWidth={2.1} aria-hidden="true" />
                          Вес, т
                        </label>
                        <div className={`mp-unit-input${position.weightTons ? " is-filled" : ""}`}>
                          <input
                            className="mp-input"
                            type="number"
                            min="0"
                            step="0.1"
                            value={position.weightTons}
                            onChange={(event) => updatePosition(index, { weightTons: event.target.value })}
                          />
                          <span aria-hidden="true">тонн</span>
                        </div>
                      </div>
                      <div className={fieldClass(position.form)}>
                        <label>
                          <PackageCheck size={14} strokeWidth={2.1} aria-hidden="true" />
                          Форма
                        </label>
                        <FormSelect
                          icon={CircleDot}
                          label="Форма сырья"
                          value={position.form}
                          options={[
                            { value: "loose", label: "Россыпь" },
                            { value: "pressed", label: "Тюки" },
                          ]}
                          onChange={(value) => updatePosition(index, { form: value as "pressed" | "loose" })}
                        />
                      </div>
                      <div className={fieldClass(position.moistureCondition)}>
                        <label>
                          <Droplets size={14} strokeWidth={2.1} aria-hidden="true" />
                          Влажность
                        </label>
                        <FormSelect
                          icon={Droplets}
                          label="Влажность сырья"
                          value={position.moistureCondition}
                          placeholder="Выберите влажность"
                          options={MOISTURE_OPTIONS}
                          onChange={(value) =>
                            updatePosition(index, { moistureCondition: value as ListingMoistureCondition })
                          }
                        />
                      </div>
                      <div className={fieldClass(position.contaminationCondition)}>
                        <label>
                          <Filter size={14} strokeWidth={2.1} aria-hidden="true" />
                          Иные включения
                        </label>
                        <FormSelect
                          icon={Filter}
                          label="Иные включения"
                          value={position.contaminationCondition}
                          placeholder="Выберите состояние"
                          options={CONTAMINATION_OPTIONS}
                          onChange={(value) =>
                            updatePosition(index, {
                              contaminationCondition: value as ListingContaminationCondition,
                            })
                          }
                        />
                      </div>
                      <div className={`${fieldClass(position.packaging.join(""))} mp-position-packaging`}>
                        <label>
                          <Layers size={14} strokeWidth={2.1} aria-hidden="true" />
                          Упаковка
                        </label>
                        <PackagingSelect
                          value={position.packaging}
                          onToggle={(option) => togglePositionPackaging(index, option)}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
              <button
                className="mp-add-row-button"
                type="button"
                onClick={() => setPositions((prev) => [...prev, emptyPosition()])}
              >
                <Package size={16} strokeWidth={2.2} aria-hidden="true" />
                Добавить позицию
              </button>
              <p className={`mp-hint mp-weight-hint${hasMinimumWeight ? " is-ok" : " is-warning"}`} aria-live="polite">
                {weightHintText}
              </p>
            </div>
          </div>

          <div className="mp-fieldset">
            {sectionTitle(MapPin, "Адрес отгрузки")}
            <div className={fieldClass(addressQuery)}>
              <label>Поиск адреса (Яндекс)</label>
              <div className="mp-address-search">
                <input
                  id={ADDRESS_SEARCH_ID}
                  className="mp-input"
                  placeholder="Начните вводить адрес и выберите вариант…"
                  autoComplete="off"
                  value={addressQuery}
                  aria-expanded={addressSuggestState === "open"}
                  aria-controls="mp-address-suggestions"
                  onChange={(event) => setAddressQuery(event.target.value)}
                  onFocus={() => {
                    if (addressSuggestions.length > 0) setAddressSuggestState("open");
                  }}
                  onBlur={() => {
                    window.setTimeout(() => {
                      setAddressSuggestState((prev) => (prev === "open" || prev === "empty" ? "idle" : prev));
                    }, 120);
                  }}
                />
                {addressSuggestState === "open" ? (
                  <div className="mp-address-suggestions" id="mp-address-suggestions" role="listbox">
                    {addressSuggestions.map((suggestion, index) => (
                      <button
                        type="button"
                        role="option"
                        key={`${suggestion.value}-${index}`}
                        onMouseDown={(event) => {
                          event.preventDefault();
                          applyAddressSuggestion(suggestion);
                        }}
                      >
                        {suggestion.value}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              {addressSuggestState === "loading" ? <p className="mp-hint">Ищем варианты…</p> : null}
              {addressSuggestState === "empty" ? (
                <p className="mp-hint">Варианты не найдены. Уточните адрес в строке поиска.</p>
              ) : null}
              {addressSuggestState === "failed" ? (
                <p className="mp-error">Подсказки временно недоступны. Попробуйте ещё раз чуть позже.</p>
              ) : null}
              {addressSuggestState === "idle" ? (
                <p className="mp-hint">Выберите подсказку — адрес сохранится в объявлении автоматически.</p>
              ) : null}
            </div>
            <div className={`mp-address-preview${city ? " is-filled" : ""}`}>
              <MapPin size={17} strokeWidth={2.1} aria-hidden="true" />
              <div>
                <span>{city ? [region, city].filter(Boolean).join(", ") : "Адрес пока не выбран"}</span>
                <p>
                  {city
                    ? [street, building, postcode].filter(Boolean).join(", ") || "Точный адрес сохранён из подсказки."
                    : "Начните вводить адрес и выберите подходящую подсказку Яндекса."}
                </p>
              </div>
            </div>
            <p className="mp-hint">Точный адрес скрыт от покупателей до принятия предложения.</p>
          </div>

          <div className="mp-fieldset">
            {sectionTitle(Truck, "Готовность и контакты")}
            <label className="mp-checkbox">
              <input type="checkbox" checked={readyNow} onChange={(event) => setReadyNow(event.target.checked)} />
              Готово к отгрузке сейчас
            </label>
            {!readyNow ? (
              <div className={fieldClass(readinessDate)}>
                <label>Дата готовности</label>
                <input
                  className="mp-input"
                  type="date"
                  value={readinessDate}
                  onChange={(event) => setReadinessDate(event.target.value)}
                />
              </div>
            ) : null}
            <div className={fieldClass(phoneDigits)}>
              <label>Контактный телефон *</label>
              <PhoneInput
                name="contactPhone"
                countryId={phoneCountry}
                digits={phoneDigits}
                onCountryChange={setPhoneCountry}
                onDigitsChange={setPhoneDigits}
              />
            </div>
          </div>

          <div className="mp-fieldset">
            {sectionTitle(FileText, "Дополнительно")}
            <div className={fieldClass(description)}>
              <label>
                <FileText size={14} strokeWidth={2.1} aria-hidden="true" />
                Описание
              </label>
              <textarea
                className="mp-input"
                rows={3}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>
            <div className="mp-grid-2">
              <div className={fieldClass(paymentTerms)}>
                <label>
                  <CreditCard size={14} strokeWidth={2.1} aria-hidden="true" />
                  Условия оплаты
                </label>
                <input
                  className="mp-input"
                  value={paymentTerms}
                  onChange={(event) => setPaymentTerms(event.target.value)}
                />
              </div>
              <div className={fieldClass(typicalLoadTons)}>
                <label>
                  <Truck size={14} strokeWidth={2.1} aria-hidden="true" />
                  Обычно гружу в машину, т
                </label>
                <input
                  className="mp-input"
                  type="number"
                  min="0"
                  step="0.1"
                  value={typicalLoadTons}
                  onChange={(event) => setTypicalLoadTons(event.target.value)}
                />
              </div>
            </div>
          </div>

          {error ? <p className="mp-error">{error}</p> : null}

          <div className="mp-form-actions">
            <button className="button secondary" type="button" disabled={saving} onClick={() => save(false)}>
              <FileText size={16} strokeWidth={2.2} aria-hidden="true" />
              Сохранить черновик
            </button>
            <button className="button" type="button" disabled={saving} onClick={() => save(true)}>
              <PackageCheck size={16} strokeWidth={2.2} aria-hidden="true" />
              Опубликовать
            </button>
          </div>
        </div>
      </section>
    </AppShell>
  );
}

function FormSelect({
  icon: Icon,
  label,
  value,
  placeholder = "Выберите",
  options,
  disabled = false,
  onChange,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  placeholder?: string;
  options: SelectOption[];
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  const [activeIndex, setActiveIndex] = useState(selectedIndex);
  const rootRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const selected = options.find((option) => option.value === value);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  useEffect(() => {
    if (open) setActiveIndex(selectedIndex);
  }, [open, selectedIndex]);

  function choose(index: number) {
    const option = options[index];
    if (!option) return;
    onChange(option.value);
    setOpen(false);
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return;
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        if (!open) setOpen(true);
        else setActiveIndex((index) => Math.min(options.length - 1, index + 1));
        break;
      case "ArrowUp":
        event.preventDefault();
        if (!open) setOpen(true);
        else setActiveIndex((index) => Math.max(0, index - 1));
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        if (open) choose(activeIndex);
        else setOpen(true);
        break;
      case "Escape":
        setOpen(false);
        break;
      case "Home":
        if (open) {
          event.preventDefault();
          setActiveIndex(0);
        }
        break;
      case "End":
        if (open) {
          event.preventDefault();
          setActiveIndex(options.length - 1);
        }
        break;
      case "Tab":
        setOpen(false);
        break;
      default:
        break;
    }
  }

  return (
    <div className={`mp-form-select${open ? " is-open" : ""}${disabled ? " is-disabled" : ""}`} ref={rootRef}>
      <button
        className="mp-form-select-trigger"
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-label={label}
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
        onKeyDown={onKeyDown}
      >
        <Icon className="mp-form-select-leading" size={17} strokeWidth={2.1} aria-hidden="true" />
        <span className={selected ? "" : "mp-form-select-placeholder"}>{selected?.label ?? placeholder}</span>
        <ChevronDown className="mp-form-select-chevron" size={18} strokeWidth={2} aria-hidden="true" />
      </button>
      {open ? (
        <ul className="mp-form-select-list" role="listbox" id={listboxId} aria-label={label}>
          {options.map((option, index) => {
            const isSelected = option.value === value;
            const isActive = index === activeIndex;
            return (
              <li
                key={option.value}
                role="option"
                aria-selected={isSelected}
                className={`mp-form-select-option${isActive ? " is-active" : ""}${isSelected ? " is-selected" : ""}`}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => choose(index)}
              >
                <span>{option.label}</span>
                {isSelected ? <Check size={16} strokeWidth={2.6} aria-hidden="true" /> : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

function PackagingSelect({ value, onToggle }: { value: string[]; onToggle: (option: string) => void }) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const label = value.join(", ") || NO_PACKAGING;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function toggle(index: number) {
    const option = PACKAGING_OPTIONS[index];
    if (!option) return;
    onToggle(option);
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        if (!open) setOpen(true);
        else setActiveIndex((index) => Math.min(PACKAGING_OPTIONS.length - 1, index + 1));
        break;
      case "ArrowUp":
        event.preventDefault();
        if (!open) setOpen(true);
        else setActiveIndex((index) => Math.max(0, index - 1));
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        if (open) toggle(activeIndex);
        else setOpen(true);
        break;
      case "Escape":
        setOpen(false);
        break;
      case "Tab":
        setOpen(false);
        break;
      default:
        break;
    }
  }

  return (
    <div className={`mp-form-select${open ? " is-open" : ""}`} ref={rootRef}>
      <button
        className="mp-form-select-trigger"
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-label="Упаковка"
        onClick={() => setOpen((prev) => !prev)}
        onKeyDown={onKeyDown}
      >
        <Layers className="mp-form-select-leading" size={17} strokeWidth={2.1} aria-hidden="true" />
        <span>{label}</span>
        <ChevronDown className="mp-form-select-chevron" size={18} strokeWidth={2} aria-hidden="true" />
      </button>
      {open ? (
        <ul className="mp-form-select-list" role="listbox" id={listboxId} aria-label="Упаковка" aria-multiselectable>
          {PACKAGING_OPTIONS.map((option, index) => {
            const isSelected = value.includes(option);
            const isActive = index === activeIndex;
            return (
              <li
                key={option}
                role="option"
                aria-selected={isSelected}
                className={`mp-form-select-option${isActive ? " is-active" : ""}${isSelected ? " is-selected" : ""}`}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => toggle(index)}
              >
                <span>{option}</span>
                {isSelected ? <Check size={16} strokeWidth={2.6} aria-hidden="true" /> : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

function MediaUploader({
  media,
  onChange,
  onUploaded,
  onRemove,
}: {
  media: MediaItem[];
  onChange: (media: MediaItem[]) => void;
  onUploaded?: (fileId: string) => void;
  onRemove?: (fileId: string) => void;
}) {
  const { token } = useAuth();
  const assets = useFileAssetsByIds(media.map((item) => item.fileId));
  const [uploadProgress, setUploadProgress] = useState<MediaUploadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const photoItems = media.filter((item) => item.kind === "photo");
  const videoItems = media.filter((item) => item.kind === "video");
  const photos = photoItems.length;
  const videos = videoItems.length;
  const uploading = uploadProgress !== null;
  const uploadPercent = Math.round((uploadProgress?.fraction ?? 0) * 100);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function mergeMedia(nextPhotos: MediaItem[], nextVideos = videoItems): MediaItem[] {
    return [...nextPhotos, ...nextVideos];
  }

  function removeMediaItem(fileId: string) {
    onRemove?.(fileId);
    onChange(media.filter((item) => item.fileId !== fileId));
  }

  function handlePhotoDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = photoItems.findIndex((item) => item.fileId === String(active.id));
    const to = photoItems.findIndex((item) => item.fileId === String(over.id));
    if (from === -1 || to === -1) return;
    onChange(mergeMedia(arrayMove(photoItems, from, to)));
  }

  async function addFiles(fileList: FileList | null, kind: "photo" | "video") {
    if (!fileList || !token) return;
    const remainingSlots = kind === "photo" ? LISTING_MAX_PHOTOS - photos : LISTING_MAX_VIDEOS - videos;
    const files = Array.from(fileList).slice(0, Math.max(0, remainingSlots));
    if (files.length === 0) return;

    setError(null);
    try {
      const next = [...media];
      for (const [index, file] of files.entries()) {
        const currentPhotos = next.filter((item) => item.kind === "photo").length;
        const currentVideos = next.filter((item) => item.kind === "video").length;
        if (kind === "photo" && currentPhotos >= LISTING_MAX_PHOTOS) break;
        if (kind === "video" && currentVideos >= LISTING_MAX_VIDEOS) break;
        setUploadProgress({ fileName: file.name, fraction: 0, index: index + 1, total: files.length, kind });
        const asset = await apiUploadFileWithProgress(file, {
          token,
          accessLevel: "public",
          onProgress: (fraction) => {
            setUploadProgress({ fileName: file.name, fraction, index: index + 1, total: files.length, kind });
          },
        });
        onUploaded?.(asset.id);
        next.push({ fileId: asset.id, kind });
      }
      onChange(
        mergeMedia(
          next.filter((item) => item.kind === "photo"),
          next.filter((item) => item.kind === "video"),
        ),
      );
    } catch (uploadError) {
      setError(uploadError instanceof ApiError ? uploadError.message : "Не удалось загрузить файл.");
    } finally {
      setUploadProgress(null);
    }
  }

  return (
    <div>
      <div className="mp-media">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handlePhotoDragEnd}>
          <SortableContext items={photoItems.map((item) => item.fileId)} strategy={rectSortingStrategy}>
            <div className="mp-media-photos">
              {photoItems.map((item, index) => (
                <SortableMediaTile
                  key={item.fileId}
                  item={item}
                  index={index}
                  url={preferredFileAssetImageUrl(assets.get(item.fileId))}
                  onRemove={() => removeMediaItem(item.fileId)}
                />
              ))}
              {photos < LISTING_MAX_PHOTOS ? (
                <label className={`mp-media-add${uploading ? " is-disabled" : ""}${photos === 0 ? " is-primary" : ""}`}>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    hidden
                    disabled={uploading}
                    onChange={(event) => addFiles(event.target.files, "photo")}
                  />
                  <ImagePlus size={20} strokeWidth={2.1} aria-hidden="true" />
                  <span>Фото</span>
                </label>
              ) : null}
            </div>
          </SortableContext>
        </DndContext>
        <div className="mp-media-videos">
          {videoItems.map((item) => {
            const url = preferredFileAssetMediaUrl(assets.get(item.fileId));
            return (
              <div className="mp-media-tile mp-video-tile" key={item.fileId}>
                {url ? <video src={url} muted preload="metadata" /> : <div className="mp-media-empty">Видео</div>}
                <button
                  className="mp-media-remove"
                  type="button"
                  aria-label="Удалить видео"
                  onClick={() => removeMediaItem(item.fileId)}
                >
                  <X size={14} />
                </button>
              </div>
            );
          })}
          {videos < LISTING_MAX_VIDEOS ? (
            <label className={`mp-media-add mp-media-add-video${uploading ? " is-disabled" : ""}`}>
              <input
                type="file"
                accept="video/*"
                hidden
                disabled={uploading}
                onChange={(event) => addFiles(event.target.files, "video")}
              />
              <Video size={20} strokeWidth={2.1} aria-hidden="true" />
              <span>Видео</span>
            </label>
          ) : null}
        </div>
        {uploadProgress ? (
          <div className="mp-media-progress" role="status" aria-live="polite">
            <div className="mp-media-progress-head">
              <Upload size={18} className="mp-media-progress-spin" />
              <span className="mp-media-progress-name">{uploadProgress.fileName}</span>
              <span className="mp-media-progress-percent">
                {uploadPercent >= 100 ? "Сохраняем…" : `${uploadPercent}%`}
              </span>
            </div>
            <div className="mp-media-progress-track">
              <div
                className={`mp-media-progress-fill${uploadPercent >= 100 ? " is-indeterminate" : ""}`}
                style={{ width: `${uploadPercent}%` }}
              />
            </div>
            <small>
              {uploadProgress.kind === "photo" ? "Фото" : "Видео"} {uploadProgress.index}/{uploadProgress.total}
            </small>
          </div>
        ) : null}
      </div>
      <p className="mp-hint">
        Фото: {photos}/{LISTING_MAX_PHOTOS} (минимум {LISTING_MIN_PHOTOS} для публикации). Видео: {videos}/
        {LISTING_MAX_VIDEOS}.
      </p>
      {error ? <p className="mp-error">{error}</p> : null}
    </div>
  );
}
