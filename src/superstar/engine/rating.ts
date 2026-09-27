import type { PlayerPosition } from './formation';
import type { PlayerStats } from './match/types';

/**
 * Your match rating, out of 10, the way the old management games gave one: 6 to 7 is an ordinary
 * game, 7 to 8 a good one, 8 and up very good, 9 and up something special.
 *
 * It's worked out from what you did — goals, assists, shots on target, passes, tackles — with each
 * position judged on its own job: a defender's tackles count for more than a striker's, and a
 * defender who scores gets a big bonus. Winning helps a little, losing costs a little. It never
 * drops below 4: every kid who turns up and tries gets something.
 */

export type RatingInput = {
  stats: PlayerStats;
  position: PlayerPosition;
  goalsFor: number;
  goalsAgainst: number;
};

type Weights = { goal: number; assist: number; tackle: number; interception: number; pass: number; cleanSheet: number };

const WEIGHTS: Record<PlayerPosition, Weights> = {
  striker: { goal: 0.85, assist: 0.6, tackle: 0.1, interception: 0.08, pass: 0.025, cleanSheet: 0 },
  winger: { goal: 0.85, assist: 0.65, tackle: 0.12, interception: 0.1, pass: 0.03, cleanSheet: 0 },
  midfielder: { goal: 0.95, assist: 0.7, tackle: 0.18, interception: 0.14, pass: 0.035, cleanSheet: 0.2 },
  defender: { goal: 1.1, assist: 0.7, tackle: 0.25, interception: 0.18, pass: 0.03, cleanSheet: 0.5 },
};

export const MIN_RATING = 4;
export const MAX_RATING = 10;

export function matchRating({ stats, position, goalsFor, goalsAgainst }: RatingInput): number {
  const w = WEIGHTS[position];
  let rating = 5.5;

  // Goals: the first counts fully, later ones a bit less (a hat-trick is still huge).
  for (let n = 0; n < stats.goals; n++) rating += w.goal * (n === 0 ? 1 : 0.88);
  rating += stats.assists * w.assist;
  rating += Math.max(0, stats.onTarget - stats.goals) * 0.1;
  rating += stats.keyPasses * 0.1;

  rating += Math.min(stats.passesDone * w.pass, 0.6);
  rating -= Math.min(Math.max(0, stats.passes - stats.passesDone) * 0.06, 0.6);
  rating += Math.min(stats.tacklesWon * w.tackle, 1.2);
  rating += Math.min(stats.interceptions * w.interception, 0.7);
  rating -= Math.min(stats.dispossessed * 0.08, 0.6);

  // Hardly touching the ball is a quiet game.
  if (stats.touches < 5) rating -= 0.4;
  else if (stats.touches < 10) rating -= 0.15;

  if (goalsFor > goalsAgainst) rating += 0.3;
  else if (goalsFor < goalsAgainst) rating -= 0.3;
  if (goalsAgainst === 0) rating += w.cleanSheet;
  if (position === 'defender') rating -= Math.min(Math.max(0, goalsAgainst - 1) * 0.15, 0.6);

  return Math.round(Math.min(MAX_RATING, Math.max(MIN_RATING, rating)) * 10) / 10;
}

/** A word to go with a rating, for the full-time screen. */
export function ratingWord(rating: number): string {
  if (rating >= 9.5) return 'Unbelievable!';
  if (rating >= 9) return 'World class!';
  if (rating >= 8) return 'Brilliant!';
  if (rating >= 7) return 'Really good!';
  if (rating >= 6.3) return 'Good game';
  if (rating >= 5.5) return 'Keep going';
  return 'Tough one';
}

/** A colour for a rating: from orange (never red) up through green to gold. */
export function ratingColour(rating: number): string {
  if (rating >= 9) return '#ffc400';
  if (rating >= 8) return '#2fd158';
  if (rating >= 7) return '#8bd200';
  if (rating >= 6) return '#ffd23f';
  return '#ff9f43';
}
