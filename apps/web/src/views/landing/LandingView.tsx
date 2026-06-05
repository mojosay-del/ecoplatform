import { Unbounded } from "next/font/google";
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
import { WorkspaceSection } from "./WorkspaceSection";

// Display-шрифт только для заголовков лендинга (с кириллицей). Подключаем здесь,
// чтобы он не грузился на остальных страницах кабинета.
const display = Unbounded({
  subsets: ["latin", "cyrillic"],
  weight: ["600", "700"],
  display: "swap",
  variable: "--font-display",
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
        <WorkspaceSection />
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
