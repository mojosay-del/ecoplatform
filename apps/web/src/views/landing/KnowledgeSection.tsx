import Image from "next/image";
import { KB_CHILDREN, KB_NAV } from "./constants";
import { reveal } from "./utils";

export function KnowledgeSection() {
  return (
    <section className="lp-section lp-shell">
      <div className="lp-show">
        <div className="lp-show__text" data-reveal>
          <span className="lp-chapter-label">04 · База знаний по сырью</span>
          <h3 className="lp-show__t">Сначала разберитесь в сырье</h3>
          <p className="lp-show__d">
            По каждому виду вторсырья: характеристики, требования, обработка и практические признаки. Навигация слева,
            материалы — справа.
          </p>
        </div>
        <div className="lp-show__mock" data-reveal style={reveal(120)}>
          <div className="lp-tilt" data-tilt>
            <div className="lp-kb">
              <aside className="lp-kb__nav" aria-hidden="true">
                <span className="lp-kb__kicker">База знаний</span>
                {KB_NAV.map((n) => (
                  <span
                    className={[
                      "lp-kb__navitem",
                      n.active ? "is-active" : "",
                      n.head ? "is-head" : "",
                      n.muted ? "is-muted" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    key={n.label}
                  >
                    {n.label}
                  </span>
                ))}
              </aside>
              <div className="lp-kb__content" aria-hidden="true">
                <span className="lp-kb__crumbs">База знаний / Макулатура / Картон</span>
                <h4 className="lp-kb__title">Картон</h4>
                <div className="lp-kb__cover lp-cover">
                  <Image
                    src="/brand/landing/kb-karton.webp"
                    alt=""
                    fill
                    sizes="(max-width: 980px) 90vw, 30vw"
                    className="u-object-cover"
                  />
                </div>
                <p className="lp-kb__lead">Виды, требования к приёму, влажность и подготовка к переработке.</p>
                <div className="lp-kb__grid">
                  {KB_CHILDREN.map((c) => (
                    <span className="lp-kb__child" key={c}>
                      {c}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
