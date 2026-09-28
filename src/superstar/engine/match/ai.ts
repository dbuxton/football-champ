import { FORMATION } from '../formation';
import {
  BOX_DEPTH,
  GOAL_HALF,
  LENGTH,
  MID_Y,
  WIDTH,
  attackGoalX,
  attackSign,
  clamp,
  dist,
  inOwnBox,
  ownGoalX,
} from '../pitch';
import { crossTo, keeperDistribute, passTo, passValue, pressureOn, shoot, smartAim } from './actions';
import { goalAngle, interceptPoint, nearestOf, nextDecision, possessionSide, predictBall, slotToWorld } from './core';
import { planDefence } from './defend';
import {
  DIFFICULTY,
  DRIBBLE_SLOWDOWN,
  GRAVITY,
  RUN_BEYOND,
  RUN_GOAL_MARGIN,
  RUN_RATE,
  RUN_TIME,
  SHOOT_RANGE,
  SHOOT_RANGE_SKILL,
  keeperAbility,
} from './tuning';
import type { Agent, MatchState, Side } from './types';

/**
 * The computer-controlled players: where each one runs, and what they do with the ball.
 *
 * Deliberately simple rules, because simple rules read as football from a distance: keep your
 * place in the team's shape, which slides up and across with the ball; the nearest player chases
 * a loose ball; without the ball, defend as a team (see `defend.ts`: meet the attack, chase back,
 * mark, hold the line); with it, forwards make runs in behind to be passed into; on the ball,
 * shoot if it's on, pass if someone's better placed, run at goal otherwise. The kid's teammates
 * love giving the kid the ball.
 */

/** Pick who chases a loose ball on each side: whoever can get there first. */
export function updateChasers(s: MatchState): void {
  s.chasers = [-1, -1];
  const ball = s.ball;
  if (ball.owner >= 0 || ball.inNet) return;
  const soon = predictBall(ball, 0.35);
  for (const side of [0, 1] as Side[]) {
    let best = -1;
    let bestT = Infinity;
    let humanT = Infinity;
    for (const a of s.agents) {
      if (a.side !== side || a.stun > 0.25) continue;
      if (a.keeper && !inOwnBox(side, soon.x, soon.y)) continue;
      const t = dist(a.x, a.y, soon.x, soon.y) / a.maxSpeed;
      if (a.human) {
        humanT = t;
        continue;
      }
      if (t < bestT) {
        bestT = t;
        best = a.id;
      }
    }
    // A ball right by the kid is the kid's: teammates don't run over and nick it.
    if (side === 0 && humanT < 1.1 && humanT < bestT * 0.8) best = -1;
    s.chasers[side] = best;
  }
}

/**
 * Where a player stands in the team's shape, given where the ball is. `lineDepth` (metres from
 * their own goal) is where the back four line up while the other team has the ball.
 */
function shapeTarget(s: MatchState, a: Agent, lineDepth: number | null = null): { x: number; y: number } {
  const slot = FORMATION[a.slot];
  const ball = s.ball;
  const bx = a.side === 0 ? ball.x / LENGTH : 1 - ball.x / LENGTH;
  const by = a.side === 0 ? ball.y / WIDTH : 1 - ball.y / WIDTH;
  const poss = possessionSide(s);
  const attacking = poss === a.side;
  const defending = poss !== -1 && !attacking;

  let x = slot.x + (bx - 0.45) * 0.55 + (attacking ? 0.1 : defending ? -0.03 : 0);
  let y = slot.y + (by - 0.5) * (attacking ? 0.22 : 0.4);

  switch (slot.role) {
    case 'CB':
    case 'RB':
    case 'LB':
      x = clamp(x + (attacking && slot.role !== 'CB' ? 0.05 : 0), 0.06, attacking ? 0.6 : 0.5);
      // Defending, hold the line, and never let the ball get between you and your own goal.
      if (defending && lineDepth !== null) x = lineDepth / LENGTH;
      if (defending) x = Math.min(x, Math.max(0.05, bx - 0.02));
      break;
    case 'RM':
    case 'LM':
    case 'CM':
      x = clamp(x, 0.14, 0.8);
      if (defending) x = Math.min(x, bx + 0.08);
      break;
    case 'ST':
      // Attacking, stay ahead of the ball to be passed to — but not camped on the keeper's toes.
      x = clamp(x, 0.32, 0.84);
      if (attacking) x = Math.max(x, Math.min(bx + 0.05, 0.82));
      break;
    default:
      break;
  }
  y = clamp(y, 0.05, 0.95);
  return slotToWorld(a.side, x, y);
}

/** Positions in and around the box when a corner is about to be taken. */
function cornerTarget(s: MatchState, a: Agent): { x: number; y: number } | null {
  const restart = s.restart;
  if (!restart || restart.kind !== 'corner' || s.phase !== 'restart') return null;
  const attacking = a.side === restart.side;
  const goalX = attackGoalX(restart.side);
  const sign = attackSign(restart.side);
  // Spread along the six-yard box and penalty spot, fixed per slot so nobody bunches up.
  const spots: Record<number, [number, number]> = attacking
    ? { 9: [7, -3], 10: [9, 4], 2: [11, -6], 3: [8, 7], 6: [13, 0], 7: [19, -4] }
    : { 2: [4, -2], 3: [4, 3], 6: [7, -5], 7: [7, 5], 1: [10, -8], 4: [10, 8], 9: [12, 0], 5: [2, -3.2], 8: [2, 3.2] };
  const spot = spots[a.slot];
  if (!spot) return null;
  return { x: goalX - sign * spot[0], y: MID_Y + spot[1] };
}

/** Decide where every computer player off the ball is heading, and how fast. */
export function planRuns(s: MatchState, dt: number): void {
  const ball = s.ball;
  const owner = ball.owner >= 0 ? s.agents[ball.owner] : null;

  // Who the play is about: whoever has the ball, or whoever a pass is on its way to (defenders
  // pick up the receiver while the ball is still travelling, not once it has arrived).
  const focus = owner ?? (ball.pass ? s.agents[ball.pass.to] : null);
  // The team without the ball defends as a unit.
  const defence = focus && s.grace <= 0 ? planDefence(s, focus) : null;

  for (const a of s.agents) {
    if (a.human || a.id === ball.owner) continue;
    // A run in behind ends when the team loses the ball.
    if (!focus || a.side !== focus.side) a.run = 0;
    if (a.keeper) {
      keeperThink(s, a, dt);
      continue;
    }
    const corner = cornerTarget(s, a);
    if (corner) {
      a.tx = corner.x;
      a.ty = corner.y;
      a.urgency = 0.8;
      continue;
    }
    if (s.phase === 'play' && ball.owner < 0 && s.chasers[a.side] === a.id) {
      const p = interceptPoint(ball, a);
      a.tx = p.x;
      a.ty = p.y;
      a.urgency = 1;
      continue;
    }
    if (ball.pass && ball.pass.to === a.id) {
      const p = interceptPoint(ball, a);
      a.tx = p.x;
      a.ty = p.y;
      a.urgency = 1;
      continue;
    }
    const job = focus && a.side !== focus.side ? defence?.jobs.get(a.id) : undefined;
    if (job) {
      a.tx = job.x;
      a.ty = job.y;
      a.urgency = job.urgency;
      continue;
    }
    if (focus && a.side === focus.side && makeRun(s, a, focus, dt)) continue;
    const spot = shapeTarget(s, a, focus && a.side !== focus.side && defence ? defence.lineDepth : null);
    // Give the kid a bit of room: teammates don't park right on top of them.
    if (a.side === 0) {
      const h = s.agents[s.humanId];
      const d = dist(spot.x, spot.y, h.x, h.y);
      if (d < 6 && d > 0.01) {
        spot.x += ((spot.x - h.x) / d) * (6 - d);
        spot.y += ((spot.y - h.y) / d) * (6 - d);
      }
    }
    a.tx = spot.x;
    a.ty = spot.y;
    const far = dist(a.x, a.y, spot.x, spot.y);
    a.urgency = far > 10 ? 0.85 : 0.6;
  }
}

/**
 * Forwards and wide players make runs in behind the defence when a teammate has the ball and
 * time to look up: a short burst to just beyond the last defender, for a pass into space.
 * Returns whether `a` is on a run.
 */
function makeRun(s: MatchState, a: Agent, owner: Agent, dt: number): boolean {
  if (a.role !== 'ST' && a.role !== 'RM' && a.role !== 'LM') {
    a.run = 0;
    return false;
  }
  const gx = attackGoalX(a.side);
  if (a.run <= 0) {
    const time = !owner.keeper && owner.hold > 0.2 && pressureOn(s, owner) > 3;
    const inRange = Math.abs(gx - a.x) < 50 && (a.x - owner.x) * attackSign(a.side) > -5;
    if (!time || !inRange || !s.rng.chance(RUN_RATE * dt)) return false;
    a.run = RUN_TIME;
  }
  a.run -= dt;
  // Just beyond the deepest outfield defender, but not onto the goal line.
  let deepest = Infinity;
  for (const o of s.agents) if (o.side !== a.side && !o.keeper) deepest = Math.min(deepest, Math.abs(gx - o.x));
  const fromGoal = Math.max(RUN_GOAL_MARGIN, Math.min(deepest - RUN_BEYOND, Math.abs(gx - a.x) - 3));
  a.tx = gx - attackSign(a.side) * fromGoal;
  a.ty = clamp(a.y + (MID_Y - a.y) * 0.25, 4, WIDTH - 4);
  a.urgency = 1;
  return true;
}

/** A computer player with the ball: shoot, pass, cross or run with it. */
export function ownerThink(s: MatchState, a: Agent, dt: number): void {
  a.hold += dt;
  if (a.keeper) {
    a.tx = a.x;
    a.ty = a.y;
    a.urgency = 0;
    if (a.hold > 1.1) keeperDistribute(s, a);
    return;
  }

  a.decide -= dt;
  const kidCalling = a.side === 0 && s.calling > 0 && a.hold > 0.2;
  if (a.decide > 0 && !kidCalling) {
    runWithBall(a);
    return;
  }
  nextDecision(s, a);

  const gx = attackGoalX(a.side);
  const toGoal = dist(a.x, a.y, gx, MID_Y);
  const pressure = pressureOn(s, a);
  const kid = s.agents[s.humanId];

  // The kid shouted for it: give it to them if the pass isn't hopeless.
  if (kidCalling && passValue(s, a, kid) > -1) {
    passTo(s, a, kid);
    return;
  }

  // Shoot?
  const range = SHOOT_RANGE + SHOOT_RANGE_SKILL * a.skills.shooting;
  if (toGoal < range) {
    const angle = goalAngle(a.side, a.x, a.y);
    let chance = (1 - toGoal / range) * 0.85 * Math.min(1, angle / 0.3) + (toGoal < 11 ? 0.35 : 0);
    // The kid's teammates look up first if the kid is better placed.
    if (a.side === 0 && dist(kid.x, kid.y, gx, MID_Y) < toGoal - 3 && pressureOn(s, kid) > 3) chance *= 0.4;
    if (s.rng.chance(chance)) {
      const y = s.rng.chance(0.7) ? smartAim(s, a, s.rng.float(1.6, 3)) : MID_Y + s.rng.float(-2.8, 2.8);
      shoot(s, a, { y, height: s.rng.float(0.25, 1.9), power: s.rng.float(0.65, 1) });
      return;
    }
  }

  // Pass?
  let best: Agent | null = null;
  let bestValue = -Infinity;
  for (const t of s.agents) {
    if (t.side !== a.side || t.id === a.id) continue;
    const value = passValue(s, a, t);
    if (value > bestValue) {
      bestValue = value;
      best = t;
    }
  }
  const keepGoing = 1.3 + (pressure > 5 ? 1 : 0) - a.hold * 0.45;
  const mustPass = pressure < 2.2 || a.hold > 3.5;
  if (best && (bestValue > keepGoing || (mustPass && bestValue > -1.5))) {
    passTo(s, a, best);
    return;
  }

  // Out wide near the byline: whip it into the box.
  if (Math.abs(gx - a.x) < 20 && Math.abs(a.y - MID_Y) > 13 && s.rng.chance(0.6)) {
    const sign = attackSign(a.side);
    let tx = gx - sign * s.rng.float(6, 12);
    let ty = MID_Y + s.rng.float(-6, 6);
    if (a.side === 0 && Math.abs(gx - kid.x) < BOX_DEPTH && Math.abs(kid.y - MID_Y) < 16) {
      tx = kid.x + sign * 1;
      ty = kid.y;
    }
    crossTo(s, a, tx, ty);
    return;
  }

  chooseDribble(s, a);
  runWithBall(a);
}

/** Pick a direction to run with the ball: towards goal, veering round anyone in the way. */
function chooseDribble(s: MatchState, a: Agent): void {
  const sign = attackSign(a.side);
  const gx = attackGoalX(a.side);
  const toGoal = Math.abs(gx - a.x);
  const aimY = toGoal < 25 ? MID_Y : clamp(a.y, MID_Y - 18, MID_Y + 18);
  let dx: number = sign;
  let dy = (aimY - a.y) / Math.max(10, toGoal);
  for (const o of s.agents) {
    if (o.side === a.side) continue;
    const rx = a.x - o.x;
    const ry = a.y - o.y;
    const d = Math.hypot(rx, ry);
    if (d > 7 || d < 0.01) continue;
    const ahead = (-rx * dx - ry * dy) / d;
    if (ahead < -0.2) continue;
    const push = ((7 - d) / 7) * 1.6;
    dx += (rx / d) * push;
    dy += (ry / d) * push;
  }
  if (a.y < 4) dy += 0.8;
  if (a.y > WIDTH - 4) dy -= 0.8;
  // Never dribble back towards your own goal just to dodge someone.
  if (dx * sign < -0.2) dx = -0.2 * sign;
  const len = Math.hypot(dx, dy) || 1;
  a.dribbleX = dx / len;
  a.dribbleY = dy / len;
}

function runWithBall(a: Agent): void {
  a.tx = clamp(a.x + a.dribbleX * 5, 0.5, LENGTH - 0.5);
  a.ty = clamp(a.y + a.dribbleY * 5, 0.5, WIDTH - 0.5);
  a.urgency = DRIBBLE_SLOWDOWN;
}

/** A goalkeeper without the ball: dive at shots, come out to close down, otherwise hold position. */
function keeperThink(s: MatchState, k: Agent, dt: number): void {
  const ball = s.ball;
  const goalX = ownGoalX(k.side);
  const out = attackSign(k.side);
  const factor = k.side === 1 ? DIFFICULTY[s.setup.difficulty].keeperFactor : 1;
  const ability = keeperAbility(k.skills.keeping, factor);
  k.diving = false;

  // A shot, or any fast ball, coming at goal.
  if (ball.owner < 0 && !ball.inNet && ball.vx * out < -5) {
    const tc = (k.x - ball.x) / ball.vx;
    if (tc > 0 && tc < 1.6) {
      const py = ball.y + ball.vy * tc;
      const pz = ball.z + ball.vz * tc - 0.5 * GRAVITY * tc * tc;
      if (Math.abs(py - MID_Y) < GOAL_HALF + 2.2 && pz < 3.4) {
        k.react += dt;
        if (k.react >= ability.reaction) {
          k.diving = true;
          k.tx = k.x;
          k.ty = clamp(py, MID_Y - GOAL_HALF - 1, MID_Y + GOAL_HALF + 1);
          k.urgency = -1;
        } else {
          k.tx = k.x;
          k.ty = k.y;
          k.urgency = 0;
        }
        return;
      }
    }
  }
  k.react = 0;

  if (s.phase === 'play' && ball.owner < 0 && s.chasers[k.side] === k.id) {
    const p = interceptPoint(ball, k);
    k.tx = p.x;
    k.ty = p.y;
    k.urgency = 1;
    return;
  }

  // One on one: come out and make the goal look small.
  const owner = ball.owner >= 0 ? s.agents[ball.owner] : null;
  if (owner && owner.side !== k.side) {
    const d = dist(owner.x, owner.y, goalX, MID_Y);
    if (d < 15 && Math.abs(owner.y - MID_Y) < 12 && nearestOf(s, k.side, owner.x, owner.y, k.id).d > 2.5) {
      const come = Math.min(6, d * 0.45);
      k.tx = goalX + ((owner.x - goalX) / d) * come;
      k.ty = MID_Y + ((owner.y - MID_Y) / d) * come;
      k.urgency = 0.95;
      return;
    }
  }

  // Stand on the line between the ball and the middle of the goal.
  const bd = dist(ball.x, ball.y, goalX, MID_Y);
  const depth = clamp(0.8 + bd * 0.06, 0.8, 4.5);
  const ux = bd > 0.1 ? (ball.x - goalX) / bd : out;
  const uy = bd > 0.1 ? (ball.y - MID_Y) / bd : 0;
  k.tx = goalX + ux * depth;
  k.ty = clamp(MID_Y + uy * depth, MID_Y - GOAL_HALF + 0.4, MID_Y + GOAL_HALF - 0.4);
  k.tx = out > 0 ? Math.max(k.tx, goalX + 0.4) : Math.min(k.tx, goalX - 0.4);
  k.urgency = 0.75;
}
