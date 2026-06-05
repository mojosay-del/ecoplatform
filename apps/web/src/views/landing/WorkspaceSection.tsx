import { FEATURES } from "./constants";

export function WorkspaceSection() {
  return (
    <section className="lp-horizontal" id="how">
      <div className="lp-horizontal__viewport">
        <div className="lp-horizontal__head">
          <span className="lp-chapter-label" data-reveal>
            01
          </span>
          <h2 className="lp-section__title" data-reveal>
            Одно рабочее пространство
          </h2>
        </div>
        <div className="lp-horizontal__track">
          {FEATURES.map((f, i) => {
            const Icon = f.icon;
            return (
              <article className="lp-feature" key={f.t}>
                <span className="lp-feature__num">{String(i + 1).padStart(2, "0")}</span>
                <span className="lp-feature__icon" aria-hidden="true">
                  <Icon size={26} />
                </span>
                <h3 className="lp-feature__t">{f.t}</h3>
                <p className="lp-feature__d">{f.d}</p>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
