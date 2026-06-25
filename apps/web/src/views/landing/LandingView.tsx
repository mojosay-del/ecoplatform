import localFont from "next/font/local";
import "../../styles/landing.css";
import { LandingClient } from "../../components/LandingClient";
import { CtaSection } from "./CtaSection";
import { EducationSection } from "./EducationSection";
import { HeroSection } from "./HeroSection";
import { KnowledgeSection } from "./KnowledgeSection";
import { LandingFooter } from "./LandingFooter";
import { LandingNav } from "./LandingNav";
import { MarqueeSection } from "./MarqueeSection";
import { MetricsSection } from "./MetricsSection";
import { NewsSection } from "./NewsSection";
import { PriceIndicesSection } from "./PriceIndicesSection";
import { WhySection } from "./WhySection";

// Display-шрифт только для заголовков лендинга; файл лежит в репозитории,
// чтобы сборка не зависела от внешних font-сервисов.
const display = localFont({
  src: "../../fonts/Unbounded-Variable.ttf",
  display: "swap",
  variable: "--font-display",
  weight: "600 700",
});

export function LandingView() {
  return (
    <div className={`lp ${display.variable}`}>
      <LandingClient />

      <div className="lp-bg" aria-hidden="true">
        <div className="lp-bg__bloom" />
      </div>

      <div className="lp-progress" aria-hidden="true">
        <div className="lp-progress__bar" />
      </div>

      <LandingNav />

      <main className="lp-main" id="main-content" tabIndex={-1}>
        <HeroSection />
        <MarqueeSection />
        <PriceIndicesSection />
        <NewsSection />
        <EducationSection />
        <KnowledgeSection />
        <WhySection />
        <MetricsSection />
        <CtaSection />
        <LandingFooter />
      </main>
    </div>
  );
}
