import { useEffect, useMemo, useRef, useState } from 'react';
import { Rng } from '../../../engine/rng';
import { getClub } from '../../data/clubs';
import type { Career } from '../../engine/career';
import { CUP_STAGES, CUPS, computerPick, shootoutWinner, takePenalty, type Aim, type PenaltyOutcome } from '../../engine/cup';
import { penaltiesFinished, useGame } from '../../store/game';
import { playSound } from '../sound';
import { Confetti } from '../components/Bits';
import { Shirt } from '../components/Kit';

/**
 * A drawn cup tie goes to penalties. You take your team's kicks — pick a corner and shoot — and
 * you're in goal for theirs: pick which way to dive. Five each, then sudden death.
 */

type Kick = { aim: Aim; dive: Aim; outcome: PenaltyOutcome };

const AIM_X: Record<Aim, number> = { [-1]: 22, 0: 50, 1: 78 };

export function Penalties({ career }: { career: Career }) {
  const drawn = useGame((s) => s.drawn);
  const match = useGame((s) => s.match);
  const rng = useMemo(() => new Rng((drawn?.setup.seed ?? 1) ^ 0x5bd1e995), [drawn]);
  const [ours, setOurs] = useState<Kick[]>([]);
  const [theirs, setTheirs] = useState<Kick[]>([]);
  const [showing, setShowing] = useState<(Kick & { side: 0 | 1 }) | null>(null);
  const [aim, setAim] = useState<Aim>(0);
  const busy = useRef(false);

  const takers = useMemo(() => {
    if (!drawn) return { ours: [career.name], theirs: ['?'] };
    const outfield = (side: 0 | 1) =>
      drawn.agents
        .filter((a) => a.side === side && !a.keeper)
        .sort((a, b) => Number(b.human) - Number(a.human) || b.skills.shooting - a.skills.shooting);
    return {
      ours: outfield(0).map((a) => (a.human ? career.name : a.shortName)),
      theirs: outfield(1).map((a) => a.shortName),
    };
  }, [drawn, career.name]);

  const winner = shootoutWinner(
    ours.map((k) => k.outcome),
    theirs.map((k) => k.outcome),
  );
  const ourTurn = ours.length === theirs.length;
  const done = winner !== null && showing === null;

  const shooting = (side: 0 | 1, index: number) => {
    if (!drawn) return 0.6;
    const outfield = drawn.agents.filter((a) => a.side === side && !a.keeper).sort((a, b) => Number(b.human) - Number(a.human) || b.skills.shooting - a.skills.shooting);
    return outfield[index % outfield.length]?.skills.shooting ?? 0.6;
  };

  const shoot = (where: Aim) => {
    if (busy.current || winner !== null || !ourTurn) return;
    busy.current = true;
    const dive = computerPick(rng);
    const outcome = takePenalty(rng, where, dive, shooting(0, ours.length));
    const kick = { aim: where, dive, outcome };
    setShowing({ ...kick, side: 0 });
    if (career.sound) playSound(outcome === 'goal' ? 'goal' : 'ooh');
    setTimeout(() => {
      setOurs((k) => [...k, kick]);
      setShowing(null);
      busy.current = false;
    }, 1500);
  };

  const dive = (where: Aim) => {
    if (busy.current || winner !== null || ourTurn) return;
    busy.current = true;
    const shot = computerPick(rng);
    const outcome = takePenalty(rng, shot, where, shooting(1, theirs.length));
    const kick = { aim: shot, dive: where, outcome };
    setShowing({ ...kick, side: 1 });
    if (career.sound) playSound(outcome === 'goal' ? 'ooh' : 'cheer');
    setTimeout(() => {
      setTheirs((k) => [...k, kick]);
      setShowing(null);
      busy.current = false;
    }, 1500);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.repeat) return;
      const dir: Aim | null = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : event.key === 'ArrowUp' ? 0 : null;
      if (ourTurn) {
        if (dir !== null) {
          event.preventDefault();
          setAim(dir);
        }
        if (event.key === ' ' || event.key === 'Enter') {
          event.preventDefault();
          shoot(aim);
        }
      } else if (dir !== null) {
        event.preventDefault();
        dive(dir);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!drawn || !match) return null;
  const club = getClub(career.clubId);
  const opponent = getClub(match.next.opponentId);
  const us = ours.filter((k) => k.outcome === 'goal').length;
  const them = theirs.filter((k) => k.outcome === 'goal').length;
  const cup = match.next.competition === 'league' ? null : CUPS[match.next.competition];
  const keeperKit = showing?.side === 1 ? match.setup.teams[0].keeperColour : match.setup.teams[1].keeperColour;
  const shooterKit = showing?.side === 1 || (!showing && !ourTurn) ? match.setup.teams[1].kit : match.setup.teams[0].kit;

  return (
    <div className="ss-app ss-club-bg">
      {done && winner === 0 && <Confetti colours={[club.colour, club.colour2, '#ffd23f', '#ff4f9a']} />}
      <main className="ss-screen ss-penalties-screen" style={{ alignItems: 'center' }}>
        <h1 className="ss-headline ss-pop">Penalties!</h1>
        {cup && (
          <p className="ss-next-label" style={{ background: cup.colour, color: '#fff' }}>
            🏆 {cup.name} {CUP_STAGES[match.next.stage ?? 0]} · {drawn.score[0]}–{drawn.score[1]} after 90 minutes
          </p>
        )}

        <section className="ss-card ss-shootout-board">
          <Row name={club.shortName} kit={club.home} kicks={ours} score={us} />
          <Row name={opponent.shortName} kit={opponent.home} kicks={theirs} score={them} />
        </section>

        <div className="ss-goal-view" aria-live="polite">
          <svg viewBox="0 0 100 62" className="ss-goal-svg" aria-hidden>
            <rect x="0" y="0" width="100" height="62" fill="#4fc456" />
            <rect x="8" y="6" width="84" height="40" fill="rgba(255,255,255,0.25)" />
            {Array.from({ length: 13 }, (_, i) => (
              <line key={`v${i}`} x1={8 + i * 7} y1="6" x2={8 + i * 7} y2="46" stroke="rgba(255,255,255,0.55)" strokeWidth="0.4" />
            ))}
            {Array.from({ length: 6 }, (_, i) => (
              <line key={`h${i}`} x1="8" y1={6 + i * 8} x2="92" y2={6 + i * 8} stroke="rgba(255,255,255,0.55)" strokeWidth="0.4" />
            ))}
            <path d="M8 46 L8 6 L92 6 L92 46" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinejoin="round" />
            <line x1="0" y1="46" x2="100" y2="46" stroke="#fff" strokeWidth="0.8" />
            {/* The keeper, diving when the kick is taken. */}
            <g
              className="ss-keeper"
              style={{
                transform: showing ? `translate(${(AIM_X[showing.dive] - 50) * 0.8}px, ${showing.dive === 0 ? -4 : 6}px) rotate(${showing.dive * 70}deg)` : 'none',
                transformOrigin: '50px 40px',
              }}
            >
              <rect x="44" y="24" width="12" height="16" rx="3" fill={keeperKit} stroke="#1b1b3a" strokeWidth="1.2" />
              <circle cx="50" cy="19" r="5" fill="#e0ac85" stroke="#1b1b3a" strokeWidth="1.2" />
              <line x1="44" y1="27" x2="36" y2="20" stroke={keeperKit} strokeWidth="3.5" strokeLinecap="round" />
              <line x1="56" y1="27" x2="64" y2="20" stroke={keeperKit} strokeWidth="3.5" strokeLinecap="round" />
              <rect x="45" y="39" width="4" height="7" fill="#1b1b3a" />
              <rect x="51" y="39" width="4" height="7" fill="#1b1b3a" />
            </g>
            {/* The ball, flying at the target. */}
            <circle
              className="ss-pen-ball"
              cx={showing ? (showing.outcome === 'missed' ? AIM_X[showing.aim] + showing.aim * 20 : AIM_X[showing.aim]) : 50}
              cy={showing ? (showing.outcome === 'missed' ? 2 : showing.aim === 0 ? 22 : 16) : 57}
              r={showing ? 2.6 : 3.4}
              fill="#fff"
              stroke="#1b1b3a"
              strokeWidth="0.9"
            />
            {ourTurn && !showing && winner === null && (
              <circle cx={AIM_X[aim]} cy={aim === 0 ? 22 : 16} r="6" fill="none" stroke="#ffe600" strokeWidth="1.4" strokeDasharray="2 1.5" className="ss-aim" />
            )}
          </svg>
          {showing && (
            <p className={`ss-pen-result ss-pop ${(showing.side === 0) === (showing.outcome === 'goal') ? 'ss-pen-good' : 'ss-pen-bad'}`}>
              {showing.outcome === 'goal' ? 'GOAL!' : showing.outcome === 'saved' ? 'SAVED!' : 'MISSED!'}
            </p>
          )}
          <Shirt kit={shooterKit} size={40} />
        </div>

        {!done && !showing && ourTurn && (
          <section className="ss-card ss-pen-prompt">
            <p>
              <b>{takers.ours[ours.length % takers.ours.length]}</b> steps up… pick a corner and shoot!
            </p>
            <div className="ss-row" style={{ justifyContent: 'center' }}>
              <button type="button" className="ss-btn ss-btn-blue" onClick={() => shoot(-1)}>
                ↖ Left
              </button>
              <button type="button" className="ss-btn ss-btn-yellow" onClick={() => shoot(0)}>
                ⬆ Middle
              </button>
              <button type="button" className="ss-btn ss-btn-pink" onClick={() => shoot(1)}>
                Right ↗
              </button>
            </div>
            <p className="ss-small">Keyboard: ← ↑ → to aim, Space to shoot</p>
          </section>
        )}
        {!done && !showing && !ourTurn && (
          <section className="ss-card ss-pen-prompt">
            <p>
              You're in goal! <b>{takers.theirs[theirs.length % takers.theirs.length]}</b> is going to shoot… which way will you dive?
            </p>
            <div className="ss-row" style={{ justifyContent: 'center' }}>
              <button type="button" className="ss-btn ss-btn-blue" onClick={() => dive(-1)}>
                ← Dive left
              </button>
              <button type="button" className="ss-btn ss-btn-yellow" onClick={() => dive(0)}>
                Stay in the middle
              </button>
              <button type="button" className="ss-btn ss-btn-pink" onClick={() => dive(1)}>
                Dive right →
              </button>
            </div>
            <p className="ss-small">Keyboard: ← ↑ →</p>
          </section>
        )}
        {done && (
          <section className="ss-card ss-pen-prompt ss-pop">
            <p className="ss-rating-word">{winner === 0 ? `${club.shortName} win on penalties! 🎉` : `${opponent.shortName} win on penalties.`}</p>
            {winner === 1 && <p>So close! You were brilliant to get this far.</p>}
            <button type="button" className="ss-btn ss-btn-green ss-btn-big" onClick={() => penaltiesFinished(us, them)}>
              Carry on →
            </button>
          </section>
        )}
      </main>
    </div>
  );
}

function Row({ name, kit, kicks, score }: { name: string; kit: import('../../data/clubs').Kit; kicks: Kick[]; score: number }) {
  const slots = Math.max(5, kicks.length);
  return (
    <div className="ss-pen-row">
      <Shirt kit={kit} size={30} />
      <b className="ss-pen-name">{name}</b>
      <span className="ss-pen-dots">
        {Array.from({ length: slots }, (_, i) => {
          const k = kicks[i];
          return (
            <span key={i} className={`ss-pen-dot ${k ? (k.outcome === 'goal' ? 'ss-pen-dot-goal' : 'ss-pen-dot-miss') : ''}`}>
              {k ? (k.outcome === 'goal' ? '⚽' : '✕') : ''}
            </span>
          );
        })}
      </span>
      <b className="ss-pen-score">{score}</b>
    </div>
  );
}
