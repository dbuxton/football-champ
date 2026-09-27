import { Rng, deriveSeed } from '../../engine/rng';
import { CLUBS } from '../data/clubs';

/**
 * The two cups. Which one you're in depends on where your club is in the league after six
 * matches: the top half go into the FA Cup, the bottom half into the EFL Cup. Each is three
 * knockout ties — quarter-final, semi-final and the final at Wembley — played between league
 * matches. A draw is settled by penalties.
 */

export type CupId = 'fa-cup' | 'efl-cup';

export const CUPS: Record<CupId, { name: string; colour: string; colour2: string }> = {
  'fa-cup': { name: 'FA Cup', colour: '#1d4ed8', colour2: '#e11d48' },
  'efl-cup': { name: 'EFL Cup', colour: '#0f9d58', colour2: '#111827' },
};

export const CUP_STAGES = ['Quarter-final', 'Semi-final', 'Final'] as const;

/** Each cup tie comes after this many league matches. */
export const CUP_AFTER = [6, 11, 16] as const;

export const FINAL_STADIUM = 'Wembley Stadium';

/** Top half of the table: the FA Cup. Bottom half: the EFL Cup. */
export function cupForPosition(position: number): CupId {
  return position <= CLUBS.length / 2 ? 'fa-cup' : 'efl-cup';
}

export type CupTie = {
  opponentId: string;
  goalsFor: number;
  goalsAgainst: number;
  /** Penalty shootout score, when the tie was a draw. */
  penalties: [number, number] | null;
  won: boolean;
};

export type CupRun = {
  cup: CupId;
  /** Opponents for the quarter-final, semi-final and final, drawn when you enter. */
  opponents: string[];
  ties: CupTie[];
  /** Knocked out, or won it. */
  over: boolean;
};

/**
 * Enter a cup: the draw pairs you with clubs from your half of the table, a different one each
 * round.
 */
export function enterCup(seed: number, season: number, position: number, clubId: string, table: readonly string[]): CupRun {
  const cup = cupForPosition(position);
  const half = CLUBS.length / 2;
  const pool = (cup === 'fa-cup' ? table.slice(0, half) : table.slice(half)).filter((id) => id !== clubId);
  const rng = new Rng(deriveSeed(seed, `cup:${season}`));
  return { cup, opponents: rng.shuffle([...pool]).slice(0, CUP_STAGES.length), ties: [], over: false };
}

/** Where the next tie is played. The final is always at Wembley. */
export function cupTieIsHome(seed: number, stage: number): boolean | 'neutral' {
  if (stage === CUP_STAGES.length - 1) return 'neutral';
  return new Rng(deriveSeed(seed, `cup-home:${stage}`)).chance(0.5);
}

/**
 * If you change clubs mid-cup, you take your cup run with you. Should your new club be one you
 * were drawn to play, someone else takes its place.
 */
export function followTransfer(run: CupRun, newClubId: string): CupRun {
  const stage = run.ties.length;
  if (!run.opponents.slice(stage).includes(newClubId)) return run;
  const spare = CLUBS.map((c) => c.id).find((id) => id !== newClubId && !run.opponents.includes(id));
  return {
    ...run,
    opponents: run.opponents.map((id, index) => (index >= stage && id === newClubId ? spare ?? id : id)),
  };
}

// ─── Penalties ──────────────────────────────────────────────────────────────

/** Left, middle or right, as the kicker sees it. */
export type Aim = -1 | 0 | 1;

export type PenaltyOutcome = 'goal' | 'saved' | 'missed';

/**
 * One penalty. Pick the same side as the keeper dives and it's probably saved; pick the other side
 * and it's probably in. Going for the corner is a touch riskier than down the middle.
 */
export function takePenalty(rng: Rng, aim: Aim, dive: Aim, shooting: number): PenaltyOutcome {
  const missChance = aim === 0 ? 0.02 : 0.09 - 0.05 * shooting;
  if (rng.chance(missChance)) return 'missed';
  if (aim === dive) return rng.chance(aim === 0 ? 0.8 : 0.65) ? 'saved' : 'goal';
  return 'goal';
}

/** The computer picks a side: usually a corner, sometimes down the middle. */
export function computerPick(rng: Rng): Aim {
  const roll = rng.next();
  return roll < 0.42 ? -1 : roll < 0.58 ? 0 : 1;
}

/** Is the shootout decided? Five each, finishing early if one side can't catch up, then sudden death. */
export function shootoutWinner(ours: PenaltyOutcome[], theirs: PenaltyOutcome[]): 0 | 1 | null {
  const us = ours.filter((k) => k === 'goal').length;
  const them = theirs.filter((k) => k === 'goal').length;
  if (ours.length <= 5 && theirs.length <= 5) {
    const leftUs = 5 - ours.length;
    const leftThem = 5 - theirs.length;
    if (us > them + leftThem) return 0;
    if (them > us + leftUs) return 1;
    if (ours.length === 5 && theirs.length === 5 && us !== them) return us > them ? 0 : 1;
    return null;
  }
  // Sudden death: after each pair of kicks.
  if (ours.length === theirs.length && us !== them) return us > them ? 0 : 1;
  return null;
}
