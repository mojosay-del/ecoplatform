"use client";

// Форма создания/редактирования объявления: позиции (сырьё/вес в тоннах/форма/
// влажность/засор), адрес с подсказками Яндекса, телефон (как в регистрации),
// упаковка (мультивыбор), объём в машину и медиа. Сохранение — черновик;
// «Опубликовать» сохраняет и публикует (бэк проверит 4–10 фото, ≥100 кг).

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import type { CreateListingDto, MarketplaceListingDetail } from "@ecoplatform/shared";
import { LISTING_MAX_PHOTOS, LISTING_MAX_VIDEOS, LISTING_MIN_PHOTOS } from "@ecoplatform/shared";
import { AppShell } from "../../components/AppShell";
import { PHONE_COUNTRIES } from "../../components/auth/constants";
import { PhoneInput } from "../../components/auth/phone-input";
import type { PhoneCountryId } from "../../components/auth/types";
import { formatPhoneFull, getPhoneCountry, normalizePhoneDigits } from "../../components/auth/utils";
import {
  ApiError,
  api,
  apiUploadFileWithProgress,
  preferredFileAssetImageUrl,
  preferredFileAssetMediaUrl,
} from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { useFileAssetsByIds } from "../../lib/use-cover-assets";
import { AccessClosed, AuthRequired, ErrorState, PageHeader, useApiQuery } from "../shared";
import { useNomenclatureOptions } from "./listing-ui";
import { loadYmaps, YANDEX_KEY, type YmapsGeoResult } from "./yandex-loader";

const PACKAGING_OPTIONS = ["Без упаковки", "Палет", "Проложки", "Обмотка"] as const;
const NO_PACKAGING = "Без упаковки";
const ADDRESS_SEARCH_ID = "mp-address-search";

type PositionForm = {
  nomenclatureId: string;
  weightTons: string;
  form: "pressed" | "loose";
  moisturePct: string;
  contaminationPct: string;
};

type MediaItem = { fileId: string; kind: "photo" | "video" };

function emptyPosition(): PositionForm {
  return { nomenclatureId: "", weightTons: "", form: "loose", moisturePct: "", contaminationPct: "" };
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
  const [packaging, setPackaging] = useState<string[]>([NO_PACKAGING]);
  const [paymentTerms, setPaymentTerms] = useState("");
  const [typicalLoadTons, setTypicalLoadTons] = useState("");
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [prefilled, setPrefilled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addressSearchRef = useRef<HTMLInputElement>(null);

  // Подсказки адреса Яндекса. На выборе варианта геокодим его и раскладываем
  // по структурным полям (город/регион/улица/дом/индекс) — чтобы не было разнобоя.
  useEffect(() => {
    if (!YANDEX_KEY) return;
    let view: { destroy: () => void } | null = null;
    let cancelled = false;
    loadYmaps()
      .then(() => {
        const ymaps = window.ymaps;
        if (cancelled || !ymaps || !addressSearchRef.current) return;
        ymaps.ready(() => {
          if (cancelled || !addressSearchRef.current) return;
          const suggest = new ymaps.SuggestView(ADDRESS_SEARCH_ID, { results: 6 });
          view = suggest;
          suggest.events.add("select", (event) => {
            const item = event.get("item") as { value?: string } | undefined;
            if (item?.value) void fillFromAddress(item.value);
          });
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      view?.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fillFromAddress(value: string) {
    const ymaps = window.ymaps;
    if (!ymaps) return;
    try {
      const result: YmapsGeoResult = await ymaps.geocode(value, { results: 1 });
      const object = result.geoObjects.get(0);
      if (!object) return;
      setRegion(object.getAdministrativeAreas()[0] ?? "");
      setCity(object.getLocalities()[0] ?? object.getAdministrativeAreas()[0] ?? "");
      setStreet(object.getThoroughfare() ?? "");
      setBuilding(object.getPremiseNumber() ?? "");
      const postal = object.properties.get("metaDataProperty.GeocoderMetaData.Address.postal_code", "");
      setPostcode(typeof postal === "string" ? postal : "");
    } catch {
      // геокодер недоступен — оставляем ручной ввод полей ниже
    }
  }

  // Префилл при редактировании — один раз, когда подгрузилось объявление.
  useEffect(() => {
    if (!existing || prefilled) return;
    setPositions(
      existing.positions.length > 0
        ? existing.positions.map((position) => ({
            nomenclatureId: position.nomenclatureId,
            weightTons: String(position.weightKg / 1000),
            form: position.form,
            moisturePct: position.moisturePct == null ? "" : String(position.moisturePct),
            contaminationPct: position.contaminationPct == null ? "" : String(position.contaminationPct),
          }))
        : [emptyPosition()],
    );
    setCity(existing.address?.city ?? existing.city ?? "");
    setRegion(existing.address?.region ?? existing.region ?? "");
    setStreet(existing.address?.street ?? "");
    setBuilding(existing.address?.building ?? "");
    setPostcode(existing.address?.postcode ?? "");
    const parsedPhone = parsePhone(existing.contactPhone ?? "");
    setPhoneCountry(parsedPhone.countryId);
    setPhoneDigits(parsedPhone.digits);
    setReadyNow(existing.readyNow);
    setReadinessDate(existing.readinessDate ? existing.readinessDate.slice(0, 10) : "");
    setDescription(existing.description ?? "");
    setPackaging(parsePackaging(existing.packaging));
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

  function togglePackaging(option: string) {
    setPackaging((prev) => {
      if (option === NO_PACKAGING) return [NO_PACKAGING];
      const withoutNone = prev.filter((value) => value !== NO_PACKAGING);
      const next = withoutNone.includes(option)
        ? withoutNone.filter((value) => value !== option)
        : [...withoutNone, option];
      return next.length > 0 ? next : [NO_PACKAGING];
    });
  }

  function buildDto(): CreateListingDto {
    return {
      positions: positions.map((position) => ({
        nomenclatureId: position.nomenclatureId,
        weightKg: (Number(position.weightTons) || 0) * 1000,
        form: position.form,
        moisturePct: position.moisturePct.trim() === "" ? null : Number(position.moisturePct),
        contaminationPct: position.contaminationPct.trim() === "" ? null : Number(position.contaminationPct),
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
      packaging: packaging.join(", ") || null,
      paymentTerms: paymentTerms.trim() || null,
      typicalLoadKg: typicalLoadTons.trim() === "" ? null : (Number(typicalLoadTons) || 0) * 1000,
      readyNow,
      readinessDate: readyNow ? null : readinessDate ? new Date(readinessDate).toISOString() : null,
      media,
    };
  }

  function clientValidationError(): string | null {
    if (!city.trim()) return "Укажите город.";
    if (!formatPhoneFull(getPhoneCountry(phoneCountry), phoneDigits)) return "Укажите контактный телефон полностью.";
    for (const position of positions) {
      if (!position.nomenclatureId) return "Выберите вид сырья во всех позициях.";
      if (!(Number(position.weightTons) > 0)) return "Укажите вес во всех позициях.";
    }
    return null;
  }

  async function save(publish: boolean) {
    const validationError = clientValidationError();
    if (validationError) {
      setError(validationError);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const dto = buildDto();
      const saved = listingId ? await api.marketplace.update(listingId, dto) : await api.marketplace.create(dto);
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
      <section className="page">
        <Link className="button ghost" href="/marketplace/my" style={{ marginBottom: 16, alignSelf: "flex-start" }}>
          ← К моим объявлениям
        </Link>
        <PageHeader
          title={listingId ? "Редактирование объявления" : "Новое объявление"}
          subtitle="Опишите сырьё, укажите адрес отгрузки и контакты. Точный адрес и телефон видят только после принятия предложения."
        />

        <div className="mp-form">
          <div className="mp-fieldset">
            <h2>Позиции</h2>
            {positions.map((position, index) => (
              <div className="mp-position-row" key={index} style={{ gridTemplateColumns: "1fr" }}>
                <div className="mp-field">
                  <label>Вид сырья</label>
                  <select
                    className="mp-select"
                    value={position.nomenclatureId}
                    onChange={(event) => updatePosition(index, { nomenclatureId: event.target.value })}
                  >
                    <option value="">— выберите —</option>
                    {nomenclature.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.name} ({option.category})
                      </option>
                    ))}
                  </select>
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
                  <div className="mp-field" style={{ flex: "1 1 110px" }}>
                    <label>Вес, т</label>
                    <input
                      className="mp-input"
                      type="number"
                      min="0"
                      step="0.1"
                      value={position.weightTons}
                      onChange={(event) => updatePosition(index, { weightTons: event.target.value })}
                    />
                  </div>
                  <div className="mp-field" style={{ flex: "1 1 110px" }}>
                    <label>Форма</label>
                    <select
                      className="mp-select"
                      value={position.form}
                      onChange={(event) => updatePosition(index, { form: event.target.value as "pressed" | "loose" })}
                    >
                      <option value="loose">Россыпь</option>
                      <option value="pressed">Тюки</option>
                    </select>
                  </div>
                  <div className="mp-field" style={{ flex: "1 1 100px" }}>
                    <label>Влажность, %</label>
                    <input
                      className="mp-input"
                      type="number"
                      min="0"
                      max="100"
                      value={position.moisturePct}
                      onChange={(event) => updatePosition(index, { moisturePct: event.target.value })}
                    />
                  </div>
                  <div className="mp-field" style={{ flex: "1 1 100px" }}>
                    <label>Засор, %</label>
                    <input
                      className="mp-input"
                      type="number"
                      min="0"
                      max="100"
                      value={position.contaminationPct}
                      onChange={(event) => updatePosition(index, { contaminationPct: event.target.value })}
                    />
                  </div>
                  <button
                    className="button secondary"
                    type="button"
                    disabled={positions.length === 1}
                    onClick={() => setPositions((prev) => prev.filter((_, i) => i !== index))}
                  >
                    Удалить
                  </button>
                </div>
              </div>
            ))}
            <button
              className="button secondary"
              type="button"
              onClick={() => setPositions((prev) => [...prev, emptyPosition()])}
            >
              + позиция
            </button>
          </div>

          <div className="mp-fieldset">
            <h2>Фото и видео</h2>
            <MediaUploader media={media} onChange={setMedia} />
          </div>

          <div className="mp-fieldset">
            <h2>Адрес отгрузки</h2>
            {YANDEX_KEY ? (
              <div className="mp-field">
                <label>Поиск адреса (Яндекс)</label>
                <input
                  ref={addressSearchRef}
                  id={ADDRESS_SEARCH_ID}
                  className="mp-input"
                  placeholder="Начните вводить адрес и выберите вариант…"
                  autoComplete="off"
                />
                <p className="mp-hint">
                  Выберите подсказку — поля ниже заполнятся автоматически. Можно править вручную.
                </p>
              </div>
            ) : null}
            <div className="mp-grid-2">
              <div className="mp-field">
                <label>Город *</label>
                <input className="mp-input" value={city} onChange={(event) => setCity(event.target.value)} />
              </div>
              <div className="mp-field">
                <label>Регион</label>
                <input className="mp-input" value={region} onChange={(event) => setRegion(event.target.value)} />
              </div>
              <div className="mp-field">
                <label>Улица</label>
                <input className="mp-input" value={street} onChange={(event) => setStreet(event.target.value)} />
              </div>
              <div className="mp-field">
                <label>Дом</label>
                <input className="mp-input" value={building} onChange={(event) => setBuilding(event.target.value)} />
              </div>
              <div className="mp-field">
                <label>Индекс</label>
                <input className="mp-input" value={postcode} onChange={(event) => setPostcode(event.target.value)} />
              </div>
            </div>
            <p className="mp-hint">Точный адрес скрыт от покупателей до принятия предложения.</p>
          </div>

          <div className="mp-fieldset">
            <h2>Готовность и контакты</h2>
            <label className="mp-checkbox">
              <input type="checkbox" checked={readyNow} onChange={(event) => setReadyNow(event.target.checked)} />
              Готово к отгрузке сейчас
            </label>
            {!readyNow ? (
              <div className="mp-field">
                <label>Дата готовности</label>
                <input
                  className="mp-input"
                  type="date"
                  value={readinessDate}
                  onChange={(event) => setReadinessDate(event.target.value)}
                />
              </div>
            ) : null}
            <div className="mp-field">
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
            <h2>Дополнительно</h2>
            <div className="mp-field">
              <label>Описание</label>
              <textarea
                className="mp-input"
                rows={3}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>
            <div className="mp-grid-2">
              <div className="mp-field">
                <label>Условия оплаты</label>
                <input
                  className="mp-input"
                  value={paymentTerms}
                  onChange={(event) => setPaymentTerms(event.target.value)}
                />
              </div>
              <div className="mp-field">
                <label>Обычно гружу в машину, т</label>
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
            <div className="mp-field">
              <label>Упаковка</label>
              <div className="mp-checkbox-row">
                {PACKAGING_OPTIONS.map((option) => (
                  <label key={option} className="mp-chip-check">
                    <input
                      type="checkbox"
                      checked={packaging.includes(option)}
                      onChange={() => togglePackaging(option)}
                    />
                    {option}
                  </label>
                ))}
              </div>
            </div>
          </div>

          {error ? <p className="mp-error">{error}</p> : null}

          <div className="mp-form-actions">
            <button className="button secondary" type="button" disabled={saving} onClick={() => save(false)}>
              Сохранить черновик
            </button>
            <button className="button" type="button" disabled={saving} onClick={() => save(true)}>
              Опубликовать
            </button>
          </div>
        </div>
      </section>
    </AppShell>
  );
}

function MediaUploader({ media, onChange }: { media: MediaItem[]; onChange: (media: MediaItem[]) => void }) {
  const { token } = useAuth();
  const assets = useFileAssetsByIds(media.map((item) => item.fileId));
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const photos = media.filter((item) => item.kind === "photo").length;
  const videos = media.filter((item) => item.kind === "video").length;

  async function addFiles(fileList: FileList | null, kind: "photo" | "video") {
    if (!fileList || !token) return;
    setError(null);
    setUploading(true);
    try {
      const next = [...media];
      for (const file of Array.from(fileList)) {
        const currentPhotos = next.filter((item) => item.kind === "photo").length;
        const currentVideos = next.filter((item) => item.kind === "video").length;
        if (kind === "photo" && currentPhotos >= LISTING_MAX_PHOTOS) break;
        if (kind === "video" && currentVideos >= LISTING_MAX_VIDEOS) break;
        const asset = await apiUploadFileWithProgress(file, { token, accessLevel: "public" });
        next.push({ fileId: asset.id, kind });
      }
      onChange(next);
    } catch (uploadError) {
      setError(uploadError instanceof ApiError ? uploadError.message : "Не удалось загрузить файл.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <div className="mp-media">
        {media.map((item) => {
          const asset = assets.get(item.fileId);
          const url = item.kind === "video" ? preferredFileAssetMediaUrl(asset) : preferredFileAssetImageUrl(asset);
          return (
            <div className="mp-media-tile" key={item.fileId}>
              {item.kind === "video" ? url ? <video src={url} muted /> : null : url ? <img src={url} alt="" /> : null}
              <button
                className="mp-media-remove"
                type="button"
                aria-label="Удалить"
                onClick={() => onChange(media.filter((other) => other.fileId !== item.fileId))}
              >
                <X size={14} />
              </button>
            </div>
          );
        })}
        {photos < LISTING_MAX_PHOTOS ? (
          <label className="mp-media-add">
            <input
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(event) => addFiles(event.target.files, "photo")}
            />
            <span>+ фото</span>
          </label>
        ) : null}
        {videos < LISTING_MAX_VIDEOS ? (
          <label className="mp-media-add">
            <input type="file" accept="video/*" hidden onChange={(event) => addFiles(event.target.files, "video")} />
            <span>+ видео</span>
          </label>
        ) : null}
      </div>
      <p className="mp-hint">
        Фото: {photos}/{LISTING_MAX_PHOTOS} (минимум {LISTING_MIN_PHOTOS} для публикации). Видео: {videos}/
        {LISTING_MAX_VIDEOS}.
      </p>
      {uploading ? <p className="mp-hint">Загрузка файла…</p> : null}
      {error ? <p className="mp-error">{error}</p> : null}
    </div>
  );
}
