"use client";

import { useEffect, useState } from "react";
import { Eye, EyeOff, Send, Trash2 } from "lucide-react";
import type { ForumAdminAnswerItem } from "@ecoplatform/shared";
import { api, errorText } from "../../../lib/api";
import { relativeTime } from "../../forum/forum-helpers";

// Разворачиваемый блок ответов вопроса для модерации: список ответов (вкл.
// скрытые) + действия hide/restore/delete и засев ответа от лица команды.
export function ForumQuestionAnswers({
  questionId,
  canModerate,
  onAfterChange,
}: {
  questionId: string;
  canModerate: boolean;
  onAfterChange: () => void;
}) {
  const [answers, setAnswers] = useState<ForumAdminAnswerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [seedBody, setSeedBody] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const detail = await api.admin.forum.question(questionId);
      setAnswers(detail.answers);
    } catch (err) {
      setError(errorText(err, "Не удалось загрузить ответы."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questionId]);

  async function moderateAnswer(action: "hide" | "restore" | "delete", answerId: string) {
    if (action === "delete" && !window.confirm("Удалить ответ?")) return;
    if (action === "hide" && !window.confirm("Скрыть ответ из публичного форума?")) return;
    setBusy(true);
    try {
      if (action === "delete") {
        await api.admin.forum.deleteAnswer(answerId);
      } else {
        await api.admin.forum.moderateAnswer(answerId, action);
      }
      await load();
      onAfterChange();
    } catch (err) {
      setError(errorText(err, "Не удалось выполнить действие."));
    } finally {
      setBusy(false);
    }
  }

  async function seedAnswer() {
    if (!seedBody.trim()) return;
    setBusy(true);
    try {
      await api.admin.forum.seedAnswer(questionId, seedBody.trim());
      setSeedBody("");
      await load();
      onAfterChange();
    } catch (err) {
      setError(errorText(err, "Не удалось добавить ответ."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="forum-answers-panel">
      {loading ? (
        <p className="auser-muted">Загрузка ответов…</p>
      ) : (
        <>
          {error ? <p className="forum-answers-error">{error}</p> : null}
          {answers.length === 0 ? (
            <p className="auser-muted">Ответов пока нет.</p>
          ) : (
            <ul className="forum-answers-list">
              {answers.map((answer) => (
                <li className={`forum-answer-mod${answer.hidden ? " is-hidden" : ""}`} key={answer.id}>
                  <div className="forum-answer-mod-body">
                    <p>{answer.body}</p>
                    <small>
                      {answer.authorName}
                      {answer.isAccepted ? " · ✓ принят" : ""}
                      {answer.hidden ? " · скрыт" : ""} · {relativeTime(answer.createdAt)}
                    </small>
                  </div>
                  {canModerate ? (
                    <div className="forum-answer-actions">
                      {answer.hidden ? (
                        <button
                          className="forum-text-button"
                          disabled={busy}
                          onClick={() => moderateAnswer("restore", answer.id)}
                          type="button"
                        >
                          <Eye size={15} /> Восстановить
                        </button>
                      ) : (
                        <button
                          className="forum-text-button"
                          disabled={busy}
                          onClick={() => moderateAnswer("hide", answer.id)}
                          type="button"
                        >
                          <EyeOff size={15} /> Скрыть
                        </button>
                      )}
                      <button
                        className="forum-text-button is-danger"
                        disabled={busy}
                        onClick={() => moderateAnswer("delete", answer.id)}
                        type="button"
                      >
                        <Trash2 size={15} /> Удалить
                      </button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}

          {canModerate ? (
            <div className="forum-seed-answer">
              <textarea
                className="textarea small"
                value={seedBody}
                onChange={(event) => setSeedBody(event.target.value)}
                placeholder="Ответ от лица команды…"
                rows={2}
              />
              <button
                className="button secondary"
                disabled={busy || !seedBody.trim()}
                onClick={seedAnswer}
                type="button"
              >
                <Send size={15} /> Ответить
              </button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
