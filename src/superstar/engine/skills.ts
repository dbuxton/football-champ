import type { Position } from '../data/squads';
import { clamp } from './pitch';

/**
 * How good a footballer is at each thing the match engine asks of them, from 0 (hopeless) to 1
 * (the best in the league).
 */
export type Skills = {
  pace: number;
  passing: number;
  shooting: number;
  dribbling: number;
  tackling: number;
  keeping: number;
  /** How long you can sprint for. Only the kid's player uses it. */
  stamina: number;
};

/** The kid's own player: six numbers from 1 to 99, shown on their player card. */
export type Attributes = {
  pace: number;
  shooting: number;
  passing: number;
  dribbling: number;
  tackling: number;
  stamina: number;
};

export const ATTRIBUTE_KEYS: readonly (keyof Attributes)[] = ['pace', 'shooting', 'passing', 'dribbling', 'tackling', 'stamina'];

type Group = 'GK' | 'DEF' | 'MID' | 'ATT';

function groupOf(position: Position): Group {
  if (position === 'GK') return 'GK';
  if (['DL', 'DC', 'DR', 'WBL', 'WBR'].includes(position)) return 'DEF';
  if (['ST', 'AML', 'AMC', 'AMR'].includes(position)) return 'ATT';
  return 'MID';
}

/** What each kind of player is better and worse at than their overall ability. */
const LEAN: Record<Group, Omit<Skills, 'keeping' | 'stamina'>> = {
  GK: { pace: -0.25, passing: -0.1, shooting: -0.5, dribbling: -0.4, tackling: -0.3 },
  DEF: { pace: -0.02, passing: -0.04, shooting: -0.25, dribbling: -0.15, tackling: 0.14 },
  MID: { pace: 0, passing: 0.12, shooting: -0.04, dribbling: 0.04, tackling: -0.02 },
  ATT: { pace: 0.06, passing: 0, shooting: 0.14, dribbling: 0.1, tackling: -0.25 },
};

/** A small, stable wobble per player, so two 80-rated strikers aren't identical. */
function wobble(name: string, salt: number): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (((h >>> 0) % 1000) / 1000 - 0.5) * 0.12;
}

/** Skills for a real player from their 1–100 ability and position. */
export function skillsFor(name: string, position: Position, ability: number): Skills {
  const base = (ability - 45) / 50;
  const group = groupOf(position);
  const lean = LEAN[group];
  const skill = (key: keyof typeof lean, salt: number) => clamp(base + lean[key] + wobble(name, salt), 0.03, 1);
  return {
    pace: skill('pace', 1),
    passing: skill('passing', 2),
    shooting: skill('shooting', 3),
    dribbling: skill('dribbling', 4),
    tackling: skill('tackling', 5),
    keeping: group === 'GK' ? clamp(base + 0.05 + wobble(name, 6), 0.05, 1) : 0.05,
    stamina: 0.6,
  };
}

/** The kid's attributes (1–99) as skills. 60 is about an average Premier League player. */
export function skillsFromAttributes(attributes: Attributes): Skills {
  const scale = (v: number) => clamp((v - 25) / 65, 0.03, 1);
  return {
    pace: scale(attributes.pace),
    passing: scale(attributes.passing),
    shooting: scale(attributes.shooting),
    dribbling: scale(attributes.dribbling),
    tackling: scale(attributes.tackling),
    keeping: 0.05,
    stamina: scale(attributes.stamina),
  };
}

/** Nudge every skill up or down, for difficulty. */
export function adjustSkills(skills: Skills, by: number): Skills {
  const out = { ...skills };
  for (const key of Object.keys(out) as (keyof Skills)[]) out[key] = clamp(out[key] + by, 0.02, 1);
  return out;
}
