import { clamp } from '../pitch';
import type { Difficulty } from './types';

/**
 * Every number that decides how a match feels, in one place. The match tests play thousands of
 * simulated minutes against these, so a change that makes matches goal-less, or unwinnable, turns
 * a test red rather than a kid off.
 */

/** The simulation runs at a fixed 60 steps a second, whatever the screen does. */
export const DT = 1 / 60;
export const GRAVITY = 9.81;
/** How quickly a rolling ball slows on the grass, m/s². */
export const ROLL_DECEL = 4.2;
/** How quickly a ball in the air slows, per second. */
export const AIR_DRAG = 0.06;
/** How much of its speed a falling ball keeps when it bounces. */
export const BOUNCE = 0.45;

/** How far in front of a dribbler the ball sits. */
export const DRIBBLE_OFFSET = 0.55;
/** How close a loose ball must be to control it; a player expecting a pass reaches a bit further. */
export const CONTROL_RADIUS = 0.9;
export const RECEIVE_RADIUS = 1.2;
export const KEEPER_RADIUS = 1.35;
/** A loose ball this high is at head height. */
export const HEAD_MIN = 1.0;
export const HEAD_MAX = 2.6;
export const HEADER_RADIUS = 0.85;
/** Seconds before a player who has just kicked the ball can touch it again. */
export const KICK_COOLDOWN = 0.28;

export const ACCEL = 18;
export const HUMAN_ACCEL = 28;
export const SPRINT_BOOST = 1.22;
export const DRIBBLE_SLOWDOWN = 0.9;
/** Sprint energy used and won back per second. */
export const SPRINT_DRAIN = 0.32;
export const SPRINT_RECOVER = 0.2;

export const TACKLE_RANGE = 1.25;
export const HUMAN_TACKLE_RANGE = 1.2;
export const SLIDE_TIME = 0.38;
export const SLIDE_SPEED = 9;
export const SLIDE_REACH = 1.5;
/** Seconds getting back up after a slide. */
export const SLIDE_RECOVER = 0.4;

/** Seconds an AI player waits between decisions on the ball. */
export const DECIDE_MIN = 0.2;
export const DECIDE_MAX = 0.38;

/** How long a goal celebration and half time last. */
export const GOAL_PAUSE = 3.2;
export const HALF_TIME_PAUSE = 2.5;
/** A half runs on while an attack is under way, for up to this many seconds. */
export const ADDED_TIME = 8;

export type DifficultyTuning = {
  /** Added to every opposition player's skills (0–1 scale). */
  opponentSkill: number;
  /** Extra top speed for the kid, m/s. */
  humanSpeedBonus: number;
  /** Extra reach for the kid to pick up a loose ball, metres. */
  humanControlBonus: number;
  /** How often an opponent right next to the kid tries a tackle, per second. */
  tackleRateOnHuman: number;
  /** Scales an opponent's chance of winning the ball off the kid. */
  humanProtection: number;
  /** Added to the kid's chance of winning a tackle. */
  humanTackleBonus: number;
  /** How much the kid's teammates like passing to them. */
  passToHuman: number;
  /** Scales the opposition keeper's reach and diving speed. */
  keeperFactor: number;
  /** Extra metres an opposition marker leaves between themselves and the kid. */
  markSlack: number;
  /** Scales how far from their own goal the opposition defence steps out to meet an attack. */
  stepOut: number;
};

export const DIFFICULTY: Record<Difficulty, DifficultyTuning> = {
  easy: {
    opponentSkill: -0.1,
    humanSpeedBonus: 0.35,
    humanControlBonus: 0.17,
    tackleRateOnHuman: 1.7,
    humanProtection: 0.76,
    humanTackleBonus: 0.16,
    passToHuman: 1.95,
    keeperFactor: 0.89,
    markSlack: 3,
    stepOut: 0.7,
  },
  medium: {
    opponentSkill: -0.06,
    humanSpeedBonus: 0.25,
    humanControlBonus: 0.12,
    tackleRateOnHuman: 2.0,
    humanProtection: 0.85,
    humanTackleBonus: 0.12,
    passToHuman: 1.7,
    keeperFactor: 0.9,
    markSlack: 2,
    stepOut: 0.85,
  },
  hard: {
    opponentSkill: 0.03,
    humanSpeedBonus: 0,
    humanControlBonus: 0,
    tackleRateOnHuman: 2.2,
    humanProtection: 1,
    humanTackleBonus: 0.04,
    passToHuman: 1.1,
    keeperFactor: 1,
    markSlack: 1.5,
    stepOut: 0.9,
  },
};

// ─── Defending as a unit ──────────────────────────────────────────────────

/**
 * A defender only steps out to meet the carrier if they can get there in this many seconds;
 * further away, they'd only be chasing, so they keep their place instead.
 */
export const MEET_REACH_TIME = 2.2;
/**
 * The defender meeting the carrier reacts this many seconds late to their sideways movement: a
 * quick change of direction can get a yard on them, the way beating a defender works.
 */
export const MEET_LAG = 0.42;
/** Less against the kid, who is already quicker than the computer players. */
export const MEET_LAG_KID = 0.36;
/** How far goal-side of the ball carrier the defender stands to tackle. */
export const MEET_DISTANCE = 1.1;
/** How far ahead (seconds) a defender reads a runner's run, marking or meeting them. */
export const READ_AHEAD = 0.35;
/** A defender caught behind the ball chases back after it if they're this close… */
export const CHASE_BACK_RANGE = 12;
/** …to get back goal-side of it, this far in front (not to tackle from behind). */
export const CHASE_BACK_TO = 4;
/**
 * The defender who meets an attack is the one who can get goal-side of it soonest. Being
 * caught behind the ball counts as this many seconds slower: you can't stop someone from behind.
 */
export const BEHIND_PENALTY = 1.2;
/**
 * The back four only step out of the line to meet an attack this close to their own goal (scaled
 * by the difficulty's `stepOut` for the kid's opponents); further out, midfielders do the pressing.
 */
export const STEP_OUT_RANGE = 34;
/** Attackers this close to goal (or closer to it than the ball) get a marker. */
export const MARK_ZONE = 30;
/** Markers pick up attackers within this distance of them. */
export const MARK_REACH = 24;
/** How close a marker stands: tight in the box, looser further out. */
export const MARK_TIGHT = 2.5;
export const MARK_LOOSE = 6;
/** How keen a marker is to keep up (fraction of top speed): quick runners can lose them. */
export const MARK_URGENCY = 0.85;
/** How far a marker leans towards the ball, to cut out the pass. */
export const MARK_BALL_SIDE = 0.3;
/**
 * The back line: its distance from goal is the ball's distance minus this gap (so it steps up as
 * the ball goes away and drops as it comes on), but it holds around the edge of the box rather
 * than backing off all the way to the goal, and never pushes up further than LINE_HIGHEST.
 */
export const LINE_GAP = 10;
export const LINE_DEEPEST = 14;
export const LINE_HIGHEST = 40;

// ─── Attacking: runs and passes into space ───────────────────────────────

/** Seconds a forward's run in behind lasts, and the chance per second of starting one. */
export const RUN_TIME = 1.8;
export const RUN_RATE = 0.7;
/** How far beyond the last defender a run aims, and how close to the goal line it may go. */
export const RUN_BEYOND = 5;
export const RUN_GOAL_MARGIN = 9;
/**
 * Passes are only played into space for runs towards the goal being attacked: at least this
 * much of the run's direction must point that way (0 = sideways). Anyone else gets it to feet.
 */
export const LEAD_FORWARD = 0.2;
/** The furthest a pass is played ahead of a runner. */
export const LEAD_MAX = 13;
/** A runner must reach the ball this many seconds before any opponent for it to be safe. */
export const LEAD_MARGIN = 0.1;
/** A pass into space needs a clear path: at most this much `laneRisk`. */
export const LEAD_LANE_RISK = 1.5;
/** Opponents take this long to react to a pass. */
export const LEAD_REACTION = 0.25;
/** How fast a pass into space is still rolling when it reaches the runner, m/s. */
export const LEAD_ARRIVE = 3.2;

/** How far out a computer player will shoot from: this, plus more for a better shooter. */
export const SHOOT_RANGE = 18;
export const SHOOT_RANGE_SKILL = 12;

/** How often an AI player next to someone else on the ball tries a tackle, per second. */
export const TACKLE_RATE = 2.6;

/** A player's top speed from their pace. */
export function runSpeed(pace: number): number {
  return 6 + 2.6 * pace;
}

export function humanRunSpeed(pace: number, difficulty: Difficulty): number {
  return 6.5 + 2 * pace + DIFFICULTY[difficulty].humanSpeedBonus;
}

/** A goalkeeper's reflexes, from their keeping skill (0–1) and difficulty. */
export function keeperAbility(keeping: number, factor = 1) {
  return {
    /** Seconds before they react to a shot. */
    reaction: clamp(0.42 - 0.14 * keeping + (1 - factor) * 0.3, 0.2, 0.6),
    /** Sideways speed while diving, m/s. */
    diveSpeed: (3.2 + 2.2 * keeping) * factor,
    /** How far from their body they can reach a ball, metres. */
    reach: (0.7 + 0.4 * keeping) * factor,
  };
}

/** The speed a ground pass needs to cover `distance` and still be rolling at `arrive` m/s. */
export function passSpeed(distance: number, arrive = 4.5): number {
  return Math.sqrt(arrive * arrive + 2 * ROLL_DECEL * distance);
}
