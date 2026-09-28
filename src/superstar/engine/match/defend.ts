import { MID_Y, clamp, dist, ownGoalX } from '../pitch';
import {
  BEHIND_PENALTY,
  CHASE_BACK_RANGE,
  CHASE_BACK_TO,
  DIFFICULTY,
  LINE_DEEPEST,
  LINE_GAP,
  LINE_HIGHEST,
  MARK_BALL_SIDE,
  MARK_LOOSE,
  MARK_REACH,
  MARK_TIGHT,
  MARK_URGENCY,
  MARK_ZONE,
  MEET_DISTANCE,
  MEET_LAG,
  MEET_LAG_KID,
  MEET_REACH_TIME,
  READ_AHEAD,
  STEP_OUT_RANGE,
} from './tuning';
import type { Agent, MatchState, Side } from './types';

/**
 * Defending as a team, the way kids' coaches teach it:
 *
 *   1. Meet it. The defender who can get between the ball and the goal soonest goes to meet the
 *      player on the ball, from the goal side. Someone behind the ball can't stop it, so they're
 *      only picked if nobody is in front. They react a moment late, so a quick change of
 *      direction can get an attacker past them; running straight at them can't.
 *   2. Chase back. A player caught behind the ball, close by, sprints back to get goal-side of
 *      it again (not to tackle from behind: one tackler at a time). If nobody is behind, the
 *      next player covers a few metres goal-side of the one meeting it.
 *   3. Mark. The back four pick up attackers near goal, or further forward than the ball, one
 *      each (the most dangerous first), from the goal side, a little towards the ball, where
 *      they're running to rather than where they are. Tight in the box, looser further out.
 *      Midfielders don't man-mark: they hold their zone in the team's shape.
 *   4. Hold the line. The back four who aren't doing any of that stand in a line across the
 *      pitch, which steps up as the ball goes away and drops as it comes on.
 *
 * The kid is never given a job: they defend however they like.
 */

export type Job = { x: number; y: number; urgency: number; kind: 'meet' | 'chase' | 'cover' | 'mark' };

export type DefencePlan = {
  /** Jobs for the defending team's players, by agent id. */
  jobs: Map<number, Job>;
  /** How far the back line stands from its own goal, metres. */
  lineDepth: number;
};

const BACK_FOUR = new Set(['CB', 'RB', 'LB']);

/** Where a player will be in a moment, reading their run. */
function ahead(a: Agent): { x: number; y: number } {
  return { x: a.x + a.vx * READ_AHEAD, y: a.y + a.vy * READ_AHEAD };
}

/** A point `metres` from (x, y) towards the middle of the goal at goalX. */
function goalSide(x: number, y: number, goalX: number, metres: number): { x: number; y: number } {
  const d = dist(x, y, goalX, MID_Y) || 1;
  return { x: x + ((goalX - x) / d) * metres, y: y + ((MID_Y - y) / d) * metres };
}

export function planDefence(s: MatchState, owner: Agent): DefencePlan {
  const side: Side = owner.side === 0 ? 1 : 0;
  const goalX = ownGoalX(side);
  const tuning = DIFFICULTY[s.setup.difficulty];
  // Only the kid's opponents are softened by the difficulty.
  const stepOut = side === 1 ? tuning.stepOut : 1;
  const slack = side === 1 ? tuning.markSlack : 0;
  const jobs = new Map<number, Job>();
  const fromGoal = (x: number) => Math.abs(x - goalX);

  const ball = s.ball;
  const lineDepth = clamp(fromGoal(ball.x) - LINE_GAP, LINE_DEEPEST, LINE_HIGHEST);

  const free = s.agents.filter((a) => a.side === side && !a.keeper && !a.human && a.stun <= 0);
  const take = (a: Agent, job: Job) => {
    jobs.set(a.id, job);
    free.splice(free.indexOf(a), 1);
  };

  // 1. Meet it.
  const carrier = ahead(owner);
  // Only the sideways part of their movement is reacted to late: a defender reads a run straight
  // at them fine, and it's the change of direction that beats them.
  const lag = owner.human ? MEET_LAG_KID : MEET_LAG;
  const gd = dist(owner.x, owner.y, goalX, MID_Y) || 1;
  const gx = (goalX - owner.x) / gd;
  const gy = (MID_Y - owner.y) / gd;
  const along = owner.vx * gx + owner.vy * gy;
  const late = { x: owner.x - (owner.vx - along * gx) * lag, y: owner.y - (owner.vy - along * gy) * lag };
  const meet = goalSide(late.x, late.y, goalX, MEET_DISTANCE);
  const nearGoal = dist(owner.x, owner.y, goalX, MID_Y) < STEP_OUT_RANGE * stepOut;
  const behind = (a: Agent) => fromGoal(a.x) > fromGoal(owner.x) - 0.5;
  let meeter: Agent | null = null;
  let bestT = MEET_REACH_TIME;
  for (const a of free) {
    if (BACK_FOUR.has(a.role) && !nearGoal) continue;
    const t = dist(a.x, a.y, meet.x, meet.y) / a.maxSpeed + (behind(a) ? BEHIND_PENALTY : 0);
    if (t < bestT) {
      bestT = t;
      meeter = a;
    }
  }
  if (meeter) take(meeter, { ...meet, urgency: owner.human ? 0.92 : 0.97, kind: 'meet' });

  // 2. Chase back, or cover.
  let chaser: Agent | null = null;
  let chaseD = CHASE_BACK_RANGE;
  for (const a of free) {
    const d = dist(a.x, a.y, owner.x, owner.y);
    if (behind(a) && d < chaseD) {
      chaseD = d;
      chaser = a;
    }
  }
  if (chaser) take(chaser, { ...goalSide(carrier.x, carrier.y, goalX, CHASE_BACK_TO), urgency: 0.95, kind: 'chase' });
  else if (meeter) {
    let cover: Agent | null = null;
    let coverD = 16;
    for (const a of free) {
      const d = dist(a.x, a.y, owner.x, owner.y);
      if (d < coverD && !BACK_FOUR.has(a.role)) {
        coverD = d;
        cover = a;
      }
    }
    if (cover) take(cover, { ...goalSide(owner.x, owner.y, goalX, 5), urgency: 0.85, kind: 'cover' });
  }

  // 3. Mark: the most dangerous attackers first, each by the nearest free defender.
  const threats = s.agents
    .filter((o) => o.side === owner.side && !o.keeper && o.id !== owner.id)
    .filter((o) => fromGoal(o.x) < MARK_ZONE || fromGoal(o.x) < fromGoal(ball.x))
    .sort((p, q) => dist(p.x, p.y, goalX, MID_Y) - dist(q.x, q.y, goalX, MID_Y));
  const markers = free.filter((a) => BACK_FOUR.has(a.role));
  for (const threat of threats) {
    const q = ahead(threat);
    const toGoal = dist(q.x, q.y, goalX, MID_Y);
    const tight = MARK_TIGHT + (MARK_LOOSE - MARK_TIGHT) * clamp((toGoal - 11) / (MARK_ZONE - 11), 0, 1);
    const spot = goalSide(q.x, q.y, goalX, tight + (threat.human ? slack : 0));
    const bd = dist(q.x, q.y, ball.x, ball.y) || 1;
    spot.x += ((ball.x - q.x) / bd) * MARK_BALL_SIDE;
    spot.y += ((ball.y - q.y) / bd) * MARK_BALL_SIDE;
    let best: Agent | null = null;
    let bestD = MARK_REACH;
    for (const a of markers) {
      const d = dist(a.x, a.y, spot.x, spot.y);
      if (d < bestD) {
        bestD = d;
        best = a;
      }
    }
    if (!best) continue;
    markers.splice(markers.indexOf(best), 1);
    take(best, { ...spot, urgency: MARK_URGENCY, kind: 'mark' });
  }

  return { jobs, lineDepth };
}
