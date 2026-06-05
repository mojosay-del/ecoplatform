import { INDEX_CARDS } from "./constants";
import { reveal, sparkline } from "./utils";

export function PriceIndicesSection() {
  return (
    <section className="lp-section lp-shell">
      <div className="lp-show lp-show--rev">
        <div className="lp-show__text" data-reveal>
          <span className="lp-chapter-label">02 · Индексы цен</span>
          <h3 className="lp-show__t">Цены живут здесь</h3>
          <p className="lp-show__d">
            Ежедневные котировки по ключевым видам вторсырья: динамика, тренды и история. Вы видите справедливую{" "}
            <span style={{ whiteSpace: "nowrap" }}>цену — и торгуетесь</span> на данных, а не на слухах.
          </p>
        </div>
        <div className="lp-show__mock" data-reveal style={reveal(120)}>
          <div className="lp-tilt" data-tilt>
            <div className="lp-idx-duo">
              {INDEX_CARDS.map((row) => {
                const sp = sparkline(row.series);
                return (
                  <article className="lp-idx lp-idx--solo" key={row.code}>
                    <div className="lp-idx__top">
                      <span className="lp-idx__code">{row.code}</span>
                      <span className={`lp-idx__chg${row.up ? "" : " is-down"}`}>{row.change}</span>
                    </div>
                    <div className="lp-idx__name">{row.name}</div>
                    <svg className="lp-idx__chart" viewBox="0 0 128 40" preserveAspectRatio="none" aria-hidden="true">
                      <path className={`lp-idx__area${row.up ? "" : " is-down"}`} d={sp.area} />
                      <path className={`lp-idx__line${row.up ? "" : " is-down"}`} d={sp.line} />
                    </svg>
                    <div className="lp-idx__price">
                      {row.price} <span>{row.unit}</span>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
