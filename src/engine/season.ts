/**
 * Season rollover: final tables, promotion and relegation, honours, awards, and building the
 * next season from the wreckage of the last one.
 */

import { Rng, clamp, deriveSeed } from './rng';
import { addDaysISO, parseISO, seasonLabel } from './date';
import { Position } from './types';
import { buildPlayer, computeValue, makeContract, PlayerSeed } from './players';
import { generateName } from './generate';
import { GENERATED_NATIONALITY_WEIGHTS } from '../data/names';
import { freeAgents } from './gamestate';
import { GameState, SeasonHistory, getClub, squadOf } from './gamestate';
import { emptyTable, tableFor, effectivePoints } from './table';
import { generateSeasonFixtures } from './fixtures';
import { initialiseCups, initialisePlayoffs } from './cups';
import { payLeaguePrizeMoney, billSeasonTickets, closeSeasonAccounts } from './finance';
import { archiveSeasonStats, processRetirements, promoteYouthPlayers } from './progression';
import { endOfSeasonReview, setSeasonBudgets, ordinal } from './board';
import { seasonAwards, publishPredictions, squadStrength } from './media';
import { addNews } from './news';
import { autoPickTeam } from './selection';
import { PARACHUTE_PAYMENTS } from '../data/competitions';

/** Every league fixture played? */
export function leagueSeasonComplete(state: GameState): boolean {
  return state.fixtures
    .filter((f) => state.competitions[f.competitionId]?.kind === 'league')
    .every((f) => f.played);
}

/** Play-offs finished (or not required)? */
export function playoffsComplete(state: GameState): boolean {
  return Object.values(state.playoffs).every((p) => p.stage === 'complete');
}

export function cupsComplete(state: GameState): boolean {
  return Object.values(state.cups).every((c) => c.winnerClubId !== null);
}

/** Fire the play-offs once the league programme is done. */
export function startPlayoffsIfReady(state: GameState): void {
  if (!leagueSeasonComplete(state)) return;
  for (const comp of Object.values(state.competitions)) {
    if (comp.kind !== 'league' || !comp.playoffSpots) continue;
    const playoffId = `${comp.id}-playoff`;
    if (state.playoffs[playoffId]) continue;
    const ordered = tableFor(state, comp.id).map((r) => r.clubId);
    initialisePlayoffs(state, comp.id, ordered);
  }
}

/**
 * Close the season: record history, award prize money and honours, move clubs between divisions,
 * age the world on, then build the new season.
 */
export function endSeason(state: GameState): void {
  const rng = new Rng(deriveSeed(state.rngState, `season-end:${state.season}`));
  const finalTables: Record<string, string[]> = {};
  const managedClub = getClub(state, state.manager.clubId);
  const managedLeagueBefore = managedClub.leagueId;

  // --- Final tables, honours and prize money -------------------------------------------------
  for (const comp of Object.values(state.competitions)) {
    if (comp.kind !== 'league') continue;
    const table = tableFor(state, comp.id);
    const ordered = table.map((r) => r.clubId);
    finalTables[comp.id] = ordered;

    payLeaguePrizeMoney(state, comp.id, ordered);

    // Champions.
    const champion = state.clubs[ordered[0]];
    if (champion) {
      champion.honours.push({ competitionName: comp.name, season: state.season });
      champion.reputation = Math.min(100, champion.reputation + 2);
      if (champion.isPlayerControlled) {
        state.manager.honours.push({
          competitionName: comp.name, season: state.season, clubName: champion.name,
        });
        const current = state.manager.career[state.manager.career.length - 1];
        if (current) current.honours.push(`${comp.name} ${state.season}`);
      }
    }

    // Club history rows.
    table.forEach((row, index) => {
      const club = state.clubs[row.clubId];
      if (!club) return;
      const attendances = state.fixtures
        .filter((f) => f.homeClubId === club.id && f.played && f.attendance)
        .map((f) => f.attendance as number);
      club.history.push({
        season: state.season,
        competitionName: comp.name,
        position: index + 1,
        played: row.played,
        won: row.won,
        drawn: row.drawn,
        lost: row.lost,
        goalsFor: row.goalsFor,
        goalsAgainst: row.goalsAgainst,
        points: effectivePoints(row),
        averageAttendance: attendances.length
          ? Math.round(attendances.reduce((a, b) => a + b, 0) / attendances.length)
          : 0,
        managerName: club.isPlayerControlled
          ? `${state.manager.firstName} ${state.manager.lastName}`
          : '',
      });
      if (club.history.length > 40) club.history.shift();
    });
  }

  // --- Awards and review ---------------------------------------------------------------------
  const awards = seasonAwards(state);
  const managedPosition = (finalTables[managedLeagueBefore] ?? []).indexOf(managedClub.id) + 1;
  endOfSeasonReview(state);

  const history: SeasonHistory = {
    season: state.season,
    finalTables,
    cupWinners: Object.fromEntries(
      Object.entries(state.cups)
        .filter(([, cup]) => cup.winnerClubId)
        .map(([id, cup]) => [id, cup.winnerClubId as string]),
    ),
    playerOfTheYear: awards.playerOfTheYear,
    youngPlayerOfTheYear: awards.youngPlayerOfTheYear,
    topScorer: awards.topScorer,
    managerClubId: managedClub.id,
    managerPosition: managedPosition,
  };
  state.history.push(history);

  closeSeasonAccounts(state);

  // --- Promotion and relegation --------------------------------------------------------------
  applyPromotionAndRelegation(state, finalTables);

  // --- Age the world on ----------------------------------------------------------------------
  archiveSeasonStats(state);
  processRetirements(state);
  promoteYouthPlayers(state);

  // --- Build the new season ------------------------------------------------------------------
  const nextStartYear = parseISO(state.date).getUTCFullYear();
  state.date = `${nextStartYear}-07-01`;
  state.season = seasonLabel(state.date);

  // Parachute payments tick along.
  for (const clubId of Object.keys(state.parachuteYears)) {
    state.parachuteYears[clubId] += 1;
    if (state.parachuteYears[clubId] > PARACHUTE_PAYMENTS.length) delete state.parachuteYears[clubId];
  }

  state.fixtures = [];
  state.cups = {};
  state.playoffs = {};
  state.tables = {};
  state.transferOffers = [];
  state.contractOffers = [];
  state.boardRequests = [];
  state.processedToday = [];
  state.pendingStop = { kind: 'none' };

  for (const comp of Object.values(state.competitions)) {
    if (comp.kind === 'league') state.tables[comp.id] = emptyTable(comp.clubIds);
  }

  generateSeasonFixtures(state);
  initialiseCups(state);

  for (const club of Object.values(state.clubs)) {
    setSeasonBudgets(state, club.id);
    autoPickTeam(state, club.id);
    // Reputation drifts toward the level the club is actually competing at.
    const comp = state.competitions[club.leagueId];
    const targetReputation = { 1: 76, 2: 50, 3: 32, 4: 21 }[comp?.tier ?? 4] ?? 21;
    club.reputation = clamp(club.reputation + (targetReputation - club.reputation) * 0.12, 5, 100);
  }

  ensureViableSquads(state);
  billSeasonTickets(state);
  publishPredictions(state);

  if (managedClub.isPlayerControlled) {
    const comp = state.competitions[managedClub.leagueId];
    addNews(state, {
      category: 'general',
      important: true,
      subject: `Welcome to ${state.season}`,
      body: `Pre-season is under way. You are managing ${managedClub.name} in the ${comp?.name}. Squad strength is rated ${Math.round(squadStrength(state, managedClub.id))} out of 200.`,
    });
  }

  void rng;
}

function applyPromotionAndRelegation(state: GameState, finalTables: Record<string, string[]>): void {
  const order = ['premier-league', 'championship', 'league-one', 'league-two'];
  const moves: { clubId: string; from: string; to: string; direction: 'up' | 'down' }[] = [];

  for (let tier = 0; tier < order.length; tier++) {
    const compId = order[tier];
    const comp = state.competitions[compId];
    const table = finalTables[compId];
    if (!comp || !table) continue;

    const above = order[tier - 1];
    const below = order[tier + 1];

    // Relegation.
    const relegationSpots = comp.relegationSpots ?? 0;
    if (relegationSpots > 0 && below) {
      for (const clubId of table.slice(-relegationSpots)) {
        moves.push({ clubId, from: compId, to: below, direction: 'down' });
      }
    }

    // Automatic promotion.
    const promotionSpots = comp.promotionSpots ?? 0;
    if (promotionSpots > 0 && above) {
      for (const clubId of table.slice(0, promotionSpots)) {
        moves.push({ clubId, from: compId, to: above, direction: 'up' });
      }
      // Play-off winner.
      const playoff = state.playoffs[`${compId}-playoff`];
      if (playoff?.winnerClubId) {
        moves.push({ clubId: playoff.winnerClubId, from: compId, to: above, direction: 'up' });
      }
    }
  }

  for (const move of moves) {
    const club = state.clubs[move.clubId];
    if (!club) continue;
    const from = state.competitions[move.from];
    const to = state.competitions[move.to];
    if (!from || !to) continue;

    from.clubIds = from.clubIds.filter((id) => id !== club.id);
    to.clubIds.push(club.id);
    club.leagueId = to.id;

    // Relegation from the Premier League starts the parachute payment clock.
    if (move.from === 'premier-league' && move.direction === 'down') {
      state.parachuteYears[club.id] = 0;
    }

    club.reputation = clamp(club.reputation + (move.direction === 'up' ? 4 : -4), 5, 100);
    club.fanHappiness = clamp(club.fanHappiness + (move.direction === 'up' ? 22 : -22), 0, 100);

    if (club.isPlayerControlled) {
      addNews(state, {
        category: 'competition',
        important: true,
        subject: move.direction === 'up' ? 'PROMOTED!' : 'Relegated',
        body: move.direction === 'up'
          ? `${club.name} will play in the ${to.name} next season. Congratulations — this is what you were hired to do.`
          : `${club.name} have been relegated to the ${to.name}. The board will expect an immediate response, and the finances will need managing carefully.`,
      });
      if (move.direction === 'up') {
        state.manager.reputation = Math.min(100, state.manager.reputation + 10);
        club.board.confidence = Math.min(100, club.board.confidence + 25);
      } else {
        state.manager.reputation = Math.max(1, state.manager.reputation - 5);
      }
    }
  }

  // Divisions must stay the right size; if a play-off winner and the automatic spots don't
  // balance (they always should), log rather than silently corrupt the world.
  for (const compId of order) {
    const comp = state.competitions[compId];
    if (!comp) continue;
    const expected = compId === 'premier-league' ? 20 : 24;
    if (comp.clubIds.length !== expected) {
      // Rebalance by moving the nearest-ranked clubs, so a save can never end up unplayable.
      rebalanceDivision(state, order, compId, expected, finalTables);
    }
  }
}

/**
 * Safety net. Promotion and relegation should always balance, but if an edge case ever leaves a
 * division the wrong size, patch it rather than leaving the game in a broken state.
 */
function rebalanceDivision(
  state: GameState,
  order: string[],
  compId: string,
  expected: number,
  finalTables: Record<string, string[]>,
): void {
  const comp = state.competitions[compId];
  const tierIndex = order.indexOf(compId);
  const below = order[tierIndex + 1];
  const above = order[tierIndex - 1];

  while (comp.clubIds.length > expected && below) {
    const table = finalTables[compId] ?? comp.clubIds;
    const worst = [...comp.clubIds].sort(
      (a, b) => table.indexOf(b) - table.indexOf(a),
    )[0];
    comp.clubIds = comp.clubIds.filter((id) => id !== worst);
    state.competitions[below].clubIds.push(worst);
    state.clubs[worst].leagueId = below;
  }

  while (comp.clubIds.length < expected && below) {
    const belowTable = finalTables[below] ?? state.competitions[below].clubIds;
    const best = belowTable.find((id) => state.competitions[below].clubIds.includes(id));
    if (!best) break;
    state.competitions[below].clubIds = state.competitions[below].clubIds.filter((id) => id !== best);
    comp.clubIds.push(best);
    state.clubs[best].leagueId = compId;
  }

  void above;
}

/**
 * Squad-integrity backstop.
 *
 * Retirements, expiring contracts and an AI that doesn't always shop sensibly can, over several
 * seasons, leave a club genuinely short in a position — and a club with no goalkeeper cannot field
 * a legal side, which would make the save unplayable. Real clubs never let this happen, so nor do
 * we: any hole is filled from the free-agent pool, and if the pool has nobody suitable, a player is
 * generated at a level appropriate to the division.
 *
 * This runs after the rollover, once retirements and promotion have settled.
 */
function ensureViableSquads(state: GameState): void {
  const rng = new Rng(deriveSeed(state.rngState, `squadfill:${state.season}`));
  const startYear = parseISO(state.date).getUTCFullYear();

  const REQUIREMENTS: { positions: Position[]; minimum: number }[] = [
    { positions: ['GK'], minimum: 3 },
    { positions: ['DR', 'DL', 'DC', 'WBR', 'WBL'], minimum: 7 },
    { positions: ['DM', 'MC', 'MR', 'ML'], minimum: 6 },
    { positions: ['AMC', 'AMR', 'AML', 'ST'], minimum: 5 },
  ];

  for (const club of Object.values(state.clubs)) {
    const tier = state.competitions[club.leagueId]?.tier ?? 4;
    const squad = squadOf(state, club.id);
    const level = squad.length
      ? squad.reduce((sum, p) => sum + p.currentAbility, 0) / squad.length / 1.9
      : [0, 66, 48, 36, 27][tier] ?? 27;

    for (const { positions, minimum } of REQUIREMENTS) {
      let have = squadOf(state, club.id).filter((p) => positions.includes(p.naturalPosition)).length;

      while (have < minimum) {
        // Prefer signing somebody who already exists and is roughly the right standard — that is
        // how a real club fills a hole in August.
        const candidate = freeAgents(state)
          .filter((p) => positions.includes(p.naturalPosition))
          .filter((p) => p.currentAbility <= level * 1.9 * 1.2)
          .sort((a, b) => b.currentAbility - a.currentAbility)[0];

        let player = candidate;
        if (!player) {
          const position = rng.pick(positions);
          const nationality = rng.weighted(GENERATED_NATIONALITY_WEIGHTS, ([, w]) => w)[0];
          const { first, last } = generateName(rng, nationality);
          const ability = clamp(Math.round(rng.gaussian(level - 6, 4)), 10, 90);
          const seed: PlayerSeed = [
            `${first} ${last}`, position, startYear - rng.int(19, 30), nationality,
            ability, clamp(ability + rng.int(0, 12), ability, 92),
          ];
          player = buildPlayer(seed, null, state.date, { salt: have });
          state.players[player.id] = player;
        }

        player.clubId = club.id;
        club.playerIds.push(player.id);
        player.contract = makeContract(player, club.reputation, state.date, rng.int(1, 3), 'Backup', rng);
        player.value = computeValue(player, state.date);
        have += 1;
      }
    }

    autoPickTeam(state, club.id);
  }
}

/** Squad registration and pre-season housekeeping, run on 1 July. */
export function preSeasonHousekeeping(state: GameState): void {
  for (const club of Object.values(state.clubs)) {
    for (const player of squadOf(state, club.id)) {
      player.condition = 88;
      player.matchSharpness = 45;
      player.morale = clamp(player.morale + 10, 20, 95);
      player.bookingPoints = 0;
      player.suspensionMatches = 0;
    }
    autoPickTeam(state, club.id);
  }
}

/** Whether a date sits in the closed season. */
export function isCloseSeason(date: string): boolean {
  const [, month, day] = date.split('-').map(Number);
  return (month === 6) || (month === 7 && day < 8);
}

export function seasonProgressLabel(state: GameState): string {
  const club = getClub(state, state.manager.clubId);
  const comp = state.competitions[club.leagueId];
  if (!comp) return state.season;
  const table = tableFor(state, comp.id);
  const row = table.find((r) => r.clubId === club.id);
  if (!row || row.played === 0) return `${comp.shortName} — season not started`;
  const position = table.findIndex((r) => r.clubId === club.id) + 1;
  return `${ordinal(position)} in the ${comp.shortName}, ${effectivePoints(row)} pts from ${row.played}`;
}

/** Total league games in the managed club's division. */
export function leagueGameCount(state: GameState): number {
  const club = getClub(state, state.manager.clubId);
  const comp = state.competitions[club.leagueId];
  return comp ? (comp.clubIds.length - 1) * 2 : 46;
}

export function addSeasonDays(date: string, days: number): string {
  return addDaysISO(date, days);
}
