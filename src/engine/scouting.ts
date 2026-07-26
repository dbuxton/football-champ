/**
 * Scouting.
 *
 * A scout's report is deliberately imprecise. You get a range, not a number, and the range only
 * narrows as the scout spends more time watching — the whole point of the scouting network is
 * that information is a resource you have to invest in.
 */

import { Rng, clamp, deriveSeed } from './rng';
import { Player, ScoutReport, Staff } from './types';
import { GameState, getClub, squadOf, staffOf } from './gamestate';
import { ageOf } from './players';
import { addNews } from './news';

/** Turn an ability figure into a star rating, in half stars. */
export function toStars(ability: number): number {
  return clamp(Math.round((ability / 200) * 10) / 2, 0.5, 5);
}

let divisionAvgCache: { key: string; value: number } | null = null;

/**
 * Average current ability across the managed club's division — the anchor that makes star
 * ratings mean something: three stars is a typical player *at your level*, not in the abstract.
 */
export function divisionAverageCA(state: GameState): number {
  const club = state.clubs[state.manager.clubId];
  const comp = club ? state.competitions[club.leagueId] : null;
  if (!comp) return 100;
  const key = `${state.date}:${comp.id}`;
  if (divisionAvgCache?.key === key) return divisionAvgCache.value;

  let sum = 0;
  let count = 0;
  for (const clubId of comp.clubIds) {
    for (const player of squadOf(state, clubId)) {
      sum += player.currentAbility;
      count += 1;
    }
  }
  const value = count ? sum / count : 100;
  divisionAvgCache = { key, value };
  return value;
}

/** Ability → stars relative to a division average: 3 stars ≈ par for the level. */
export function toStarsRelative(ability: number, divisionAverage: number): number {
  const raw = ((ability / Math.max(1, divisionAverage)) - 1) * 5.5 + 3;
  return clamp(Math.round(raw * 2) / 2, 0.5, 5);
}

/** Star ratings for a player the manager owns, relative to the division they compete in. */
export function ownPlayerStars(
  state: GameState,
  player: Player,
): { stars: number; potentialStars: number } {
  const average = divisionAverageCA(state);
  return {
    stars: toStarsRelative(player.currentAbility, average),
    potentialStars: toStarsRelative(player.potentialAbility, average),
  };
}

/**
 * Produce a report. Accuracy is a function of the scout's judging attributes and how long they've
 * watched; an inaccurate report is not just vaguer, it is *biased*, which is what makes a bad
 * scout genuinely dangerous rather than merely useless.
 */
export function generateReport(
  state: GameState,
  scout: Staff,
  player: Player,
  daysWatched: number,
): ScoutReport {
  const rng = new Rng(deriveSeed(state.rngState, `scout:${scout.id}:${player.id}`));

  const judgingAbility = scout.attributes.judgingAbility;
  const judgingPotential = scout.attributes.judgingPotential;

  // 0..1. A great scout watching for a month is near-certain; a poor one never is.
  const timeFactor = clamp(daysWatched / 30, 0.15, 1);
  const abilityAccuracy = clamp((judgingAbility / 20) * 0.7 + timeFactor * 0.3, 0.15, 0.97);
  const potentialAccuracy = clamp((judgingPotential / 20) * 0.6 + timeFactor * 0.25, 0.1, 0.9);

  const abilitySpread = (1 - abilityAccuracy) * 60;
  const potentialSpread = (1 - potentialAccuracy) * 80;

  // A poor scout's central estimate is itself wrong, not merely uncertain.
  const abilityBias = rng.gaussian(0, (1 - abilityAccuracy) * 18);
  const potentialBias = rng.gaussian(0, (1 - potentialAccuracy) * 22);

  const estimatedAbility = clamp(player.currentAbility + abilityBias, 1, 200);
  const estimatedPotential = clamp(
    Math.max(estimatedAbility, player.potentialAbility + potentialBias),
    1,
    200,
  );

  const abilityRange: [number, number] = [
    clamp(Math.round(estimatedAbility - abilitySpread / 2), 1, 200),
    clamp(Math.round(estimatedAbility + abilitySpread / 2), 1, 200),
  ];
  const potentialRange: [number, number] = [
    clamp(Math.round(estimatedPotential - potentialSpread / 2), 1, 200),
    clamp(Math.round(estimatedPotential + potentialSpread / 2), 1, 200),
  ];

  return {
    playerId: player.id,
    scoutId: scout.id,
    accuracy: abilityAccuracy,
    abilityRange,
    potentialRange,
    stars: toStars(estimatedAbility),
    potentialStars: toStars(estimatedPotential),
    verdict: writeVerdict(state, player, estimatedAbility, estimatedPotential, abilityAccuracy),
    date: state.date,
  };
}

function writeVerdict(
  state: GameState,
  player: Player,
  ability: number,
  potential: number,
  accuracy: number,
): string {
  const club = getClub(state, state.manager.clubId);
  const squad = squadOf(state, club.id);
  const squadAverage = squad.length
    ? squad.reduce((s, p) => s + p.currentAbility, 0) / squad.length
    : 100;

  const age = ageOf(player, state.date);
  const upside = potential - ability;

  const confidence = accuracy > 0.8 ? 'I am confident that'
    : accuracy > 0.55 ? 'I believe'
      : 'It is hard to be certain, but I would say';

  let assessment: string;
  if (ability > squadAverage * 1.25) {
    assessment = 'he would significantly strengthen the first team';
  } else if (ability > squadAverage * 1.05) {
    assessment = 'he would improve our starting eleven';
  } else if (ability > squadAverage * 0.9) {
    assessment = 'he would be useful squad depth';
  } else {
    assessment = 'he is below the standard we need';
  }

  const future = age <= 22 && upside > 30
    ? ' There is real room for growth here — with the right coaching he could become considerably better than he is now.'
    : age <= 22 && upside > 15
      ? ' He should continue to improve over the next few seasons.'
      : age >= 31
        ? ' At his age you would be buying the present, not the future.'
        : '';

  return `${confidence} ${assessment}.${future}`;
}

/** Assign a scout to a player, region or competition. */
export function assignScout(
  state: GameState,
  scoutId: string,
  kind: 'player' | 'region' | 'competition',
  target: string,
): void {
  const scout = state.staff[scoutId];
  if (!scout || scout.role !== 'Scout') return;
  scout.assignment = { kind, target, daysElapsed: 0 };
}

export function unassignScout(state: GameState, scoutId: string): void {
  const scout = state.staff[scoutId];
  if (scout) scout.assignment = null;
}

/** Daily scouting tick: assignments accrue time and occasionally produce a report. */
export function processScouting(state: GameState): void {
  const club = getClub(state, state.manager.clubId);
  const scouts = staffOf(state, club.id).filter((s) => s.role === 'Scout' && s.assignment);
  const rng = new Rng(deriveSeed(state.rngState, `scouting:${state.date}`));

  for (const scout of scouts) {
    const assignment = scout.assignment!;
    assignment.daysElapsed += 1;

    if (assignment.kind === 'player') {
      const player = state.players[assignment.target];
      if (!player) { scout.assignment = null; continue; }
      // A specific-player assignment reports after a fortnight, then keeps refining.
      if (assignment.daysElapsed === 14 || (assignment.daysElapsed > 14 && assignment.daysElapsed % 14 === 0)) {
        upsertReport(state, generateReport(state, scout, player, assignment.daysElapsed));
        addNews(state, {
          category: 'staff',
          subject: `Scout report: ${player.shortName}`,
          body: `${scout.shortName} has filed a report on ${player.firstName} ${player.lastName}.`,
          relatedPlayerId: player.id,
        });
      }
      continue;
    }

    // Region and competition assignments turn up new names periodically.
    if (assignment.daysElapsed % 10 !== 0) continue;

    const pool = Object.values(state.players).filter((p) => {
      if (p.retired || p.clubId === club.id) return false;
      if (assignment.kind === 'region') return p.nationality === assignment.target;
      const playerClub = p.clubId ? state.clubs[p.clubId] : null;
      return playerClub?.leagueId === assignment.target;
    });
    if (pool.length === 0) continue;

    // A good scout finds better players.
    const found = rng.weighted(
      rng.shuffle(pool).slice(0, 40),
      (p) => Math.max(1, p.potentialAbility ** (1 + scout.attributes.judgingPotential / 40)),
    );

    const report = generateReport(state, scout, found, assignment.daysElapsed);
    upsertReport(state, report);

    if (report.potentialStars >= 3.5) {
      addNews(state, {
        category: 'staff',
        important: report.potentialStars >= 4.5,
        subject: `Scout report: ${found.shortName}`,
        body: `${scout.shortName} has flagged ${found.firstName} ${found.lastName} (${ageOf(found, state.date)}, ${found.naturalPosition}, ${state.clubs[found.clubId ?? '']?.name ?? 'free agent'}). ${report.verdict}`,
        relatedPlayerId: found.id,
      });
      if (!state.shortlist.includes(found.id)) state.shortlist.push(found.id);
    }
  }
}

function upsertReport(state: GameState, report: ScoutReport): void {
  const existing = state.scoutReports.findIndex((r) => r.playerId === report.playerId);
  if (existing >= 0) state.scoutReports[existing] = report;
  else state.scoutReports.push(report);
  if (state.scoutReports.length > 400) state.scoutReports.shift();
}

export function reportFor(state: GameState, playerId: string): ScoutReport | null {
  return state.scoutReports.find((r) => r.playerId === playerId) ?? null;
}

/**
 * What the manager is allowed to see about a player they don't own. Their own players are fully
 * visible; everyone else is filtered through whatever scouting has been done.
 */
export interface PlayerKnowledge {
  full: boolean;
  report: ScoutReport | null;
  /** Star rating to display, or null if nothing is known. */
  stars: number | null;
  potentialStars: number | null;
}

export function knowledgeOf(state: GameState, player: Player): PlayerKnowledge {
  if (player.clubId === state.manager.clubId) {
    return {
      full: true,
      report: null,
      stars: toStars(player.currentAbility),
      potentialStars: toStars(player.potentialAbility),
    };
  }
  const report = reportFor(state, player.id);
  return {
    full: false,
    report,
    stars: report?.stars ?? null,
    potentialStars: report?.potentialStars ?? null,
  };
}

/** Search filters used by the transfer screen. */
export interface PlayerSearchFilters {
  name?: string;
  positions?: string[];
  maxAge?: number;
  minAge?: number;
  maxValue?: number;
  maxWage?: number;
  nationality?: string;
  leagueId?: string;
  transferListedOnly?: boolean;
  loanListedOnly?: boolean;
  freeAgentsOnly?: boolean;
  expiringContractsOnly?: boolean;
  minAbility?: number;
}

export function searchPlayers(state: GameState, filters: PlayerSearchFilters, limit = 200): Player[] {
  const managed = state.manager.clubId;
  const results: Player[] = [];

  for (const player of Object.values(state.players)) {
    if (player.retired || player.clubId === managed) continue;

    if (filters.name) {
      const needle = filters.name.toLowerCase();
      const haystack = `${player.firstName} ${player.lastName}`.toLowerCase();
      if (!haystack.includes(needle)) continue;
    }
    if (filters.positions?.length && !filters.positions.includes(player.naturalPosition)) continue;

    const age = ageOf(player, state.date);
    if (filters.minAge && age < filters.minAge) continue;
    if (filters.maxAge && age > filters.maxAge) continue;
    if (filters.maxValue && player.value > filters.maxValue) continue;
    if (filters.maxWage && (player.contract?.wage ?? 0) > filters.maxWage) continue;
    if (filters.nationality && player.nationality !== filters.nationality) continue;
    if (filters.transferListedOnly && !player.transferListed) continue;
    if (filters.loanListedOnly && !player.loanListed) continue;
    if (filters.freeAgentsOnly && player.clubId) continue;
    if (filters.minAbility && player.currentAbility < filters.minAbility) continue;

    if (filters.leagueId) {
      const club = player.clubId ? state.clubs[player.clubId] : null;
      if (club?.leagueId !== filters.leagueId) continue;
    }
    if (filters.expiringContractsOnly) {
      if (!player.contract) continue;
      const monthsLeft = (new Date(player.contract.expires).getTime() - new Date(state.date).getTime()) /
        (1000 * 60 * 60 * 24 * 30.44);
      if (monthsLeft > 12) continue;
    }

    results.push(player);
    if (results.length >= limit * 3) break;
  }

  return results
    .sort((a, b) => b.currentAbility - a.currentAbility)
    .slice(0, limit);
}
