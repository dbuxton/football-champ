import { isClubId } from '../data/clubs';
import { BADGES, type BadgeId } from '../engine/badges';
import { STARTING_AGE, STARTING_ATTRIBUTES, type Career, type Look, type MatchRecord, type Stint } from '../engine/career';
import { CUP_STAGES, type CupRun } from '../engine/cup';
import { PLAYER_POSITIONS, type PlayerPosition } from '../engine/formation';
import type { Difficulty } from '../engine/match/types';
import type { Result } from '../engine/season';
import { ATTRIBUTE_KEYS, type Attributes } from '../engine/skills';

/**
 * Superstar's save: every player made on this computer, in the browser's local storage under its
 * own key (the management game's saves are left alone).
 *
 * Whatever comes out of storage passes through `sanitizeSave`, which never throws, fixes anything
 * out of range and keeps fields it doesn't recognise (in case a newer version wrote them). A save
 * that can't be read at all is copied aside to `<key>.corrupt` before the game starts afresh, so a
 * grown-up can still rescue it.
 */

export const SAVE_KEY = 'superstar.save.v1';
export const SAVE_VERSION = 1;

export type SaveFile = { version: number; careers: Career[]; activeId: string | null };

export function emptySave(): SaveFile {
  return { version: SAVE_VERSION, careers: [], activeId: null };
}

type Loose = Record<string, unknown>;
const isObject = (v: unknown): v is Loose => typeof v === 'object' && v !== null && !Array.isArray(v);

function int(v: unknown, min: number, max: number, fallback: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback;
  return Math.min(Math.max(Math.round(v), min), max);
}

function num(v: unknown, min: number, max: number, fallback: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback;
  return Math.min(Math.max(v, min), max);
}

function str(v: unknown, fallback: string, max = 40): string {
  return typeof v === 'string' && v.trim().length > 0 ? v.slice(0, max) : fallback;
}

const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];
const HAIR_STYLES: Look['hairStyle'][] = ['short', 'long', 'curly', 'bun', 'buzz', 'spiky'];
const HEX = /^#[0-9a-fA-F]{6}$/;
const colour = (v: unknown, fallback: string) => (typeof v === 'string' && HEX.test(v) ? v : fallback);

function look(v: unknown): Look {
  const o = isObject(v) ? v : {};
  return {
    skin: colour(o.skin, '#e0ac85'),
    hair: colour(o.hair, '#4a2c16'),
    hairStyle: HAIR_STYLES.includes(o.hairStyle as Look['hairStyle']) ? (o.hairStyle as Look['hairStyle']) : 'short',
    boots: colour(o.boots, '#ff4f9a'),
  };
}

function attributes(v: unknown, position: PlayerPosition): Attributes {
  const o = isObject(v) ? v : {};
  const base = STARTING_ATTRIBUTES[position];
  const out = { ...base };
  for (const key of ATTRIBUTE_KEYS) out[key] = int(o[key], 1, 99, base[key]);
  return out;
}

function matchRecord(v: unknown): MatchRecord | null {
  if (!isObject(v) || !isClubId(v.clubId) || !isClubId(v.opponentId)) return null;
  const competition = v.competition === 'fa-cup' || v.competition === 'efl-cup' ? v.competition : 'league';
  const penalties = Array.isArray(v.penalties) && v.penalties.length === 2 ? ([int(v.penalties[0], 0, 99, 0), int(v.penalties[1], 0, 99, 0)] as [number, number]) : undefined;
  return {
    ...v,
    season: int(v.season, 1, 999, 1),
    round: int(v.round, 0, 99, 1),
    competition,
    ...(penalties ? { penalties } : {}),
    clubId: v.clubId,
    opponentId: v.opponentId,
    home: v.home !== false,
    goalsFor: int(v.goalsFor, 0, 99, 0),
    goalsAgainst: int(v.goalsAgainst, 0, 99, 0),
    rating: num(v.rating, 4, 10, 6),
    goals: int(v.goals, 0, 99, 0),
    assists: int(v.assists, 0, 99, 0),
    shots: int(v.shots, 0, 999, 0),
    passes: int(v.passes, 0, 999, 0),
    tackles: int(v.tackles, 0, 999, 0),
  } as MatchRecord;
}

function stint(v: unknown): Stint | null {
  if (!isObject(v) || !isClubId(v.clubId)) return null;
  return {
    ...v,
    clubId: v.clubId,
    season: int(v.season, 1, 999, 1),
    round: int(v.round, 1, 99, 1),
    how: v.how === 'up' || v.how === 'down' ? v.how : 'start',
    matches: int(v.matches, 0, 100_000, 0),
    goals: int(v.goals, 0, 100_000, 0),
    assists: int(v.assists, 0, 100_000, 0),
    ratingTotal: num(v.ratingTotal, 0, 1_000_000, 0),
  } as Stint;
}

function results(v: unknown): Record<string, Result> {
  const out: Record<string, Result> = {};
  if (!isObject(v)) return out;
  for (const [key, r] of Object.entries(v)) {
    if (!isObject(r) || !isClubId(r.home) || !isClubId(r.away)) continue;
    const scorers = Array.isArray(r.scorers)
      ? r.scorers.filter((s): s is Result['scorers'][number] => isObject(s) && typeof s.name === 'string' && isClubId(s.clubId))
      : [];
    out[key] = { home: r.home, away: r.away, hg: int(r.hg, 0, 99, 0), ag: int(r.ag, 0, 99, 0), scorers };
  }
  return out;
}

function cup(v: unknown): CupRun | null {
  if (!isObject(v) || (v.cup !== 'fa-cup' && v.cup !== 'efl-cup')) return null;
  const opponents = Array.isArray(v.opponents) ? v.opponents.filter(isClubId) : [];
  if (opponents.length < CUP_STAGES.length) return null;
  const ties = Array.isArray(v.ties)
    ? v.ties.filter(isObject).map((t) => ({
        opponentId: isClubId(t.opponentId) ? t.opponentId : opponents[0],
        goalsFor: int(t.goalsFor, 0, 99, 0),
        goalsAgainst: int(t.goalsAgainst, 0, 99, 0),
        penalties: Array.isArray(t.penalties) ? ([int(t.penalties[0], 0, 99, 0), int(t.penalties[1], 0, 99, 0)] as [number, number]) : null,
        won: t.won === true,
      }))
    : [];
  return { cup: v.cup, opponents: opponents.slice(0, CUP_STAGES.length), ties: ties.slice(0, CUP_STAGES.length), over: v.over === true };
}

export function sanitizeCareer(v: unknown): Career | null {
  if (!isObject(v) || !isClubId(v.clubId)) return null;
  const position = PLAYER_POSITIONS.includes(v.position as PlayerPosition) ? (v.position as PlayerPosition) : 'striker';
  const matches = Array.isArray(v.matches) ? v.matches.map(matchRecord).filter((m): m is MatchRecord => m !== null) : [];
  let stints = Array.isArray(v.stints) ? v.stints.map(stint).filter((s): s is Stint => s !== null) : [];
  if (stints.length === 0 || stints[stints.length - 1].clubId !== v.clubId) {
    stints = [...stints, { clubId: v.clubId, season: 1, round: 1, how: 'start', matches: 0, goals: 0, assists: 0, ratingTotal: 0 }];
  }
  const badges: Career['badges'] = {};
  if (isObject(v.badges)) {
    for (const [id, season] of Object.entries(v.badges)) if (id in BADGES) badges[id as BadgeId] = int(season, 1, 999, 1);
  }
  const pending =
    isObject(v.pending) && (v.pending.kind === 'up' || v.pending.kind === 'down') && Array.isArray(v.pending.offers)
      ? { kind: v.pending.kind, offers: v.pending.offers.filter(isClubId), form: num(v.pending.form, 0, 10, 6) }
      : null;
  const reputation: Record<string, number> = {};
  if (isObject(v.world) && isObject(v.world.reputation)) {
    for (const [id, shift] of Object.entries(v.world.reputation)) if (isClubId(id)) reputation[id] = num(shift, -50, 50, 0);
  }
  return {
    ...v,
    id: str(v.id, `player_${Math.random().toString(36).slice(2, 8)}`),
    name: str(v.name, 'Player', 16),
    number: int(v.number, 1, 99, 7),
    age: int(v.age, 10, 60, STARTING_AGE),
    world: { reputation },
    position,
    look: look(v.look),
    attributes: attributes(v.attributes, position),
    points: int(v.points, 0, 100_000, 0),
    difficulty: DIFFICULTIES.includes(v.difficulty as Difficulty) ? (v.difficulty as Difficulty) : 'easy',
    halfMinutes: num(v.halfMinutes, 0.1, 5, 2),
    sound: v.sound !== false,
    clubId: v.clubId,
    season: int(v.season, 1, 999, 1),
    round: int(v.round, 1, 20, 1),
    seasonSeed: int(v.seasonSeed, 0, 2 ** 32 - 1, 1),
    results: results(v.results),
    cup: cup(v.cup),
    matches,
    stints,
    seasons: Array.isArray(v.seasons) ? v.seasons.filter(isObject).map((s) => s as unknown as Career['seasons'][number]) : [],
    trophies: Array.isArray(v.trophies) ? v.trophies.filter((t) => isObject(t) && isClubId(t.clubId)).map((t) => t as unknown as Career['trophies'][number]) : [],
    badges,
    pending: pending && pending.offers.length > 0 ? pending : null,
    createdAt: str(v.createdAt, new Date().toISOString().slice(0, 10)),
  } as Career;
}

export function sanitizeSave(v: unknown): SaveFile {
  if (!isObject(v)) return emptySave();
  const seen = new Set<string>();
  const careers: Career[] = [];
  for (const raw of Array.isArray(v.careers) ? v.careers : []) {
    const career = sanitizeCareer(raw);
    if (!career) continue;
    if (seen.has(career.id)) {
      const base = career.id;
      for (let n = careers.length; seen.has(career.id); n++) career.id = `${base}_${n}`;
    }
    seen.add(career.id);
    careers.push(career);
  }
  const activeId = careers.some((c) => c.id === v.activeId) ? (v.activeId as string) : null;
  return { ...v, version: SAVE_VERSION, careers, activeId };
}

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function loadSave(): SaveFile {
  const store = storage();
  let raw: string | null = null;
  try {
    raw = store?.getItem(SAVE_KEY) ?? null;
  } catch {
    return emptySave();
  }
  if (raw === null) return emptySave();
  try {
    return sanitizeSave(JSON.parse(raw));
  } catch {
    try {
      if (store && store.getItem(`${SAVE_KEY}.corrupt`) === null) store.setItem(`${SAVE_KEY}.corrupt`, raw);
    } catch {
      // Nowhere to keep a copy either; carry on.
    }
    return emptySave();
  }
}

export function writeSave(save: SaveFile): void {
  try {
    storage()?.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    // Full or switched-off storage: keep playing, just unsaved.
  }
}
