import { CLUBS, getClub } from '../../data/clubs';
import { BADGES, BADGE_ORDER } from '../../engine/badges';
import {
  FORM_MATCHES,
  SETTLE_MATCHES,
  clubRatings,
  currentStint,
  currentTable,
  form,
  nextMatch,
  rankOf,
  seasonLabel,
  thresholds,
  type Career,
} from '../../engine/career';
import { CUP_AFTER, CUP_STAGES, CUPS, FINAL_STADIUM } from '../../engine/cup';
import { ROUNDS } from '../../engine/season';
import { goTo, prepareMatch } from '../../store/game';
import { FormStrip, PlayerCard, TopBar, ordinal, useEnterToContinue } from '../components/Bits';
import { ClubBadge, Shirt, clubStars } from '../components/Kit';

/** Your club: who you are, the next match, your form, the league and the cups. */
export function Hub({ career }: { career: Career }) {
  const club = getClub(career.clubId);
  const rank = rankOf(career, club.id);
  const next = nextMatch(career);
  useEnterToContinue(prepareMatch, next !== null, 400);

  return (
    <div className="ss-app ss-club-bg">
      <TopBar career={career} />
      <main className="ss-screen">
        <div className="ss-hub-hello ss-rise">
          <ClubBadge club={club} size={72} />
          <div>
            <h1 className="ss-headline" style={{ textAlign: 'left' }}>
              {club.name}
            </h1>
            <p className="ss-hello-sub">
              {clubStars(rank)} The {ordinal(rank)} biggest club of {CLUBS.length} · {club.stadium} · Season {seasonLabel(career.season)}
            </p>
          </div>
        </div>

        <div className="ss-hub-grid">
          <PlayerCard career={career} />

          <div className="ss-hub-col">
            <NextMatchCard career={career} />
            <FormCard career={career} />
          </div>

          <div className="ss-hub-col">
            <LeagueCard career={career} />
            <CupCard career={career} />
            <BadgeStrip career={career} />
          </div>
        </div>
      </main>
    </div>
  );
}

function NextMatchCard({ career }: { career: Career }) {
  const next = nextMatch(career);
  if (!next) return null;
  const club = getClub(career.clubId);
  const opponent = getClub(next.opponentId);
  const home = next.home === false ? opponent : club;
  const away = next.home === false ? club : opponent;
  const cup = next.competition === 'league' ? null : CUPS[next.competition];
  const where = next.home === 'neutral' ? FINAL_STADIUM : `${home.stadium}`;
  return (
    <section className="ss-card ss-next-match" aria-label="Next match">
      <p className="ss-next-label" style={cup ? { background: cup.colour, color: '#fff' } : undefined}>
        {cup ? `🏆 ${cup.name} ${CUP_STAGES[next.stage ?? 0]}` : `Premier League · Match ${next.round} of ${ROUNDS}`}
      </p>
      <div className="ss-versus">
        <div className="ss-versus-team">
          <Shirt kit={home.home} size={64} />
          <b>{home.shortName}</b>
        </div>
        <span className="ss-versus-v">v</span>
        <div className="ss-versus-team">
          <Shirt kit={away.home} size={64} />
          <b>{away.shortName}</b>
        </div>
      </div>
      <p className="ss-small" style={{ textAlign: 'center', margin: '4px 0 12px' }}>
        📍 {where} {next.home === true ? '(home)' : next.home === false ? '(away)' : ''}
      </p>
      <button type="button" className="ss-btn ss-btn-green ss-btn-big ss-wide" onClick={prepareMatch}>
        ▶ Play match
      </button>
    </section>
  );
}

function FormCard({ career }: { career: Career }) {
  const club = getClub(career.clubId);
  const rank = rankOf(career, club.id);
  const ratings = clubRatings(career);
  const f = form(career);
  const { up, down } = thresholds(rank);
  const played = currentStint(career).matches;
  const left = SETTLE_MATCHES - played;

  let message: string;
  if (left > 0) {
    message = `Play ${left} more ${left === 1 ? 'match' : 'matches'} for ${club.shortName} and other clubs will start watching you.`;
  } else if (f === null) {
    message = '';
  } else if (rank === 1 && f >= up) {
    message = 'You play for the biggest club of all. Keep shining!';
  } else if (f >= up - 0.4) {
    message = 'So close! One great game and a bigger club will want you.';
  } else if (f <= down && rank === CLUBS.length) {
    message = "Keep going — from here, the only way is up!";
  } else if (f <= down + 0.3) {
    message = `Careful! A good game will keep you at ${club.shortName}.`;
  } else {
    message = `Average ${up.toFixed(1)} or more over ${FORM_MATCHES} games and bigger clubs will sign you.`;
  }

  // The meter runs from 5 to 9.
  const pos = (v: number) => `${Math.min(100, Math.max(0, ((v - 5) / 4) * 100))}%`;
  return (
    <section className="ss-card" aria-label="Your form">
      <h2>Your form</h2>
      <FormStrip ratings={ratings.slice(-5)} />
      {f !== null && played >= 1 && (
        <div className="ss-meter" aria-label={`Form ${f.toFixed(1)}`}>
          <div className="ss-meter-down" style={{ width: pos(down) }}>
            <span>smaller club</span>
          </div>
          <div className="ss-meter-up" style={{ left: pos(up) }}>
            <span>bigger club</span>
          </div>
          <div className="ss-meter-you" style={{ left: pos(f) }} title={`Your form: ${f.toFixed(2)}`}>
            {f.toFixed(1)}
          </div>
        </div>
      )}
      <p className="ss-form-message">{message}</p>
    </section>
  );
}

function LeagueCard({ career }: { career: Career }) {
  const { table } = currentTable(career);
  const index = table.findIndex((row) => row.clubId === career.clubId);
  const played = table[index]?.played ?? 0;
  // The top three, and the clubs either side of yours.
  const show = new Set([0, 1, 2, index - 1, index, index + 1].filter((i) => i >= 0 && i < table.length));
  return (
    <section className="ss-card" aria-label="League">
      <h2>Premier League</h2>
      {played === 0 ? (
        <p className="ss-small">The season starts with your first match!</p>
      ) : (
        <p style={{ margin: '0 0 8px', fontWeight: 800 }}>
          {getClub(career.clubId).shortName} are {ordinal(index + 1)} {index < CLUBS.length / 2 ? '(top half)' : '(bottom half)'}
        </p>
      )}
      <table className="ss-mini-table">
        <tbody>
          {[...show]
            .sort((a, b) => a - b)
            .map((i) => {
              const row = table[i];
              const c = getClub(row.clubId);
              return (
                <tr key={row.clubId} className={row.clubId === career.clubId ? 'ss-row-you' : ''}>
                  <td>{i + 1}</td>
                  <td>
                    <span className="ss-dot" style={{ background: c.colour }} /> {c.shortName}
                  </td>
                  <td>{row.played}</td>
                  <td>
                    <b>{row.points}</b>
                  </td>
                </tr>
              );
            })}
        </tbody>
      </table>
      <button type="button" className="ss-btn ss-btn-small ss-btn-blue" style={{ marginTop: 10 }} onClick={() => goTo('table')}>
        See the whole table
      </button>
    </section>
  );
}

function CupCard({ career }: { career: Career }) {
  const run = career.cup;
  if (!run) {
    const leagueLeft = CUP_AFTER[0] - (career.round - 1);
    return (
      <section className="ss-card ss-cup-card" aria-label="Cups">
        <h2>🏆 The cups</h2>
        <p style={{ margin: 0 }}>
          After {CUP_AFTER[0]} league matches{leagueLeft > 0 ? ` (${leagueLeft} to go)` : ''}: clubs in the <b>top half</b> of the table go into the{' '}
          <b style={{ color: CUPS['fa-cup'].colour }}>FA Cup</b>, clubs in the <b>bottom half</b> into the{' '}
          <b style={{ color: CUPS['efl-cup'].colour }}>EFL Cup</b>.
        </p>
      </section>
    );
  }
  const cup = CUPS[run.cup];
  const won = run.ties.length === CUP_STAGES.length && run.ties.every((t) => t.won);
  return (
    <section className="ss-card ss-cup-card" aria-label={cup.name} style={{ borderColor: cup.colour }}>
      <h2 style={{ color: cup.colour }}>🏆 {cup.name}</h2>
      <ol className="ss-cup-path">
        {CUP_STAGES.map((stage, i) => {
          const tie = run.ties[i];
          const opponent = getClub(run.opponents[i]);
          return (
            <li key={stage} className={tie ? (tie.won ? 'ss-cup-won' : 'ss-cup-lost') : ''}>
              <b>{stage}</b>
              <span>
                {tie
                  ? `${tie.won ? '✅' : '❌'} ${tie.goalsFor}–${tie.goalsAgainst} v ${opponent.shortName}${tie.penalties ? ` (pens ${tie.penalties[0]}–${tie.penalties[1]})` : ''}`
                  : run.over
                    ? '—'
                    : `v ${opponent.shortName}, after league match ${CUP_AFTER[i]}`}
              </span>
            </li>
          );
        })}
      </ol>
      {won && <p className="ss-cup-winner">🏆 You won the {cup.name}!</p>}
      {run.over && !won && <p className="ss-small">Knocked out this time — there's always next season!</p>}
    </section>
  );
}

function BadgeStrip({ career }: { career: Career }) {
  const earned = BADGE_ORDER.filter((id) => career.badges[id]);
  return (
    <section className="ss-card" aria-label="Badges">
      <h2>
        Badges <span className="ss-small">({earned.length} of {BADGE_ORDER.length})</span>
      </h2>
      {earned.length === 0 ? (
        <p className="ss-small">Play your first match to earn your first badge!</p>
      ) : (
        <div className="ss-badge-row">
          {earned.slice(-8).map((id) => (
            <span key={id} className="ss-badge" title={`${BADGES[id].name}: ${BADGES[id].how}`}>
              {BADGES[id].emoji}
            </span>
          ))}
        </div>
      )}
      {career.points > 0 && (
        <button type="button" className="ss-btn ss-btn-small ss-btn-orange" style={{ marginTop: 10 }} onClick={() => goTo('training')}>
          💪 {career.points} training points to spend!
        </button>
      )}
    </section>
  );
}
