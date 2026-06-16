"use client";

// Экран CMS «Индексы цен»: слева единый плоский список номенклатуры (без
// категорий), справа — редактор выбранной позиции. Этот файл держит состояние и
// загрузку данных; под-компоненты вынесены в соседние модули этой папки:
//   NomenclatureRow.tsx — строка номенклатуры в списке
//   create-forms.tsx    — инлайн-форма создания номенклатуры
//   PriceIndexCard.tsx  — правая панель номенклатуры и истории цен
//   format.ts / types.ts — форматтеры и доменные типы

import { useEffect, useMemo, useState } from "react";
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { FolderOpen, Plus } from "lucide-react";
import type { PaginatedResponse } from "@ecoplatform/shared";
import { AppShell } from "../../../components/AppShell";
import { apiFetch } from "../../../lib/api";
import { useAuth } from "../../../lib/auth";
import { formatPriceValuesCount } from "./format";
import { SortableNomenclatureRow } from "./NomenclatureRow";
import { NomenclatureCreateForm } from "./create-forms";
import { PriceIndexCard } from "./PriceIndexCard";
import type { MutateFn, Nomenclature, Selection } from "./types";

export function AdminIndicesView() {
  const { token } = useAuth();
  const [nomenclatures, setNomenclatures] = useState<Nomenclature[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection>({ kind: "none" });
  const [createOpen, setCreateOpen] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  useEffect(() => {
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function loadAll() {
    if (!token) return;
    try {
      const data = await apiFetch<PaginatedResponse<Nomenclature>>("/admin/content/indices?limit=200", { token });
      setNomenclatures(data.items);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось загрузить индексы");
    }
  }

  const mutate: MutateFn = async (path, method, body) => {
    if (!token) {
      setMessage("Войдите как администратор или контент-менеджер.");
      return false;
    }
    try {
      await apiFetch(path, { method, token, body });
      await loadAll();
      setMessage(null);
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Ошибка сохранения.");
      return false;
    }
  };

  const activeNomenclature = useMemo(() => {
    if (selection.kind !== "nomenclature") return null;
    return nomenclatures.find((item) => item.id === selection.id) ?? null;
  }, [selection, nomenclatures]);

  async function deleteNomenclature(nomenclature: Nomenclature) {
    const valuesCount = nomenclature.priceIndex?.values.length ?? 0;
    const indexWarning = nomenclature.priceIndex
      ? `\n\nБудет удалён связанный индекс и ${formatPriceValuesCount(valuesCount)}.`
      : "";
    const okToDelete = confirm(
      `Удалить номенклатуру «${nomenclature.name}» полностью?${indexWarning}\n\nЭто действие нельзя отменить.`,
    );
    if (!okToDelete) return;

    const ok = await mutate(`/admin/content/indices/nomenclature/${nomenclature.id}`, "DELETE");
    if (ok && selection.kind === "nomenclature" && selection.id === nomenclature.id) {
      setSelection({ kind: "none" });
    }
  }

  async function reorderNomenclatures(event: DragEndEvent) {
    if (!token) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const from = nomenclatures.findIndex((item) => item.id === String(active.id));
    const to = nomenclatures.findIndex((item) => item.id === String(over.id));
    if (from === -1 || to === -1) return;

    const ordered = arrayMove(nomenclatures, from, to);
    setNomenclatures(ordered.map((nomenclature, position) => ({ ...nomenclature, position })));

    try {
      await apiFetch(`/admin/content/indices/nomenclature/${active.id}/move`, {
        method: "PATCH",
        token,
        body: { position: to },
      });
      await loadAll();
      setMessage("Порядок номенклатур сохранён.");
    } catch (error) {
      await loadAll();
      setMessage(
        error instanceof Error
          ? `Не удалось сохранить порядок номенклатур: ${error.message}. Список обновлён с сервера.`
          : "Не удалось сохранить порядок номенклатур. Список обновлён с сервера.",
      );
    }
  }

  return (
    <AppShell>
      <section className="page">
        <header className="page-header">
          <h1 className="page-title">Индексы цен</h1>
          <p className="page-subtitle">
            Номенклатура и история цен. Выберите позицию слева — справа откроется индекс.
          </p>
        </header>
        {message ? <p className="cms-flash">{message}</p> : null}

        <div className="moderation-layout cms-vertical-layout">
          <div className="education-tree">
            <div className="education-tree-header">
              <span className="education-tree-title">Номенклатура</span>
              <button
                className="education-tree-add"
                type="button"
                onClick={() => setCreateOpen(true)}
                title="Новая номенклатура"
                aria-label="Новая номенклатура"
              >
                <Plus size={14} />
              </button>
            </div>
            {createOpen ? (
              <NomenclatureCreateForm onMutate={mutate} onClose={() => setCreateOpen(false)} />
            ) : null}
            {nomenclatures.length === 0 ? <p className="education-tree-empty">Номенклатуры пока нет.</p> : null}
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(event) => void reorderNomenclatures(event)}>
              <SortableContext items={nomenclatures.map((item) => item.id)} strategy={verticalListSortingStrategy}>
                <ul className="tree" role="tree">
                  {nomenclatures.map((nomenclature) => (
                    <SortableNomenclatureRow
                      key={nomenclature.id}
                      nomenclature={nomenclature}
                      active={selection.kind === "nomenclature" && selection.id === nomenclature.id}
                      onSelect={() => setSelection({ kind: "nomenclature", id: nomenclature.id })}
                    />
                  ))}
                </ul>
              </SortableContext>
            </DndContext>
          </div>

          <div className="moderation-detail">
            {activeNomenclature ? (
              <PriceIndexCard
                key={activeNomenclature.id}
                nomenclature={activeNomenclature}
                onMutate={mutate}
                onDeleteNomenclature={deleteNomenclature}
              />
            ) : (
              <div className="indices-empty-detail">
                <FolderOpen size={28} />
                <h2>Выберите номенклатуру слева</h2>
                <p>Откройте позицию для редактирования и ведения истории цен.</p>
              </div>
            )}
          </div>
        </div>
      </section>
    </AppShell>
  );
}
