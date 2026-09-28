import { LENGTH, MID_Y, WIDTH, clamp, dist } from '../pitch';
import {
  AIR_DRAG,
  DECIDE_MAX,
  DECIDE_MIN,
  FIRST_TOUCH_MAX,
  FIRST_TOUCH_MIN,
  GRAVITY,
  KICK_COOLDOWN,
  ROLL_DECEL,
} from './tuning';
import type { Agent, Ball, EventKind, MatchState, Side } from './types';

/**
 * The small things everything else in the match leans on: the clock, the event log, kicking the
 * ball and taking control of it, and guessing where a moving ball is going.
 */

/** The match minute on the scoreboard. Stoppage time shows as 45 or 90. */
export function minuteOf(s: MatchState): number {
  const played = Math.min(45, Math.floor((s.clock / s.setup.halfSeconds) * 45));
  return s.half === 1 ? played : 45 + played;
}

export function record(s: MatchState, kind: EventKind, side: Side, agent = -1, other = -1): void {
  s.seq += 1;
  s.events.push({ seq: s.seq, minute: minuteOf(s), kind, side, agent, other });
}

export function ballSpeed(ball: Ball): number {
  return Math.hypot(ball.vx, ball.vy);
}

/**
 * Kick the ball towards (tx, ty) at `speed`, rising at `vz`, knocked off line by a random error
 * of about `errorDeg` degrees. The kicker can't touch it again for a moment.
 */
export function kick(s: MatchState, a: Agent, tx: number, ty: number, speed: number, vz: number, errorDeg: number): void {
  const ball = s.ball;
  const angle = Math.atan2(ty - ball.y, tx - ball.x) + (s.rng.gaussian(0, 1) * errorDeg * Math.PI) / 180;
  ball.vx = Math.cos(angle) * speed;
  ball.vy = Math.sin(angle) * speed;
  ball.vz = vz;
  ball.z = Math.max(ball.z, 0.05);
  ball.owner = -1;
  ball.last = a.id;
  ball.pass = null;
  ball.shot = null;
  a.kickCd = KICK_COOLDOWN;
  a.hold = 0;
  if (a.human) s.charge = -1;
}

/** Give `a` the ball: a pass received, a tackle won, a loose ball picked up or a save held. */
export function giveBall(s: MatchState, a: Agent): void {
  const ball = s.ball;
  const pass = ball.pass;
  const previous = ball.last >= 0 ? s.agents[ball.last] : null;

  ball.owner = a.id;
  ball.last = a.id;
  ball.pass = null;
  ball.shot = null;
  ball.z = 0;
  ball.vz = 0;
  a.hold = 0;
  a.decide = s.rng.float(FIRST_TOUCH_MIN, FIRST_TOUCH_MAX);
  s.stats[a.id].touches += 1;
  if (a.human) s.sinceTouch = 0;

  if (pass) {
    const passer = s.agents[pass.from];
    if (passer.side === a.side && passer.id !== a.id) {
      s.stats[passer.id].passesDone += 1;
      a.receivedFrom = passer.id;
    } else {
      a.receivedFrom = -1;
      if (passer.side !== a.side) {
        s.stats[a.id].interceptions += 1;
        record(s, 'interception', a.side, a.id, passer.id);
      }
    }
  } else if (!previous || previous.side !== a.side || previous.id !== a.id) {
    // Won it back, or picked up a loose ball: nobody set this one up.
    a.receivedFrom = -1;
  }
}

/** Where the ball will be after `t` seconds, ignoring anyone getting in the way. */
export function predictBall(ball: Ball, t: number): { x: number; y: number; z: number } {
  if (ball.owner >= 0) return { x: ball.x, y: ball.y, z: 0 };
  const speed = Math.hypot(ball.vx, ball.vy);
  const airborne = ball.z > 0.05 || ball.vz > 0.5;
  let travel: number;
  let z = 0;
  if (airborne) {
    // Roughly: it flies, then rolls once it lands.
    const land = (ball.vz + Math.sqrt(ball.vz * ball.vz + 2 * GRAVITY * Math.max(ball.z, 0))) / GRAVITY;
    if (t <= land) {
      travel = speed * t * (1 - AIR_DRAG * t * 0.5);
      z = Math.max(0, ball.z + ball.vz * t - 0.5 * GRAVITY * t * t);
    } else {
      const landSpeed = speed * 0.8;
      const rollT = Math.min(t - land, landSpeed / ROLL_DECEL);
      travel = speed * land + landSpeed * rollT - 0.5 * ROLL_DECEL * rollT * rollT;
    }
  } else {
    const stopT = speed / ROLL_DECEL;
    const tt = Math.min(t, stopT);
    travel = speed * tt - 0.5 * ROLL_DECEL * tt * tt;
  }
  const dx = speed > 0 ? ball.vx / speed : 0;
  const dy = speed > 0 ? ball.vy / speed : 0;
  return { x: clamp(ball.x + dx * travel, -2, LENGTH + 2), y: clamp(ball.y + dy * travel, -2, WIDTH + 2), z };
}

/**
 * The earliest point on the ball's path that `a` can get to in time, or where it stops rolling.
 */
export function interceptPoint(ball: Ball, a: Agent, speed = a.maxSpeed): { x: number; y: number } {
  if (ball.owner >= 0) return { x: ball.x, y: ball.y };
  for (let t = 0.1; t <= 3; t += 0.1) {
    const p = predictBall(ball, t);
    if (dist(a.x, a.y, p.x, p.y) / speed <= t) return p;
  }
  return predictBall(ball, 3);
}

/** Distance from (x, y) to the nearest player of `side`, leaving out `except`. */
export function nearestOf(s: MatchState, side: Side, x: number, y: number, except = -1): { agent: Agent | null; d: number } {
  let best: Agent | null = null;
  let bestD = Infinity;
  for (const a of s.agents) {
    if (a.side !== side || a.id === except) continue;
    const d = dist(a.x, a.y, x, y);
    if (d < bestD) {
      bestD = d;
      best = a;
    }
  }
  return { agent: best, d: bestD };
}

/** The side that has the ball, or the side that touched it last while it's loose. */
export function possessionSide(s: MatchState): Side | -1 {
  const id = s.ball.owner >= 0 ? s.ball.owner : s.ball.last;
  return id >= 0 ? s.agents[id].side : -1;
}

/** The world position of a formation slot for a side (slots are written attacking right). */
export function slotToWorld(side: Side, x: number, y: number): { x: number; y: number } {
  return side === 0 ? { x: x * LENGTH, y: y * WIDTH } : { x: (1 - x) * LENGTH, y: (1 - y) * WIDTH };
}

/** Set a fresh wait before an AI player's next decision on the ball. */
export function nextDecision(s: MatchState, a: Agent): void {
  a.decide = s.rng.float(DECIDE_MIN, DECIDE_MAX);
}

/** How wide the goal looks from (x, y), in radians. Narrow from out wide or far away. */
export function goalAngle(side: Side, x: number, y: number): number {
  const gx = side === 0 ? LENGTH : 0;
  const a1 = Math.atan2(MID_Y - 3.66 - y, gx - x);
  const a2 = Math.atan2(MID_Y + 3.66 - y, gx - x);
  let diff = Math.abs(a1 - a2);
  if (diff > Math.PI) diff = 2 * Math.PI - diff;
  return diff;
}
