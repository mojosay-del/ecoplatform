"use client";

// Форма создания/редактирования объявления: позиции (сырьё/вес/форма/влажность/
// засор), адрес, контактный телефон, готовность, медиа (фото/видео). Сохранение —
// черновик; «Опубликовать» сохраняет и публикует (бэк проверит 4–10 фото, ≥100 кг).

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { CreateListingDto, MarketplaceListingDetail } from "@ecoplatform/shared";
import { LISTING_MAX_PHOTOS, LISTING_MAX_VIDEOS, LISTING_MIN_PHOTOS } from "@ecoplatform/shared";
import { AppShell } from "../../components/AppShell";
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

type PositionForm = {
  nomenclatureId: string;
  weightKg: string;
  form: "pressed" | "loose";
  moisturePct: string;
  contaminationPct: string;
};

type MediaItem = { fileId: string; kind: "photo" | "video" };

function emptyPosition(): PositionForm {
  return { nomenclatureId: "", weightKg: "", form: "loose", moisturePct: "", contaminationPct: "" };
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
  const [contactPhone, setContactPhone] = useState("");
  const [readyNow, setReadyNow] = useState(true);
  const [readinessDate, setReadinessDate] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState("");
  const [packaging, setPackaging] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [prefilled, setPrefilled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Префилл при редактировании — один раз, когда подгрузилось объявление.
  useEffect(() => {
    if (!existing || prefilled) return;
    setPositions(
      existing.positions.length > 0
        ? existing.positions.map((position) => ({
            nomenclatureId: position.nomenclatureId,
            weightKg: String(position.weightKg),
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
    setContactPhone(existing.contactPhone ?? "");
    setReadyNow(existing.readyNow);
    setReadinessDate(existing.readinessDate ? existing.readinessDate.slice(0, 10) : "");
    setDescription(existing.description ?? "");
    setColor(existing.color ?? "");
    setPackaging(existing.packaging ?? "");
    setPaymentTerms(existing.paymentTerms ?? "");
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

  function buildDto(): CreateListingDto {
    return {
      positions: positions.map((position) => ({
        nomenclatureId: position.nomenclatureId,
        weightKg: Number(position.weightKg) || 0,
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
      contactPhone: contactPhone.trim(),
      description: description.trim() || null,
      color: color.trim() || null,
      packaging: packaging.trim() || null,
      paymentTerms: paymentTerms.trim() || null,
      readyNow,
      readinessDate: readyNow ? null : readinessDate ? new Date(readinessDate).toISOString() : null,
      media,
    };
  }

  function clientValidationError(): string | null {
    if (!city.trim()) return "Укажите город.";
    if (!contactPhone.trim()) return "Укажите контактный телефон.";
    for (const position of positions) {
      if (!position.nomenclatureId) return "Выберите вид сырья во всех позициях.";
      if (!(Number(position.weightKg) > 0)) return "Укажите вес во всех позициях.";
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
                    <label>Вес, кг</label>
                    <input
                      className="mp-input"
                      type="number"
                      min="0"
                      value={position.weightKg}
                      onChange={(event) => updatePosition(index, { weightKg: event.target.value })}
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
            <button className="button secondary" type="button" onClick={() => setPositions((prev) => [...prev, emptyPosition()])}>
              + позиция
            </button>
          </div>

          <div className="mp-fieldset">
            <h2>Фото и видео</h2>
            <MediaUploader media={media} onChange={setMedia} />
          </div>

          <div className="mp-fieldset">
            <h2>Адрес отгрузки</h2>
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
              <input
                className="mp-input"
                value={contactPhone}
                placeholder="+7 999 123-45-67"
                onChange={(event) => setContactPhone(event.target.value)}
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
                <label>Цвет / сорт</label>
                <input className="mp-input" value={color} onChange={(event) => setColor(event.target.value)} />
              </div>
              <div className="mp-field">
                <label>Упаковка</label>
                <input className="mp-input" value={packaging} onChange={(event) => setPackaging(event.target.value)} />
              </div>
              <div className="mp-field">
                <label>Условия оплаты</label>
                <input className="mp-input" value={paymentTerms} onChange={(event) => setPaymentTerms(event.target.value)} />
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
              {item.kind === "video" ? (
                url ? <video src={url} muted /> : null
              ) : url ? (
                <img src={url} alt="" />
              ) : null}
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
            <input type="file" accept="image/*" multiple hidden onChange={(event) => addFiles(event.target.files, "photo")} />
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
        Фото: {photos}/{LISTING_MAX_PHOTOS} (минимум {LISTING_MIN_PHOTOS} для публикации). Видео: {videos}/{LISTING_MAX_VIDEOS}.
      </p>
      {uploading ? <p className="mp-hint">Загрузка файла…</p> : null}
      {error ? <p className="mp-error">{error}</p> : null}
    </div>
  );
}
