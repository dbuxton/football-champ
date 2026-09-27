/**
 * The pitch, in metres. x runs along the pitch from 0 (the left goal line) to LENGTH (the right
 * one); y runs across it from 0 (the top touchline, as drawn) to WIDTH.
 *
 * Your team always attacks the right-hand goal. Real teams swap ends at half time; a kid who has
 * just learned which way to shoot shouldn't have to learn it again at 45 minutes.
 */

export const LENGTH = 105;
export const WIDTH = 68;
export const MID_X = LENGTH / 2;
export const MID_Y = WIDTH / 2;

/** Half the width of the goal mouth, and its height. */
export const GOAL_HALF = 3.66;
export const GOAL_HEIGHT = 2.44;
/** How deep the net is behind the line. */
export const GOAL_DEPTH = 2;

export const BOX_DEPTH = 16.5;
export const BOX_HALF = 20.16;
export const SIX_DEPTH = 5.5;
export const SIX_HALF = 9.16;
export const CENTRE_RADIUS = 9.15;
export const PENALTY_SPOT = 11;

export const BALL_RADIUS = 0.11;

export type Vec = { x: number; y: number };

export const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/** The x of the goal line a side attacks. Side 0 (you) attacks the right-hand goal. */
export function attackGoalX(side: 0 | 1): number {
  return side === 0 ? LENGTH : 0;
}

/** The x of the goal line a side defends. */
export function ownGoalX(side: 0 | 1): number {
  return side === 0 ? 0 : LENGTH;
}

/** +1 when a side attacks towards larger x, -1 otherwise. */
export function attackSign(side: 0 | 1): 1 | -1 {
  return side === 0 ? 1 : -1;
}

/** Is (x, y) inside the penalty box that `side` defends? */
export function inOwnBox(side: 0 | 1, x: number, y: number): boolean {
  const fromLine = side === 0 ? x : LENGTH - x;
  return fromLine >= -1 && fromLine <= BOX_DEPTH && Math.abs(y - MID_Y) <= BOX_HALF;
}

/** Distance from a point to the segment a→b. */
export function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : clamp(((px - ax) * dx + (py - ay) * dy) / len2, 0, 1);
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
