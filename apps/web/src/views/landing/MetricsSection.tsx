import { METRICS } from "./constants";
import { reveal } from "./utils";

export function MetricsSection() {
  return (
    <section className="lp-section lp-shell">
      <div className="lp-metrics">
        {METRICS.map((m, i) => (
          <div className="lp-metric" key={m.l} data-reveal style={reveal(i * 80)}>
            <div className="lp-metric__v">
              <span data-count={m.count} data-suffix={m.suffix}>
                {`0${m.suffix}`}
              </span>
              {m.unit ? <sup className="lp-metric__unit">{m.unit}</sup> : null}
            </div>
            <div className="lp-metric__l">{m.l}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
