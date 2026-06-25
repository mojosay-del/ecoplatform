import { Download, FileText } from "lucide-react";
import { DOC_TILES } from "./constants";
import { reveal } from "./utils";

const formatClass: Record<string, string> = {
  DOCX: "is-docx",
  PDF: "is-pdf",
  XLSX: "is-xlsx",
};

const statusLabel = {
  new: "Новое",
  updated: "Обновлено",
} satisfies Record<(typeof DOC_TILES)[number]["status"], string>;

export function DocumentationSection() {
  return (
    <section className="lp-section lp-shell">
      <div className="lp-show lp-show--rev">
        <div className="lp-show__text" data-reveal>
          <span className="lp-chapter-label">05 · Документация</span>
          <h3 className="lp-show__t">Шаблоны и регламенты рядом с работой</h3>
          <p className="lp-show__d">
            Договоры, акты, справки и памятки собраны в одном разделе. Формат виден сразу, важные документы закреплены,
            а свежие версии не теряются в чатах.
          </p>
        </div>
        <div className="lp-show__mock" data-reveal style={reveal(120)}>
          <div className="lp-tilt" data-tilt>
            <div className="lp-docs" aria-hidden="true">
              <div className="lp-docs__grid">
                {DOC_TILES.map((tile, index) => (
                  <article className="lp-doc-card" key={tile.title} style={reveal(index * 60)}>
                    <div className="lp-doc-card__body">
                      <div className="lp-doc-card__top">
                        <span className={`lp-doc-format ${formatClass[tile.format]}`}>{tile.format}</span>
                        <span className={`lp-doc-status is-${tile.status}`}>{statusLabel[tile.status]}</span>
                      </div>
                      <h4>{tile.title}</h4>
                      <p>{tile.subtitle}</p>
                    </div>
                    <div className="lp-doc-card__foot">
                      <span>
                        <FileText size={13} />
                        {tile.meta}
                      </span>
                      <span className="lp-doc-card__download">
                        <Download size={14} />
                        Скачать
                      </span>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
