import { getClub } from '../../data/clubs';
import { BADGES, BADGE_ORDER } from '../../engine/badges';
import { careerTotals, type Career, type Trophy } from '../../engine/career';
import { CUPS } from '../../engine/cup';
import { setDifficulty, setHalfMinutes } from '../../store/game';
import { RatingBubble, TopBar, ordinal } from '../components/Bits';
import { ClubBadge, Shirt } from '../components/Kit';
import type { Difficulty } from '../../engine/match/types';

const TROPHY_NAMES: Record<Trophy['kind'], { name: string; emoji: string }> = {
  champions: { name: 'Premier League champions', emoji: '🥇' },
  'golden-boot': { name: 'Golden Boot', emoji: '👢' },
  'player-of-the-season': { name: 'Player of the Season', emoji: '🌟' },
  'fa-cup': { name: 'FA Cup winners', emoji: '🏆' },
  'efl-cup': { name: 'EFL Cup winners', emoji: '🏆' },
};

/** Your whole career: the clubs, the shirts, the trophies, the sticker book of badges. */
export function CareerScreen({ career }: { career: Career }) {
  const totals = careerTotals(career);
  const recent = [...career.matches].reverse().slice(0, 10);
  return (
    <div className="ss-app ss-club-bg">
      <TopBar career={career} />
      <main className="ss-screen">
        <h1 className="ss-headline">{career.name}'s career</h1>
        <div className="ss-stat-row ss-card" style={{ justifyContent: 'space-around' }}>
          <Big label="Matches" value={totals.matches} />
          <Big label="Goals" value={totals.goals} />
          <Big label="Assists" value={totals.assists} />
          <Big label="Average rating" value={totals.matches ? totals.averageRating.toFixed(1) : '–'} />
          <Big label="Trophies" value={career.trophies.length} />
        </div>

        <section className="ss-card">
          <h2>👕 My clubs</h2>
          <div className="ss-shirt-wall">
            {career.stints.map((stint, i) => {
              const club = getClub(stint.clubId);
              return (
                <div key={i} className="ss-shirt-hanger">
                  <Shirt kit={club.home} number={career.number} size={76} />
                  <b>{club.shortName}</b>
                  <span className="ss-small">
                    {stint.how === 'start' ? 'First club' : stint.how === 'up' ? '⬆ Moved up' : '⬇ Moved down'} · Season {stint.season}
                  </span>
                  <span className="ss-small">
                    {stint.matches} games · {stint.goals} goals
                    {stint.matches ? ` · avg ${(stint.ratingTotal / stint.matches).toFixed(1)}` : ''}
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        <section className="ss-card">
          <h2>🏆 Trophy cabinet</h2>
          {career.trophies.length === 0 ? (
            <p className="ss-small">Empty for now — win the league or a cup, or top the scoring charts, to fill it!</p>
          ) : (
            <div className="ss-trophies">
              {career.trophies.map((t, i) => (
                <div key={i} className="ss-trophy ss-pop">
                  <span className="ss-trophy-emoji">{TROPHY_NAMES[t.kind].emoji}</span>
                  <b>{TROPHY_NAMES[t.kind].name}</b>
                  <span className="ss-small">
                    Season {t.season} · {getClub(t.clubId).shortName}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="ss-card">
          <h2>
            ⭐ Badge book <span className="ss-small">({BADGE_ORDER.filter((id) => career.badges[id]).length} of {BADGE_ORDER.length})</span>
          </h2>
          <div className="ss-badge-book">
            {BADGE_ORDER.map((id) => {
              const badge = BADGES[id];
              const earned = career.badges[id];
              return (
                <div key={id} className={`ss-badge-slot ${earned ? '' : 'ss-badge-locked'}`}>
                  <span className="ss-badge">{earned ? badge.emoji : '?'}</span>
                  <b>{badge.name}</b>
                  <span className="ss-small">{earned ? `Season ${earned}` : badge.how}</span>
                </div>
              );
            })}
          </div>
        </section>

        {career.seasons.length > 0 && (
          <section className="ss-card">
            <h2>📅 Seasons</h2>
            <table className="ss-table">
              <thead>
                <tr>
                  <th>Season</th>
                  <th style={{ textAlign: 'left' }}>Club</th>
                  <th>Finished</th>
                  <th>Games</th>
                  <th>Goals</th>
                  <th>Avg</th>
                </tr>
              </thead>
              <tbody>
                {career.seasons.map((s) => (
                  <tr key={s.season}>
                    <td>{s.season}</td>
                    <td style={{ textAlign: 'left' }}>{getClub(s.clubId).shortName}</td>
                    <td>{ordinal(s.position)}</td>
                    <td>{s.matches}</td>
                    <td>{s.goals}</td>
                    <td>{s.averageRating ? s.averageRating.toFixed(1) : '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {recent.length > 0 && (
          <section className="ss-card">
            <h2>⚽ Recent matches</h2>
            <ul className="ss-match-list">
              {recent.map((m, i) => {
                const opponent = getClub(m.opponentId);
                return (
                  <li key={i}>
                    <ClubBadge club={getClub(m.clubId)} size={28} />
                    <span>
                      {m.competition === 'league' ? '' : `🏆 ${CUPS[m.competition].name} · `}
                      {m.goalsFor}–{m.goalsAgainst} v {opponent.shortName}
                      {m.penalties ? ` (pens ${m.penalties[0]}–${m.penalties[1]})` : ''}
                    </span>
                    <span className="ss-small">
                      {m.goals ? `⚽×${m.goals} ` : ''}
                      {m.assists ? `🤝×${m.assists}` : ''}
                    </span>
                    <RatingBubble rating={m.rating} size="small" />
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <section className="ss-card">
          <h2>⚙️ Settings</h2>
          <p className="ss-label">How hard</p>
          <div className="ss-row">
            {(['easy', 'medium', 'hard'] as Difficulty[]).map((d) => (
              <button key={d} type="button" className={`ss-chip ${career.difficulty === d ? 'ss-chip-on' : ''}`} onClick={() => setDifficulty(d)}>
                {d === 'easy' ? '😊 Easy' : d === 'medium' ? '😎 Medium' : '🔥 Hard'}
              </button>
            ))}
          </div>
          <p className="ss-label">Match length</p>
          <div className="ss-row">
            {[
              [1.5, 'Quick (3 min)'],
              [2, 'Normal (4 min)'],
              [3, 'Long (6 min)'],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={`ss-chip ${career.halfMinutes === value ? 'ss-chip-on' : ''}`}
                onClick={() => setHalfMinutes(value as number)}
              >
                {label}
              </button>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

function Big({ label, value }: { label: string; value: number | string }) {
  return (
    <span className="ss-stat">
      <b className="ss-big-number">{value}</b>
      <span className="ss-small">{label}</span>
    </span>
  );
}
