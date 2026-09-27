import { getClub } from '../../data/clubs';
import { BADGES } from '../../engine/badges';
import { rankOf, thresholds, type Career, type MatchSummary } from '../../engine/career';
import { CUP_STAGES, CUPS } from '../../engine/cup';
import { ratingWord } from '../../engine/rating';
import { afterMatch, useGame } from '../../store/game';
import { Confetti, RatingBubble, TopBar, useEnterToContinue } from '../components/Bits';
import { Shirt } from '../components/Kit';

/** Full time: the score, your rating, what you did, and what happens next. */
export function FullTime({ career }: { career: Career }) {
  const last = useGame((s) => s.last);
  const fresh = useGame((s) => s.fresh);
  useEnterToContinue(afterMatch, true, 1200);
  if (!last) return null;

  const { summary, next, score, goals, penalties } = last;
  const { record } = summary;
  const club = getClub(record.clubId);
  const opponent = getClub(record.opponentId);
  const won = score[0] > score[1] || (penalties !== null && penalties[0] > penalties[1]);
  const lost = score[0] < score[1] || (penalties !== null && penalties[0] < penalties[1]);
  const cup = next.competition === 'league' ? null : CUPS[next.competition];
  const bigMoment = summary.cup?.trophy || record.goals >= 3 || summary.rating >= 9;
  const pending = career.pending;

  return (
    <div className="ss-app ss-club-bg">
      <TopBar career={career} />
      {bigMoment && <Confetti colours={[club.colour, club.colour2, '#ffd23f', '#ff4f9a', '#4fc3f7']} />}
      <main className="ss-screen">
        <h1 className="ss-headline ss-pop">{won ? 'You won! 🎉' : lost ? 'Full time' : 'A draw!'}</h1>

        <section className="ss-card ss-final-score ss-rise">
          {cup && <p className="ss-next-label" style={{ background: cup.colour, color: '#fff' }}>🏆 {cup.name} {CUP_STAGES[next.stage ?? 0]}</p>}
          <div className="ss-versus">
            <div className="ss-versus-team">
              <Shirt kit={club.home} size={60} />
              <b>{club.shortName}</b>
            </div>
            <span className="ss-score-big" data-testid="final-score">
              {score[0]} – {score[1]}
            </span>
            <div className="ss-versus-team">
              <Shirt kit={opponent.home} size={60} />
              <b>{opponent.shortName}</b>
            </div>
          </div>
          {penalties && (
            <p className="ss-penalty-line">
              Penalties: {penalties[0]} – {penalties[1]}
            </p>
          )}
          {goals.length > 0 && (
            <ul className="ss-goal-list">
              {goals.map((g, i) => (
                <li key={i} className={g.side === 0 ? 'ss-goal-ours' : 'ss-goal-theirs'}>
                  ⚽ {g.minute}' {g.kid ? <b>⭐ {g.name}</b> : g.name}
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="ss-grid">
          <section className="ss-card ss-rating-card ss-rise">
            <h2>Your rating</h2>
            <div className="ss-row" style={{ gap: 16 }}>
              <RatingBubble rating={summary.rating} size="big" />
              <div>
                <p className="ss-rating-word">{ratingWord(summary.rating)}</p>
                <p className="ss-small" style={{ margin: 0 }}>
                  out of 10 {summary.rating >= 8.5 ? '· 🌟 Player of the Match!' : ''}
                </p>
              </div>
            </div>
            <div className="ss-stat-row">
              <Stat label="Goals" value={record.goals} emoji="⚽" />
              <Stat label="Assists" value={record.assists} emoji="🤝" />
              <Stat label="Shots" value={record.shots} emoji="🎯" />
              <Stat label="Passes" value={record.passes} emoji="➡️" />
              <Stat label="Tackles" value={record.tackles} emoji="🛡️" />
            </div>
          </section>

          <section className="ss-card ss-rise">
            <h2>What's next</h2>
            {summary.cup && <CupNews summary={summary} />}
            {summary.drawnInto && (
              <p className="ss-news" style={{ borderColor: CUPS[summary.drawnInto].colour }}>
                🏆 {club.shortName} are in the <b>{CUPS[summary.drawnInto].name}</b>!{' '}
                {summary.drawnInto === 'fa-cup' ? 'Top half of the table — well done!' : 'The bottom-half clubs play for the EFL Cup.'}
              </p>
            )}
            {pending?.kind === 'up' && <p className="ss-news ss-news-good">📰 Bigger clubs have been watching you. They want to sign you!</p>}
            {pending?.kind === 'down' && (
              <p className="ss-news">📰 It's been tough at {club.shortName}. Some other clubs would love to give you more games.</p>
            )}
            {!pending && summary.verdict.kind === 'settling' && (
              <p className="ss-small">
                {summary.verdict.matchesLeft > 0
                  ? `${summary.verdict.matchesLeft} more ${summary.verdict.matchesLeft === 1 ? 'match' : 'matches'} and other clubs will be watching your form.`
                  : ''}
              </p>
            )}
            {!pending && summary.verdict.kind === 'stay' && (
              <p className="ss-small">
                Your form is {summary.verdict.form.toFixed(1)}. Average {thresholds(rankOf(career, club.id)).up.toFixed(1)} and bigger clubs will call!
              </p>
            )}
            <p className="ss-points">💪 +{summary.points} training points</p>
            {fresh.length > 0 && (
              <div className="ss-new-badges">
                {fresh.map((id) => (
                  <span key={id} className="ss-new-badge ss-pop">
                    <span className="ss-badge">{BADGES[id].emoji}</span>
                    <span>
                      <b>New badge: {BADGES[id].name}</b>
                      <span className="ss-small"> — {BADGES[id].how}</span>
                    </span>
                  </span>
                ))}
              </div>
            )}
          </section>
        </div>

        <div className="ss-row" style={{ justifyContent: 'center' }}>
          <button type="button" className="ss-btn ss-btn-green ss-btn-big" onClick={afterMatch}>
            {pending ? '📰 Transfer news!' : 'Carry on →'}
          </button>
        </div>
      </main>
    </div>
  );
}

function Stat({ label, value, emoji }: { label: string; value: number; emoji: string }) {
  return (
    <span className="ss-stat">
      <span className="ss-stat-emoji">{emoji}</span>
      <b>{value}</b>
      <span className="ss-small">{label}</span>
    </span>
  );
}

function CupNews({ summary }: { summary: MatchSummary }) {
  const cup = summary.cup!;
  const name = CUPS[cup.cup].name;
  if (cup.trophy) return <p className="ss-news ss-news-good ss-pop">🏆🏆🏆 YOU WON THE {name.toUpperCase()}! 🏆🏆🏆</p>;
  if (cup.won) return <p className="ss-news ss-news-good">🎉 Through to the {CUP_STAGES[cup.stage + 1]} of the {name}!</p>;
  return <p className="ss-news">Out of the {name} this time. There's always next season!</p>;
}
