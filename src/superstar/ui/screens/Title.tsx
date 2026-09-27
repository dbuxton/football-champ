import { getClub } from '../../data/clubs';
import { overall } from '../../engine/career';
import { deleteCareer, goTo, selectCareer, useGame } from '../../store/game';
import { POSITION_NAMES } from '../components/Bits';
import { ClubBadge, Footballer } from '../components/Kit';
import { DemoPitch } from '../match/DemoPitch';

const RAINBOW = ['#ff4f9a', '#ff8a00', '#ffd23f', '#2fd158', '#4fc3f7', '#3d8bff', '#9b5cff', '#ff4f9a', '#ffd23f'];

/** The title screen: a match playing in the background, and your players to pick from. */
export function Title() {
  const careers = useGame((s) => s.save.careers);
  return (
    <div className="ss-title-screen">
      <DemoPitch />
      <div className="ss-title-shade" />
      <main className="ss-title-content">
        <h1 className="ss-title" aria-label="Superstar">
          {'SUPERSTAR'.split('').map((letter, i) => (
            <span key={i} style={{ color: RAINBOW[i], animationDelay: `${i * 0.15}s` }} aria-hidden>
              {letter}
            </span>
          ))}
        </h1>
        <p className="ss-tagline">
          Be a Premier League footballer! You play every match yourself. Play well and a bigger club will sign you — have a
          tough time and you'll move to a smaller one.
        </p>

        <button type="button" className="ss-btn ss-btn-green ss-btn-big" onClick={() => goTo('create')}>
          ⭐ New player
        </button>

        {careers.length > 0 && (
          <section className="ss-player-list" aria-label="Your players">
            <h2 className="ss-list-title">Carry on as…</h2>
            {careers.map((career) => {
              const club = getClub(career.clubId);
              return (
                <div key={career.id} className="ss-card ss-player-row">
                  <button type="button" className="ss-player-row-main" onClick={() => selectCareer(career.id)}>
                    <Footballer look={career.look} kit={club.home} number={career.number} size={70} />
                    <span className="ss-player-row-text">
                      <b>{career.name}</b>
                      <span>
                        {POSITION_NAMES[career.position].name} · {club.name}
                      </span>
                      <span className="ss-small">
                        Rated {overall(career.attributes, career.position)} · Season {career.season} · {career.matches.length} matches
                      </span>
                    </span>
                    <ClubBadge club={club} size={44} />
                  </button>
                  <button
                    type="button"
                    className="ss-delete"
                    aria-label={`Delete ${career.name}`}
                    title="Delete this player"
                    onClick={() => {
                      if (confirm(`Delete ${career.name} and their whole career? This can't be undone.`)) deleteCareer(career.id);
                    }}
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </section>
        )}

        <a className="ss-manager-link" href="./manager/">
          Rather be the manager? Play Football Champ →
        </a>
      </main>
    </div>
  );
}
