import Image from "next/image";
import { NEWS_TILES } from "./constants";
import { reveal } from "./utils";

export function NewsSection() {
  return (
    <section className="lp-section lp-shell">
      <div className="lp-show">
        <div className="lp-show__text" data-reveal>
          <span className="lp-chapter-label">02 · Новости</span>
          <h3 className="lp-show__t">Главное в отрасли — без шума</h3>
          <p className="lp-show__d">
            Лента с обложками, тегами и удобным чтением: регулирование, цены, технологии. Будьте в курсе перемен за
            минуты, а не за часы.
          </p>
        </div>
        <div className="lp-show__mock" data-reveal style={reveal(120)}>
          <div className="lp-tilt" data-tilt>
            <div className="lp-news">
              {NEWS_TILES.map((tile) => (
                <article className="lp-news-tile" key={tile.title}>
                  <div className="lp-news-tile__cover lp-cover">
                    <Image
                      src={tile.photo}
                      alt=""
                      fill
                      sizes="(max-width: 980px) 90vw, 18vw"
                      className="u-object-cover"
                    />
                  </div>
                  <div className="lp-news-tile__body">
                    <span className="lp-news-tile__cat">Новости</span>
                    <h4 className="lp-news-tile__title">{tile.title}</h4>
                    <p className="lp-news-tile__lead">{tile.lead}</p>
                    <div className="lp-news-tile__meta">
                      <time className="lp-news-tile__date">{tile.date}</time>
                      <span className="lp-news-tile__tags">
                        {tile.tags.map((t) => (
                          <span className="lp-tag" key={t}>
                            {t}
                          </span>
                        ))}
                      </span>
                    </div>
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
