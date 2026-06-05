import Link from "next/link";
import { Boxes } from "lucide-react";
import { LEGAL_LINKS } from "./constants";

export function LandingFooter() {
  return (
    <footer className="lp-footer lp-shell" id="contacts">
      <div className="lp-footer__brand">
        <Boxes size={18} aria-hidden="true" />
        ЭкоПлатформа
      </div>
      <nav className="lp-footer__links" aria-label="Правовая информация">
        {LEGAL_LINKS.map((link) => (
          <Link href={link.href} key={link.href}>
            {link.label}
          </Link>
        ))}
      </nav>
      <div className="lp-footer__copy">© {new Date().getFullYear()} ЭкоПлатформа. Рынок вторсырья на данных.</div>
    </footer>
  );
}
