import { getClub } from '../../data/clubs';
import { squadFor } from '../../data/squads';
import { BADGES } from '../../engine/badges';
import { seasonLabel, type Career, type SeasonChanges } from '../../engine/career';
import { goTo, useGame } from '../../store/game';
import { Confetti, TopBar, ordinal, useEnterToContinue } from '../components/Bits';
import { ClubBadge } from '../components/Kit';
import { GoldenBoot, LeagueTable } from './Table';

const TROPHY_TEXT = {
  champions: '🥇 Premier League champions!',
  'golden-boot': '👢 You won the Golden Boot!',
  'player-of-the-season': '🌟 Player of the Season!',
  'fa-cup': '🏆 FA Cup winners!',
  'efl-cup': '🏆 EFL Cup winners!',
} as const;

/** The end of a season: where your club finished, the trophies, and what's changed for next season. */
export function SeasonEnd({ career }: { career: Career }) {
  const review = useGame((s) => s.review);
  const changes = useGame((s) => s.changes);
  const fresh = useGame((s) => s.fresh);
  useEnterToContinue(() => goTo('hub'), true, 1500);
  if (!review) return null;
  const club = getClub(review.clubId);
  const seasonTrophies = career.trophies.filter((t) => t.season === review.season);

  return (
    <div className="ss-app ss-club-bg">
      <TopBar career={career} />
      {seasonTrophies.length > 0 && <Confetti colours={[club.colour, club.colour2, '#ffd23f', '#ff4f9a', '#2fd158']} />}
      <main className="ss-screen">
        <h1 className="ss-headline ss-pop">Season {seasonLabel(review.season)} is over!</h1>

        <section className="ss-card ss-season-summary ss-rise">
          <ClubBadge club={club} size={80} />
          <div>
            <p className="ss-rating-word" style={{ margin: 0 }}>
              {club.shortName} finished {ordinal(review.position)}
            </p>
            <p style={{ margin: '6px 0 0' }}>
              You played {review.record.matches} matches, scored {review.record.goals} and set up {review.record.assists}.
              {review.record.matches > 0 ? ` Average rating ${review.record.averageRating.toFixed(1)}.` : ''}
            </p>
          </div>
        </section>

        {seasonTrophies.length > 0 && (
          <section className="ss-card ss-trophies ss-pop">
            {seasonTrophies.map((t, i) => (
              <p key={i} className="ss-trophy-line">
                {TROPHY_TEXT[t.kind]}
              </p>
            ))}
          </section>
        )}

        {fresh.length > 0 && (
          <div className="ss-new-badges">
            {fresh.map((id) => (
              <span key={id} className="ss-new-badge ss-pop">
                <span className="ss-badge">{BADGES[id].emoji}</span>
                <b>New badge: {BADGES[id].name}</b>
              </span>
            ))}
          </div>
        )}

        <div className="ss-table-layout">
          <LeagueTable table={review.table} highlight={review.clubId} />
          <GoldenBoot scorers={review.scorers} />
        </div>

        {changes && <WhatsNew career={career} changes={changes} />}

        <div className="ss-row" style={{ justifyContent: 'center' }}>
          <button type="button" className="ss-btn ss-btn-green ss-btn-big" onClick={() => goTo('hub')}>
            Start the {seasonLabel(career.season)} season →
          </button>
        </div>
      </main>
    </div>
  );
}

/** Everything that changed over the summer. */
function WhatsNew({ career, changes }: { career: Career; changes: SeasonChanges }) {
  const moves = changes.ladderAfter
    .map((id, index) => ({ id, change: changes.ladderBefore.indexOf(id) - index, now: index + 1 }))
    .filter((m) => m.change !== 0)
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
    .slice(0, 6);
  const myRank = changes.ladderAfter.indexOf(career.clubId) + 1;
  // Who at your club got better over the summer?
  const before = new Map(squadFor(career.clubId, career.season - 1).map((p) => [p.name, p.ability]));
  const improvers = squadFor(career.clubId, career.season)
    .map((p) => ({ ...p, gain: p.ability - (before.get(p.name) ?? p.ability) }))
    .filter((p) => p.gain > 0)
    .sort((a, b) => b.gain - a.gain)
    .slice(0, 3);

  return (
    <section className="ss-card ss-rise" aria-label="What's new">
      <h2>🌟 What's new for {seasonLabel(career.season)}</h2>
      <ul className="ss-whats-new">
        <li>🎂 You're {changes.age} now — happy birthday, {career.name}!</li>
        <li>💪 Pre-season training: +{changes.bonusPoints} training points</li>
        <li>
          📊 {getClub(career.clubId).shortName} {myRank === 1 ? 'are the biggest club of all!' : `are now the ${ordinal(myRank)} biggest club.`}
        </li>
        <li>⏳ Everybody is a year older: young stars get better, older players slow down, and some retire.</li>
      </ul>
      {moves.length > 0 && (
        <>
          <p className="ss-label">Clubs on the move (they grow when they finish high, shrink when they finish low)</p>
          <div className="ss-moves">
            {moves.map((m) => (
              <span key={m.id} className={`ss-move ${m.change > 0 ? 'ss-move-up' : 'ss-move-down'}`}>
                <ClubBadge club={getClub(m.id)} size={28} />
                {getClub(m.id).shortName} {m.change > 0 ? `⬆ ${m.change}` : `⬇ ${-m.change}`} (now {ordinal(m.now)})
              </span>
            ))}
          </div>
        </>
      )}
      {improvers.length > 0 && (
        <>
          <p className="ss-label">Teammates who got better</p>
          <div className="ss-moves">
            {improvers.map((p) => (
              <span key={p.name} className="ss-move ss-move-up">
                {p.shortName} {p.ability} (+{p.gain})
              </span>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
