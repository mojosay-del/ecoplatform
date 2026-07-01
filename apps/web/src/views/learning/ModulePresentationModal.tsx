"use client";

// Модальная презентация модуля обучения: открывается с витрины «Обучение» по
// клику на карточку (вместо перехода на отдельную страницу). Переиспользует
// механику модалок кабинета (useAccountDialogBodyLock + классы оболочки) и общий
// контент-компонент ModulePresentationBody. Переход в урок — обычная навигация,
// модалка размонтируется при смене маршрута.

import { X } from "lucide-react";
import type { LearningModuleDetail } from "@ecoplatform/shared";
import { api, preferredFileAssetImageUrl } from "../../lib/api";
import { useCoverAssets } from "../../lib/use-cover-assets";
import { useApiQuery } from "../shared";
import { useAccountDialogBodyLock } from "../account/hooks";
import { ModulePresentationBody } from "./module-presentation";
import "./learning-modal.css";

export function ModulePresentationModal({ moduleId, onClose }: { moduleId: string; onClose: () => void }) {
  const { data, state } = useApiQuery<LearningModuleDetail | null>(
    `learning-module:${moduleId}:public`,
    () => api.learning.getModule(moduleId, { preview: false }),
    null,
  );
  const covers = useCoverAssets(data ? [data] : []);
  useAccountDialogBodyLock(true, onClose);

  const coverUrl = data ? preferredFileAssetImageUrl(data.coverImageId ? covers.get(data.coverImageId) : null) : null;

  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- клик по фону закрывает (мышиное удобство); клавиатурный паритет — Escape (useAccountDialogBodyLock) + кнопка закрытия
    <div
      aria-label="Презентация модуля обучения"
      aria-modal="true"
      className="account-password-modal-backdrop module-modal-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="dialog"
    >
      <section className="account-password-modal module-modal">
        <button
          aria-label="Закрыть презентацию модуля"
          className="account-password-modal-close module-modal-close"
          onClick={onClose}
          type="button"
        >
          <X aria-hidden="true" size={18} />
        </button>
        <div className="module-modal-body">
          {state === "loading" || !data ? (
            <p className="page-subtitle module-modal-loading">Загружаем модуль…</p>
          ) : (
            <ModulePresentationBody data={data} moduleId={moduleId} coverUrl={coverUrl} inModal />
          )}
        </div>
      </section>
    </div>
  );
}
