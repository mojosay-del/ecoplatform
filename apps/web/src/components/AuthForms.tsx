"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ChangeEvent, FormEvent, ReactNode } from "react";
import { useEffect, useState } from "react";
import { Check, Eye, EyeOff, Factory, Forklift, Package, RussianRuble, Truck } from "lucide-react";
import { MIN_PASSWORD_LENGTH } from "@ecoplatform/shared";
import { ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";

const companyTypeOptions = [
  { value: "collector", label: "Заготовитель" },
  { value: "trader", label: "Трейдер" },
  { value: "processor", label: "Переработчик" },
];

const genderOptions = [
  { value: "male", label: "Мужской" },
  { value: "female", label: "Женский" },
];

// Каждая иконка снабжена собственной длительностью показа. Все обычные —
// 1500мс, финальная (логотип сайта) — 4000мс. Цикл бесконечный.
type AuthIcon = {
  key: string;
  hold: number;
  node: ReactNode;
};

const AUTH_ICONS: AuthIcon[] = [
  {
    key: "factory",
    hold: 1500,
    node: <Factory aria-hidden="true" />,
  },
  {
    key: "forklift",
    hold: 1500,
    node: <Forklift aria-hidden="true" />,
  },
  {
    key: "bale",
    hold: 1500,
    node: <Package aria-hidden="true" />,
  },
  {
    key: "truck",
    hold: 1500,
    node: <Truck aria-hidden="true" />,
  },
  {
    key: "ruble",
    hold: 1500,
    node: <RussianRuble aria-hidden="true" />,
  },
  // Финальный кадр — логотип ЭкоПлатформы. Заливка (а не обводка), потому
  // что у бренд-знака сплошной силуэт; класс `is-logo` в CSS снимает stroke
  // и увеличивает размер, чтобы знак не выглядел мельче остальных иконок
  // (его реальный bounding-box занимает только центральную часть viewBox).
  {
    key: "logo",
    hold: 4000,
    node: (
      <svg viewBox="0 0 1024 1024" aria-hidden="true">
        <path
          d="M 771 289 L 706 303 L 525 312 L 467 330 L 423 358 L 392 390 L 363 438 L 336 554 L 376 483 L 446 422 L 534 384 L 635 366 L 518 407 L 422 469 L 359 548 L 300 684 L 566 684 L 603 672 L 639 604 L 438 604 L 450 569 L 641 559 L 662 543 L 693 476 L 486 502 L 424 520 L 380 544 L 435 505 L 579 470 L 652 438 L 728 368 Z M 634 365 L 635 364 L 638 364 L 639 365 L 638 366 L 635 366 Z"
          fillRule="evenodd"
        />
      </svg>
    ),
  },
];

type AuthMode = "login" | "register";

const PHONE_MAX_DIGITS = 10;
const ORGANIZATION_NAME_EXAMPLES = ["ИП Иванов И.И.", "ООО Экология"];
const ORGANIZATION_TYPE_DELAY = 150;
const ORGANIZATION_ERASE_DELAY = 90;
const ORGANIZATION_HOLD_DELAY = 1800;
const ORGANIZATION_EMPTY_DELAY = 600;

function normalizeRussianPhoneDigits(value: string) {
  const digits = value.replace(/\D/g, "");
  const withoutCountryCode =
    digits.length > PHONE_MAX_DIGITS && (digits.startsWith("7") || digits.startsWith("8")) ? digits.slice(1) : digits;

  return withoutCountryCode.slice(0, PHONE_MAX_DIGITS);
}

function formatRussianPhoneLocal(digits: string) {
  const operator = digits.slice(0, 3);
  const first = digits.slice(3, 6);
  const second = digits.slice(6, 8);
  const third = digits.slice(8, 10);

  let value = "";
  if (operator) value += `(${operator}${operator.length === 3 ? ")" : ""}`;
  if (first) value += `${operator.length === 3 ? " " : ""}${first}`;
  if (second) value += `-${second}`;
  if (third) value += `-${third}`;

  return value;
}

function formatRussianPhoneFull(digits: string) {
  return digits.length === PHONE_MAX_DIGITS ? `+7${digits}` : "";
}

function normalizeEmailValue(value: string) {
  return value.trim().toLowerCase();
}

function AuthVisual({ mode }: { mode: AuthMode }) {
  const [index, setIndex] = useState(0);
  const current = AUTH_ICONS[index] ?? AUTH_ICONS[0]!;

  // Смена кадра по таймауту с индивидуальной длительностью для каждой
  // иконки. setTimeout пересоздаётся при каждом изменении index — это
  // даёт точный тайминг без рассинхрона, который был бы у одного setInterval.
  useEffect(() => {
    const id = window.setTimeout(() => setIndex((prev) => (prev + 1) % AUTH_ICONS.length), current.hold);
    return () => window.clearTimeout(id);
  }, [current.key, current.hold]);

  return (
    <section className="auth-visual" aria-hidden="true">
      {/* Лёгкий wordmark вверху — без него левая панель пустая, пользователь
          теряет контекст где находится. */}
      <div className="auth-visual-wordmark">ЭкоПлатформа</div>

      <div className="auth-visual-stage">
        <div className={`auth-visual-icon${current.key === "logo" ? " is-logo" : ""}`} key={current.key}>
          {current.node}
        </div>
      </div>

      {/* На странице регистрации добавляем три коротких преимущества —
          снимаем страх перед заполнением длинной формы. */}
      {mode === "register" ? (
        <ul className="auth-visual-bullets">
          <li>
            <Check size={16} strokeWidth={3} /> Доступ на 24 часа
          </li>
          <li>
            <Check size={16} strokeWidth={3} /> Без банковской карты
          </li>
          <li>
            <Check size={16} strokeWidth={3} /> Полный доступ ко всем разделам
          </li>
        </ul>
      ) : (
        <div className="auth-visual-foot" />
      )}
    </section>
  );
}

function AuthShell({ children, mode }: { children: ReactNode; mode: AuthMode }) {
  return (
    <main className="auth-page">
      <div className="auth-layout">
        <AuthVisual mode={mode} />
        <div className="auth-form-panel">{children}</div>
      </div>
    </main>
  );
}

// Унифицированное поле: label сверху, контрол снизу. Раньше часть полей
// шла с placeholder вместо label, что нарушало WCAG и сбивало пользователя.
function AuthField({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="auth-field">
      <span className="auth-field-label">{label}</span>
      {children}
      {hint ? <span className="auth-field-hint">{hint}</span> : null}
    </label>
  );
}

function EmailInput({ name, autoComplete }: { name: string; autoComplete: "email" | "username" }) {
  return (
    <input
      className="input"
      name={name}
      type="email"
      autoComplete={autoComplete}
      inputMode="email"
      autoCapitalize="none"
      spellCheck={false}
      placeholder="name@example.ru"
      required
      onBlur={(event) => {
        event.currentTarget.value = normalizeEmailValue(event.currentTarget.value);
      }}
    />
  );
}

function OrganizationNameInput() {
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
    <input className="input" name="organizationName" placeholder={placeholder} autoComplete="organization" required />
  );
}

function RussianPhoneInput({ name }: { name: string }) {
  const [digits, setDigits] = useState("");
  const displayValue = formatRussianPhoneLocal(digits);
  const fullValue = formatRussianPhoneFull(digits);

  function setPhoneValidity(input: HTMLInputElement, valueDigits: string) {
    input.setCustomValidity(
      valueDigits.length === 0 || valueDigits.length === PHONE_MAX_DIGITS
        ? ""
        : "Введите 10 цифр российского номера после +7.",
    );
  }

  function onChange(event: ChangeEvent<HTMLInputElement>) {
    const nextDigits = normalizeRussianPhoneDigits(event.currentTarget.value);
    setDigits(nextDigits);
    setPhoneValidity(event.currentTarget, nextDigits);
  }

  return (
    <div className="phone-input-wrap">
      <span className="phone-country" aria-hidden="true">
        <span className="phone-country-flag" />
        <span className="phone-country-code">+7</span>
      </span>
      <input
        className="input phone-input"
        type="tel"
        inputMode="numeric"
        autoComplete="tel-national"
        placeholder="(999) 123-45-67"
        value={displayValue}
        onChange={onChange}
        onBlur={(event) => setPhoneValidity(event.currentTarget, digits)}
        onInvalid={(event) => {
          if (digits.length > 0 && digits.length < PHONE_MAX_DIGITS) {
            setPhoneValidity(event.currentTarget, digits);
          }
        }}
        title="Введите номер в формате +7 (999) 123-45-67"
        required
      />
      <input type="hidden" name={name} value={fullValue} />
    </div>
  );
}

function PasswordInput({
  name,
  autoComplete,
  minLength,
}: {
  name: string;
  autoComplete: "current-password" | "new-password";
  minLength?: number;
}) {
  const [visible, setVisible] = useState(false);
  const Icon = visible ? EyeOff : Eye;

  return (
    <div className="password-input-wrap">
      <input
        className="input password-input"
        name={name}
        type={visible ? "text" : "password"}
        autoComplete={autoComplete}
        required
        minLength={minLength}
      />
      <button
        className="password-toggle"
        type="button"
        aria-label={visible ? "Скрыть пароль" : "Показать пароль"}
        aria-pressed={visible}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setVisible((prev) => !prev)}
      >
        <Icon size={18} strokeWidth={2.2} aria-hidden="true" />
      </button>
    </div>
  );
}

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
      // Сервер возвращает осмысленные тексты («Учётная запись заблокирована»,
      // «Доступ к кабинету компании закрыт»). Раньше пустой catch их съедал —
      // пользователь видел только общий «Не удалось войти».
      setError(err instanceof ApiError && err.message ? err.message : "Не удалось войти. Проверьте email и пароль.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell mode="login">
      <form className="auth-card form" onSubmit={onSubmit}>
        <header className="auth-card-head">
          <h1 className="auth-card-title">Войти в аккаунт</h1>
          <p className="auth-card-sub">
            Нет аккаунта? <Link href="/register">Создать аккаунт</Link>
          </p>
        </header>

        <AuthField label="Email">
          <EmailInput name="email" autoComplete="email" />
        </AuthField>

        <AuthField label="Пароль">
          <PasswordInput name="password" autoComplete="current-password" />
        </AuthField>

        <div className="auth-row">
          <label className="auth-check">
            <input className="auth-check-input" type="checkbox" name="rememberMe" defaultChecked />
            <span className="auth-check-box" aria-hidden="true" />
            <span>Запомнить меня</span>
          </label>
          <Link className="auth-row-link" href="/forgot-password">
            Забыли пароль?
          </Link>
        </div>

        {error ? <p className="auth-error">{error}</p> : null}

        <button className="button auth-submit" type="submit" disabled={submitting}>
          {submitting ? "Входим…" : "Войти"}
        </button>
      </form>
    </AuthShell>
  );
}

export function RegisterForm() {
  const router = useRouter();
  const { register } = useAuth();
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSubmitting(true);
    setError("");
    try {
      await register({
        organizationName: String(form.get("organizationName")),
        companyType: String(form.get("companyType")),
        lastName: String(form.get("lastName")),
        firstName: String(form.get("firstName")),
        gender: String(form.get("gender")),
        phone: String(form.get("phone")),
        email: normalizeEmailValue(String(form.get("email"))),
        password: String(form.get("password")),
      });
      router.push("/news");
    } catch (err) {
      setError(
        err instanceof ApiError && err.message
          ? err.message
          : "Не удалось зарегистрироваться. Возможно, email или телефон уже используются.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell mode="register">
      <form className="auth-card form auth-card-wide" onSubmit={onSubmit}>
        <header className="auth-card-head">
          <h1 className="auth-card-title">Создать аккаунт</h1>
          <p className="auth-card-sub">
            Доступ на 24 часа · <Link href="/login">Уже есть аккаунт</Link>
          </p>
        </header>

        {/* Секция «О компании» — два первых поля логично связаны темой. */}
        <fieldset className="auth-section">
          <legend className="auth-section-title">О компании</legend>
          <AuthField label="Наименование организации">
            <OrganizationNameInput />
          </AuthField>
          <AuthField label="Тип компании">
            <select className="select" name="companyType" defaultValue="collector" required>
              {companyTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </AuthField>
        </fieldset>

        {/* Секция «О вас» — личные данные в одну группу, парные поля в строку. */}
        <fieldset className="auth-section">
          <legend className="auth-section-title">О вас</legend>
          <div className="auth-grid-2">
            <AuthField label="Фамилия">
              <input className="input" name="lastName" required />
            </AuthField>
            <AuthField label="Имя">
              <input className="input" name="firstName" required />
            </AuthField>
          </div>
          <div className="auth-grid-2">
            <AuthField label="Пол">
              <select className="select" name="gender" defaultValue="male" required>
                {genderOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </AuthField>
            <AuthField label="Телефон">
              <RussianPhoneInput name="phone" />
            </AuthField>
          </div>
        </fieldset>

        {/* Секция «Доступ» — email и пароль, всё что нужно для входа. */}
        <fieldset className="auth-section">
          <legend className="auth-section-title">Доступ</legend>
          <div className="auth-grid-2">
            <AuthField label="Email">
              <EmailInput name="email" autoComplete="email" />
            </AuthField>
            <AuthField
              label="Пароль"
              hint={`Не короче ${MIN_PASSWORD_LENGTH} символов, минимум одна буква и одна цифра.`}
            >
              <PasswordInput name="password" autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} />
            </AuthField>
          </div>
        </fieldset>

        {error ? <p className="auth-error">{error}</p> : null}

        <button className="button auth-submit" type="submit" disabled={submitting}>
          {submitting ? "Создаём аккаунт…" : "Создать аккаунт"}
        </button>
      </form>
    </AuthShell>
  );
}
