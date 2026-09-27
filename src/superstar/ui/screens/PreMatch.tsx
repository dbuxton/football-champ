import { getClub } from '../../data/clubs';
import { overall, type Career } from '../../engine/career';
import { CUP_STAGES, CUPS, FINAL_STADIUM } from '../../engine/cup';
import { FORMATION } from '../../engine/formation';
import type { TeamSetup } from '../../engine/match/types';
import { ROUNDS } from '../../engine/season';
import { kickOff, quitMatch, useGame } from '../../store/game';
import { MiniCard, POSITION_NAMES, TopBar, useEnterToContinue } from '../components/Bits';
import { ClubBadge } from '../components/Kit';
import { touchScreen } from '../match/controls';

/** Before kick-off: both teams' line-ups on player cards, and a reminder of the controls. */
export function PreMatch({ career }: { career: Career }) {
  const match = useGame((s) => s.match);
  useEnterToContinue(kickOff, true, 500);
  if (!match) return null;
  const { setup, next } = match;
  const homeSide = setup.homeSide;
  const teams = [setup.teams[homeSide], setup.teams[homeSide === 0 ? 1 : 0]];
  const cup = next.competition === 'league' ? null : CUPS[next.competition];
  const stadium = next.home === 'neutral' ? FINAL_STADIUM : getClub(teams[0].clubId).stadium;

  return (
    <div className="ss-app ss-club-bg">
      <TopBar career={career} />
      <main className="ss-screen">
        <div className="ss-prematch-head ss-rise">
          <p className="ss-next-label" style={cup ? { background: cup.colour, color: '#fff' } : undefined}>
            {cup ? `🏆 ${cup.name} ${CUP_STAGES[next.stage ?? 0]}` : `Premier League · Match ${next.round} of ${ROUNDS}`}
          </p>
          <h1 className="ss-headline">
            {teams[0].shortName} v {teams[1].shortName}
          </h1>
          <p className="ss-hello-sub">📍 {stadium}</p>
        </div>

        <div className="ss-lineups">
          {teams.map((team) => (
            <TeamSheet key={team.clubId} team={team} career={career} kid={team === setup.teams[0]} />
          ))}
        </div>

        <section className="ss-card ss-controls-card">
          <h2>Remember</h2>
          <p style={{ margin: 0 }}>
            You're <b>{career.name}</b>, the {POSITION_NAMES[career.position].name.toLowerCase()} with the <b>yellow ring</b>.{' '}
            {touchScreen ? (
              <>Use the stick to run, PASS to pass (or shout for the ball) and hold SHOOT to shoot.</>
            ) : (
              <>
                <kbd>←</kbd>
                <kbd>↑</kbd>
                <kbd>↓</kbd>
                <kbd>→</kbd> run, <kbd>X</kbd> pass (or shout for the ball), hold <kbd className="ss-kbd-wide">Space</kbd> to shoot,{' '}
                <kbd className="ss-kbd-wide">Shift</kbd> sprint. <kbd className="ss-kbd-wide">Esc</kbd> pauses.
              </>
            )}
          </p>
        </section>

        <div className="ss-row" style={{ justifyContent: 'center' }}>
          <button type="button" className="ss-btn ss-btn-green ss-btn-big" onClick={kickOff}>
            ⚽ Kick off!
          </button>
          <button type="button" className="ss-btn ss-btn-white" onClick={quitMatch}>
            Not yet
          </button>
        </div>
        <p className="ss-small" style={{ textAlign: 'center', color: '#fff' }}>
          or press Enter
        </p>
      </main>
    </div>
  );
}

function TeamSheet({ team, career, kid }: { team: TeamSetup; career: Career; kid: boolean }) {
  const club = getClub(team.clubId);
  return (
    <section className="ss-card ss-team-sheet" aria-label={team.name}>
      <h2 className="ss-row" style={{ gap: 10 }}>
        <ClubBadge club={club} size={42} /> {team.name}
      </h2>
      <div className="ss-mini-cards">
        {team.players.map((player, slot) =>
          player.human ? (
            <MiniCard
              key={slot}
              name={career.name}
              number={career.number}
              position={POSITION_NAMES[career.position].code}
              ability={overall(career.attributes, career.position)}
              nationality=""
              age={career.age}
              kit={team.kit}
              you
            />
          ) : (
            <MiniCard
              key={slot}
              name={player.shortName}
              number={player.number}
              position={player.position ?? FORMATION[slot].role}
              ability={player.ability ?? 60}
              nationality={player.nationality ?? ''}
              age={player.age}
              kit={slot === 0 ? { ...team.kit, shirt: team.keeperColour, trim: '#1b1b3a', pattern: 'plain', number: '#1b1b3a' } : team.kit}
            />
          ),
        )}
      </div>
      {kid && <p className="ss-small">⭐ That's you!</p>}
    </section>
  );
}
