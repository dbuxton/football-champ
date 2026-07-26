/**
 * Attribute generation and derivation.
 *
 * Squad data in `src/data/squads` stores each player as a compact tuple carrying only name,
 * position, birth year, nationality, ability and potential. The full 56-attribute CM profile is
 * derived here: an archetype supplies the *shape* of the profile (a poacher's Finishing is high,
 * their Tackling is not), the ability rating scales it, and a seeded PRNG adds the individual
 * variation that stops every centre back looking identical.
 *
 * Because the PRNG is seeded from the player's own name, a given player always generates the same
 * way — squads are stable across sessions without storing 56 numbers per player in the repo.
 */

import { Rng, clamp, hashString } from './rng';
import {
  Attributes, Position, POSITIONS, GOALKEEPING_KEYS, HIDDEN_KEYS,
  TECHNICAL_KEYS, MENTAL_KEYS, PHYSICAL_KEYS,
} from './types';

/**
 * Per-position weights, 0..1, describing how important each attribute is to that position.
 * These do double duty: they shape generated players, and they weight the "how good is this
 * player, here" calculation used by team selection, the AI and the match engine.
 */
type Weights = Partial<Record<keyof Attributes, number>>;

const OUTFIELD_BASE: Weights = {
  // Every outfielder needs a floor of these.
  passing: 0.5, technique: 0.45, decisions: 0.5, teamwork: 0.45, workRate: 0.45,
  stamina: 0.5, pace: 0.4, acceleration: 0.4, strength: 0.35, balance: 0.35,
  agility: 0.35, composure: 0.4, anticipation: 0.4, concentration: 0.4, determination: 0.45,
  naturalFitness: 0.4, positioning: 0.3, offTheBall: 0.3, bravery: 0.35, jumping: 0.3,
  aggression: 0.3, creativity: 0.25, flair: 0.25, influence: 0.25, marking: 0.2,
  tackling: 0.2, heading: 0.25, dribbling: 0.3, crossing: 0.2, finishing: 0.2,
  longShots: 0.2, freeKicks: 0.2, corners: 0.2, penalties: 0.25,
};

export const POSITION_WEIGHTS: Record<Position, Weights> = {
  GK: {
    handling: 1, reflexes: 1, oneOnOnes: 0.85, aerialAbility: 0.75, commandOfArea: 0.8,
    communication: 0.7, rushingOut: 0.65, throwing: 0.5, kicking: 0.55, eccentricity: 0.1,
    concentration: 0.8, positioning: 0.85, anticipation: 0.7, decisions: 0.7, composure: 0.6,
    bravery: 0.6, agility: 0.8, jumping: 0.6, strength: 0.5,
  },
  DC: {
    ...OUTFIELD_BASE,
    marking: 1, tackling: 1, heading: 0.9, positioning: 0.95, strength: 0.85, jumping: 0.85,
    bravery: 0.8, concentration: 0.85, anticipation: 0.8, decisions: 0.8, composure: 0.7,
    aggression: 0.6, passing: 0.6, pace: 0.6, acceleration: 0.55, dribbling: 0.15, crossing: 0.1,
    finishing: 0.15, flair: 0.1, creativity: 0.2, offTheBall: 0.15,
  },
  DR: {
    ...OUTFIELD_BASE,
    marking: 0.85, tackling: 0.9, positioning: 0.8, crossing: 0.7, pace: 0.8, acceleration: 0.8,
    stamina: 0.85, workRate: 0.8, anticipation: 0.7, concentration: 0.75, teamwork: 0.7,
    dribbling: 0.5, heading: 0.45, finishing: 0.15,
  },
  DL: {
    ...OUTFIELD_BASE,
    marking: 0.85, tackling: 0.9, positioning: 0.8, crossing: 0.7, pace: 0.8, acceleration: 0.8,
    stamina: 0.85, workRate: 0.8, anticipation: 0.7, concentration: 0.75, teamwork: 0.7,
    dribbling: 0.5, heading: 0.45, finishing: 0.15,
  },
  WBR: {
    ...OUTFIELD_BASE,
    crossing: 0.9, stamina: 1, pace: 0.9, acceleration: 0.9, workRate: 0.95, tackling: 0.7,
    marking: 0.6, dribbling: 0.7, teamwork: 0.8, offTheBall: 0.6, positioning: 0.6,
  },
  WBL: {
    ...OUTFIELD_BASE,
    crossing: 0.9, stamina: 1, pace: 0.9, acceleration: 0.9, workRate: 0.95, tackling: 0.7,
    marking: 0.6, dribbling: 0.7, teamwork: 0.8, offTheBall: 0.6, positioning: 0.6,
  },
  DM: {
    ...OUTFIELD_BASE,
    tackling: 0.95, marking: 0.8, positioning: 0.9, anticipation: 0.85, workRate: 0.9,
    stamina: 0.9, passing: 0.8, decisions: 0.85, teamwork: 0.85, concentration: 0.8,
    aggression: 0.6, strength: 0.7, composure: 0.7, finishing: 0.15, crossing: 0.2,
  },
  MC: {
    ...OUTFIELD_BASE,
    passing: 0.95, technique: 0.85, creativity: 0.8, decisions: 0.85, workRate: 0.8,
    stamina: 0.85, teamwork: 0.8, composure: 0.75, anticipation: 0.75, tackling: 0.6,
    longShots: 0.55, dribbling: 0.6, offTheBall: 0.6, positioning: 0.55,
  },
  MR: {
    ...OUTFIELD_BASE,
    crossing: 0.9, dribbling: 0.8, pace: 0.85, acceleration: 0.85, technique: 0.8,
    stamina: 0.85, workRate: 0.8, agility: 0.7, flair: 0.6, offTheBall: 0.65, tackling: 0.4,
  },
  ML: {
    ...OUTFIELD_BASE,
    crossing: 0.9, dribbling: 0.8, pace: 0.85, acceleration: 0.85, technique: 0.8,
    stamina: 0.85, workRate: 0.8, agility: 0.7, flair: 0.6, offTheBall: 0.65, tackling: 0.4,
  },
  AMC: {
    ...OUTFIELD_BASE,
    creativity: 1, passing: 0.9, technique: 0.95, dribbling: 0.8, composure: 0.8, flair: 0.8,
    longShots: 0.75, decisions: 0.8, offTheBall: 0.8, agility: 0.75, finishing: 0.6,
    freeKicks: 0.6, tackling: 0.15, marking: 0.1, positioning: 0.2,
  },
  AMR: {
    ...OUTFIELD_BASE,
    dribbling: 0.95, pace: 0.9, acceleration: 0.95, technique: 0.85, crossing: 0.75,
    flair: 0.8, agility: 0.8, finishing: 0.6, offTheBall: 0.75, balance: 0.7, tackling: 0.15,
    marking: 0.1,
  },
  AML: {
    ...OUTFIELD_BASE,
    dribbling: 0.95, pace: 0.9, acceleration: 0.95, technique: 0.85, crossing: 0.75,
    flair: 0.8, agility: 0.8, finishing: 0.6, offTheBall: 0.75, balance: 0.7, tackling: 0.15,
    marking: 0.1,
  },
  ST: {
    ...OUTFIELD_BASE,
    finishing: 1, offTheBall: 0.95, composure: 0.85, anticipation: 0.85, heading: 0.7,
    technique: 0.8, dribbling: 0.65, pace: 0.8, acceleration: 0.85, strength: 0.7,
    longShots: 0.55, penalties: 0.5, tackling: 0.1, marking: 0.1, positioning: 0.15,
    crossing: 0.25,
  },
};

/** Positions a player is passably comfortable in, given their natural one. */
const ADJACENT: Record<Position, Position[]> = {
  GK: [],
  DR: ['WBR', 'MR', 'DC'],
  DL: ['WBL', 'ML', 'DC'],
  DC: ['DM', 'DR', 'DL'],
  WBR: ['DR', 'MR', 'AMR'],
  WBL: ['DL', 'ML', 'AML'],
  DM: ['MC', 'DC'],
  MR: ['AMR', 'WBR', 'MC'],
  ML: ['AML', 'WBL', 'MC'],
  MC: ['DM', 'AMC', 'MR', 'ML'],
  AMR: ['MR', 'ST', 'AMC'],
  AML: ['ML', 'ST', 'AMC'],
  AMC: ['MC', 'ST', 'AMR', 'AML'],
  ST: ['AMC', 'AMR', 'AML'],
};

/**
 * Generate a full attribute set.
 *
 * @param ability 1-100 "how good is this player" on a human-readable scale. 90+ is a world
 *                superstar, ~70 is a solid Premier League regular, ~50 is a Championship squad
 *                player, ~30 is a League Two journeyman.
 */
export function generateAttributes(
  position: Position,
  ability: number,
  rng: Rng,
  overrides?: Partial<Attributes>,
): Attributes {
  const weights = POSITION_WEIGHTS[position];
  const isKeeper = position === 'GK';

  // Map the 1-100 ability onto the 1-20 attribute scale. A weight of 1 attribute on a 100-ability
  // player lands around 18-19; a weight of 0.2 attribute on the same player lands around 8.
  const peak = 3 + (ability / 100) * 16;

  const attrs = {} as Attributes;

  const assign = (key: keyof Attributes, weight: number) => {
    // Weight bends the peak: high-weight attributes sit near the player's ceiling, low-weight
    // ones regress toward a mediocre baseline.
    const baseline = 4 + (ability / 100) * 5;
    const target = baseline + (peak - baseline) * weight;
    const spread = 1.4 + (1 - weight) * 1.2;
    attrs[key] = clamp(Math.round(rng.gaussian(target, spread)), 1, 20);
  };

  for (const key of TECHNICAL_KEYS) assign(key, isKeeper ? 0.12 : (weights[key] ?? 0.25));
  for (const key of MENTAL_KEYS) assign(key, weights[key] ?? 0.35);
  for (const key of PHYSICAL_KEYS) assign(key, weights[key] ?? 0.4);
  for (const key of GOALKEEPING_KEYS) {
    // Outfielders get token goalkeeping numbers, as they do in the real games.
    assign(key, isKeeper ? (weights[key] ?? 0.4) : 0.02);
  }

  // Hidden attributes are largely independent of ability, though better players do tend to be
  // more professional and more consistent — that's part of why they're better.
  for (const key of HIDDEN_KEYS) {
    let mean = 10;
    if (key === 'consistency' || key === 'importantMatches' || key === 'professionalism') {
      mean = 8 + (ability / 100) * 8;
    } else if (key === 'ambition') {
      mean = 8 + (ability / 100) * 6;
    } else if (key === 'injuryProneness' || key === 'dirtiness') {
      mean = 8;
    } else if (key === 'versatility' || key === 'adaptability' || key === 'pressure') {
      mean = 10;
    }
    attrs[key] = clamp(Math.round(rng.gaussian(mean, 3.2)), 1, 20);
  }

  // Goalkeeper eccentricity is deliberately noisy and mostly low — the occasional maverick is
  // half the fun.
  if (isKeeper) attrs.eccentricity = clamp(Math.round(rng.gaussian(7, 4)), 1, 20);

  if (overrides) Object.assign(attrs, overrides);
  return attrs;
}

/** Positional familiarity 1-20 for every position, given a natural position. */
export function generatePositionRatings(
  natural: Position,
  versatility: number,
  rng: Rng,
): Record<Position, number> {
  const out = {} as Record<Position, number>;
  const spill = 1 + versatility / 10; // 1..3
  for (const pos of POSITIONS) {
    if (pos === natural) {
      out[pos] = 20;
    } else if (natural === 'GK' || pos === 'GK') {
      out[pos] = 1;
    } else if (ADJACENT[natural].includes(pos)) {
      out[pos] = clamp(Math.round(rng.gaussian(13 + spill, 2.5)), 6, 19);
    } else {
      // Mirrored flanks (DR <-> DL etc.) are more natural than a random reassignment.
      const mirrored = mirrorPosition(natural) === pos;
      const mean = mirrored ? 12 + spill : 5 + spill;
      out[pos] = clamp(Math.round(rng.gaussian(mean, 2.5)), 1, 18);
    }
  }
  return out;
}

function mirrorPosition(pos: Position): Position | null {
  const pairs: Partial<Record<Position, Position>> = {
    DR: 'DL', DL: 'DR', WBR: 'WBL', WBL: 'WBR', MR: 'ML', ML: 'MR', AMR: 'AML', AML: 'AMR',
  };
  return pairs[pos] ?? null;
}

/**
 * Current Ability on the CM 1-200 scale, derived from the attributes that matter for the
 * player's position. This is the number the AI values players by.
 */
export function computeCurrentAbility(attrs: Attributes, position: Position): number {
  const weights = POSITION_WEIGHTS[position];
  const keys = position === 'GK'
    ? [...GOALKEEPING_KEYS, ...MENTAL_KEYS, ...PHYSICAL_KEYS] as (keyof Attributes)[]
    : [...TECHNICAL_KEYS, ...MENTAL_KEYS, ...PHYSICAL_KEYS] as (keyof Attributes)[];

  let sum = 0;
  let totalWeight = 0;
  for (const key of keys) {
    const w = weights[key] ?? 0.25;
    sum += attrs[key] * w;
    totalWeight += w;
  }
  const weightedMean = sum / Math.max(totalWeight, 0.001); // 1..20

  // Consistency and Important Matches are worth real ability in practice.
  const mentalBonus = ((attrs.consistency + attrs.importantMatches) / 2 - 10) * 0.35;

  return clamp(Math.round((weightedMean + mentalBonus - 1) * (199 / 19) + 1), 1, 200);
}

/**
 * How effective a player is in a given position right now, 0..1. Combines raw ability with
 * positional familiarity, so playing a striker at left back is possible but costly.
 */
export function positionalEffectiveness(
  attrs: Attributes,
  positions: Record<Position, number>,
  playAt: Position,
): number {
  const ca = computeCurrentAbility(attrs, playAt);
  const familiarity = positions[playAt] ?? 1;
  // 20 = no penalty, 1 = roughly a 45% reduction. Deliberately not ruinous: CM lets you get away
  // with a slightly out-of-position player, and so should we.
  const penalty = 0.55 + 0.45 * (familiarity / 20);
  return (ca / 200) * penalty;
}

/** A stable per-player RNG, so the same name always generates the same footballer. */
export function playerRng(seedSource: string, salt = 0): Rng {
  return new Rng(hashString(seedSource) ^ (salt * 2654435761));
}

/** Convert an ability rating (1-100) to a rough CA target on the 1-200 scale. */
export function abilityToCA(ability: number): number {
  return clamp(Math.round(ability * 1.9 + 5), 1, 200);
}
