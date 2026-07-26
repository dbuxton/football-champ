/**
 * League tables and their sorting rules.
 */

import { Fixture, LeagueTableRow, MatchResult } from './types';
import { GameState, getCompetition } from './gamestate';

export function emptyRow(clubId: string): LeagueTableRow {
  return {
    clubId,
    played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0,
    pointsDeduction: 0,
    form: [],
    homeRecord: { w: 0, d: 0, l: 0, gf: 0, ga: 0 },
    awayRecord: { w: 0, d: 0, l: 0, gf: 0, ga: 0 },
  };
}

export function emptyTable(clubIds: string[]): LeagueTableRow[] {
  return clubIds.map(emptyRow);
}

export function goalDifference(row: LeagueTableRow): number {
  return row.goalsFor - row.goalsAgainst;
}

export function effectivePoints(row: LeagueTableRow): number {
  return row.points - row.pointsDeduction;
}

/**
 * English league order: points, then goal difference, then goals scored, then head-to-head,
 * then alphabetically as a deterministic final tiebreak.
 */
export function sortTable(
  rows: LeagueTableRow[],
  fixtures: Fixture[],
  clubName: (id: string) => string,
): LeagueTableRow[] {
  return [...rows].sort((a, b) => {
    const pts = effectivePoints(b) - effectivePoints(a);
    if (pts !== 0) return pts;

    const gd = goalDifference(b) - goalDifference(a);
    if (gd !== 0) return gd;

    const gf = b.goalsFor - a.goalsFor;
    if (gf !== 0) return gf;

    const h2h = headToHead(a.clubId, b.clubId, fixtures);
    if (h2h !== 0) return h2h;

    return clubName(a.clubId).localeCompare(clubName(b.clubId));
  });
}

/** Positive when b is ahead of a on their meetings. */
function headToHead(aId: string, bId: string, fixtures: Fixture[]): number {
  let aPoints = 0;
  let bPoints = 0;
  let aGoals = 0;
  let bGoals = 0;

  for (const fixture of fixtures) {
    if (!fixture.played || !fixture.result) continue;
    const involvesBoth =
      (fixture.homeClubId === aId && fixture.awayClubId === bId) ||
      (fixture.homeClubId === bId && fixture.awayClubId === aId);
    if (!involvesBoth) continue;

    const aIsHome = fixture.homeClubId === aId;
    const aScore = aIsHome ? fixture.result.homeGoals : fixture.result.awayGoals;
    const bScore = aIsHome ? fixture.result.awayGoals : fixture.result.homeGoals;
    aGoals += aScore;
    bGoals += bScore;
    if (aScore > bScore) aPoints += 3;
    else if (aScore < bScore) bPoints += 3;
    else { aPoints += 1; bPoints += 1; }
  }

  if (aPoints !== bPoints) return bPoints - aPoints;
  return bGoals - aGoals;
}

/** Apply a played league fixture to the table. */
export function applyResultToTable(state: GameState, fixture: Fixture, result: MatchResult): void {
  const comp = state.competitions[fixture.competitionId];
  if (!comp || comp.kind !== 'league') return;
  const table = state.tables[comp.id];
  if (!table) return;

  const home = table.find((r) => r.clubId === fixture.homeClubId);
  const away = table.find((r) => r.clubId === fixture.awayClubId);
  if (!home || !away) return;

  home.played += 1;
  away.played += 1;
  home.goalsFor += result.homeGoals;
  home.goalsAgainst += result.awayGoals;
  away.goalsFor += result.awayGoals;
  away.goalsAgainst += result.homeGoals;
  home.homeRecord.gf += result.homeGoals;
  home.homeRecord.ga += result.awayGoals;
  away.awayRecord.gf += result.awayGoals;
  away.awayRecord.ga += result.homeGoals;

  if (result.homeGoals > result.awayGoals) {
    home.won += 1; home.points += 3; home.homeRecord.w += 1; home.form.push('W');
    away.lost += 1; away.awayRecord.l += 1; away.form.push('L');
  } else if (result.homeGoals < result.awayGoals) {
    away.won += 1; away.points += 3; away.awayRecord.w += 1; away.form.push('W');
    home.lost += 1; home.homeRecord.l += 1; home.form.push('L');
  } else {
    home.drawn += 1; home.points += 1; home.homeRecord.d += 1; home.form.push('D');
    away.drawn += 1; away.points += 1; away.awayRecord.d += 1; away.form.push('D');
  }

  // Keep the form guide to the last six.
  if (home.form.length > 6) home.form = home.form.slice(-6);
  if (away.form.length > 6) away.form = away.form.slice(-6);

  state.tables[comp.id] = sortTable(
    table,
    state.fixtures.filter((f) => f.competitionId === comp.id),
    (id) => state.clubs[id]?.name ?? id,
  );
}

export function tableFor(state: GameState, competitionId: string): LeagueTableRow[] {
  const table = state.tables[competitionId] ?? [];
  return sortTable(
    table,
    state.fixtures.filter((f) => f.competitionId === competitionId),
    (id) => state.clubs[id]?.name ?? id,
  );
}

export function positionOf(state: GameState, competitionId: string, clubId: string): number {
  return tableFor(state, competitionId).findIndex((r) => r.clubId === clubId) + 1;
}

/** Zones for colouring the table: promotion, play-off, relegation. */
export type TableZone = 'promotion' | 'playoff' | 'relegation' | 'none';

export function zoneFor(state: GameState, competitionId: string, index: number): TableZone {
  const comp = getCompetition(state, competitionId);
  const size = comp.clubIds.length;
  const promotion = comp.promotionSpots ?? 0;
  const playoff = comp.playoffSpots ?? 0;
  const relegation = comp.relegationSpots ?? 0;

  if (index < promotion) return 'promotion';
  if (index < promotion + playoff) return 'playoff';
  if (relegation > 0 && index >= size - relegation) return 'relegation';
  return 'none';
}

/** Points a club is projected to finish on, used by the board and the media. */
export function projectedPoints(row: LeagueTableRow, totalGames: number): number {
  if (row.played === 0) return 0;
  return Math.round((effectivePoints(row) / row.played) * totalGames);
}
