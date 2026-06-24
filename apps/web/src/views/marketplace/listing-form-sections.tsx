"use client";

// Секции формы объявления (медиа, позиции, адрес, готовность/контакты,
// дополнительно). Чистая разметка поверх контроллера useListingForm — логики нет.

import {
  CircleDot,
  ClipboardList,
  CreditCard,
  Droplets,
  FileText,
  Filter,
  ImagePlus,
  Layers,
  MapPin,
  Package,
  PackageCheck,
  Scale,
  Truck,
  X,
} from "lucide-react";
import type { ListingContaminationCondition, ListingMoistureCondition } from "@ecoplatform/shared";
import { PhoneInput } from "../../components/auth/phone-input";
import { FormSelect, PackagingSelect, sectionTitle } from "./listing-form-fields";
import { MediaUploader } from "./listing-form-media";
import { ADDRESS_SEARCH_ID, CONTAMINATION_OPTIONS, MOISTURE_OPTIONS, fieldClass } from "./listing-form.helpers";
import type { ListingFormController } from "./use-listing-form";

export function MediaSection({ form }: { form: ListingFormController }) {
  return (
    <div className="mp-fieldset mp-fieldset-media">
      {sectionTitle(ImagePlus, "Фото и видео")}
      <MediaUploader
        media={form.media}
        onChange={form.setMedia}
        onUploaded={form.registerDraftUpload}
        onRemove={(fileId) => {
          void form.cleanupDraftUpload(fileId);
        }}
      />
    </div>
  );
}

export function PositionsSection({ form }: { form: ListingFormController }) {
  return (
    <div className="mp-fieldset">
      {sectionTitle(ClipboardList, "Позиции")}
      {form.positions.map((position, index) => {
        const category = form.selectedCategory(position);
        const options = form.positionOptions(position);
        return (
          <div className="mp-position-row" key={index}>
            <div className="mp-position-header">
              <span>Позиция {index + 1}</span>
              <button
                className="mp-icon-action"
                type="button"
                disabled={form.positions.length === 1}
                onClick={() => form.removePosition(index)}
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
                  options={form.categoryOptions}
                  disabled={form.categoryOptions.length === 0}
                  onChange={(value) => form.changePositionCategory(index, value)}
                />
              </div>
              <div className={fieldClass(position.nomenclatureId)}>
                <label>Позиция</label>
                <FormSelect
                  icon={Package}
                  label="Позиция сырья"
                  value={position.nomenclatureId}
                  placeholder={category ? "Выберите позицию" : "Сначала категория"}
                  options={options}
                  disabled={!category || options.length === 0}
                  onChange={(value) => form.updatePosition(index, { nomenclatureId: value })}
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
                    onChange={(event) => form.updatePosition(index, { weightTons: event.target.value })}
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
                  onChange={(value) => form.updatePosition(index, { form: value as "pressed" | "loose" })}
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
                    form.updatePosition(index, { moistureCondition: value as ListingMoistureCondition })
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
                    form.updatePosition(index, {
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
                  onToggle={(option) => form.togglePositionPackaging(index, option)}
                />
              </div>
            </div>
          </div>
        );
      })}
      <button className="mp-add-row-button" type="button" onClick={form.addPosition}>
        <Package size={16} strokeWidth={2.2} aria-hidden="true" />
        Добавить позицию
      </button>
      <p className={`mp-hint mp-weight-hint${form.hasMinimumWeight ? " is-ok" : " is-warning"}`} aria-live="polite">
        {form.weightHintText}
      </p>
    </div>
  );
}

export function AddressSection({ form }: { form: ListingFormController }) {
  return (
    <div className="mp-fieldset">
      {sectionTitle(MapPin, "Адрес отгрузки")}
      <div className={fieldClass(form.addressQuery)}>
        <label>Поиск адреса</label>
        <div className="mp-country-toggle" role="group" aria-label="Страна адреса">
          {(["RU", "BY"] as const).map((code) => (
            <button
              type="button"
              key={code}
              className={form.addressCountry === code ? "is-active" : ""}
              aria-pressed={form.addressCountry === code}
              onClick={() => form.setAddressCountry(code)}
            >
              {code === "RU" ? "Россия" : "Беларусь"}
            </button>
          ))}
        </div>
        <div className="mp-address-search">
          <input
            id={ADDRESS_SEARCH_ID}
            className="mp-input"
            placeholder="Начните вводить адрес и выберите вариант…"
            autoComplete="off"
            value={form.addressQuery}
            aria-expanded={form.addressSuggestState === "open"}
            aria-controls="mp-address-suggestions"
            onChange={(event) => form.setAddressQuery(event.target.value)}
            onFocus={() => {
              if (form.addressSuggestions.length > 0) form.setAddressSuggestState("open");
            }}
            onBlur={() => {
              window.setTimeout(() => {
                form.setAddressSuggestState((prev) => (prev === "open" || prev === "empty" ? "idle" : prev));
              }, 120);
            }}
          />
          {form.addressSuggestState === "open" ? (
            <div className="mp-address-suggestions" id="mp-address-suggestions" role="listbox">
              {form.addressSuggestions.map((suggestion, index) => (
                <button
                  type="button"
                  role="option"
                  key={`${suggestion.value}-${index}`}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    form.applyAddressSuggestion(suggestion);
                  }}
                >
                  {suggestion.value}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        {form.addressSuggestState === "loading" ? <p className="mp-hint">Ищем варианты…</p> : null}
        {form.addressSuggestState === "empty" ? (
          <p className="mp-hint">Варианты не найдены. Уточните адрес в строке поиска.</p>
        ) : null}
        {form.addressSuggestState === "failed" ? (
          <p className="mp-error">Подсказки временно недоступны. Попробуйте ещё раз чуть позже.</p>
        ) : null}
        {form.addressSuggestState === "idle" ? (
          <p className="mp-hint">Выберите подсказку — адрес сохранится в объявлении автоматически.</p>
        ) : null}
      </div>
      <div className={`mp-address-preview${form.city ? " is-filled" : ""}`}>
        <MapPin size={17} strokeWidth={2.1} aria-hidden="true" />
        <div>
          <span>{form.city ? [form.region, form.city].filter(Boolean).join(", ") : "Адрес пока не выбран"}</span>
          <p>
            {form.city
              ? [form.street, form.building, form.postcode].filter(Boolean).join(", ") ||
                "Точный адрес сохранён из подсказки."
              : "Начните вводить адрес и выберите подходящую подсказку Яндекса."}
          </p>
        </div>
      </div>
      <p className="mp-hint">Точный адрес скрыт от покупателей до принятия предложения.</p>
    </div>
  );
}

export function ContactsSection({ form }: { form: ListingFormController }) {
  return (
    <div className="mp-fieldset">
      {sectionTitle(Truck, "Готовность и контакты")}
      <label className="mp-checkbox">
        <input type="checkbox" checked={form.readyNow} onChange={(event) => form.setReadyNow(event.target.checked)} />
        Готово к отгрузке сейчас
      </label>
      {!form.readyNow ? (
        <div className={fieldClass(form.readinessDate)}>
          <label>Дата готовности</label>
          <input
            className="mp-input"
            type="date"
            value={form.readinessDate}
            onChange={(event) => form.setReadinessDate(event.target.value)}
          />
        </div>
      ) : null}
      <div className={fieldClass(form.phoneDigits)}>
        <label>Контактный телефон *</label>
        <PhoneInput
          name="contactPhone"
          countryId={form.phoneCountry}
          digits={form.phoneDigits}
          onCountryChange={form.setPhoneCountry}
          onDigitsChange={form.setPhoneDigits}
        />
      </div>
    </div>
  );
}

export function ExtraSection({ form }: { form: ListingFormController }) {
  return (
    <div className="mp-fieldset">
      {sectionTitle(FileText, "Дополнительно")}
      <div className={fieldClass(form.description)}>
        <label>
          <FileText size={14} strokeWidth={2.1} aria-hidden="true" />
          Описание
        </label>
        <textarea
          className="mp-input"
          rows={3}
          value={form.description}
          onChange={(event) => form.setDescription(event.target.value)}
        />
      </div>
      <div className="mp-grid-2">
        <div className={fieldClass(form.paymentTerms)}>
          <label>
            <CreditCard size={14} strokeWidth={2.1} aria-hidden="true" />
            Условия оплаты
          </label>
          <input
            className="mp-input"
            value={form.paymentTerms}
            onChange={(event) => form.setPaymentTerms(event.target.value)}
          />
        </div>
        <div className={fieldClass(form.typicalLoadTons)}>
          <label>
            <Truck size={14} strokeWidth={2.1} aria-hidden="true" />
            Обычно гружу в машину, т
          </label>
          <input
            className="mp-input"
            type="number"
            min="0"
            step="0.1"
            value={form.typicalLoadTons}
            onChange={(event) => form.setTypicalLoadTons(event.target.value)}
          />
        </div>
      </div>
    </div>
  );
}
