"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { ShieldCheck, User } from "lucide-react";
import { MIN_PASSWORD_LENGTH, type CompanyInvitationInfo, type LegalDocumentSummary } from "@ecoplatform/shared";
import { ApiError, api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { AuthShell } from "./auth-shell";
import { ConsentRow } from "./consent-row";
import { DEFAULT_PHONE_COUNTRY } from "./constants";
import { AuthField, FieldAffix, PasswordInput } from "./fields";
import { PhoneInput } from "./phone-input";
import { areRequiredDocsAccepted, getRequiredLegalDocs } from "./register-form.helpers";
import type { PhoneCountryId } from "./types";
import { formatPhoneFull, getPhoneCountry } from "./utils";

export function InviteAcceptForm({ token }: { token: string }) {
  const router = useRouter();
  const { login } = useAuth();
  const [info, setInfo] = useState<CompanyInvitationInfo | null>(null);
  const [infoError, setInfoError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phoneCountryId, setPhoneCountryId] = useState<PhoneCountryId>(DEFAULT_PHONE_COUNTRY.id as PhoneCountryId);
  const [phoneDigits, setPhoneDigits] = useState("");
  const [password, setPassword] = useState("");
  const [legalDocs, setLegalDocs] = useState<LegalDocumentSummary[]>([]);
  const [legalLoadError, setLegalLoadError] = useState(false);
  const [acceptedIds, setAcceptedIds] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    api.companyMembers
      .invitationInfo(token)
      .then((data) => {
        if (!cancelled) setInfo(data);
      })
      .catch((err) => {
        if (!cancelled) setInfoError(err instanceof ApiError ? err.message : "Приглашение недействительно.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    api.legal
      .list()
      .then((docs) => {
        if (!cancelled) setLegalDocs(docs);
      })
      .catch(() => {
        if (!cancelled) setLegalLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const requiredDocs = getRequiredLegalDocs(legalDocs);

  function toggleAccepted(id: string) {
    setAcceptedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!info) return;
    setError("");
    const phone = formatPhoneFull(getPhoneCountry(phoneCountryId), phoneDigits);
    if (!firstName.trim() || !lastName.trim()) {
      setError("Укажите имя и фамилию.");
      return;
    }
    if (!phone) {
      setError("Укажите телефон полностью в международном формате.");
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Пароль должен быть не короче ${MIN_PASSWORD_LENGTH} символов.`);
      return;
    }
    if (!areRequiredDocsAccepted(requiredDocs, acceptedIds)) {
      setError("Подтвердите обязательные документы.");
      return;
    }

    setSubmitting(true);
    try {
      await api.companyMembers.accept(token, {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone,
        password,
        acceptedDocumentIds: Array.from(acceptedIds),
      });
      // Аккаунт создан — сразу входим теми же кредами и открываем платформу.
      await login(info.email, password, true);
      router.push("/news");
    } catch (err) {
      setError(err instanceof ApiError && err.message ? err.message : "Не удалось принять приглашение.");
      setSubmitting(false);
    }
  }

  if (infoError) {
    return (
      <AuthShell mode="register">
        <div className="ui-card form">
          <header className="ui-card-head">
            <h1 className="ui-card-title">Приглашение недействительно</h1>
            <p className="ui-card-sub">{infoError}</p>
          </header>
          <Link className="button form-submit" href="/login">
            На страницу входа
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell mode="register">
      <form className="ui-card form" onSubmit={onSubmit}>
        <header className="ui-card-head">
          <h1 className="ui-card-title">Присоединиться к компании</h1>
          <p className="ui-card-sub">
            {loading || !info ? "Загружаем приглашение…" : `Вас пригласили в «${info.companyName}». Создайте аккаунт.`}
          </p>
        </header>

        {info ? (
          <>
            <AuthField label="Email">
              <input className="input" value={info.email} disabled readOnly />
            </AuthField>

            <div className="form-grid-2">
              <AuthField label="Фамилия">
                <FieldAffix icon={User}>
                  <input
                    className="input form-input-leading"
                    name="lastName"
                    value={lastName}
                    onChange={(event) => setLastName(event.currentTarget.value)}
                    required
                  />
                </FieldAffix>
              </AuthField>
              <AuthField label="Имя">
                <FieldAffix icon={User}>
                  <input
                    className="input form-input-leading"
                    name="firstName"
                    value={firstName}
                    onChange={(event) => setFirstName(event.currentTarget.value)}
                    required
                  />
                </FieldAffix>
              </AuthField>
            </div>

            <AuthField label="Телефон">
              <PhoneInput
                name="phone"
                countryId={phoneCountryId}
                digits={phoneDigits}
                onCountryChange={setPhoneCountryId}
                onDigitsChange={setPhoneDigits}
              />
            </AuthField>

            <AuthField label="Пароль">
              <PasswordInput
                name="password"
                autoComplete="new-password"
                minLength={MIN_PASSWORD_LENGTH}
                value={password}
                onValueChange={setPassword}
              />
            </AuthField>

            {requiredDocs.length > 0 ? (
              <fieldset className="form-section">
                <legend className="form-section-title">Согласия</legend>
                {legalLoadError ? (
                  <p className="form-error">Не удалось загрузить документы. Обновите страницу.</p>
                ) : (
                  <div className="consent-list">
                    {requiredDocs.map((doc) => (
                      <ConsentRow
                        key={doc.id}
                        document={doc}
                        checked={acceptedIds.has(doc.id)}
                        onChange={() => toggleAccepted(doc.id)}
                        required
                      />
                    ))}
                  </div>
                )}
              </fieldset>
            ) : null}

            {error ? <p className="form-error">{error}</p> : null}

            <button className="button form-submit" type="submit" disabled={submitting}>
              {submitting ? (
                <>
                  <span className="form-btn-spinner" aria-hidden="true" />
                  Создаём аккаунт…
                </>
              ) : (
                "Принять приглашение"
              )}
            </button>

            <p className="form-secure-note">
              <ShieldCheck size={14} strokeWidth={2} aria-hidden="true" />
              Соединение защищено
            </p>
          </>
        ) : null}
      </form>
    </AuthShell>
  );
}
