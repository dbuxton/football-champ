import { useSyncExternalStore } from 'react';
import { getClub } from '../data/clubs';
import type { BadgeId } from '../engine/badges';
import {
  moveTo,
  newCareer,
  nextMatch,
  recordMatch,
  startNextSeason,
  train as trainAttribute,
  type Career,
  type Look,
  type MatchSummary,
  type NextMatch,
  type SeasonChanges,
  type SeasonReview,
} from '../engine/career';
import type { PlayerPosition } from '../engine/formation';
import { lineUp } from '../engine/lineup';
import type { Difficulty, MatchSetup, MatchState, Side } from '../engine/match/types';
import type { Attributes } from '../engine/skills';
import type { Scene } from '../ui/match/render';
import { loadSave, writeSave, type SaveFile } from './save';

/**
 * The game's state: the save file (kept in local storage) and which screen is showing (not
 * kept: a reload always lands on the title screen, the right place on a computer several kids
 * share). A tiny store rather than a library: `useGame` subscribes a component to a slice of it.
 */

export type Screen =
  | 'title'
  | 'create'
  | 'hub'
  | 'prematch'
  | 'match'
  | 'penalties'
  | 'fulltime'
  | 'transfer'
  | 'season-end'
  | 'table'
  | 'training'
  | 'career';

export type GoalLine = { minute: number; name: string; side: Side; kid: boolean };

/** Everything the full-time screen shows. */
export type LastMatch = {
  summary: MatchSummary;
  next: NextMatch;
  score: [number, number];
  goals: GoalLine[];
  penalties: [number, number] | null;
};

export type GameState = {
  save: SaveFile;
  screen: Screen;
  match: { setup: MatchSetup; scene: Scene; next: NextMatch } | null;
  /** A drawn cup tie, waiting for its penalty shootout. */
  drawn: MatchState | null;
  last: LastMatch | null;
  review: SeasonReview | null;
  /** What's new for the season just starting. */
  changes: SeasonChanges | null;
  /** Badges just earned, to celebrate. */
  fresh: BadgeId[];
  /** Where a transfer took you, for the welcome screen. */
  movedTo: string | null;
};

let state: GameState = {
  save: loadSave(),
  screen: 'title',
  match: null,
  drawn: null,
  last: null,
  review: null,
  changes: null,
  fresh: [],
  movedTo: null,
};
const listeners = new Set<() => void>();

function set(patch: Partial<GameState>): void {
  const saveChanged = patch.save !== undefined && patch.save !== state.save;
  state = { ...state, ...patch };
  if (saveChanged) writeSave(state.save);
  for (const listener of listeners) listener();
}

export function getState(): GameState {
  return state;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useGame<T>(selector: (s: GameState) => T): T {
  return useSyncExternalStore(subscribe, () => selector(state));
}

export function activeCareer(s: GameState): Career | null {
  return s.save.careers.find((c) => c.id === s.save.activeId) ?? null;
}

function updateCareer(update: (career: Career) => Career): void {
  const career = activeCareer(state);
  if (!career) return;
  const next = update(career);
  if (next === career) return;
  set({ save: { ...state.save, careers: state.save.careers.map((c) => (c.id === career.id ? next : c)) } });
}

const today = () => new Date().toISOString().slice(0, 10);
const randomSeed = () => Math.floor(Math.random() * 2 ** 31);

// ─── Players ────────────────────────────────────────────────────────────────

export function createCareer(opts: {
  name: string;
  number: number;
  position: PlayerPosition;
  look: Look;
  difficulty: Difficulty;
  halfMinutes: number;
  clubId: string;
}): void {
  const career = newCareer({
    ...opts,
    id: `player_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    seed: randomSeed(),
    today: today(),
  });
  set({
    save: { ...state.save, careers: [...state.save.careers, career], activeId: career.id },
    screen: 'hub',
    last: null,
    review: null,
    fresh: [],
  });
}

export function selectCareer(id: string): void {
  if (!state.save.careers.some((c) => c.id === id)) return;
  const career = state.save.careers.find((c) => c.id === id)!;
  set({ save: { ...state.save, activeId: id }, screen: career.pending ? 'transfer' : 'hub', last: null, review: null, fresh: [], movedTo: null });
}

export function deleteCareer(id: string): void {
  set({
    save: {
      ...state.save,
      careers: state.save.careers.filter((c) => c.id !== id),
      activeId: state.save.activeId === id ? null : state.save.activeId,
    },
    screen: 'title',
  });
}

export function toTitle(): void {
  set({ screen: 'title', match: null, drawn: null, save: { ...state.save, activeId: null } });
}

export function goTo(screen: Screen): void {
  set({ screen });
}

// ─── Matches ────────────────────────────────────────────────────────────────

/** Line up the next match and show the teams. */
export function prepareMatch(): void {
  const career = activeCareer(state);
  const next = career && nextMatch(career);
  if (!career || !next) return;
  const setup = lineUp({
    seed: randomSeed(),
    clubId: career.clubId,
    opponentId: next.opponentId,
    home: next.home !== false,
    footballer: { name: career.name, number: career.number, position: career.position, attributes: career.attributes },
    difficulty: career.difficulty,
    halfSeconds: career.halfMinutes * 60,
    season: career.season,
  });
  const ours = getClub(career.clubId);
  const theirs = getClub(next.opponentId);
  const homeClub = next.home === false ? theirs : ours;
  const scene: Scene = {
    kits: [setup.teams[0].kit, setup.teams[1].kit],
    keeperColours: [setup.teams[0].keeperColour, setup.teams[1].keeperColour],
    // At Wembley both sets of fans fill the stands.
    crowd: next.home === 'neutral' ? [ours.colour, theirs.colour] : [homeClub.colour, homeClub.colour2],
    kidLook: career.look,
    kidLabel: career.name,
  };
  set({ match: { setup, scene, next }, screen: 'prematch', drawn: null, last: null, fresh: [] });
}

export function kickOff(): void {
  if (state.match) set({ screen: 'match' });
}

export function quitMatch(): void {
  set({ match: null, drawn: null, screen: 'hub' });
}

/** The final whistle. A drawn cup tie goes to penalties first. */
export function matchFinished(finished: MatchState): void {
  const match = state.match;
  if (!match) return;
  if (match.next.competition !== 'league' && finished.score[0] === finished.score[1]) {
    set({ drawn: finished, screen: 'penalties' });
    return;
  }
  finishRecord(finished, null);
}

export function penaltiesFinished(ours: number, theirs: number): void {
  if (state.drawn) finishRecord(state.drawn, [ours, theirs]);
}

function finishRecord(finished: MatchState, penalties: [number, number] | null): void {
  const career = activeCareer(state);
  const match = state.match;
  if (!career || !match) return;
  const { career: updated, summary } = recordMatch(career, finished, penalties);
  const goals: GoalLine[] = finished.events
    .filter((e) => e.kind === 'goal' || e.kind === 'own-goal')
    .map((e) => ({
      minute: e.minute,
      side: e.side,
      kid: e.kind === 'goal' && e.agent === finished.humanId,
      name: e.kind === 'own-goal' ? 'Own goal' : e.agent === finished.humanId ? career.name : finished.agents[e.agent].shortName,
    }));
  set({
    save: { ...state.save, careers: state.save.careers.map((c) => (c.id === career.id ? updated : c)) },
    last: { summary, next: match.next, score: [finished.score[0], finished.score[1]], goals, penalties },
    fresh: summary.badges,
    match: null,
    drawn: null,
    screen: 'fulltime',
  });
}

/** Carry on from full time: a transfer to decide, the end of the season, or back to the club. */
export function afterMatch(): void {
  const career = activeCareer(state);
  if (!career) return;
  if (career.pending) {
    set({ screen: 'transfer', movedTo: null });
    return;
  }
  if (nextMatch(career) === null) {
    endSeason();
    return;
  }
  set({ screen: 'hub' });
}

export function chooseTransfer(clubId: string | null): void {
  const career = activeCareer(state);
  if (!career) return;
  const { career: moved, badges } = moveTo(career, clubId);
  if (moved === career) return;
  updateCareer(() => moved);
  set({ fresh: badges, movedTo: clubId });
}

/** After the welcome to a new club (or staying put). */
export function afterTransfer(): void {
  const career = activeCareer(state);
  if (!career) return;
  set({ movedTo: null });
  if (nextMatch(career) === null) endSeason();
  else set({ screen: 'hub' });
}

function endSeason(): void {
  const career = activeCareer(state);
  if (!career) return;
  const { career: next, review, changes, badges } = startNextSeason(career, randomSeed());
  updateCareer(() => next);
  set({ review, changes, fresh: badges, screen: 'season-end' });
}

// ─── Settings and training ──────────────────────────────────────────────────

export function train(key: keyof Attributes): void {
  updateCareer((career) => trainAttribute(career, key));
}

export function toggleSound(): void {
  updateCareer((career) => ({ ...career, sound: !career.sound }));
}

export function setDifficulty(difficulty: Difficulty): void {
  updateCareer((career) => ({ ...career, difficulty }));
}

export function setHalfMinutes(halfMinutes: number): void {
  updateCareer((career) => ({ ...career, halfMinutes }));
}
