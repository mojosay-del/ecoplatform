"use client";

// Экран CMS «Обучение»: слева дерево модулей/глав/уроков, справа редактор
// выбранного узла. Этот файл держит auth, загрузку и общий API-mutator.

import { useCallback, useEffect, useState } from "react";
import type { PaginatedResponse } from "@ecoplatform/shared";
import { AppShell } from "../../../components/AppShell";
import { StatusPill } from "../../../components/StatusPill";
import { ApiError, apiFetch } from "../../../lib/api";
import { useAuth } from "../../../lib/auth";
import { DetailPanel } from "./detail-panel";
import { EducationTree } from "./tree";
import type { EducationMutation, LearningModule, Selection, ViewState } from "./types";

export function AdminEducationView() {
  const { token } = useAuth();
  const [state, setState] = useState<ViewState>("unauthenticated");
  const [modules, setModules] = useState<LearningModule[]>([]);
  const [selection, setSelection] = useState<Selection>({ kind: "none" });
  const [message, setMessage] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    if (!token) {
      setState("unauthenticated");
      return;
    }
    setState("loading");
    setMessage(null);
    try {
      const data = await apiFetch<PaginatedResponse<LearningModule>>("/admin/content/education?limit=200", { token });
      setModules(data.items);
      setState("ready");
    } catch (error) {
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        setState("forbidden");
        return;
      }
      setState("error");
      setMessage(error instanceof Error ? error.message : "Не удалось загрузить курсы");
    }
  }, [token]);

  const mutate = useCallback<EducationMutation>(
    async (path, method, body) => {
      if (!token) return false;
      setMessage(null);
      try {
        await apiFetch(path, { method, token, body });
        await loadAll();
        return true;
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Ошибка сохранения.");
        return false;
      }
    },
    [loadAll, token],
  );

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

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
        {message ? (
          <StatusPill as="p" variant="danger">
            {message}
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
