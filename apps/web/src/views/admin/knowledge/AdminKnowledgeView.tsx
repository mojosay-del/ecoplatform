"use client";

// Экран CMS «База знаний»: слева дерево категорий и материалов, справа —
// редактор выбранной записи. Состояние и операции живут в useAdminKnowledge,
// чтобы сам view оставался тонким page-level контейнером.

import { AppShell } from "../../../components/AppShell";
import { EMPTY_MATERIAL_DRAFT } from "./constants";
import { KnowledgeDetailForm } from "./detail-form";
import { KnowledgeEmptyDetail } from "./empty-detail";
import { KnowledgeTreePanel } from "./tree-panel";
import { useAdminKnowledge } from "./use-admin-knowledge";

export function AdminKnowledgeView() {
  const knowledge = useAdminKnowledge();
  const {
    activeCategoryTitle,
    autosaveEnabled,
    categories,
    categoryCreateOpen,
    createCategory,
    draft,
    expanded,
    hasActiveDraft,
    hasChanges,
    isEditingNew,
    knowledgeAutosave,
    materialsByCategory,
    message,
    original,
    publishToggle,
    remove,
    reorderMaterials,
    sensors,
    setCategoryCreateOpen,
    setDraft,
    startEdit,
    startNewMaterial,
    state,
    submit,
    submitting,
    toggleExpand,
    uncategorizedMaterials,
  } = knowledge;

  if (state === "unauthenticated") {
    return (
      <AppShell>
        <section className="page">
          <h1 className="page-title">CMS / База знаний</h1>
          <p className="page-subtitle">Войдите как администратор или контент-менеджер.</p>
        </section>
      </AppShell>
    );
  }

  if (state === "forbidden") {
    return (
      <AppShell>
        <section className="page">
          <h1 className="page-title">CMS / База знаний</h1>
          <p className="page-subtitle">Раздел доступен админу и контент-менеджеру.</p>
        </section>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <section className="page">
        <header className="page-header">
          <h1 className="page-title">База знаний</h1>
          <p className="page-subtitle">
            Категории и материалы базы знаний. Новые материалы добавляются внутри категории.
          </p>
        </header>
        {message ? <p className="cms-flash">{message}</p> : null}

        <div className="moderation-layout cms-vertical-layout">
          <KnowledgeTreePanel
            categories={categories}
            categoryCreateOpen={categoryCreateOpen}
            draftId={draft.id}
            expanded={expanded}
            materialsByCategory={materialsByCategory}
            sensors={sensors}
            uncategorizedMaterials={uncategorizedMaterials}
            onAddMaterial={startNewMaterial}
            onCloseCategoryCreate={() => setCategoryCreateOpen(false)}
            onCreateCategory={createCategory}
            onReorderMaterials={(categoryId, event) => void reorderMaterials(categoryId, event)}
            onSelect={startEdit}
            onToggleCategoryCreate={() => setCategoryCreateOpen((value) => !value)}
            onToggleExpand={toggleExpand}
          />

          <div className="moderation-detail">
            {hasActiveDraft ? (
              <KnowledgeDetailForm
                draft={draft}
                original={original}
                hasChanges={hasChanges}
                autosaveEnabled={autosaveEnabled}
                submitting={submitting}
                isEditingNew={isEditingNew}
                activeCategoryTitle={activeCategoryTitle}
                autosave={knowledgeAutosave}
                setDraft={setDraft}
                onSubmit={(event) => void submit(event)}
                onCancel={() => setDraft(EMPTY_MATERIAL_DRAFT)}
                onAddMaterial={(categoryId) => startNewMaterial(categoryId)}
                onRemove={(article) => void remove(article)}
                onPublishToggle={(article) => void publishToggle(article)}
              />
            ) : (
              <KnowledgeEmptyDetail categoriesCount={categories.length} />
            )}
          </div>
        </div>
      </section>
    </AppShell>
  );
}
