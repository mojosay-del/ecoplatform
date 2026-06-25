import { Award, BadgeCheck, CircleCheck, Eye, HelpCircle, MessageSquare, Plus, Search } from "lucide-react";
import { FORUM_EXPERTS, FORUM_PROFILE, FORUM_TILES } from "./constants";
import { reveal } from "./utils";

export function ForumSection() {
  return (
    <section className="lp-section lp-shell">
      <div className="lp-show">
        <div className="lp-show__text" data-reveal>
          <span className="lp-chapter-label">06 · Форум</span>
          <h3 className="lp-show__t">Ответы от тех, кто уже сталкивался</h3>
          <p className="lp-show__d">
            Вопросы по сырью, документам, логистике и оборудованию живут в отраслевом контексте. Решённые темы видны
            сразу, а полезные ответы повышают репутацию участника.
          </p>
        </div>
        <div className="lp-show__mock" data-reveal style={reveal(120)}>
          <div className="lp-tilt" data-tilt>
            <div className="lp-forum" aria-hidden="true">
              <div className="lp-forum__hero">
                <h4>Найдите готовый ответ — или спросите сообщество</h4>
                <div className="lp-forum-search">
                  <Search size={15} />
                  <span>Например: хороший пресс</span>
                </div>
                <p>42 решённых вопроса на форуме · обновляется ежедневно</p>
              </div>
              <div className="lp-forum__workspace">
                <div className="lp-forum__feed">
                  {FORUM_TILES.map((tile, index) => {
                    const solved = tile.status === "solved";
                    const StatusIcon = solved ? CircleCheck : HelpCircle;
                    return (
                      <article className={`lp-forum-card ${solved ? "is-solved" : "is-open"}`} key={tile.title}>
                        <div className="lp-forum-card__body">
                          <div className="lp-forum-card__tags">
                            <span className="lp-forum-status">
                              <StatusIcon size={13} />
                              {solved ? "Решено" : "Нужен ответ"}
                            </span>
                            <span className="lp-forum-chip">{tile.rawMaterial}</span>
                            <span className="lp-forum-chip">{tile.questionType}</span>
                          </div>
                          <h4>{tile.title}</h4>
                          <p>{tile.excerpt}</p>
                          <div className="lp-forum-card__meta">
                            <span>
                              <MessageSquare size={13} />
                              {tile.answers}
                            </span>
                            <span>
                              <Eye size={13} />
                              {tile.views}
                            </span>
                            <span>{index === 0 ? "2 ч" : index === 1 ? "1 дн" : "3 дн"}</span>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
                <aside className="lp-forum__side">
                  <div className="lp-forum-profile">
                    <h5>Ваш профиль</h5>
                    <div className="lp-forum-profile__person">
                      <span className="lp-forum-avatar">ИФ</span>
                      <span>
                        <b>{FORUM_PROFILE.name}</b>
                        <small>
                          <BadgeCheck size={13} />
                          {FORUM_PROFILE.role}
                        </small>
                      </span>
                    </div>
                    <div className="lp-forum-profile__stats">
                      <span>
                        Ответов
                        <b>{FORUM_PROFILE.answers}</b>
                      </span>
                      <span>
                        Решено
                        <b>{FORUM_PROFILE.solved}</b>
                      </span>
                    </div>
                    <p>
                      <Award size={16} />
                      Лучшие ответы повышают репутацию
                    </p>
                    <span className="lp-forum-profile__cta">
                      <Plus size={16} />
                      Задать вопрос
                    </span>
                  </div>
                  <div className="lp-forum__experts">
                    <span className="lp-forum__experts-kicker">Эксперты недели</span>
                    {FORUM_EXPERTS.map((expert, index) => (
                      <div className="lp-forum-expert" key={expert.name}>
                        <span className="lp-forum-expert__rank">{index + 1}</span>
                        <span>
                          <b>{expert.name}</b>
                          <small>{expert.role}</small>
                        </span>
                        <strong>+{expert.solved}</strong>
                      </div>
                    ))}
                  </div>
                </aside>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
