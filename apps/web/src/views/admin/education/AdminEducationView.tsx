"use client";

// Экран CMS «Обучение»: слева дерево модулей/глав/уроков, справа редактор
// выбранного узла. Этот файл держит auth, загрузку и общий API-mutator.

import { useCallback, useState } from "react";
import type { PaginatedResponse } from "@ecoplatform/shared";
import { AppShell } from "../../../components/AppShell";
import { StatusPill } from "../../../components/StatusPill";
import { apiFetch } from "../../../lib/api";
import { queryKeys } from "../../../lib/query/keys";
import { useApiQuery } from "../../shared";
import { DetailPanel } from "./detail-panel";
import { EducationTree } from "./tree";
import type { EducationMutation, LearningModule, Selection } from "./types";

export function AdminEducationView() {
  const [selection, setSelection] = useState<Selection>({ kind: "none" });
  const [message, setMessage] = useState<string | null>(null);
  const {
    data: modules,
    state,
    errorMessage,
    refetch,
  } = useApiQuery<LearningModule[]>(
    queryKeys.admin.education(),
    async () => (await apiFetch<PaginatedResponse<LearningModule>>("/admin/content/education?limit=200")).items,
    [],
  );

  const mutate = useCallback<EducationMutation>(
    async (path, method, body) => {
      setMessage(null);
      try {
        await apiFetch(path, { method, body });
        await refetch();
        return true;
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Ошибка сохранения.");
        return false;
      }
    },
    [refetch],
  );

  if (state === "unauthenticated") {
    return (
      <AppShell>
        <section className="page">
          <h1 className="page-title">CMS / Обучение</h1>
          <p className="page-subtitle">Войдите как администратор или контент-менеджер.</p>
        </section>
      </AppShell>
    );
  }

  if (state === "forbidden") {
    return (
      <AppShell>
        <section className="page">
          <h1 className="page-title">CMS / Обучение</h1>
          <p className="page-subtitle">Раздел доступен админу и контент-менеджеру.</p>
        </section>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <section className="page">
        <header className="page-header">
          <h1 className="page-title">Обучение</h1>
          <p className="page-subtitle">Терминал управления обучающего сектора.</p>
        </header>
        {message ?? errorMessage ? (
          <StatusPill as="p" variant="danger">
            {message ?? errorMessage}
          </StatusPill>
        ) : null}

        <div className="moderation-layout cms-vertical-layout">
          <div className="education-tree">
            <EducationTree modules={modules} selection={selection} onSelect={setSelection} onMutate={mutate} />
          </div>
          <div className="moderation-detail">
            <DetailPanel selection={selection} modules={modules} onSelect={setSelection} onMutate={mutate} />
          </div>
        </div>
      </section>
    </AppShell>
  );
}
