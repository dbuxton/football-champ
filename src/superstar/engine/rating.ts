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
 *
 * Matches can be 3, 4 or 6 minutes long, and a longer match has more of everything in it. So the
 * things you do are counted per standard match (`STANDARD_HALF_SECONDS`): two goals in a 3-minute
 * match are worth more than two in a 6-minute one. Without this, just picking longer matches would
 * get you transferred to a bigger club.
 */

export type RatingInput = {
  stats: PlayerStats;
  position: PlayerPosition;
  goalsFor: number;
  goalsAgainst: number;
  /** How long each half lasted, in real seconds. Leave out for a standard-length match. */
  halfSeconds?: number;
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

/** The match length ratings are judged against: 2-minute halves, the length a new player starts with. */
export const STANDARD_HALF_SECONDS = 120;
/** Very short or very long matches are only scaled so far (12-second test matches, say). */
const LENGTH_SCALE_MIN = 0.5;
const LENGTH_SCALE_MAX = 2;

/** What to multiply a match's counts by to turn them into counts per standard-length match. */
export function lengthScale(halfSeconds: number = STANDARD_HALF_SECONDS): number {
  if (!(halfSeconds > 0)) return 1;
  return Math.min(LENGTH_SCALE_MAX, Math.max(LENGTH_SCALE_MIN, STANDARD_HALF_SECONDS / halfSeconds));
}

export function matchRating({ stats, position, goalsFor, goalsAgainst, halfSeconds }: RatingInput): number {
  const w = WEIGHTS[position];
  const per = lengthScale(halfSeconds);
  let rating = 5.5;

  // Goals: the first counts fully, later ones a bit less (a hat-trick is still huge).
  for (let n = 0; n < stats.goals; n++) rating += w.goal * (n === 0 ? 1 : 0.88) * per;
  rating += stats.assists * w.assist * per;
  rating += Math.max(0, stats.onTarget - stats.goals) * 0.1 * per;
  rating += stats.keyPasses * 0.1 * per;

  rating += Math.min(stats.passesDone * w.pass * per, 0.6);
  rating -= Math.min(Math.max(0, stats.passes - stats.passesDone) * 0.06 * per, 0.6);
  rating += Math.min(stats.tacklesWon * w.tackle * per, 1.2);
  rating += Math.min(stats.interceptions * w.interception * per, 0.7);
  rating -= Math.min(stats.dispossessed * 0.08 * per, 0.6);

  // Hardly touching the ball is a quiet game.
  const touches = stats.touches * per;
  if (touches < 5) rating -= 0.4;
  else if (touches < 10) rating -= 0.15;

  if (goalsFor > goalsAgainst) rating += 0.3;
  else if (goalsFor < goalsAgainst) rating -= 0.3;
  if (goalsAgainst === 0) rating += w.cleanSheet;
  if (position === 'defender') rating -= Math.min(Math.max(0, goalsAgainst * per - 1) * 0.15, 0.6);

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
