"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { useAuth } from "../lib/auth";

export function LoginForm() {
  const router = useRouter();
  const { login } = useAuth();
  const [error, setError] = useState("");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await login(String(form.get("email")), String(form.get("password")));
      router.push("/news");
    } catch {
      setError("Не удалось войти. Проверьте email и пароль.");
    }
  }

  return (
    <div className="auth-page">
      <form className="auth-card form" onSubmit={onSubmit}>
        <h1 className="page-title">Вход</h1>
        <p className="page-subtitle">Для входа нужны только почта и пароль.</p>
        <input className="input" name="email" placeholder="Email" type="email" defaultValue="demo@ecoplatform.local" />
        <input className="input" name="password" placeholder="Пароль" type="password" defaultValue="Demo12345" />
        {error ? <p style={{ color: "var(--red)" }}>{error}</p> : null}
        <button className="button" type="submit">Войти</button>
        <Link href="/register">Создать demo-аккаунт</Link>
      </form>
    </div>
  );
}

export function RegisterForm() {
  const router = useRouter();
  const { register } = useAuth();
  const [error, setError] = useState("");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await register({
        organizationName: String(form.get("organizationName")),
        lastName: String(form.get("lastName")),
        firstName: String(form.get("firstName")),
        phone: String(form.get("phone")),
        email: String(form.get("email")),
        password: String(form.get("password")),
      });
      router.push("/news");
    } catch {
      setError("Не удалось зарегистрироваться. Возможно, email или телефон уже используются.");
    }
  }

  return (
    <div className="auth-page">
      <form className="auth-card form" onSubmit={onSubmit}>
        <h1 className="page-title">Регистрация</h1>
        <p className="page-subtitle">После регистрации компания получает demo-доступ на 24 часа.</p>
        <input className="input" name="organizationName" placeholder="Наименование организации" />
        <input className="input" name="lastName" placeholder="Фамилия" />
        <input className="input" name="firstName" placeholder="Имя" />
        <input className="input" name="phone" placeholder="Телефон" />
        <input className="input" name="email" placeholder="Email" type="email" />
        <input className="input" name="password" placeholder="Пароль" type="password" />
        {error ? <p style={{ color: "var(--red)" }}>{error}</p> : null}
        <button className="button" type="submit">Создать demo</button>
        <Link href="/login">Уже есть аккаунт</Link>
      </form>
    </div>
  );
}
