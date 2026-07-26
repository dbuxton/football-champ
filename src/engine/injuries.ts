/**
 * Injuries: what they are, how long they last, and how quickly a club's medical department
 * gets a player back.
 */

import { Rng, clamp } from './rng';
import { Injury, Player } from './types';

interface InjuryType {
  name: string;
  /** Typical layoff in days, before modifiers. */
  minDays: number;
  maxDays: number;
  weight: number;
  /** Chance the injury leaves a lingering susceptibility. */
  recurrenceChance: number;
}

const INJURY_TYPES: InjuryType[] = [
  { name: 'Bruised ribs', minDays: 3, maxDays: 8, weight: 10, recurrenceChance: 0.05 },
  { name: 'Dead leg', minDays: 2, maxDays: 6, weight: 12, recurrenceChance: 0.03 },
  { name: 'Twisted ankle', minDays: 5, maxDays: 16, weight: 14, recurrenceChance: 0.12 },
  { name: 'Hamstring strain', minDays: 12, maxDays: 32, weight: 15, recurrenceChance: 0.3 },
  { name: 'Groin strain', minDays: 10, maxDays: 28, weight: 11, recurrenceChance: 0.25 },
  { name: 'Calf strain', minDays: 9, maxDays: 24, weight: 10, recurrenceChance: 0.22 },
  { name: 'Knee ligament damage', minDays: 40, maxDays: 130, weight: 5, recurrenceChance: 0.35 },
  { name: 'Broken metatarsal', minDays: 45, maxDays: 95, weight: 3, recurrenceChance: 0.15 },
  { name: 'Fractured collarbone', minDays: 30, maxDays: 60, weight: 3, recurrenceChance: 0.08 },
  { name: 'Concussion', minDays: 7, maxDays: 18, weight: 5, recurrenceChance: 0.1 },
  { name: 'Back spasm', minDays: 4, maxDays: 14, weight: 7, recurrenceChance: 0.2 },
  { name: 'Achilles problem', minDays: 25, maxDays: 90, weight: 3, recurrenceChance: 0.32 },
  { name: 'Cruciate ligament rupture', minDays: 180, maxDays: 300, weight: 1, recurrenceChance: 0.4 },
  { name: 'Shoulder injury', minDays: 14, maxDays: 45, weight: 4, recurrenceChance: 0.15 },
  { name: 'Illness', minDays: 3, maxDays: 10, weight: 6, recurrenceChance: 0 },
];

/**
 * Roll a new injury.
 *
 * @param medical The club's medical facility rating 1-20 — better facilities shorten layoffs.
 * @param severityBias Multiplier on how bad the injury is; the match engine passes >1 for
 *                     injuries picked up in a heavy challenge.
 */
export function rollInjury(rng: Rng, player: Player, medical: number, severityBias = 1): Injury {
  const type = rng.weighted(INJURY_TYPES, (t) => t.weight);

  let days = rng.int(type.minDays, type.maxDays) * severityBias;

  // Injury-prone players take longer to come back, and older players slower still.
  days *= 0.85 + player.attributes.injuryProneness / 40;
  days *= 1 - (player.attributes.naturalFitness - 10) * 0.012;

  // A good medical department is worth real time.
  days *= clamp(1.22 - medical * 0.022, 0.7, 1.25);

  const total = Math.max(1, Math.round(days));
  return {
    type: type.name,
    daysRemaining: total,
    totalDays: total,
    recurring: rng.chance(type.recurrenceChance),
  };
}

/** Human-readable layoff, in the phrasing the news items use. */
export function describeLayoff(injury: Injury): string {
  const days = injury.daysRemaining;
  if (days <= 3) return 'a couple of days';
  if (days <= 10) return `${Math.round(days)} days`;
  if (days <= 56) return `${Math.round(days / 7)} weeks`;
  return `${Math.round(days / 30)} months`;
}

/** Advance an injury by a day. Returns true when the player becomes fit again. */
export function tickInjury(player: Player, physioQuality: number, rng: Rng): boolean {
  if (!player.injury) return false;
  // A good physio occasionally shaves an extra day off.
  const extra = rng.chance(clamp(physioQuality / 60, 0, 0.35)) ? 1 : 0;
  player.injury.daysRemaining -= 1 + extra;
  if (player.injury.daysRemaining <= 0) {
    // Coming back from a long lay-off leaves a player short of sharpness.
    const severity = player.injury.totalDays;
    player.matchSharpness = clamp(player.matchSharpness - severity * 0.6, 15, 100);
    player.condition = clamp(player.condition, 55, 100);
    if (player.injury.recurring) {
      player.attributes.injuryProneness = clamp(player.attributes.injuryProneness + 1, 1, 20);
    }
    player.injury = null;
    return true;
  }
  return false;
}
