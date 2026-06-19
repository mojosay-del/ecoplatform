"use client";
import "../../styles/forum.css";

// Новый вопрос: заголовок (required) + подробности + два обязательных
// фильтра-справочника. Валидация required на клиенте (и на сервере). После
// публикации — переход на карточку созданного вопроса.

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Lock, Search } from "lucide-react";
import type { ForumTaxonomy } from "@ecoplatform/shared";
import { AppShell } from "../../components/AppShell";
import { SendActionIcon } from "../../components/app-shell/nav-icons";
import { api } from "../../lib/api";
import { ApiError } from "../../lib/api";
import { invalidateQueryFamilies, queryKeys } from "../../lib/query";
import { AccessClosed, AuthRequired, ErrorState, useApiQuery } from "../shared";

const EMPTY_TAXONOMY: ForumTaxonomy = { rawMaterials: [], questionTypes: [] };

export function ForumAskView() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const taxonomy = useApiQuery(queryKeys.forum.taxonomy(), () => api.forum.taxonomy(), EMPTY_TAXONOMY);

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [rawMaterialId, setRawMaterialId] = useState("");
  const [questionTypeId, setQuestionTypeId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (taxonomy.state === "unauthenticated") return <AuthRequired title="Форум" />;
  if (taxonomy.state === "forbidden") return <AccessClosed title="Форум" />;
  if (taxonomy.state === "error") return <ErrorState title="Форум" message={taxonomy.errorMessage} />;

  const submit = async () => {
    if (!title.trim()) {
      setError("Добавьте заголовок вопроса.");
      return;
    }
    if (!rawMaterialId || !questionTypeId) {
      setError("Выберите вид сырья и тип вопроса.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const created = await api.forum.ask({ title: title.trim(), body: body.trim(), rawMaterialId, questionTypeId });
      await invalidateQueryFamilies(queryClient, ["forum"]);
      router.push(`/forum/q/${created.id}`);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Не удалось опубликовать вопрос.");
      setSubmitting(false);
    }
  };

  return (
    <AppShell>
      <section className="page forum-page">
        <div className="forum-form">
          <Link href="/forum" className="forum-back">
            <ArrowLeft size={16} /> К форуму
          </Link>
          <h1 className="forum-title">Новый вопрос</h1>

          <div className="forum-hint">
            <Search size={20} />
            <span>
              Сначала поищите — возможно, на ваш вопрос уже есть решённый ответ.{" "}
              <Link href="/forum" style={{ textDecoration: "underline" }}>
                Открыть поиск
              </Link>
            </span>
          </div>

          {error ? <div className="forum-flash is-error">{error}</div> : null}

          <div className="forum-fgroup">
            <label htmlFor="ask-title">Заголовок</label>
            <p className="desc">Сформулируйте суть одним предложением — так его найдут другие</p>
            <input
              id="ask-title"
              className="input"
              value={title}
              maxLength={180}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Например: нужна ли лицензия для перевозки стеклобоя?"
            />
          </div>

          <div className="forum-fgroup">
            <label htmlFor="ask-body">Подробности</label>
            <p className="desc">Что уже пробовали, какой регион, какие объёмы — чем конкретнее, тем точнее ответ</p>
            <textarea
              id="ask-body"
              className="textarea"
              rows={6}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder="Опишите ситуацию"
            />
          </div>

          <div className="forum-fgroup">
            <div className="forum-two">
              <div className="forum-fgroup">
                <label htmlFor="ask-mat">
                  Вид сырья <span className="forum-req">обязательно</span>
                </label>
                <select
                  id="ask-mat"
                  className="select"
                  value={rawMaterialId}
                  onChange={(event) => setRawMaterialId(event.target.value)}
                >
                  <option value="">Выберите вид сырья</option>
                  {taxonomy.data.rawMaterials.map((value) => (
                    <option key={value.id} value={value.id}>
                      {value.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="forum-fgroup">
                <label htmlFor="ask-type">
                  Тип вопроса <span className="forum-req">обязательно</span>
                </label>
                <select
                  id="ask-type"
                  className="select"
                  value={questionTypeId}
                  onChange={(event) => setQuestionTypeId(event.target.value)}
                >
                  <option value="">Выберите тип</option>
                  {taxonomy.data.questionTypes.map((value) => (
                    <option key={value.id} value={value.id}>
                      {value.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <p className="forum-filters__note">
              <Lock size={14} /> Других тегов нет — две оси держат форум в порядке и легко ищутся
            </p>
          </div>

          <div className="forum-form-actions">
            <button type="button" className="button" onClick={submit} disabled={submitting}>
              <SendActionIcon size={18} /> Опубликовать вопрос
            </button>
            <Link href="/forum" className="button secondary">
              Отмена
            </Link>
          </div>
        </div>
      </section>
    </AppShell>
  );
}
