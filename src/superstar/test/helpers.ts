/**
 * Shared bits for the Superstar tests: a quick headless match with the robot kid at the controls,
 * and ready-made careers and match records so career tests don't have to play real football.
 */

import { newCareer, STARTING_ATTRIBUTES, type Career, type MatchRecord } from '../engine/career';
import type { PlayerPosition } from '../engine/formation';
import { lineUp } from '../engine/lineup';
import { makeBot } from '../engine/match/bot';
import { createMatch, stepMatch } from '../engine/match/sim';
import type { Difficulty, MatchState } from '../engine/match/types';

/** Enough frames for any short match, with a wide margin for added time and pauses. */
const FRAME_GUARD = 60 * 60 * 10;

export type QuickMatch = {
  seed: number;
  clubId?: string;
  opponentId?: string;
  home?: boolean;
  position?: PlayerPosition;
  difficulty?: Difficulty;
  halfSeconds?: number;
  botSkill?: number;
  botSeed?: number;
  season?: number;
};

/** Play a whole short match with the robot kid and return the final state. */
export function playMatch(opts: QuickMatch): MatchState {
  const position = opts.position ?? 'striker';
  const setup = lineUp({
    seed: opts.seed,
    clubId: opts.clubId ?? 'bha',
    opponentId: opts.opponentId ?? 'eve',
    home: opts.home ?? true,
    footballer: { name: 'Robin', number: 7, position, attributes: { ...STARTING_ATTRIBUTES[position] } },
    difficulty: opts.difficulty ?? 'medium',
    halfSeconds: opts.halfSeconds ?? 30,
    season: opts.season,
  });
  const s = createMatch(setup);
  const bot = makeBot(opts.botSkill ?? 0.5, opts.botSeed ?? opts.seed + 1);
  let guard = 0;
  while (s.phase !== 'fulltime' && guard++ < FRAME_GUARD) stepMatch(s, bot(s));
  return s;
}

export function makeCareer(overrides: Partial<Career> = {}, clubId = 'bha'): Career {
  return {
    ...newCareer({
      id: 'test',
      name: 'Robin',
      number: 7,
      position: 'striker',
      look: { skin: '#e0ac85', hair: '#4a2c16', hairStyle: 'short', boots: '#ff4f9a' },
      difficulty: 'medium',
      halfMinutes: 2,
      clubId,
      seed: 12345,
      today: '2026-09-28',
    }),
    ...overrides,
  };
}

export function record(rating: number, overrides: Partial<MatchRecord> = {}): MatchRecord {
  return {
    season: 1,
    round: 1,
    competition: 'league',
    clubId: 'bha',
    opponentId: 'eve',
    home: true,
    goalsFor: 1,
    goalsAgainst: 1,
    rating,
    goals: 0,
    assists: 0,
    shots: 0,
    passes: 0,
    tackles: 0,
    ...overrides,
  };
}

/** A career that has played these ratings at its current club (one stint). */
export function withRatings(career: Career, ratings: number[]): Career {
  const stints = [...career.stints];
  const last = stints[stints.length - 1];
  stints[stints.length - 1] = {
    ...last,
    matches: last.matches + ratings.length,
    ratingTotal: last.ratingTotal + ratings.reduce((a, b) => a + b, 0),
  };
  const matches = [...career.matches, ...ratings.map((r, i) => record(r, { clubId: career.clubId, round: career.matches.length + i + 1 }))];
  return { ...career, matches, stints };
}

let finished: MatchState | null = null;
/** One real, finished short match (played once per test file), to feed `recordMatch`. */
export function finishedMatch(): MatchState {
  finished ??= playMatch({ seed: 99, halfSeconds: 20, botSkill: 0.6 });
  return finished;
}

/** The finished match with a different final score, for cup ties and results. */
export function withScore(state: MatchState, ours: number, theirs: number): MatchState {
  return { ...state, score: [ours, theirs] };
}
