import { MARQUEE } from "./constants";

export function MarqueeSection() {
  return (
    <div className="lp-marquee" aria-hidden="true">
      <div className="lp-marquee__track">
        {[0, 1].map((dup) => (
          <span className="lp-marquee__item" key={dup}>
            {MARQUEE.map((word) => (
              <span key={word}>{word}</span>
            ))}
          </span>
        ))}
      </div>
    </div>
  );
}
