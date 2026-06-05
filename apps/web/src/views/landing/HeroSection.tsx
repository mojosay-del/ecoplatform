import { ArrowDown } from "lucide-react";
import { reveal } from "./utils";

export function HeroSection() {
  return (
    <header className="lp-hero">
      <h1 className="lp-hero__brand" data-reveal>
        ЭкоПлатформа
      </h1>
      <p className="lp-hero__slogan" data-reveal style={reveal(120)}>
        Рынок вторсырья,
        <br />
        который наконец <em>понятен</em>.
      </p>
      <span className="lp-hero__scroll" data-reveal style={reveal(220)}>
        Листайте вниз
        <ArrowDown size={18} aria-hidden="true" />
      </span>
    </header>
  );
}
