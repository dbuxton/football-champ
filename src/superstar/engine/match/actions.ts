import { LENGTH, MID_Y, WIDTH, attackGoalX, attackSign, clamp, dist, distToSegment } from '../pitch';
import { kick } from './core';
import {
  DIFFICULTY,
  GRAVITY,
  KID_CALL_BONUS,
  KID_PASS_ARRIVE,
  KID_FORGOTTEN,
  KID_FORGOTTEN_MAX,
  KID_FORGOTTEN_RATE,
  LEAD_ARRIVE,
  LEAD_FORWARD,
  LEAD_LANE_RISK,
  LEAD_MARGIN,
  LEAD_MAX,
  LEAD_REACTION,
  ROLL_DECEL,
  passSpeed,
} from './tuning';
import type { Agent, MatchState } from './types';

/**
 * The things a player can do with the ball: pass, shoot, cross, head it. Used by the AI and by
 * the kid's buttons alike, so the kid's passes obey the same physics as everyone else's.
 */

/** Seconds a ground pass takes to go `d` metres, arriving at `arrive` m/s (see `passSpeed`). */
function passTime(d: number, arrive: number): number {
  return (passSpeed(d, arrive) - arrive) / ROLL_DECEL;
}

/**
 * Where to play a pass to `t`: into the space in front of them if they're running towards goal,
 * so they run onto it, or to their feet if they're standing still or running anywhere else.
 *
 * The ideal spot is where the runner will be when the ball gets there. For a computer player
 * it's only used if they can get there before any opponent and the ball has a clear path;
 * otherwise the pass comes back towards them until it's safe, or just in front of them.
 *
 * The kid is different: a person keeps running where they're running, so a pass anywhere short
 * of where they'll be ends up behind them. The kid always gets it where they'll be, whichever way
 * they're going (a defender may nick it, but it's never played behind them).
 */
export function leadPoint(s: MatchState, a: Agent, t: Agent): { x: number; y: number } {
  const speed = Math.hypot(t.vx, t.vy);
  if (speed < 2) return { x: t.x, y: t.y };
  const ux = t.vx / speed;
  const uy = t.vy / speed;
  // A computer player is only played into space on a run towards goal; otherwise to feet.
  if (!t.human && ux * attackSign(t.side) < LEAD_FORWARD) return { x: t.x, y: t.y };
  const arrive = passArrival(t);
  const at = (lead: number) => ({
    x: clamp(t.x + ux * lead, 1, LENGTH - 1),
    y: clamp(t.y + uy * lead, 1, WIDTH - 1),
  });
  // Where the runner will be when the ball arrives.
  let ideal = 0;
  while (ideal < LEAD_MAX) {
    const p = at(ideal + 0.5);
    if ((ideal + 0.5) / speed > passTime(dist(a.x, a.y, p.x, p.y), arrive)) break;
    ideal += 0.5;
  }
  if (t.human) return at(ideal);
  // The furthest ahead of that which is safe.
  for (let lead = ideal; lead >= 1.5; lead -= 0.5) {
    const p = at(lead);
    if (Math.abs(p.x - t.x - ux * lead) > 0.3 || Math.abs(p.y - t.y - uy * lead) > 0.3) continue; // off the pitch
    const runner = lead / speed;
    const ball = passTime(dist(a.x, a.y, p.x, p.y), arrive);
    let theirs = Infinity;
    for (const o of s.agents) {
      if (o.side === a.side) continue;
      theirs = Math.min(theirs, dist(o.x, o.y, p.x, p.y) / o.maxSpeed + LEAD_REACTION);
    }
    if (theirs > Math.max(runner, ball) + LEAD_MARGIN && laneRisk(s, a, p.x, p.y) < LEAD_LANE_RISK) return p;
  }
  return at(Math.min(ideal, 1.5));
}

/** How fast a pass to `t` should still be rolling when it gets to them. */
function passArrival(t: Agent): number {
  return t.human ? KID_PASS_ARRIVE : LEAD_ARRIVE;
}

/** Pass to a teammate: into the space in front of them if they're running (see `leadPoint`). */
export function passTo(s: MatchState, a: Agent, t: Agent, opts: { lob?: boolean } = {}): void {
  const { x: tx, y: ty } = leadPoint(s, a, t);
  const led = dist(tx, ty, t.x, t.y) > 1;
  const td = dist(a.x, a.y, tx, ty);
  const error = (1 - a.skills.passing) * (a.human ? 4 : 6) + (a.human ? 0.5 : 0.8);

  if (opts.lob || td > 32) {
    const speed = clamp(8 + td * 0.42, 11, 24);
    const flight = td / speed;
    kick(s, a, tx, ty, speed, Math.min(12, (GRAVITY * flight) / 2), error);
  } else {
    // A pass into space is weighted to slow down as the runner gets to it.
    kick(s, a, tx, ty, led || t.human ? passSpeed(td, passArrival(t)) : passSpeed(td), 0, error);
  }
  s.ball.pass = { from: a.id, to: t.id };
  s.stats[a.id].passes += 1;
}

export type ShotAim = {
  /** Where across the goal to aim. */
  y: number;
  /** How high the ball should be as it crosses the line. */
  height: number;
  /** 0–1: a tap to a full-power strike. */
  power: number;
};

/** Shoot at the goal the player's team attacks. */
export function shoot(s: MatchState, a: Agent, aim: ShotAim): void {
  const gx = attackGoalX(a.side) + attackSign(a.side) * 0.4;
  const speed = 15 + 16 * aim.power;
  const d = dist(a.x, a.y, gx, aim.y);
  const flight = d / speed;
  const vz = clamp((aim.height + 0.5 * GRAVITY * flight * flight) / flight, 0, 14);
  const pressure = pressureOn(s, a);
  const error =
    (1 - a.skills.shooting) * (a.human ? 4.5 : 7) + (a.human ? 1 : 2) + (pressure < 2 ? 2 : 0) + aim.power * 1.2;
  kick(s, a, gx, aim.y, speed, vz, error);
  s.ball.shot = { by: a.id };
  s.stats[a.id].shots += 1;
  if (a.receivedFrom >= 0 && s.agents[a.receivedFrom].side === a.side) s.stats[a.receivedFrom].keyPasses += 1;
}

/** Distance to the nearest opponent. */
export function pressureOn(s: MatchState, a: Agent): number {
  let best = Infinity;
  for (const o of s.agents) {
    if (o.side === a.side) continue;
    best = Math.min(best, dist(a.x, a.y, o.x, o.y));
  }
  return best;
}

/** Aim for the side of the goal the keeper isn't covering. */
export function smartAim(s: MatchState, a: Agent, offset = 2.3): number {
  const keeper = s.agents.find((o) => o.side !== a.side && o.keeper);
  const keeperY = keeper ? keeper.y : MID_Y;
  const side = keeperY > MID_Y ? -1 : keeperY < MID_Y ? 1 : s.rng.chance(0.5) ? 1 : -1;
  return MID_Y + side * offset;
}

/** A lofted ball into an area — corners, and wingers crossing. */
export function crossTo(s: MatchState, a: Agent, tx: number, ty: number): void {
  const d = dist(a.x, a.y, tx, ty);
  const speed = clamp(10 + d * 0.3, 13, 20);
  const flight = d / speed;
  const vz = clamp((1.4 + 0.5 * GRAVITY * flight * flight) / flight, 3, 11);
  kick(s, a, tx, ty, speed, vz, (1 - a.skills.passing) * 5 + 1.5);
  s.stats[a.id].passes += 1;
}

/**
 * A header. Near goal it's a header at goal; anywhere else it's knocked on towards a teammate or
 * cleared away from danger.
 */
export function header(s: MatchState, a: Agent): void {
  const ball = s.ball;
  const gx = attackGoalX(a.side);
  const toGoal = Math.abs(gx - a.x);
  if (toGoal < 15 && Math.abs(a.y - MID_Y) < 14) {
    const y = MID_Y + (s.rng.chance(0.5) ? 1 : -1) * s.rng.float(1, 3);
    const previous = ball.last;
    kick(s, a, gx, y, 12 + 5 * a.skills.shooting, 0.8, (1 - a.skills.shooting) * 7 + 2.5);
    s.ball.shot = { by: a.id };
    s.stats[a.id].shots += 1;
    s.stats[a.id].touches += 1;
    // A header from a teammate's cross counts as their assist if it goes in.
    a.receivedFrom = previous >= 0 && s.agents[previous].side === a.side && previous !== a.id ? previous : -1;
    if (a.receivedFrom >= 0) s.stats[a.receivedFrom].keyPasses += 1;
    if (a.human) s.sinceTouch = 0;
    return;
  }
  // Knock it on or away: upfield, back into the middle.
  const sign = attackSign(a.side);
  const tx = clamp(a.x + sign * s.rng.float(10, 18), 2, LENGTH - 2);
  const ty = clamp(a.y + (MID_Y - a.y) * 0.3 + s.rng.float(-6, 6), 3, WIDTH - 3);
  kick(s, a, tx, ty, 11, 3.5, 12);
  s.stats[a.id].touches += 1;
  if (a.human) s.sinceTouch = 0;
}

/** The risk that a pass from a to (tx, ty) gets cut out: grows as opponents stand near its path. */
export function laneRisk(s: MatchState, a: Agent, tx: number, ty: number): number {
  let risk = 0;
  for (const o of s.agents) {
    if (o.side === a.side) continue;
    const d = distToSegment(o.x, o.y, a.x, a.y, tx, ty);
    if (d < 2.6) risk += 2.6 - d;
  }
  return risk;
}

/**
 * How good a pass to `t` looks for an AI player: forward, open and safe is good. The kid's
 * teammates look for the kid a little more than anyone else, a lot more when the kid is calling
 * for it, and more if the kid hasn't had a kick for a while.
 */
export function passValue(s: MatchState, a: Agent, t: Agent): number {
  const d = dist(a.x, a.y, t.x, t.y);
  if (d < 4.5 || d > 40) return -Infinity;
  // Judge the pass by where it will go: a through ball into space is worth more than the spot
  // the runner has just left.
  const p = leadPoint(s, a, t);
  const sign = attackSign(a.side);
  const progress = (p.x - a.x) * sign;
  let open = 10;
  for (const o of s.agents) {
    if (o.side === a.side) continue;
    open = Math.min(open, dist(p.x, p.y, o.x, o.y));
  }
  let value = progress * 0.08 + Math.min(open, 8) * 0.32 - laneRisk(s, a, p.x, p.y) * 1.3;
  if (d > 26) value -= (d - 26) * 0.12;
  if (t.keeper) value -= 3;
  const toGoal = Math.abs(attackGoalX(a.side) - p.x);
  if (toGoal < 20 && Math.abs(p.y - MID_Y) < 16) value += 0.8;
  if (t.human && !a.human) {
    const tuning = DIFFICULTY[s.setup.difficulty];
    const forgotten = Math.min(KID_FORGOTTEN_MAX, Math.max(0, s.sinceTouch - KID_FORGOTTEN) * KID_FORGOTTEN_RATE);
    value += tuning.passToHuman + forgotten + (s.calling > 0 ? KID_CALL_BONUS : 0);
  }
  return value;
}

/**
 * The teammate the kid means when they press pass: whoever is best placed in the direction
 * they're pushing (or facing), preferring open players not too far away.
 */
export function humanPassTarget(s: MatchState, a: Agent, dx: number, dy: number): Agent | null {
  const len = Math.hypot(dx, dy);
  const ux = len > 0.2 ? dx / len : a.fx;
  const uy = len > 0.2 ? dy / len : a.fy;
  let best: Agent | null = null;
  let bestScore = -Infinity;
  for (const t of s.agents) {
    if (t.side !== a.side || t.id === a.id) continue;
    const tx = t.x - a.x;
    const ty = t.y - a.y;
    const d = Math.hypot(tx, ty);
    if (d < 2) continue;
    const cos = (tx * ux + ty * uy) / d;
    const angle = Math.acos(clamp(cos, -1, 1));
    if (angle > 1.35) continue;
    let open = 10;
    for (const o of s.agents) if (o.side !== a.side) open = Math.min(open, dist(t.x, t.y, o.x, o.y));
    // A teammate already running the way the kid is pushing is the one they mean.
    const running = Math.max(0, t.vx * ux + t.vy * uy);
    const score =
      -angle * 2.6 - Math.max(0, d - 12) * 0.05 - (d > 40 ? 3 : 0) + Math.min(open, 6) * 0.15 - (t.keeper ? 2 : 0) + running * 0.06;
    if (score > bestScore) {
      bestScore = score;
      best = t;
    }
  }
  return best;
}

/** A keeper with the ball in their hands finds an open teammate, or kicks it long. */
export function keeperDistribute(s: MatchState, k: Agent): void {
  let best: Agent | null = null;
  let bestValue = -Infinity;
  for (const t of s.agents) {
    if (t.side !== k.side || t.id === k.id) continue;
    const d = dist(k.x, k.y, t.x, t.y);
    if (d < 8 || d > 45) continue;
    let open = 10;
    for (const o of s.agents) if (o.side !== k.side) open = Math.min(open, dist(t.x, t.y, o.x, o.y));
    const value = Math.min(open, 9) - laneRisk(s, k, t.x, t.y) * 1.5 + (t.human ? DIFFICULTY[s.setup.difficulty].passToHuman * 0.6 : 0);
    if (value > bestValue) {
      bestValue = value;
      best = t;
    }
  }
  if (best && bestValue > 3) {
    passTo(s, k, best, { lob: dist(k.x, k.y, best.x, best.y) > 25 });
    return;
  }
  // Nobody open close by: a big kick up the pitch.
  const sign = attackSign(k.side);
  crossTo(s, k, clamp(k.x + sign * s.rng.float(35, 50), 5, LENGTH - 5), s.rng.float(15, WIDTH - 15));
}
