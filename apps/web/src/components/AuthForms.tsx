"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ChangeEvent, FormEvent, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Eye, EyeOff, Factory, Forklift, Package, RussianRuble, Truck } from "lucide-react";
import { MIN_PASSWORD_LENGTH, type LegalDocumentSummary } from "@ecoplatform/shared";
import { api, ApiError } from "../lib/api";
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
type RegisterStep = "company" | "person";

type RegisterFormValues = {
  organizationName: string;
  companyType: string;
  lastName: string;
  firstName: string;
  gender: string;
  phoneCountryId: PhoneCountryId;
  phoneDigits: string;
  email: string;
  password: string;
};

type PhoneCountry = {
  id: string;
  name: string;
  dialCode: string;
  nationalLength: number;
  groups: number[];
  placeholder: string;
  flagClassName: string;
};

type PhoneCountryId = "ru" | "by" | "kz" | "am" | "kg" | "uz" | "tj" | "az" | "md" | "tm";

const PHONE_COUNTRIES: PhoneCountry[] = [
  {
    id: "ru",
    name: "Россия",
    dialCode: "+7",
    nationalLength: 10,
    groups: [3, 3, 2, 2],
    placeholder: "999 123-45-67",
    flagClassName: "phone-flag-ru",
  },
  {
    id: "by",
    name: "Беларусь",
    dialCode: "+375",
    nationalLength: 9,
    groups: [2, 3, 2, 2],
    placeholder: "29 123-45-67",
    flagClassName: "phone-flag-by",
  },
  {
    id: "kz",
    name: "Казахстан",
    dialCode: "+7",
    nationalLength: 10,
    groups: [3, 3, 2, 2],
    placeholder: "700 123-45-67",
    flagClassName: "phone-flag-kz",
  },
  {
    id: "am",
    name: "Армения",
    dialCode: "+374",
    nationalLength: 8,
    groups: [2, 3, 3],
    placeholder: "77 123-456",
    flagClassName: "phone-flag-am",
  },
  {
    id: "kg",
    name: "Киргизия",
    dialCode: "+996",
    nationalLength: 9,
    groups: [3, 3, 3],
    placeholder: "700 123 456",
    flagClassName: "phone-flag-kg",
  },
  {
    id: "uz",
    name: "Узбекистан",
    dialCode: "+998",
    nationalLength: 9,
    groups: [2, 3, 2, 2],
    placeholder: "90 123-45-67",
    flagClassName: "phone-flag-uz",
  },
  {
    id: "tj",
    name: "Таджикистан",
    dialCode: "+992",
    nationalLength: 9,
    groups: [2, 3, 2, 2],
    placeholder: "93 123-45-67",
    flagClassName: "phone-flag-tj",
  },
  {
    id: "az",
    name: "Азербайджан",
    dialCode: "+994",
    nationalLength: 9,
    groups: [2, 3, 2, 2],
    placeholder: "50 123-45-67",
    flagClassName: "phone-flag-az",
  },
  {
    id: "md",
    name: "Молдова",
    dialCode: "+373",
    nationalLength: 8,
    groups: [2, 3, 3],
    placeholder: "69 123 456",
    flagClassName: "phone-flag-md",
  },
  {
    id: "tm",
    name: "Туркменистан",
    dialCode: "+993",
    nationalLength: 8,
    groups: [2, 3, 3],
    placeholder: "65 123 456",
    flagClassName: "phone-flag-tm",
  },
];

const DEFAULT_PHONE_COUNTRY = PHONE_COUNTRIES[0]!;
const ORGANIZATION_NAME_EXAMPLES = ["ИП Иванов И.И.", "ООО Экология"];
const ORGANIZATION_TYPE_DELAY = 150;
const ORGANIZATION_ERASE_DELAY = 90;
const ORGANIZATION_HOLD_DELAY = 1800;
const ORGANIZATION_EMPTY_DELAY = 600;
const INITIAL_REGISTER_VALUES: RegisterFormValues = {
  organizationName: "",
  companyType: "collector",
  lastName: "",
  firstName: "",
  gender: "male",
  phoneCountryId: DEFAULT_PHONE_COUNTRY.id as PhoneCountryId,
  phoneDigits: "",
  email: "",
  password: "",
};

function getPhoneCountry(id: PhoneCountryId) {
  return PHONE_COUNTRIES.find((country) => country.id === id) ?? DEFAULT_PHONE_COUNTRY;
}

function normalizePhoneDigits(value: string, country: PhoneCountry) {
  const digits = value.replace(/\D/g, "");
  const dialDigits = country.dialCode.replace(/\D/g, "");
  let localDigits = digits;

  if (digits.length > country.nationalLength && digits.startsWith(dialDigits)) {
    localDigits = digits.slice(dialDigits.length);
  } else if (country.id === "ru" && digits.length > country.nationalLength && digits.startsWith("8")) {
    localDigits = digits.slice(1);
  }

  return localDigits.slice(0, country.nationalLength);
}

function formatPhoneLocal(digits: string, country: PhoneCountry) {
  const parts: string[] = [];
  let cursor = 0;

  for (const groupLength of country.groups) {
    if (cursor >= digits.length) break;
    const part = digits.slice(cursor, cursor + groupLength);
    if (part) parts.push(part);
    cursor += groupLength;
  }

  if (parts.length <= 2) return parts.join(" ");

  return `${parts.slice(0, 2).join(" ")}-${parts.slice(2).join("-")}`;
}

function formatPhoneFull(country: PhoneCountry, digits: string) {
  return digits.length === country.nationalLength ? `${country.dialCode}${digits}` : "";
}

function isPasswordStrong(password: string) {
  return password.length >= MIN_PASSWORD_LENGTH && /[A-Za-zА-Яа-яЁё]/.test(password) && /[0-9]/.test(password);
}

function passwordStrength(password: string) {
  const checks = [password.length >= MIN_PASSWORD_LENGTH, /[A-Za-zА-Яа-яЁё]/.test(password), /[0-9]/.test(password)];

  return checks.filter(Boolean).length;
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
    <section className="auth-visual" data-mode={mode} aria-hidden="true">
      {/* Лёгкий wordmark вверху — без него левая панель пустая, пользователь
          теряет контекст где находится. */}
      <div className="auth-visual-wordmark">ЭкоПлатформа</div>

      <div className="auth-visual-stage">
        <div className={`auth-visual-icon${current.key === "logo" ? " is-logo" : ""}`} key={current.key}>
          {current.node}
        </div>
      </div>

      <div className="auth-visual-foot" />
    </section>
  );
}

function AuthShell({ children, mode }: { children: ReactNode; mode: AuthMode }) {
  return (
    <main className="auth-page" id="main-content" tabIndex={-1}>
      <div className="auth-layout">
        <AuthVisual mode={mode} />
        <div className="auth-form-panel">
          {children}
          <footer className="auth-footer">
            <Link href="/legal/privacy">Конфиденциальность</Link>
            <Link href="/legal/terms">Соглашение</Link>
            <Link href="/legal/personal-data">152-ФЗ</Link>
            <Link href="/legal/cookies">Cookies</Link>
            <Link href="/legal/offer">Оферта</Link>
          </footer>
        </div>
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

function EmailInput({
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
      value={value}
      onChange={onValueChange ? (event) => onValueChange(event.currentTarget.value) : undefined}
      onBlur={(event) => {
        const normalized = normalizeEmailValue(event.currentTarget.value);
        event.currentTarget.value = normalized;
        onValueChange?.(normalized);
      }}
    />
  );
}

function OrganizationNameInput({ value, onValueChange }: { value?: string; onValueChange?: (value: string) => void }) {
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
      className="input"
      name="organizationName"
      placeholder={placeholder}
      autoComplete="organization"
      required
      value={value}
      onChange={onValueChange ? (event) => onValueChange(event.currentTarget.value) : undefined}
    />
  );
}

function PhoneInput({
  name,
  countryId,
  digits,
  onCountryChange,
  onDigitsChange,
}: {
  name: string;
  countryId: PhoneCountryId;
  digits: string;
  onCountryChange: (countryId: PhoneCountryId) => void;
  onDigitsChange: (digits: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const country = getPhoneCountry(countryId);
  const displayValue = formatPhoneLocal(digits, country);
  const fullValue = formatPhoneFull(country, digits);

  function setPhoneValidity(input: HTMLInputElement, valueDigits: string) {
    input.setCustomValidity(
      valueDigits.length === 0 || valueDigits.length === country.nationalLength
        ? ""
        : `Введите ${country.nationalLength} цифр номера для страны ${country.name}.`,
    );
  }

  function onChange(event: ChangeEvent<HTMLInputElement>) {
    const nextDigits = normalizePhoneDigits(event.currentTarget.value, country);
    onDigitsChange(nextDigits);
    setPhoneValidity(event.currentTarget, nextDigits);
  }

  function selectCountry(nextCountryId: PhoneCountryId) {
    const nextCountry = getPhoneCountry(nextCountryId);
    onCountryChange(nextCountryId);
    onDigitsChange(digits.slice(0, nextCountry.nationalLength));
    setOpen(false);
  }

  return (
    <div
      className="phone-input-wrap"
      onBlur={(event) => {
        const nextTarget = event.relatedTarget as Node | null;
        if (!nextTarget || !event.currentTarget.contains(nextTarget)) {
          setOpen(false);
        }
      }}
    >
      <button
        className="phone-country"
        type="button"
        aria-label={`Выбрать страну телефона. Сейчас ${country.name} ${country.dialCode}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className={`phone-country-flag ${country.flagClassName}`} aria-hidden="true" />
        <span className="phone-country-code">{country.dialCode}</span>
      </button>
      {open ? (
        <div className="phone-country-menu" role="listbox" aria-label="Страна телефона">
          {PHONE_COUNTRIES.map((option) => (
            <button
              key={option.id}
              className="phone-country-option"
              type="button"
              role="option"
              aria-selected={option.id === country.id}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => selectCountry(option.id as PhoneCountryId)}
            >
              <span className={`phone-country-flag ${option.flagClassName}`} aria-hidden="true" />
              <span className="phone-country-name">{option.name}</span>
              <span className="phone-country-option-code">{option.dialCode}</span>
            </button>
          ))}
        </div>
      ) : null}
      <input
        className="input phone-input"
        type="tel"
        inputMode="numeric"
        autoComplete="tel-national"
        placeholder={country.placeholder}
        value={displayValue}
        onChange={onChange}
        onBlur={(event) => setPhoneValidity(event.currentTarget, digits)}
        onInvalid={(event) => {
          if (digits.length > 0 && digits.length < country.nationalLength) {
            setPhoneValidity(event.currentTarget, digits);
          }
        }}
        title={`Введите номер: ${country.dialCode} ${country.placeholder}`}
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
        value={value}
        onChange={onValueChange ? (event) => onValueChange(event.currentTarget.value) : undefined}
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

function PasswordStrengthMeter({ password }: { password: string }) {
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
  const formRef = useRef<HTMLFormElement>(null);
  const [step, setStep] = useState<RegisterStep>("company");
  const [values, setValues] = useState<RegisterFormValues>(INITIAL_REGISTER_VALUES);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // Тумблер из админки: открыта ли само-регистрация. null — пока грузим статус.
  const [registrationOpen, setRegistrationOpen] = useState<boolean | null>(null);

  // Активные документы — приходят с API, чекбоксы рендерятся динамически по
  // списку. Это даёт гибкость: контент-менеджер опубликовал новую обязательную
  // версию — на форме она появилась без правки кода.
  const [legalDocs, setLegalDocs] = useState<LegalDocumentSummary[]>([]);
  const [legalLoadError, setLegalLoadError] = useState(false);
  const [acceptedIds, setAcceptedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    api.legal
      .list()
      .then((docs) => {
        if (cancelled) return;
        setLegalDocs(docs);
      })
      .catch(() => {
        if (cancelled) return;
        setLegalLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    api.auth
      .registrationStatus()
      .then((status) => {
        if (!cancelled) setRegistrationOpen(status.enabled);
      })
      .catch(() => {
        // Статус не получили — форму не блокируем, бэк всё равно проверит тумблер.
        if (!cancelled) setRegistrationOpen(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const requiredDocs = useMemo(() => legalDocs.filter((d) => d.isRequired), [legalDocs]);
  const requiredAccepted = requiredDocs.every((d) => acceptedIds.has(d.id));
  const selectedPhoneCountry = getPhoneCountry(values.phoneCountryId);
  const passwordReady = isPasswordStrong(values.password);
  // Кнопка submit заблокирована, пока документы не загружены или не отмечены
  // все обязательные, а пароль не дошёл до зелёной шкалы. Бэк сохраняет
  // двойную защиту на те же документы и пароль.
  const canSubmit = legalDocs.length > 0 && requiredAccepted && passwordReady;
  const currentStepNumber = step === "company" ? 1 : 2;
  const progressWidth = `${currentStepNumber * 50}%`;

  function setField<K extends keyof RegisterFormValues>(field: K, value: RegisterFormValues[K]) {
    setValues((prev) => ({ ...prev, [field]: value }));
  }

  function toggleAccepted(id: string) {
    setAcceptedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function goToPersonStep() {
    setError("");
    if (formRef.current?.reportValidity()) {
      setStep("person");
    }
  }

  function goBackToCompanyStep() {
    setError("");
    setStep("company");
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (step === "company") {
      goToPersonStep();
      return;
    }

    if (!passwordReady) {
      setError("Пароль должен стать зелёным: минимум 12 символов, буква и цифра.");
      return;
    }

    if (!requiredAccepted) {
      setError("Отметьте все обязательные согласия.");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      await register({
        organizationName: values.organizationName.trim(),
        companyType: values.companyType,
        lastName: values.lastName.trim(),
        firstName: values.firstName.trim(),
        gender: values.gender,
        phone: formatPhoneFull(selectedPhoneCountry, values.phoneDigits),
        email: normalizeEmailValue(values.email),
        password: values.password,
        acceptedDocumentIds: Array.from(acceptedIds),
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

  if (registrationOpen === false) {
    return (
      <AuthShell mode="register">
        <div className="auth-card form auth-card-wide">
          <header className="auth-card-head">
            <h1 className="auth-card-title">Регистрация закрыта</h1>
            <p className="auth-card-sub">
              Регистрация новых пользователей временно отключена. Загляните позже.
            </p>
          </header>
          <p className="auth-card-sub">
            Уже есть аккаунт? <Link href="/login">Войти</Link>
          </p>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell mode="register">
      <form ref={formRef} className="auth-card form auth-card-wide" onSubmit={onSubmit}>
        <header className="auth-card-head">
          <h1 className="auth-card-title">Создать аккаунт</h1>
          <p className="auth-card-sub">
            Доступ на 24 часа · <Link href="/login">Уже есть аккаунт</Link>
          </p>
        </header>

        <div className="auth-progress" aria-label={`Шаг ${currentStepNumber} из 2`}>
          <div className="auth-progress-row">
            <span>Шаг {currentStepNumber} из 2</span>
            <span>{step === "company" ? "О компании" : "О вас"}</span>
          </div>
          <div className="auth-progress-track" aria-hidden="true">
            <span style={{ width: progressWidth }} />
          </div>
        </div>

        {step === "company" ? (
          <fieldset className="auth-section">
            <legend className="auth-section-title">О компании</legend>
            <AuthField label="Наименование компании">
              <OrganizationNameInput
                value={values.organizationName}
                onValueChange={(value) => setField("organizationName", value)}
              />
            </AuthField>
            <AuthField label="Тип компании">
              <select
                className="select"
                name="companyType"
                value={values.companyType}
                onChange={(event) => setField("companyType", event.currentTarget.value)}
                required
              >
                {companyTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </AuthField>
          </fieldset>
        ) : (
          <>
            <fieldset className="auth-section">
              <legend className="auth-section-title">О вас</legend>
              <div className="auth-grid-2">
                <AuthField label="Фамилия">
                  <input
                    className="input"
                    name="lastName"
                    value={values.lastName}
                    onChange={(event) => setField("lastName", event.currentTarget.value)}
                    required
                  />
                </AuthField>
                <AuthField label="Имя">
                  <input
                    className="input"
                    name="firstName"
                    value={values.firstName}
                    onChange={(event) => setField("firstName", event.currentTarget.value)}
                    required
                  />
                </AuthField>
              </div>
              <div className="auth-grid-2">
                <AuthField label="Пол">
                  <select
                    className="select"
                    name="gender"
                    value={values.gender}
                    onChange={(event) => setField("gender", event.currentTarget.value)}
                    required
                  >
                    {genderOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </AuthField>
                <AuthField label="Телефон">
                  <PhoneInput
                    name="phone"
                    countryId={values.phoneCountryId}
                    digits={values.phoneDigits}
                    onCountryChange={(countryId) => setField("phoneCountryId", countryId)}
                    onDigitsChange={(digits) => setField("phoneDigits", digits)}
                  />
                </AuthField>
              </div>
            </fieldset>

            <fieldset className="auth-section">
              <legend className="auth-section-title">Доступ</legend>
              <div className="auth-grid-2">
                <AuthField label="Email">
                  <EmailInput
                    name="email"
                    autoComplete="email"
                    value={values.email}
                    onValueChange={(value) => setField("email", value)}
                  />
                </AuthField>
                <AuthField label="Пароль">
                  <PasswordInput
                    name="password"
                    autoComplete="new-password"
                    minLength={MIN_PASSWORD_LENGTH}
                    value={values.password}
                    onValueChange={(value) => setField("password", value)}
                  />
                  <PasswordStrengthMeter password={values.password} />
                </AuthField>
              </div>
            </fieldset>

            <fieldset className="auth-section">
              <legend className="auth-section-title">Согласия</legend>
              {legalLoadError ? (
                <p className="auth-error">Не удалось загрузить юридические документы. Обновите страницу.</p>
              ) : legalDocs.length === 0 ? (
                <p className="auth-card-sub">Загружаем актуальные документы…</p>
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
          </>
        )}

        {error ? <p className="auth-error">{error}</p> : null}

        {step === "company" ? (
          <button className="button auth-submit" type="button" onClick={goToPersonStep}>
            Далее
          </button>
        ) : (
          <div className="auth-step-actions">
            <button className="button secondary" type="button" onClick={goBackToCompanyStep} disabled={submitting}>
              Назад
            </button>
            <button className="button auth-submit" type="submit" disabled={submitting || !canSubmit}>
              {submitting ? "Создаём аккаунт…" : "Создать аккаунт"}
            </button>
          </div>
        )}
      </form>
    </AuthShell>
  );
}

// Маппинг типа документа на ссылку публичной страницы. Если для какого-то
// типа страницы нет (например, marketing_consent), показываем title без линка.
const LEGAL_PUBLIC_ROUTES: Record<string, string> = {
  privacy_policy: "/legal/privacy",
  terms_of_service: "/legal/terms",
  personal_data_consent: "/legal/personal-data",
  cookie_policy: "/legal/cookies",
  offer_agreement: "/legal/offer",
};

function ConsentRow({
  document,
  checked,
  onChange,
  required,
}: {
  document: LegalDocumentSummary;
  checked: boolean;
  onChange: () => void;
  required?: boolean;
}) {
  const route = LEGAL_PUBLIC_ROUTES[document.type];
  return (
    <label className="consent-row">
      <input className="consent-input" type="checkbox" checked={checked} onChange={onChange} required={required} />
      <span className="consent-box" aria-hidden="true" />
      <span className="consent-copy">
        Я ознакомлен(а) и согласен(на) с{" "}
        {route ? (
          <Link href={route} target="_blank" rel="noopener noreferrer">
            {document.title}
          </Link>
        ) : (
          <strong>{document.title}</strong>
        )}
        {required ? (
          <span className="consent-required" aria-label="обязательно">
            {" "}
            *
          </span>
        ) : null}
      </span>
    </label>
  );
}
