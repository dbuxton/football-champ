/**
 * Match day: the classic ticking commentary feed and live stats, plus a 2D pitch showing where
 * the ball is, in-match substitutions and tactical changes.
 *
 * The simulation is stepped one minute at a time on a timer, so the manager can pause, make a
 * change, and watch it play out — the whole point of the original match screen.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useGame } from '../GameContext';
import { getClub, clubFixtures, squadOf } from '../../engine/gamestate';
import { Rng, deriveSeed } from '../../engine/rng';
import { MatchSim, MatchTeam, TeamTalk } from '../../engine/match';
import { applyMatchResult, humanDefeatStreak } from '../../engine/postmatch';
import { aggregateFor, playoffNeedsWinner } from '../../engine/cups';
import { POSITION_COORDS, Mentality, Pressing } from '../../engine/types';
import { repairSelection, validateSelection } from '../../engine/selection';
import { conditionCurve, totalStats, averageForm } from '../../engine/players';
import { knowledgeOf } from '../../engine/scouting';
import { formationByName } from '../../engine/formations';
import { positionOf, tableFor } from '../../engine/table';
import { ordinal } from '../../engine/board';
import { pickTeamAutomatically } from '../../game/actions';
import { nextHumanFixture } from '../../game/loop';
import { formatDate } from '../../engine/date';
import { ResultDetails } from '../ResultDetails';
import { Kit, Panel, Field, FormGuide, OptionGroup, stars } from '../components';

type Speed = 'paused' | 'slow' | 'normal' | 'fast' | 'instant';

const SPEED_MS: Record<Exclude<Speed, 'paused' | 'instant'>, number> = {
  slow: 900,
  normal: 380,
  fast: 130,
};

export function MatchDayScreen({ onFinish }: { onFinish: () => void }) {
  const { state, refresh, settings, showToast, setScreen, inspectPlayer } = useGame();
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
  const [teamTalk, setTeamTalk] = useState<TeamTalk>('none');
  const [preMatchPosition, setPreMatchPosition] = useState(0);
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
    setPreMatchPosition(positionOf(state, club.leagueId, club.id));
    const rng = new Rng(deriveSeed(state.seed, `match:${fixture.id}`));
    const created = new MatchSim(state, fixture, rng, {
      needsWinner: playoffNeedsWinner(fixture) ||
        (state.competitions[fixture.competitionId]?.kind === 'cup' && fixture.roundName === 'Final'),
      aggregate: aggregateFor(state, fixture),
      humanDefeatStreak: humanDefeatStreak(state),
      teamTalk,
    });
    setSim(created);
    setKickedOff(true);
    setSpeed(settings.matchSpeed === 'slow' ? 'slow' : settings.matchSpeed === 'fast' ? 'fast' : 'normal');
  }, [fixture, hasErrors, state, club.id, club.leagueId, refresh, showToast, settings.matchSpeed, teamTalk]);

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

  // The build-up: opposition report, team news and the team talk.
  if (!kickedOff) {
    const opponentId = weAreHome ? fixture.awayClubId : fixture.homeClubId;
    const opponent = state.clubs[opponentId];
    return (
      <>
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
              {club.rivalIds.includes(opponentId) && <span className="pill pill--warn" style={{ marginLeft: 8 }}>Local derby</span>}
            </p>
            {aggregateFor(state, fixture) && (
              <p className="warn" style={{ margin: 0 }}>
                Second leg. First-leg aggregate carried forward.
              </p>
            )}
          </div>
        </Panel>

        <div className="grid grid--2">
          {opponent && <OppositionReport opponentId={opponentId} />}

          <div>
            <Panel
              title="Your team"
              actions={
                <span className="row">
                  <button type="button" className="btn btn--small" onClick={() => setScreen('tactics')}>
                    Go to Tactics
                  </button>
                  <button
                    type="button"
                    className="btn btn--small"
                    onClick={() => { pickTeamAutomatically(state); refresh(); showToast('Strongest available side selected.'); }}
                  >
                    Pick strongest side
                  </button>
                </span>
              }
              flush
            >
              {problems.length > 0 && (
                <div style={{ padding: '8px 11px', borderBottom: '1px solid var(--border)' }}>
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {problems.map((problem, index) => (
                      <li key={index} className={problem.severity === 'error' ? 'neg' : 'warn'}>
                        {problem.message}
                      </li>
                    ))}
                  </ul>
                  {hasErrors && (
                    <p className="faint small" style={{ margin: '6px 0 0' }}>
                      Kick off anyway and your assistant will pick the strongest legal side.
                    </p>
                  )}
                </div>
              )}
              <table className="data">
                <tbody>
                  {club.tactics.slots.map((slot, index) => {
                    const player = slot.playerId ? state.players[slot.playerId] : null;
                    if (!player) {
                      return (
                        <tr key={index}>
                          <td className="pos faint">{slot.position}</td>
                          <td className="neg">— empty —</td><td /><td />
                        </tr>
                      );
                    }
                    const ready = Math.round(conditionCurve(player.condition) *
                      (0.82 + 0.18 * (player.matchSharpness / 100)) *
                      (0.9 + 0.2 * (player.morale / 100)) * 100);
                    const form = averageForm(player);
                    return (
                      <tr key={index} className="clickable" onClick={() => inspectPlayer(player.id)}>
                        <td className="pos strong">{slot.position}</td>
                        <td>{player.shortName}<span className="faint small"> · {slot.role}</span></td>
                        <td className="num muted small">{form ? form.toFixed(1) : '—'}</td>
                        <td className={`num ${ready >= 90 ? 'pos' : ready < 75 ? 'warn' : ''}`}>{ready}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Panel>

            <Panel title="Team talk">
              <OptionGroup
                options={[
                  { value: 'none', label: 'Say nothing', hint: 'Let the football do the talking.' },
                  { value: 'calm', label: 'Calm them', hint: 'Steadies the defence. Good away from home.' },
                  { value: 'motivate', label: 'Fire them up', hint: 'Sharpens the attack.' },
                  { value: 'demand', label: 'Demand a result', hint: 'A gamble — big characters respond, nervous squads freeze.' },
                ]}
                value={teamTalk}
                onChange={setTeamTalk}
              />
            </Panel>
          </div>
        </div>
      </>
    );
  }

  if (!sim) return null;

  // Full time: the review. The result has been applied, the table has moved — show it.
  if (sim.isComplete && applied) {
    const us = weAreHome ? sim.homeGoals : sim.awayGoals;
    const them = weAreHome ? sim.awayGoals : sim.homeGoals;
    const verdict = us > them ? 'A win' : us === them ? 'A draw' : 'A defeat';
    const newPosition = positionOf(state, club.leagueId, club.id);
    const isLeague = state.competitions[fixture.competitionId]?.kind === 'league';
    const upcoming = nextHumanFixture(state);
    const upcomingOpponent = upcoming
      ? state.clubs[upcoming.homeClubId === club.id ? upcoming.awayClubId : upcoming.homeClubId]
      : null;
    return (
      <>
        <Panel flush>
          <div className="scoreboard">
            <span className="scoreboard__team"><Kit club={home} /> {home?.shortName}</span>
            <span className="scoreboard__score">{sim.homeGoals} - {sim.awayGoals}</span>
            <span className="scoreboard__team">{away?.shortName} <Kit club={away} /></span>
            <span className="scoreboard__clock">FT</span>
          </div>
          <div className="row row--wrap" style={{ padding: '8px 11px', gap: 12, alignItems: 'center' }}>
            <span className={`strong ${us > them ? 'pos' : us < them ? 'neg' : ''}`}>{verdict}.</span>
            {isLeague && preMatchPosition > 0 && newPosition > 0 && (
              <span className="muted">
                {newPosition === preMatchPosition
                  ? `Still ${ordinal(newPosition)}.`
                  : <>You move {ordinal(preMatchPosition)} → <b className={newPosition < preMatchPosition ? 'pos' : 'neg'}>{ordinal(newPosition)}</b>.</>}
              </span>
            )}
            {upcoming && upcomingOpponent && (
              <span className="muted small">
                Next: {upcomingOpponent.shortName} ({upcoming.homeClubId === club.id ? 'H' : 'A'}), {formatDate(upcoming.date)}
              </span>
            )}
            <span className="spacer" style={{ flex: 1 }} />
            <button type="button" className="btn btn--primary" onClick={onFinish}>
              Continue ▸
            </button>
          </div>
        </Panel>
        <ResultDetails fixture={fixture} />
      </>
    );
  }

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
                        sim.updateTactics(weAreHome ? 'home' : 'away', {
                          mentality: event.target.value as Mentality,
                        });
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
                        sim.updateTactics(weAreHome ? 'home' : 'away', {
                          pressing: event.target.value as Pressing,
                        });
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
                  Changes take effect from the next minute, for this match only. Pushing forward
                  when you are behind works, but leaves gaps at the back.
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
                          <td className="num mono">{mp.rating.toFixed(1)}</td>
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
 * What you'd want from an assistant's dossier: where they are, how they're playing, who hurts
 * you, and how they'll probably line up — all filtered through what scouting actually knows.
 */
function OppositionReport({ opponentId }: { opponentId: string }) {
  const { state, inspectPlayer } = useGame();
  const opponent = state.clubs[opponentId];
  if (!opponent) return null;

  const theirLeague = state.competitions[opponent.leagueId];
  const table = theirLeague ? tableFor(state, theirLeague.id) : [];
  const row = table.find((r) => r.clubId === opponentId);
  const theirPosition = table.findIndex((r) => r.clubId === opponentId) + 1;

  const recent = clubFixtures(state, opponentId).filter((f) => f.played && f.result).slice(-3);
  const squad = squadOf(state, opponentId);
  const topScorer = squad
    .map((p) => ({ p, goals: totalStats(p).goals }))
    .sort((a, b) => b.goals - a.goals)[0];

  const formation = formationByName(opponent.tactics.formationName);
  const probableXi = opponent.tactics.slots.map((slot, index) => ({
    position: formation.slots[index] ?? slot.position,
    player: slot.playerId ? state.players[slot.playerId] : null,
  }));

  return (
    <Panel title={`Opposition report — ${opponent.name}`} flush>
      <div className="panel__body col">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span className="muted">League</span>
          <span>
            {theirPosition > 0 ? `${ordinal(theirPosition)} in the ${theirLeague?.shortName}` : theirLeague?.name}
          </span>
        </div>
        {row && (
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="muted">Form</span>
            <FormGuide form={row.form} />
          </div>
        )}
        {recent.length > 0 && (
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="muted">Last results</span>
            <span className="mono small">
              {recent.map((f) => {
                const theirHome = f.homeClubId === opponentId;
                const gf = theirHome ? f.result!.homeGoals : f.result!.awayGoals;
                const ga = theirHome ? f.result!.awayGoals : f.result!.homeGoals;
                return `${gf > ga ? 'W' : gf === ga ? 'D' : 'L'} ${gf}-${ga}`;
              }).join(' · ')}
            </span>
          </div>
        )}
        {topScorer && topScorer.goals > 0 && (
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="muted">Top scorer</span>
            <span className="clickable" onClick={() => inspectPlayer(topScorer.p.id)}>
              {topScorer.p.shortName} ({topScorer.goals})
            </span>
          </div>
        )}
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span className="muted">Likely shape</span>
          <span className="strong">{opponent.tactics.formationName}</span>
        </div>
      </div>
      <div className="panel__head">Probable XI</div>
      <table className="data">
        <tbody>
          {probableXi.map(({ position, player }, index) => {
            if (!player) return null;
            const knowledge = knowledgeOf(state, player);
            return (
              <tr key={index} className="clickable" onClick={() => inspectPlayer(player.id)}>
                <td className="pos strong">{position}</td>
                <td>{player.shortName}</td>
                <td className="num gold small" title={knowledge.stars === null ? 'Unscouted — send a scout to learn more' : 'From your scouts'}>
                  {knowledge.stars !== null ? stars(knowledge.stars) : <span className="faint">not scouted</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Panel>
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
