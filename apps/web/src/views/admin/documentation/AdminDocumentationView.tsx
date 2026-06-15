"use client";

// Экран CMS «Документация»: слева дерево разделов и документов, справа — редактор
// выбранной записи. Состояние и операции живут в useAdminDocumentation, чтобы
// сам view оставался тонким page-level контейнером.

import { AppShell } from "../../../components/AppShell";
import { EMPTY_DOCUMENT_DRAFT } from "./constants";
import { DocDetailForm } from "./detail-form";
import { DocEmptyDetail } from "./empty-detail";
import { DocTreePanel } from "./tree-panel";
import { useAdminDocumentation } from "./use-admin-documentation";

export function AdminDocumentationView() {
  const documentation = useAdminDocumentation();
  const {
    activeCategoryTitle,
    autosaveEnabled,
    categories,
    categoryCreateOpen,
    createCategory,
    docAutosave,
    documentsByCategory,
    draft,
    expanded,
    hasActiveDraft,
    hasChanges,
    isEditingNew,
    message,
    original,
    publishToggle,
    remove,
    reorderDocuments,
    sensors,
    setCategoryCreateOpen,
    setDraft,
    startEdit,
    startNewDocument,
    state,
    submit,
    submitting,
    toggleExpand,
    uncategorizedDocuments,
  } = documentation;

  if (state === "unauthenticated") {
    return (
      <AppShell>
        <section className="page">
          <h1 className="page-title">CMS / Документация</h1>
          <p className="page-subtitle">Войдите как администратор или контент-менеджер.</p>
        </section>
      </AppShell>
    );
  }

  if (state === "forbidden") {
    return (
      <AppShell>
        <section className="page">
          <h1 className="page-title">CMS / Документация</h1>
          <p className="page-subtitle">Раздел доступен админу и контент-менеджеру.</p>
        </section>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <section className="page">
        <header className="page-header">
          <h1 className="page-title">Документация</h1>
          <p className="page-subtitle">
            Разделы и документы базы документации. Новые документы добавляются внутри раздела.
          </p>
        </header>
        {message ? <p className="cms-flash">{message}</p> : null}

        <div className="moderation-layout cms-vertical-layout">
          <DocTreePanel
            categories={categories}
            categoryCreateOpen={categoryCreateOpen}
            documentsByCategory={documentsByCategory}
            draftId={draft.id}
            expanded={expanded}
            sensors={sensors}
            uncategorizedDocuments={uncategorizedDocuments}
            onAddDocument={startNewDocument}
            onCloseCategoryCreate={() => setCategoryCreateOpen(false)}
            onCreateCategory={createCategory}
            onReorderDocuments={(categoryId, event) => void reorderDocuments(categoryId, event)}
            onSelect={startEdit}
            onToggleCategoryCreate={() => setCategoryCreateOpen((value) => !value)}
            onToggleExpand={toggleExpand}
          />

          <div className="moderation-detail">
            {hasActiveDraft ? (
              <DocDetailForm
                draft={draft}
                original={original}
                hasChanges={hasChanges}
                autosaveEnabled={autosaveEnabled}
                submitting={submitting}
                isEditingNew={isEditingNew}
                activeCategoryTitle={activeCategoryTitle}
                autosave={docAutosave}
                setDraft={setDraft}
                onSubmit={(event) => void submit(event)}
                onCancel={() => setDraft(EMPTY_DOCUMENT_DRAFT)}
                onAddDocument={(categoryId) => startNewDocument(categoryId)}
                onRemove={(article) => void remove(article)}
                onPublishToggle={(article) => void publishToggle(article)}
              />
            ) : (
              <DocEmptyDetail categoriesCount={categories.length} />
            )}
          </div>
        </div>
      </section>
    </AppShell>
  );
}
