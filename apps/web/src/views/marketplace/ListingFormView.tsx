"use client";

// Тонкая страница создания/редактирования объявления: собирает контроллер
// useListingForm и раскладывает секции. Состояние/валидация/сохранение — в
// use-listing-form.ts и listing-form.helpers.ts; поля и секции — в listing-form-*.tsx.

import Link from "next/link";
import { ArrowLeft, FileText, PackageCheck } from "lucide-react";
import { AppShell } from "../../components/AppShell";
import { AccessClosed, AuthRequired, ErrorState } from "../shared";
import {
  AddressSection,
  ContactsSection,
  ExtraSection,
  MediaSection,
  PositionsSection,
} from "./listing-form-sections";
import { useListingForm } from "./use-listing-form";

export function ListingFormView({ listingId }: { listingId?: string }) {
  const form = useListingForm(listingId);
  const { user, isCollector, existing, state } = form;

  if (user && !isCollector && (user.platformRoles?.length ?? 0) === 0) {
    return <AccessClosed title="Объявление" />;
  }
  if (listingId && state === "unauthenticated") {
    return <AuthRequired title="Объявление" />;
  }
  if (listingId && existing && !existing.isOwner) {
    return <ErrorState title="Объявление" message="Это объявление принадлежит другой компании." />;
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
            <MediaSection form={form} />
            <PositionsSection form={form} />
          </div>

          <AddressSection form={form} />
          <ContactsSection form={form} />
          <ExtraSection form={form} />

          {form.error ? <p className="mp-error">{form.error}</p> : null}

          <div className="mp-form-actions">
            <button className="button secondary" type="button" disabled={form.saving} onClick={() => form.save(false)}>
              <FileText size={16} strokeWidth={2.2} aria-hidden="true" />
              Сохранить черновик
            </button>
            <button className="button" type="button" disabled={form.saving} onClick={() => form.save(true)}>
              <PackageCheck size={16} strokeWidth={2.2} aria-hidden="true" />
              Опубликовать
            </button>
          </div>
        </div>
      </section>
    </AppShell>
  );
}
