"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { ApiError } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { AuthShell } from "./auth-shell";
import { AuthField, EmailInput, PasswordInput } from "./fields";
import { normalizeEmailValue } from "./utils";

export function LoginForm() {
  const router = useRouter();
  const { login } = useAuth();
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSubmitting(true);
    setError("");
    try {
      await login(
        normalizeEmailValue(String(form.get("email"))),
        String(form.get("password")),
        form.get("rememberMe") === "on",
      );
      router.push("/news");
    } catch (err) {
      setError(err instanceof ApiError && err.message ? err.message : "Не удалось войти. Проверьте email и пароль.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell mode="login">
      <form className="ui-card form" onSubmit={onSubmit}>
        <header className="ui-card-head">
          <h1 className="ui-card-title">Войти в аккаунт</h1>
          <p className="ui-card-sub">
            Нет аккаунта? <Link href="/register">Создать аккаунт</Link>
          </p>
        </header>

        <AuthField label="Email">
          <EmailInput name="email" autoComplete="email" />
        </AuthField>

        <AuthField label="Пароль">
          <PasswordInput name="password" autoComplete="current-password" />
        </AuthField>

        <div className="form-row">
          <label className="form-check">
            <input className="form-check-input" type="checkbox" name="rememberMe" defaultChecked />
            <span className="form-check-box" aria-hidden="true" />
            <span>Запомнить меня</span>
          </label>
          <Link className="form-row-link" href="/forgot-password">
            Забыли пароль?
          </Link>
        </div>

        {error ? <p className="form-error">{error}</p> : null}

        <button className="button form-submit" type="submit" disabled={submitting}>
          {submitting ? (
            <>
              <span className="form-btn-spinner" aria-hidden="true" />
              Входим…
            </>
          ) : (
            "Войти"
          )}
        </button>

        <p className="form-secure-note">
          <ShieldCheck size={14} strokeWidth={2} aria-hidden="true" />
          Соединение защищено
        </p>
      </form>
    </AuthShell>
  );
}
