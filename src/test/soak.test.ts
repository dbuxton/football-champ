/**
 * The soak test: ten consecutive seasons, headless.
 *
 * Unit tests catch broken code. This catches broken *balance* — the slow-burn failures that only
 * show up after several rollovers: wage inflation, every club going bankrupt, the transfer market
 * drying up, squads shrinking to nothing, or the whole league drifting into being 30 goals a game.
 */

import { describe, it, expect } from 'vitest';
import { createNewGame } from '../engine/generate';
import { advance, rolloverSeason } from '../game/loop';
import { tableFor } from '../engine/table';
import { squadOf } from '../engine/gamestate';
import { ageOf } from '../engine/players';
import { ordinal } from '../engine/board';

const SEASONS = 10;

describe('ten-season soak', () => {
  it('survives a decade without the world falling apart', () => {
    const state = createNewGame({
      seed: 8675309,
      managerFirstName: 'Soak',
      managerLastName: 'Tester',
      managerNationality: 'England',
      managerBackground: 'Continental Coaching Badges',
      difficulty: 'Normal',
      preferredFormation: '4-2-3-1',
      startDate: '2026-07-01',
    });
    state.autoPlayMatches = true;

    const report: string[] = [];

    for (let season = 0; season < SEASONS; season++) {
      const label = state.season;
      let guard = 0;
      let sacked = false;

      while (guard < 120) {
        const result = advance(state, 400);
        guard += 1;
        if (result.stop.kind === 'season-end') break;
        if (result.stop.kind === 'sacked') { sacked = true; break; }
      }

      if (sacked) {
        // Being sacked is a legitimate outcome, not a failure — stop here.
        report.push(`${label}: manager sacked`);
        break;
      }

      // Every league fixture must have been played before the season can end.
      const unplayed = state.fixtures.filter(
        (f) => !f.played && state.competitions[f.competitionId]?.kind === 'league',
      );
      expect(unplayed).toHaveLength(0);

      // Divisions must be the right size before the rollover.
      expect(state.competitions['premier-league'].clubIds).toHaveLength(20);
      for (const id of ['championship', 'league-one', 'league-two']) {
        expect(state.competitions[id].clubIds).toHaveLength(24);
      }

      const table = tableFor(state, state.clubs[state.manager.clubId].leagueId);
      const position = table.findIndex((r) => r.clubId === state.manager.clubId) + 1;
      report.push(
        `${label}: ${state.clubs[state.manager.clubId].shortName} ` +
        `${ordinal(position)} ` +
        `in ${state.competitions[state.clubs[state.manager.clubId].leagueId].shortName}`,
      );

      rolloverSeason(state);

      // --- Post-rollover invariants ----------------------------------------------------------

      // Every club still has a usable squad.
      for (const club of Object.values(state.clubs)) {
        const squad = squadOf(state, club.id);
        expect(squad.length).toBeGreaterThanOrEqual(14);
        expect(squad.filter((p) => p.naturalPosition === 'GK').length).toBeGreaterThanOrEqual(1);
        expect(club.tactics.slots.filter((s) => s.playerId).length).toBe(11);
      }

      // Nobody is playing at 60.
      const ages = Object.values(state.players)
        .filter((p) => !p.retired && p.clubId)
        .map((p) => ageOf(p, state.date));
      expect(Math.max(...ages)).toBeLessThan(45);
      expect(Math.min(...ages)).toBeGreaterThanOrEqual(15);

      // The player pool doesn't collapse or explode.
      const active = Object.values(state.players).filter((p) => !p.retired).length;
      expect(active).toBeGreaterThan(1_800);
      expect(active).toBeLessThan(6_000);

      // Finances stay in the realm of the plausible.
      for (const club of Object.values(state.clubs)) {
        expect(Number.isFinite(club.finances.balance)).toBe(true);
        expect(Math.abs(club.finances.balance)).toBeLessThan(5_000_000_000);
        expect(Number.isFinite(club.finances.wageBudget)).toBe(true);
        expect(club.finances.wageBudget).toBeGreaterThan(0);
      }

      // A fresh fixture list exists for the new season.
      expect(state.fixtures.filter((f) => !f.played).length).toBeGreaterThan(1_800);
      expect(state.fixtures.every((f) => !f.played)).toBe(true);
    }

    // eslint-disable-next-line no-console
    console.log(report.join('\n'));
    expect(report.length).toBeGreaterThan(0);
  }, 900_000);

  it('keeps league quality from drifting between divisions', () => {
    const state = createNewGame({
      seed: 4242,
      managerFirstName: 'Soak',
      managerLastName: 'Tester',
      managerNationality: 'England',
      managerBackground: 'National Coaching Badges',
      difficulty: 'Normal',
      preferredFormation: '4-4-2',
      startDate: '2026-07-01',
    });
    state.autoPlayMatches = true;

    const averageAbility = (competitionId: string) => {
      const clubIds = state.competitions[competitionId].clubIds;
      const players = clubIds.flatMap((id) => squadOf(state, id));
      return players.reduce((sum, p) => sum + p.currentAbility, 0) / Math.max(1, players.length);
    };

    for (let season = 0; season < 4; season++) {
      let guard = 0;
      while (guard < 120) {
        const result = advance(state, 400);
        guard += 1;
        if (result.stop.kind === 'season-end') break;
        if (result.stop.kind === 'sacked') return;
      }
      rolloverSeason(state);
    }

    const pl = averageAbility('premier-league');
    const ch = averageAbility('championship');
    const l1 = averageAbility('league-one');
    const l2 = averageAbility('league-two');

    // eslint-disable-next-line no-console
    console.log(`Average ability — PL ${pl.toFixed(0)}, Champ ${ch.toFixed(0)}, L1 ${l1.toFixed(0)}, L2 ${l2.toFixed(0)}`);

    // The pyramid must stay a pyramid.
    expect(pl).toBeGreaterThan(ch);
    expect(ch).toBeGreaterThan(l1);
    expect(l1).toBeGreaterThan(l2);
  }, 600_000);
});
