import Link from "next/link";
import { ArrowRight } from "lucide-react";

export function CtaSection() {
  return (
    <section className="lp-section">
      <div className="lp-cta" data-reveal>
        <div className="lp-cta__inner">
          <h2 className="lp-cta__title">Рынок вторсырья, каким он должен быть: прозрачным, понятным и удобным</h2>
          <p className="lp-cta__sub">
            Присоединяйтесь к ЭкоПлатформе — и увидите отрасль такой, какой она может быть уже сегодня.
          </p>
          <Link className="lp-btn lp-btn--lg lp-cta__btn" href="/login">
            Войти в платформу
            <ArrowRight size={18} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  );
}
