/**
 * Match day: the classic ticking commentary feed and live stats, plus a 2D pitch showing where
 * the ball is, in-match substitutions and tactical changes.
 *
 * The simulation is stepped one minute at a time on a timer, so the manager can pause, make a
 * change, and watch it play out — the whole point of the original match screen.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useGame } from '../GameContext';
import { getClub } from '../../engine/gamestate';
import { Rng, deriveSeed } from '../../engine/rng';
import { MatchSim, MatchTeam } from '../../engine/match';
import { applyMatchResult, humanDefeatStreak } from '../../engine/postmatch';
import { aggregateFor, playoffNeedsWinner } from '../../engine/cups';
import { POSITION_COORDS, Mentality, Pressing } from '../../engine/types';
import { repairSelection, validateSelection } from '../../engine/selection';
import { nextHumanFixture } from '../../game/loop';
import { formatDate } from '../../engine/date';
import { Kit, Panel, Field } from '../components';

type Speed = 'paused' | 'slow' | 'normal' | 'fast' | 'instant';

const SPEED_MS: Record<Exclude<Speed, 'paused' | 'instant'>, number> = {
  slow: 900,
  normal: 380,
  fast: 130,
};

export function MatchDayScreen({ onFinish }: { onFinish: () => void }) {
  const { state, refresh, settings, showToast } = useGame();
  const club = getClub(state, state.manager.clubId);
  const fixture = useMemo(
    () => state.fixtures.find((f) => f.date <= state.date && !f.played &&
      (f.homeClubId === club.id || f.awayClubId === club.id)) ?? nextHumanFixture(state),
    [state, club.id],
  );

  const [sim, setSim] = useState<MatchSim | null>(null);
  const [speed, setSpeed] = useState<Speed>('paused');
  const [tick, setTick] = useState(0);
  const [applied, setApplied] = useState(false);
  const [kickedOff, setKickedOff] = useState(false);
  const timerRef = useRef<number | null>(null);

  const problems = fixture ? validateSelection(state, club.id) : [];
  const hasErrors = problems.some((p) => p.severity === 'error');

  // Build the simulation once the manager kicks off, so team changes before kick-off take effect.
  const kickOff = useCallback(() => {
    if (!fixture) return;
    if (hasErrors) {
      repairSelection(state, club.id);
      showToast('Your line-up was not legal, so your assistant fixed it.', true);
      refresh();
    }
    const rng = new Rng(deriveSeed(state.seed, `match:${fixture.id}`));
    const created = new MatchSim(state, fixture, rng, {
      needsWinner: playoffNeedsWinner(fixture) ||
        (state.competitions[fixture.competitionId]?.kind === 'cup' && fixture.roundName === 'Final'),
      aggregate: aggregateFor(state, fixture),
      humanDefeatStreak: humanDefeatStreak(state),
    });
    setSim(created);
    setKickedOff(true);
    setSpeed(settings.matchSpeed === 'slow' ? 'slow' : settings.matchSpeed === 'fast' ? 'fast' : 'normal');
  }, [fixture, hasErrors, state, club.id, refresh, showToast, settings.matchSpeed]);

  // The clock.
  useEffect(() => {
    if (!sim || sim.isComplete || speed === 'paused') return;

    if (speed === 'instant') {
      sim.simulateToEnd();
      setTick((t) => t + 1);
      return;
    }

    timerRef.current = window.setInterval(() => {
      sim.step();
      setTick((t) => t + 1);
    }, SPEED_MS[speed]);

    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [sim, speed, tick === -1]); // eslint-disable-line react-hooks/exhaustive-deps

  // Commit the result once the whistle goes.
  useEffect(() => {
    if (!sim?.isComplete || applied || !fixture) return;
    applyMatchResult(state, fixture, sim, sim.toResult());
    setApplied(true);
    refresh();
  }, [sim, sim?.isComplete, applied, fixture, state, refresh]);

  if (!fixture) {
    return (
      <Panel title="No match today">
        <p>There is no fixture to play. Press Continue to move on.</p>
      </Panel>
    );
  }

  const home = state.clubs[fixture.homeClubId];
  const away = state.clubs[fixture.awayClubId];
  const competition = state.competitions[fixture.competitionId];
  const weAreHome = fixture.homeClubId === club.id;
  const ourTeam: MatchTeam | null = sim ? (weAreHome ? sim.home : sim.away) : null;

  // Pre-match team talk screen.
  if (!kickedOff) {
    return (
      <Panel
        title={`${home?.name} v ${away?.name}`}
        actions={
          <button type="button" className="btn btn--primary" onClick={kickOff}>
            Kick off ▸
          </button>
        }
      >
        <div className="col">
          <p className="muted" style={{ margin: 0 }}>
            {competition?.name}{fixture.roundName ? ` · ${fixture.roundName}` : ''} ·{' '}
            {formatDate(fixture.date)} · {fixture.neutralVenue ?? home?.stadiumName} ·{' '}
            {fixture.weather}
          </p>
          {aggregateFor(state, fixture) && (
            <p className="warn" style={{ margin: 0 }}>
              Second leg. First-leg aggregate carried forward.
            </p>
          )}
          {problems.length > 0 && (
            <div className="panel" style={{ margin: 0 }}>
              <div className="panel__head">Before you kick off</div>
              <div className="panel__body">
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {problems.map((problem, index) => (
                    <li key={index} className={problem.severity === 'error' ? 'neg' : 'warn'}>
                      {problem.message}
                    </li>
                  ))}
                </ul>
                {hasErrors && (
                  <p className="faint small" style={{ marginBottom: 0 }}>
                    Kick off anyway and your assistant will pick the strongest legal side. You can
                    also go to Tactics and fix it yourself.
                  </p>
                )}
              </div>
            </div>
          )}
          <div className="row">
            <span className="muted">Line-up:</span>
            <span>
              {club.tactics.slots
                .map((slot) => (slot.playerId ? state.players[slot.playerId]?.shortName : '—'))
                .filter(Boolean)
                .join(', ')}
            </span>
          </div>
        </div>
      </Panel>
    );
  }

  if (!sim) return null;

  const commentary = [...sim.commentary].reverse();

  return (
    <>
      <Panel flush>
        <div className="scoreboard">
          <span className="scoreboard__team">
            <Kit club={home} /> {home?.shortName}
          </span>
          <span className="scoreboard__score">{sim.homeGoals} - {sim.awayGoals}</span>
          <span className="scoreboard__team">
            {away?.shortName} <Kit club={away} />
          </span>
          <span className="scoreboard__clock">
            {sim.isComplete ? 'FT' : `${Math.min(sim.minute, sim.regulationEnd + sim.addedTime)}'`}
          </span>
        </div>
        <div className="row row--wrap" style={{ padding: '8px 11px', gap: 8 }}>
          {!sim.isComplete && (
            <>
              {(['paused', 'slow', 'normal', 'fast', 'instant'] as Speed[]).map((option) => (
                <button
                  key={option}
                  type="button"
                  className={`btn btn--small${speed === option ? ' btn--primary' : ''}`}
                  onClick={() => setSpeed(option)}
                >
                  {option === 'paused' ? 'Pause' : option === 'instant' ? 'Skip to result' : option}
                </button>
              ))}
            </>
          )}
          <span className="spacer" style={{ flex: 1 }} />
          <span className="muted small">
            {fixture.neutralVenue ?? home?.stadiumName} · att. {sim.attendance.toLocaleString()} ·{' '}
            {fixture.weather} · ref {sim.referee}
          </span>
          {sim.isComplete && (
            <button type="button" className="btn btn--primary" onClick={onFinish}>
              Continue ▸
            </button>
          )}
        </div>
      </Panel>

      <div className="matchday">
        <div>
          <Panel title="Commentary" flush>
            <div className="commentary">
              {commentary.map((line, index) => (
                <div
                  key={commentary.length - index}
                  className={[
                    'commentary__line',
                    line.important ? 'commentary__line--important' : '',
                    line.text.startsWith('GOAL') || line.text.includes('IT\'S IN') ? 'commentary__line--goal' : '',
                  ].filter(Boolean).join(' ')}
                >
                  <span className="commentary__minute">{line.minute}'</span>
                  <span>{line.text}</span>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Match statistics">
            <StatBar label="Possession" home={sim.home.stats.possession || 50} away={sim.away.stats.possession || 50} suffix="%" />
            <StatBar label="Shots" home={sim.home.stats.shots} away={sim.away.stats.shots} />
            <StatBar label="On target" home={sim.home.stats.shotsOnTarget} away={sim.away.stats.shotsOnTarget} />
            <StatBar label="Expected goals" home={sim.home.stats.xg} away={sim.away.stats.xg} decimals={2} />
            <StatBar label="Corners" home={sim.home.stats.corners} away={sim.away.stats.corners} />
            <StatBar label="Fouls" home={sim.home.stats.fouls} away={sim.away.stats.fouls} />
            <StatBar label="Offsides" home={sim.home.stats.offsides} away={sim.away.stats.offsides} />
            <StatBar label="Yellow cards" home={sim.home.stats.yellowCards} away={sim.away.stats.yellowCards} />
            <StatBar label="Red cards" home={sim.home.stats.redCards} away={sim.away.stats.redCards} />
            <StatBar label="Saves" home={sim.home.stats.saves} away={sim.away.stats.saves} />
          </Panel>
        </div>

        <div>
          <Panel title="The pitch" flush>
            <PitchView sim={sim} />
          </Panel>

          {ourTeam && !sim.isComplete && (
            <>
              <Panel title="In-match changes">
                <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                  <Field label="Mentality">
                    <select
                      value={ourTeam.tactics.mentality}
                      onChange={(event) => {
                        ourTeam.tactics.mentality = event.target.value as Mentality;
                        setTick((t) => t + 1);
                      }}
                    >
                      {['Defensive', 'Counter', 'Balanced', 'Attacking', 'Overload'].map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Pressing">
                    <select
                      value={ourTeam.tactics.pressing}
                      onChange={(event) => {
                        ourTeam.tactics.pressing = event.target.value as Pressing;
                        setTick((t) => t + 1);
                      }}
                    >
                      {['Deep', 'Standard', 'High', 'Gegenpress'].map((p) => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                  </Field>
                </div>
                <p className="faint small" style={{ marginBottom: 0 }}>
                  Changes take effect from the next minute. Pushing forward when you are behind
                  works, but leaves gaps at the back.
                </p>
              </Panel>

              <SubstitutionPanel
                sim={sim}
                side={weAreHome ? 'home' : 'away'}
                team={ourTeam}
                onChange={() => setTick((t) => t + 1)}
              />
            </>
          )}

          <Panel title="Player ratings" flush>
            <table className="data">
              <tbody>
                {[sim.home, sim.away].map((team) => (
                  <>
                    <tr key={team.clubId}>
                      <td colSpan={3} className="strong">{team.shortName}</td>
                    </tr>
                    {team.onPitch
                      .filter((mp) => mp.minutesPlayed > 0 || mp.onPitch)
                      .map((mp) => (
                        <tr key={mp.player.id}>
                          <td className="faint">{mp.position}</td>
                          <td>
                            {mp.player.shortName}
                            {mp.goals > 0 && <span className="pos"> ⚽{mp.goals > 1 ? mp.goals : ''}</span>}
                            {mp.yellow > 0 && !mp.red && <span className="warn"> ▪</span>}
                            {mp.red && <span className="neg"> ▪</span>}
                            {!mp.onPitch && <span className="faint"> (off)</span>}
                          </td>
                          <td className="num mono">{(6.5 + (mp.rating - 6.5)).toFixed(1)}</td>
                        </tr>
                      ))}
                  </>
                ))}
              </tbody>
            </table>
          </Panel>
        </div>
      </div>
    </>
  );
}

/**
 * The 2D pitch. A schematic view of the abstract simulation rather than a physics engine: players
 * hold their formation shape and drift toward the ball, which moves to wherever the last event
 * happened.
 */
function PitchView({ sim }: { sim: MatchSim }) {
  const last = sim.commentary[sim.commentary.length - 1];
  const ball = last?.ball ?? { x: 0.5, y: 0.5 };

  // A real kit clash is resolved by the away side changing strip; do the same here so the two
  // sets of tokens are always tellable apart.
  const awayColours = kitsClash(sim.home.colors.primary, sim.away.colors.primary)
    ? { ...sim.away.colors, primary: sim.away.colors.secondary, text: sim.away.colors.primary }
    : sim.away.colors;

  const tokens = [sim.home, sim.away].flatMap((team, teamIndex) =>
    team.onPitch
      .filter((mp) => mp.onPitch && !mp.red)
      .map((mp) => {
        const base = POSITION_COORDS[mp.position];
        // Home attacks up the pitch, away attacks down it.
        const baseY = teamIndex === 0 ? base.y : 1 - base.y;
        const baseX = teamIndex === 0 ? base.x : 1 - base.x;
        // Drift a fraction of the way toward the ball so shape stays legible.
        const pull = 0.22;
        return {
          id: mp.player.id,
          x: baseX + (ball.x - baseX) * pull,
          y: baseY + (ball.y - baseY) * pull,
          colours: teamIndex === 0 ? team.colors : awayColours,
          number: mp.player.squadNumber || '',
          name: mp.player.shortName,
        };
      }),
  );

  return (
    <div className="pitch">
      {Array.from({ length: 10 }, (_, i) => (
        <div key={i} className="pitch__stripe" style={{ top: `${i * 10}%`, height: '10%', opacity: i % 2 }} />
      ))}
      <div className="pitch__line" style={{ left: 0, right: 0, top: '50%', height: 2 }} />
      <div className="pitch__circle" />
      <div className="pitch__box" style={{ top: 0, height: '16%', width: '58%' }} />
      <div className="pitch__box" style={{ bottom: 0, height: '16%', width: '58%' }} />
      <div className="pitch__box" style={{ top: 0, height: '5.5%', width: '26%' }} />
      <div className="pitch__box" style={{ bottom: 0, height: '5.5%', width: '26%' }} />

      {tokens.map((token) => (
        <div
          key={token.id}
          className="token"
          title={token.name}
          style={{
            left: `${token.x * 100}%`,
            top: `${(1 - token.y) * 100}%`,
            background: token.colours.primary,
            color: token.colours.text,
          }}
        >
          {token.number}
        </div>
      ))}

      <div
        className="token token--ball"
        style={{ left: `${ball.x * 100}%`, top: `${(1 - ball.y) * 100}%` }}
      />
    </div>
  );
}

/** Crude perceptual distance between two hex colours. */
function kitsClash(a: string, b: string): boolean {
  const parse = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const [r1, g1, b1] = parse(a);
  const [r2, g2, b2] = parse(b);
  const distance = Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
  return distance < 110;
}

function StatBar({
  label,
  home,
  away,
  suffix = '',
  decimals = 0,
}: {
  label: string;
  home: number;
  away: number;
  suffix?: string;
  decimals?: number;
}) {
  const total = home + away;
  const homePct = total > 0 ? (home / total) * 100 : 50;
  return (
    <div className="statbar">
      <span className="statbar__value">{home.toFixed(decimals)}{suffix}</span>
      <span className="statbar__track">
        <span className="statbar__home" style={{ width: `${homePct}%` }} />
        <span className="statbar__away" style={{ width: `${100 - homePct}%` }} />
      </span>
      <span className="statbar__value right">{away.toFixed(decimals)}{suffix}</span>
      <span className="statbar__label">{label}</span>
    </div>
  );
}

function SubstitutionPanel({
  sim,
  side,
  team,
  onChange,
}: {
  sim: MatchSim;
  side: 'home' | 'away';
  team: MatchTeam;
  onChange: () => void;
}) {
  const [off, setOff] = useState('');
  const [on, setOn] = useState('');
  const { showToast } = useGame();

  const onPitch = team.onPitch.filter((mp) => mp.onPitch && !mp.red);
  const bench = team.bench;

  return (
    <Panel title={`Substitutions (${team.subsUsed}/5 used)`}>
      {team.subsUsed >= 5 ? (
        <p className="muted" style={{ margin: 0 }}>You have used all your substitutions.</p>
      ) : (
        <div className="col">
          {onPitch.some((mp) => mp.injured) && (
            <p className="neg small" style={{ margin: 0 }}>
              {onPitch.filter((mp) => mp.injured).map((mp) => mp.player.shortName).join(', ')} needing
              treatment — consider a change.
            </p>
          )}
          <div className="row row--wrap">
            <Field label="Off">
              <select value={off} onChange={(e) => setOff(e.target.value)}>
                <option value="">— select —</option>
                {onPitch.map((mp) => (
                  <option key={mp.player.id} value={mp.player.id}>
                    {mp.position} {mp.player.shortName} ({Math.round(mp.condition)}%)
                    {mp.injured ? ' — injured' : ''}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="On">
              <select value={on} onChange={(e) => setOn(e.target.value)}>
                <option value="">— select —</option>
                {bench.map((mp) => (
                  <option key={mp.player.id} value={mp.player.id}>
                    {mp.player.naturalPosition} {mp.player.shortName}
                  </option>
                ))}
              </select>
            </Field>
            <button
              type="button"
              className="btn"
              disabled={!off || !on}
              onClick={() => {
                if (sim.substitute(side, off, on)) {
                  setOff('');
                  setOn('');
                  onChange();
                } else {
                  showToast('That substitution is not allowed.', true);
                }
              }}
              style={{ alignSelf: 'flex-end' }}
            >
              Make the change
            </button>
          </div>
          <button
            type="button"
            className="btn btn--small"
            onClick={() => { sim.autoSubstitute(side, team); onChange(); }}
          >
            Let the assistant decide
          </button>
        </div>
      )}
    </Panel>
  );
}
