import type { Rng } from '../../../engine/rng';
import type { Kit } from '../../data/clubs';
import type { Role } from '../formation';
import type { Skills } from '../skills';

/** Side 0 is always the kid's team, attacking the right-hand goal. Side 1 is the opposition. */
export type Side = 0 | 1;

export type Difficulty = 'easy' | 'medium' | 'hard';

export type TeamPlayer = {
  name: string;
  shortName: string;
  number: number;
  skills: Skills;
  human?: boolean;
  /** For the team sheet's player cards: their real position, rating (1–100) and country. */
  position?: string;
  ability?: number;
  nationality?: string;
  age?: number;
};

export type TeamSetup = {
  clubId: string;
  name: string;
  shortName: string;
  code: string;
  kit: Kit;
  keeperColour: string;
  /** One per formation slot, goalkeeper first. */
  players: TeamPlayer[];
};

export type MatchSetup = {
  seed: number;
  /** Real seconds each half lasts. Two minutes a half makes a match about four minutes long. */
  halfSeconds: number;
  difficulty: Difficulty;
  /** Which side is the home team. Only the scoreboard and the crowd care. */
  homeSide: Side;
  teams: [TeamSetup, TeamSetup];
  /** The formation slot the kid plays in. */
  humanSlot: number;
  /** Let the computer play the kid's position too — for checking the computer players' balance. */
  autopilotKid?: boolean;
};

export type Agent = {
  id: number;
  side: Side;
  slot: number;
  role: Role;
  name: string;
  shortName: string;
  number: number;
  human: boolean;
  keeper: boolean;
  skills: Skills;
  /** Top running speed in m/s (the kid can sprint faster than this for a while). */
  maxSpeed: number;

  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Which way they face, as a unit vector. */
  fx: number;
  fy: number;

  /** Seconds before they can touch the ball again (just kicked it, or just lost it). */
  kickCd: number;
  /** Seconds before they can tackle again. */
  tackleCd: number;
  /** Seconds left off balance: can't move properly or touch the ball. */
  stun: number;
  /** Seconds left in a slide tackle (the kid's only). */
  slide: number;
  /** Seconds until an AI player on the ball decides what to do next. */
  decide: number;
  /** Seconds they've had the ball. */
  hold: number;
  /** Sprint energy, 0–1 (the kid's only). */
  energy: number;
  /** Who passed them the ball, for assists. -1 when they won it themselves. */
  receivedFrom: number;
  /** An AI dribbler's chosen direction. */
  dribbleX: number;
  dribbleY: number;
  /** Where an AI player is heading, and how keen they are (fraction of top speed). */
  tx: number;
  ty: number;
  urgency: number;
  /** Goalkeepers: how long a shot has been coming, and whether they're diving for it. */
  react: number;
  diving: boolean;
  /** For the running animation. */
  stride: number;
};

export type Ball = {
  x: number;
  y: number;
  /** Height above the grass. */
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** Who has it at their feet (or in their hands), or -1. */
  owner: number;
  /** Who touched it last, or -1. */
  last: number;
  /** A pass on its way to someone. */
  pass: { from: number; to: number } | null;
  /** A shot on its way to goal. */
  shot: { by: number } | null;
  /** Radians the ball has rolled through, for drawing it spin. */
  spin: number;
  inNet: boolean;
};

export type Phase = 'kickoff' | 'play' | 'restart' | 'goal' | 'halftime' | 'fulltime';

export type RestartKind = 'kickoff' | 'throw-in' | 'corner' | 'goal-kick';

export type Restart = { kind: RestartKind; side: Side; x: number; y: number; taker: number };

export type EventKind =
  | 'kickoff'
  | 'goal'
  | 'own-goal'
  | 'save'
  | 'miss'
  | 'woodwork'
  | 'blocked'
  | 'tackle'
  | 'interception'
  | 'corner'
  | 'half-time'
  | 'full-time';

export type MatchEvent = {
  seq: number;
  minute: number;
  kind: EventKind;
  side: Side;
  /** The main player involved (scorer, keeper, tackler…), or -1. */
  agent: number;
  /** A second player (the assist, the shooter who was saved, the player tackled), or -1. */
  other: number;
};

export type PlayerStats = {
  touches: number;
  passes: number;
  passesDone: number;
  keyPasses: number;
  shots: number;
  onTarget: number;
  goals: number;
  assists: number;
  tackles: number;
  tacklesWon: number;
  interceptions: number;
  dispossessed: number;
  saves: number;
};

export function emptyStats(): PlayerStats {
  return {
    touches: 0,
    passes: 0,
    passesDone: 0,
    keyPasses: 0,
    shots: 0,
    onTarget: 0,
    goals: 0,
    assists: 0,
    tackles: 0,
    tacklesWon: 0,
    interceptions: 0,
    dispossessed: 0,
    saves: 0,
  };
}

/** What the kid is pressing this frame. Held buttons, not presses: the engine spots the presses. */
export type Input = {
  /** Direction, each -1…1. Up on screen is -y. */
  x: number;
  y: number;
  sprint: boolean;
  pass: boolean;
  shoot: boolean;
};

export const NO_INPUT: Input = { x: 0, y: 0, sprint: false, pass: false, shoot: false };

export type MatchState = {
  setup: MatchSetup;
  rng: Rng;
  frame: number;
  /** Seconds played in the current half. */
  clock: number;
  half: 1 | 2;
  phase: Phase;
  /** Seconds left of a pause (goal, half time) or before a restart is taken. */
  phaseTime: number;
  score: [number, number];
  agents: Agent[];
  humanId: number;
  ball: Ball;
  restart: Restart | null;
  /** Seconds after a restart during which the other team hangs back instead of charging in. */
  grace: number;
  /** Which side each loose-ball chaser is (-1: nobody), refreshed a few times a second. */
  chasers: [number, number];
  events: MatchEvent[];
  seq: number;
  stats: PlayerStats[];
  /** Seconds each side has had the ball. */
  possession: [number, number];

  /** Buttons held last frame, to spot new presses. */
  prevPass: boolean;
  prevShoot: boolean;
  /** Seconds the shoot button has been held on the ball, or -1 when not charging a shot. */
  charge: number;
  /** Seconds left on the kid's shout for the ball. */
  calling: number;
  /** Seconds since the kid last touched the ball. */
  sinceTouch: number;
};

/** The kid's frame, in one line. */
export const human = (s: MatchState): Agent => s.agents[s.humanId];
