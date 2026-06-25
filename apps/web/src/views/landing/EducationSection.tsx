import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { EDU_CARDS } from "./constants";
import { reveal } from "./utils";

export function EducationSection() {
  return (
    <section className="lp-section lp-shell">
      <div className="lp-show lp-show--rev">
        <div className="lp-show__text" data-reveal>
          <span className="lp-chapter-label">03 · Обучение</span>
          <h3 className="lp-show__t">Учитесь сами и обучайте команду</h3>
          <p className="lp-show__d">
            Курсы с уроками и понятным прогрессом. От основ рынка до экономики переработки — новый человек входит в
            отрасль за недели.
          </p>
        </div>
        <div className="lp-show__mock" data-reveal style={reveal(120)}>
          <div className="lp-tilt" data-tilt>
            <div className="lp-edu">
              {EDU_CARDS.map((c) => (
                <article className="lp-edu-card" key={c.title}>
                  <div className="lp-edu-card__cover">
                    <div className="lp-edu-card__photo">
                      <Image
                        src={c.photo}
                        alt=""
                        fill
                        sizes="(max-width: 980px) 90vw, 18vw"
                        className="u-object-cover"
                      />
                    </div>
                    <div className="lp-edu-card__overlay">
                      <h4 className="lp-edu-card__title">{c.title}</h4>
                      <span className="lp-edu-card__lessons">Уроков: {c.lessons}</span>
                    </div>
                  </div>
                  <div className="lp-edu-card__foot">
                    <span className="lp-edu-card__progress">
                      <i style={{ width: `${c.progress}%` }} />
                    </span>
                    <span className="lp-edu-card__cta" aria-hidden="true">
                      Продолжить
                      <ArrowRight size={14} />
                    </span>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
