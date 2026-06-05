import Image from "next/image";
import Link from "next/link";

export function LandingNav() {
  return (
    <nav className="lp-nav" aria-label="Главная навигация">
      <Link className="lp-nav__brand" href="/" aria-label="ЭкоПлатформа">
        <Image className="lp-nav__logo" src="/brand/logo.webp" alt="ЭкоПлатформа" width={34} height={34} priority />
      </Link>
      <span className="lp-nav__links">
        <Link className="lp-nav__link" href="#subscription">
          Подписка
        </Link>
        <Link className="lp-nav__link" href="#company">
          Компания
        </Link>
        <Link className="lp-nav__link" href="#contacts">
          Контакты
        </Link>
        <Link className="lp-btn lp-btn--primary lp-btn--sm" href="/login">
          Войти
        </Link>
      </span>
    </nav>
  );
}
