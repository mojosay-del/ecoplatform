import { WHY } from "./constants";
import { reveal } from "./utils";

export function WhySection() {
  return (
    <section className="lp-section lp-shell" id="why">
      <div className="lp-section__head">
        <span className="lp-chapter-label" data-reveal>
          07
        </span>
        <h2 className="lp-section__title" data-reveal>
          Почему ЭкоПлатформа?
        </h2>
      </div>
      <div className="lp-bento">
        {WHY.map((card, i) => {
          const Icon = card.icon;
          return (
            <article
              className={`lp-bento-card ${
                card.feature ? "lp-bento-card--feature" : i < 3 ? "lp-bento-card--half" : "lp-bento-card--third"
              }`}
              key={card.t}
              data-reveal
              style={reveal(i * 70)}
            >
              {Icon ? (
                <span className="lp-bento-card__icon" aria-hidden="true">
                  <Icon size={24} />
                </span>
              ) : null}
              <h3 className="lp-bento-card__t">{card.t}</h3>
              <p className="lp-bento-card__d">{card.d}</p>
            </article>
          );
        })}
      </div>
    </section>
  );
}
