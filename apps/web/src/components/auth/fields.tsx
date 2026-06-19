"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { Lock, type LucideIcon, Mail } from "lucide-react";
import { PasswordCheckIcon, type AnimatedNavIconHandle } from "../app-shell/nav-icons";
import {
  ORGANIZATION_EMPTY_DELAY,
  ORGANIZATION_ERASE_DELAY,
  ORGANIZATION_HOLD_DELAY,
  ORGANIZATION_NAME_EXAMPLES,
  ORGANIZATION_TYPE_DELAY,
} from "./constants";
import { normalizeEmailValue, passwordStrength } from "./utils";

export function AuthField({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="form-field">
      <span className="form-field-label">{label}</span>
      {children}
      {hint ? <span className="form-field-hint">{hint}</span> : null}
    </label>
  );
}

export function FieldAffix({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <div className="form-field-affix">
      <Icon className="form-field-affix-icon" size={17} strokeWidth={2} aria-hidden="true" />
      {children}
    </div>
  );
}

export function EmailInput({
  name,
  autoComplete,
  value,
  onValueChange,
}: {
  name: string;
  autoComplete: "email" | "username";
  value?: string;
  onValueChange?: (value: string) => void;
}) {
  return (
    <div className="form-field-affix">
      <Mail className="form-field-affix-icon" size={17} strokeWidth={2} aria-hidden="true" />
      <input
        className="input form-input-leading"
        name={name}
        type="email"
        autoComplete={autoComplete}
        inputMode="email"
        autoCapitalize="none"
        spellCheck={false}
        placeholder="name@example.ru"
        required
        value={value}
        onChange={onValueChange ? (event) => onValueChange(event.currentTarget.value) : undefined}
        onBlur={(event) => {
          const normalized = normalizeEmailValue(event.currentTarget.value);
          event.currentTarget.value = normalized;
          onValueChange?.(normalized);
        }}
      />
    </div>
  );
}

export function OrganizationNameInput({
  value,
  onValueChange,
}: {
  value?: string;
  onValueChange?: (value: string) => void;
}) {
  const [placeholder, setPlaceholder] = useState("");
  const [exampleIndex, setExampleIndex] = useState(0);
  const [charIndex, setCharIndex] = useState(0);
  const [phase, setPhase] = useState<"typing" | "holding" | "erasing" | "paused">("typing");

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) {
      setPlaceholder(ORGANIZATION_NAME_EXAMPLES[0] ?? "");
      return;
    }

    const example = ORGANIZATION_NAME_EXAMPLES[exampleIndex] ?? "";
    const delay =
      phase === "holding"
        ? ORGANIZATION_HOLD_DELAY
        : phase === "paused"
          ? ORGANIZATION_EMPTY_DELAY
          : phase === "erasing"
            ? ORGANIZATION_ERASE_DELAY
            : ORGANIZATION_TYPE_DELAY;

    const id = window.setTimeout(() => {
      if (phase === "typing") {
        if (charIndex < example.length) {
          const nextCharIndex = charIndex + 1;
          setCharIndex(nextCharIndex);
          setPlaceholder(example.slice(0, nextCharIndex));
          return;
        }
        setPhase("holding");
        return;
      }

      if (phase === "holding") {
        setPhase("erasing");
        return;
      }

      if (phase === "erasing") {
        if (charIndex > 0) {
          const nextCharIndex = charIndex - 1;
          setCharIndex(nextCharIndex);
          setPlaceholder(example.slice(0, nextCharIndex));
          return;
        }
        setExampleIndex((prev) => (prev + 1) % ORGANIZATION_NAME_EXAMPLES.length);
        setPhase("paused");
        return;
      }

      setPhase("typing");
    }, delay);

    return () => window.clearTimeout(id);
  }, [charIndex, exampleIndex, phase]);

  return (
    <input
      className="input form-input-leading"
      name="organizationName"
      placeholder={placeholder}
      autoComplete="organization"
      required
      value={value}
      onChange={onValueChange ? (event) => onValueChange(event.currentTarget.value) : undefined}
    />
  );
}

export function PasswordInput({
  name,
  autoComplete,
  minLength,
  value,
  onValueChange,
}: {
  name: string;
  autoComplete: "current-password" | "new-password";
  minLength?: number;
  value?: string;
  onValueChange?: (value: string) => void;
}) {
  const [visible, setVisible] = useState(false);
  const iconRef = useRef<AnimatedNavIconHandle | null>(null);

  return (
    <div className="password-input-wrap form-field-affix">
      <Lock className="form-field-affix-icon" size={17} strokeWidth={2} aria-hidden="true" />
      <input
        className="input password-input form-input-leading"
        name={name}
        type={visible ? "text" : "password"}
        autoComplete={autoComplete}
        required
        minLength={minLength}
        value={value}
        onChange={onValueChange ? (event) => onValueChange(event.currentTarget.value) : undefined}
      />
      <button
        className="password-toggle"
        type="button"
        aria-label={visible ? "Скрыть пароль" : "Показать пароль"}
        aria-pressed={visible}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          iconRef.current?.play();
          setVisible((prev) => !prev);
        }}
      >
        <PasswordCheckIcon ref={iconRef} />
      </button>
    </div>
  );
}

export function PasswordStrengthMeter({ password }: { password: string }) {
  const score = passwordStrength(password);
  const tone = score === 3 ? "strong" : score >= 2 ? "medium" : "weak";
  const label =
    password.length === 0
      ? "Введите пароль"
      : score === 3
        ? "Надёжный пароль"
        : score >= 2
          ? "Почти готово"
          : "Слишком простой";

  return (
    <div className={`password-strength password-strength-${tone}`} aria-live="polite">
      <div className="password-strength-track" aria-hidden="true">
        <span className={score >= 1 ? "is-active" : ""} />
        <span className={score >= 2 ? "is-active" : ""} />
        <span className={score >= 3 ? "is-active" : ""} />
      </div>
      <span className="password-strength-label">{label}</span>
    </div>
  );
}
