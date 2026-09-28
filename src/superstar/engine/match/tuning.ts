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
};

export const DIFFICULTY: Record<Difficulty, DifficultyTuning> = {
  easy: {
    opponentSkill: -0.12,
    humanSpeedBonus: 0.4,
    humanControlBonus: 0.2,
    tackleRateOnHuman: 2.1,
    humanProtection: 0.72,
    humanTackleBonus: 0.18,
    passToHuman: 2.1,
    keeperFactor: 0.85,
  },
  medium: {
    opponentSkill: -0.06,
    humanSpeedBonus: 0.25,
    humanControlBonus: 0.12,
    tackleRateOnHuman: 2.6,
    humanProtection: 0.85,
    humanTackleBonus: 0.12,
    passToHuman: 1.7,
    keeperFactor: 0.9,
  },
  hard: {
    opponentSkill: 0.03,
    humanSpeedBonus: 0,
    humanControlBonus: 0,
    tackleRateOnHuman: 3.2,
    humanProtection: 1,
    humanTackleBonus: 0.04,
    passToHuman: 1.1,
    keeperFactor: 1,
  },
};

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
