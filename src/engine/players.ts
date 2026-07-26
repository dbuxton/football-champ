/**
 * Building, valuing and describing players.
 */

import { Rng, clamp } from './rng';
import {
  generateAttributes, generatePositionRatings, computeCurrentAbility, playerRng,
  abilityToCA, positionalEffectiveness,
} from './attributes';
import {
  Player, Position, Foot, Attributes, SquadStatus, Contract, PlayerSeasonStats,
} from './types';
import { addDays, dateToISO, parseISO, yearsBetween } from './date';

/**
 * The compact form squad data is authored in.
 * [name, position, birthYear, nationality, ability(1-100), potential(1-100), foot?]
 */
export type PlayerSeed = [
  name: string,
  position: Position,
  birthYear: number,
  nationality: string,
  ability: number,
  potential: number,
  foot?: Foot,
];

let idCounter = 0;
export function resetIdCounter(): void {
  idCounter = 0;
}
export function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}${idCounter.toString(36)}`;
}

function splitName(full: string): { first: string; last: string } {
  const parts = full.trim().split(/\s+/);
  if (parts.length === 1) return { first: '', last: parts[0] };
  return { first: parts[0], last: parts.slice(1).join(' ') };
}

export function shortNameOf(first: string, last: string): string {
  return first ? `${first[0]}. ${last}` : last;
}

/** Typical heights by position, so target men are big and wingers are not. */
function heightFor(position: Position, rng: Rng): number {
  const means: Partial<Record<Position, number>> = {
    GK: 190, DC: 187, ST: 183, DM: 182, MC: 179, DR: 178, DL: 178,
    WBR: 177, WBL: 177, MR: 177, ML: 177, AMC: 176, AMR: 175, AML: 175,
  };
  return Math.round(clamp(rng.gaussian(means[position] ?? 180, 5), 162, 204));
}

export function buildPlayer(
  seed: PlayerSeed,
  clubId: string | null,
  currentDate: string,
  opts: { homegrown?: boolean; attributeOverrides?: Partial<Attributes>; salt?: number } = {},
): Player {
  const [name, position, birthYear, nationality, ability, potential, foot] = seed;
  const { first, last } = splitName(name);
  const rng = playerRng(`${name}|${birthYear}|${position}`, opts.salt ?? 0);

  const attributes = generateAttributes(position, ability, rng, opts.attributeOverrides);
  const positions = generatePositionRatings(position, attributes.versatility, rng);
  const currentAbility = computeCurrentAbility(attributes, position);
  const potentialAbility = clamp(
    Math.max(currentAbility, abilityToCA(potential) + rng.int(-6, 6)),
    currentAbility,
    200,
  );

  // Birthdays are spread through the year so ageing doesn't happen to everyone at once.
  const birthDate = dateToISO(new Date(Date.UTC(birthYear, rng.int(0, 11), rng.int(1, 28))));

  const player: Player = {
    id: nextId('p'),
    firstName: first,
    lastName: last,
    shortName: shortNameOf(first, last),
    clubId,
    nationality,
    birthDate,
    foot: foot ?? (rng.chance(0.15) ? 'B' : rng.chance(0.25) ? 'L' : 'R'),
    height: heightFor(position, rng),
    weight: 0,
    naturalPosition: position,
    positions,
    attributes,
    currentAbility,
    potentialAbility,
    contract: null,
    morale: rng.int(60, 85),
    matchSharpness: rng.int(70, 95),
    condition: rng.int(88, 100),
    form: [],
    injury: null,
    bookingPoints: 0,
    suspensionMatches: 0,
    value: 0,
    transferListed: false,
    loanListed: false,
    loan: null,
    stats: [],
    history: [],
    caps: 0,
    internationalGoals: 0,
    homegrown: opts.homegrown ?? false,
    retired: false,
    squadNumber: 0,
  };

  player.weight = Math.round(clamp(rng.gaussian((player.height - 100) * 0.95, 4), 58, 100));
  player.value = computeValue(player, currentDate);
  return player;
}

export function ageOf(player: Player, currentDate: string): number {
  return yearsBetween(player.birthDate, currentDate);
}

/**
 * Market value in GBP.
 *
 * Driven mostly by current ability, then bent hard by age (a 32-year-old and a 21-year-old with
 * identical CA are worth very different money), remaining contract length, and unrealised
 * potential.
 */
export function computeValue(player: Player, currentDate: string): number {
  const age = ageOf(player, currentDate);
  const ca = player.currentAbility;

  // Roughly exponential in ability: Championship squad filler is worth six figures, an elite
  // player eight.
  let value = Math.pow(ca / 100, 6.2) * 4_200_000;

  // Age curve: peak value at 24-26, sharp decline after 30.
  let ageFactor: number;
  if (age <= 17) ageFactor = 0.75;
  else if (age <= 21) ageFactor = 0.9 + (21 - age) * 0.04;
  else if (age <= 26) ageFactor = 1.0;
  else if (age <= 29) ageFactor = 1.0 - (age - 26) * 0.11;
  else if (age <= 33) ageFactor = 0.67 - (age - 29) * 0.13;
  else ageFactor = Math.max(0.03, 0.15 - (age - 33) * 0.04);
  value *= ageFactor;

  // Unfulfilled potential in a young player is expensive.
  const upside = player.potentialAbility - ca;
  if (age < 24 && upside > 10) value *= 1 + Math.min(upside, 60) / 55;

  // A player with under a year left can leave for nothing, and everyone knows it.
  if (player.contract) {
    const monthsLeft = monthsUntil(currentDate, player.contract.expires);
    if (monthsLeft <= 0) value *= 0.15;
    else if (monthsLeft < 6) value *= 0.35;
    else if (monthsLeft < 12) value *= 0.6;
    else if (monthsLeft < 18) value *= 0.85;
  } else {
    value *= 0.4; // free agent
  }

  // Round to something that looks like a real quoted price.
  return roundMoney(value);
}

export function roundMoney(value: number): number {
  if (value >= 10_000_000) return Math.round(value / 250_000) * 250_000;
  if (value >= 1_000_000) return Math.round(value / 50_000) * 50_000;
  if (value >= 100_000) return Math.round(value / 5_000) * 5_000;
  if (value >= 10_000) return Math.round(value / 1_000) * 1_000;
  return Math.max(0, Math.round(value / 500) * 500);
}

export function monthsUntil(from: string, to: string): number {
  const a = parseISO(from);
  const b = parseISO(to);
  return (b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24 * 30.44);
}

/**
 * The weekly wage a player expects, given their ability and the reputation of the club asking.
 * A big club has to pay more for the same player, partly because they can, partly because
 * players hold out for it.
 */
export function expectedWage(player: Player, clubReputation: number, currentDate: string): number {
  const ca = player.currentAbility;
  const age = ageOf(player, currentDate);

  let wage = Math.pow(ca / 100, 4.6) * 22_000;
  // Youngsters accept less; players in their prime extract more.
  if (age < 21) wage *= 0.55;
  else if (age < 24) wage *= 0.85;
  else if (age > 32) wage *= 0.8;

  // Reputation of the paying club, normalised around a mid-Championship club (~45).
  wage *= 0.6 + (clubReputation / 45) * 0.4;

  // Ambitious players want more, loyal ones less.
  wage *= 1 + (player.attributes.ambition - 10) * 0.015;
  wage *= 1 - (player.attributes.loyalty - 10) * 0.008;

  return Math.max(500, Math.round(wage / 250) * 250);
}

export function makeContract(
  player: Player,
  clubReputation: number,
  currentDate: string,
  years: number,
  status: SquadStatus,
  rng: Rng,
): Contract {
  const wage = Math.round(expectedWage(player, clubReputation, currentDate) * rng.float(0.9, 1.1));
  return {
    expires: dateToISO(addDays(parseISO(currentDate), Math.round(years * 365))),
    wage,
    releaseClause: 0,
    loyaltyBonus: Math.round(wage * rng.int(0, 6)),
    appearanceFee: Math.round(wage * 0.08 / 50) * 50,
    goalBonus: Math.round(wage * 0.12 / 50) * 50,
    squadStatus: status,
    signingOnFee: 0,
  };
}

/** Average of the last N match ratings, or 0 if the player hasn't featured. */
export function averageForm(player: Player, lastN = 6): number {
  const recent = player.form.slice(-lastN);
  if (recent.length === 0) return 0;
  return recent.reduce((a, b) => a + b, 0) / recent.length;
}

export function seasonStatsFor(player: Player, competitionId: string): PlayerSeasonStats {
  let entry = player.stats.find((s) => s.competitionId === competitionId);
  if (!entry) {
    entry = {
      competitionId,
      appearances: 0, substituteAppearances: 0, minutes: 0, goals: 0, assists: 0,
      yellowCards: 0, redCards: 0, cleanSheets: 0, goalsConceded: 0, ratingSum: 0, motm: 0,
    };
    player.stats.push(entry);
  }
  return entry;
}

/** Aggregate stats across every competition this season. */
export function totalStats(player: Player): PlayerSeasonStats {
  const total: PlayerSeasonStats = {
    competitionId: 'ALL',
    appearances: 0, substituteAppearances: 0, minutes: 0, goals: 0, assists: 0,
    yellowCards: 0, redCards: 0, cleanSheets: 0, goalsConceded: 0, ratingSum: 0, motm: 0,
  };
  for (const s of player.stats) {
    total.appearances += s.appearances;
    total.substituteAppearances += s.substituteAppearances;
    total.minutes += s.minutes;
    total.goals += s.goals;
    total.assists += s.assists;
    total.yellowCards += s.yellowCards;
    total.redCards += s.redCards;
    total.cleanSheets += s.cleanSheets;
    total.goalsConceded += s.goalsConceded;
    total.ratingSum += s.ratingSum;
    total.motm += s.motm;
  }
  return total;
}

export function isAvailable(player: Player): boolean {
  return !player.injury && player.suspensionMatches === 0 && !player.retired;
}

/** How much a given condition level costs, applied exactly once per effectiveness pathway. */
export function conditionCurve(condition: number): number {
  return 0.62 + 0.38 * (condition / 100);
}

/**
 * Effectiveness 0..1 in a slot from ability, familiarity, sharpness and morale — everything
 * except condition. The match engine tracks its own in-match condition and applies
 * `conditionCurve` itself, so keeping condition out of the base stops it being counted twice.
 */
export function baseEffectiveness(player: Player, playAt: Position): number {
  const base = positionalEffectiveness(player.attributes, player.positions, playAt);
  const sharpnessFactor = 0.82 + 0.18 * (player.matchSharpness / 100);
  const moraleFactor = 0.9 + 0.2 * (player.morale / 100);
  return base * sharpnessFactor * moraleFactor;
}

/** Effectiveness 0..1 in a slot, further reduced by condition, sharpness and morale. */
export function matchEffectiveness(player: Player, playAt: Position): number {
  return baseEffectiveness(player, playAt) * conditionCurve(player.condition);
}

export function fullName(player: Player): string {
  return player.firstName ? `${player.firstName} ${player.lastName}` : player.lastName;
}
