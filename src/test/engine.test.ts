/**
 * Engine unit tests: the invariants that must hold for a career to be playable at all.
 */

import { describe, it, expect } from 'vitest';
import { Rng } from '../engine/rng';
import { createNewGame } from '../engine/generate';
import { roundRobin } from '../engine/fixtures';
import { sortTable, emptyRow, effectivePoints } from '../engine/table';
import { advance } from '../game/loop';
import { compress, decompress } from '../game/compress';
import { computeCurrentAbility, generateAttributes } from '../engine/attributes';
import { buildPlayer, computeValue } from '../engine/players';
import { seasonLabel, addDaysISO, daysBetween, yearsBetween } from '../engine/date';

const BASE_OPTIONS = {
  managerFirstName: 'Test',
  managerLastName: 'Manager',
  managerNationality: 'England',
  managerBackground: 'Professional Footballer' as const,
  difficulty: 'Normal' as const,
  preferredFormation: '4-4-2',
  startDate: '2026-07-01',
};

describe('rng', () => {
  it('is deterministic for a given seed', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    const seqA = Array.from({ length: 50 }, () => a.next());
    const seqB = Array.from({ length: 50 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('produces a roughly uniform distribution', () => {
    const rng = new Rng(7);
    const buckets = new Array(10).fill(0);
    for (let i = 0; i < 100_000; i++) buckets[Math.floor(rng.next() * 10)] += 1;
    for (const count of buckets) {
      expect(count).toBeGreaterThan(9_000);
      expect(count).toBeLessThan(11_000);
    }
  });

  it('clamps gaussian output to a sane range', () => {
    const rng = new Rng(11);
    for (let i = 0; i < 10_000; i++) {
      const value = rng.gaussian(10, 3);
      expect(value).toBeGreaterThan(0);
      expect(value).toBeLessThan(20);
    }
  });
});

describe('dates', () => {
  it('labels seasons on a July boundary', () => {
    expect(seasonLabel('2026-08-15')).toBe('2026/27');
    expect(seasonLabel('2027-03-01')).toBe('2026/27');
    expect(seasonLabel('2027-07-01')).toBe('2027/28');
    expect(seasonLabel('2026-06-30')).toBe('2025/26');
  });

  it('does arithmetic in UTC', () => {
    expect(addDaysISO('2026-12-31', 1)).toBe('2027-01-01');
    expect(daysBetween('2026-01-01', '2026-03-01')).toBe(59);
    expect(yearsBetween('2000-05-14', '2026-05-13')).toBe(25);
    expect(yearsBetween('2000-05-14', '2026-05-14')).toBe(26);
  });
});

describe('fixture generation', () => {
  it('builds a balanced double round robin', () => {
    const clubs = Array.from({ length: 24 }, (_, i) => `c${i}`);
    const rounds = roundRobin(clubs, new Rng(5));

    // 24 clubs play 46 rounds of 12 matches.
    expect(rounds).toHaveLength(46);
    for (const round of rounds) expect(round).toHaveLength(12);

    // No club appears twice in a round.
    for (const round of rounds) {
      const seen = new Set<string>();
      for (const [home, away] of round) {
        expect(seen.has(home)).toBe(false);
        expect(seen.has(away)).toBe(false);
        seen.add(home);
        seen.add(away);
      }
    }

    // Every pairing happens exactly once in each direction.
    const pairings = new Map<string, number>();
    for (const round of rounds) {
      for (const [home, away] of round) {
        const key = `${home}>${away}`;
        pairings.set(key, (pairings.get(key) ?? 0) + 1);
      }
    }
    expect(pairings.size).toBe(24 * 23);
    for (const count of pairings.values()) expect(count).toBe(1);
  });

  it('gives every club the same number of home and away games', () => {
    const clubs = Array.from({ length: 20 }, (_, i) => `c${i}`);
    const rounds = roundRobin(clubs, new Rng(9));
    const home = new Map<string, number>();
    const away = new Map<string, number>();
    for (const round of rounds) {
      for (const [h, a] of round) {
        home.set(h, (home.get(h) ?? 0) + 1);
        away.set(a, (away.get(a) ?? 0) + 1);
      }
    }
    for (const club of clubs) {
      expect(home.get(club)).toBe(19);
      expect(away.get(club)).toBe(19);
    }
  });
});

describe('league table', () => {
  it('sorts on points, then goal difference, then goals scored', () => {
    const rows = [
      { ...emptyRow('a'), points: 10, goalsFor: 10, goalsAgainst: 8 },
      { ...emptyRow('b'), points: 10, goalsFor: 12, goalsAgainst: 10 },
      { ...emptyRow('c'), points: 12, goalsFor: 5, goalsAgainst: 5 },
      { ...emptyRow('d'), points: 10, goalsFor: 6, goalsAgainst: 2 },
    ];
    const sorted = sortTable(rows, [], (id) => id);
    // c leads on points; d has the best GD of the 10-pointers; b outscores a on equal GD.
    expect(sorted.map((r) => r.clubId)).toEqual(['c', 'd', 'b', 'a']);
  });

  it('applies points deductions', () => {
    const rows = [
      { ...emptyRow('a'), points: 20, pointsDeduction: 12 },
      { ...emptyRow('b'), points: 15 },
    ];
    const sorted = sortTable(rows, [], (id) => id);
    expect(sorted[0].clubId).toBe('b');
    expect(effectivePoints(sorted[1])).toBe(8);
  });
});

describe('players', () => {
  it('generates the same player from the same seed data', () => {
    const seed = ['Test Player', 'ST', 2000, 'England', 70, 80] as const;
    const a = buildPlayer([...seed] as never, null, '2026-07-01');
    const b = buildPlayer([...seed] as never, null, '2026-07-01');
    expect(a.attributes).toEqual(b.attributes);
    expect(a.currentAbility).toBe(b.currentAbility);
  });

  it('maps ability onto current ability monotonically', () => {
    const rngFor = (ability: number) =>
      computeCurrentAbility(generateAttributes('MC', ability, new Rng(1)), 'MC');
    expect(rngFor(30)).toBeLessThan(rngFor(55));
    expect(rngFor(55)).toBeLessThan(rngFor(80));
    expect(rngFor(80)).toBeLessThan(rngFor(95));
  });

  it('values a 24-year-old above an identical 34-year-old', () => {
    const young = buildPlayer(['Young Man', 'AMC', 2002, 'England', 75, 80] as never, null, '2026-07-01');
    const old = buildPlayer(['Older Man', 'AMC', 1992, 'England', 75, 80] as never, null, '2026-07-01');
    expect(computeValue(young, '2026-07-01')).toBeGreaterThan(computeValue(old, '2026-07-01') * 2);
  });
});

describe('save compression', () => {
  it('round-trips arbitrary JSON', () => {
    const payload = JSON.stringify({
      nested: { a: [1, 2, 3], b: 'hello world hello world hello world' },
      unicode: 'St James’ Park — Kaoru Mitoma',
      numbers: Array.from({ length: 500 }, (_, i) => i * 1.5),
    });
    expect(decompress(compress(payload))).toBe(payload);
  });

  it('handles an empty string and a single character', () => {
    expect(decompress(compress(''))).toBe('');
    expect(decompress(compress('x'))).toBe('x');
  });

  it('meaningfully shrinks a repetitive payload', () => {
    const payload = JSON.stringify(
      Array.from({ length: 400 }, (_, i) => ({ id: `p${i}`, position: 'MC', nationality: 'England' })),
    );
    expect(compress(payload).length).toBeLessThan(payload.length * 0.5);
  });
});

describe('world generation', () => {
  it('builds the full pyramid', () => {
    const state = createNewGame({ ...BASE_OPTIONS, seed: 100 });

    expect(Object.keys(state.clubs)).toHaveLength(92);
    expect(state.competitions['premier-league'].clubIds).toHaveLength(20);
    expect(state.competitions['championship'].clubIds).toHaveLength(24);
    expect(state.competitions['league-one'].clubIds).toHaveLength(24);
    expect(state.competitions['league-two'].clubIds).toHaveLength(24);
    expect(Object.keys(state.players).length).toBeGreaterThan(2_000);
  });

  it('appoints the manager to a Championship club', () => {
    for (const seed of [1, 2, 3, 42, 999]) {
      const state = createNewGame({ ...BASE_OPTIONS, seed });
      const club = state.clubs[state.manager.clubId];
      expect(club.leagueId).toBe('championship');
      expect(club.isPlayerControlled).toBe(true);
      // Exactly one club is player-controlled.
      expect(Object.values(state.clubs).filter((c) => c.isPlayerControlled)).toHaveLength(1);
    }
  });

  it('gives every club a legal starting eleven and a viable squad', () => {
    const state = createNewGame({ ...BASE_OPTIONS, seed: 55 });
    for (const club of Object.values(state.clubs)) {
      const selected = club.tactics.slots.filter((s) => s.playerId);
      expect(selected.length).toBe(11);
      // No duplicates.
      const ids = selected.map((s) => s.playerId);
      expect(new Set(ids).size).toBe(11);
      // A goalkeeper is in goal.
      const keeperSlot = club.tactics.slots.find((s) => s.position === 'GK');
      expect(state.players[keeperSlot!.playerId!].naturalPosition).toBe('GK');
      expect(club.playerIds.length).toBeGreaterThanOrEqual(20);
    }
  });

  it('gives every player a contract and a sane value', () => {
    const state = createNewGame({ ...BASE_OPTIONS, seed: 77 });
    for (const club of Object.values(state.clubs)) {
      for (const id of club.playerIds) {
        const player = state.players[id];
        expect(player.contract).not.toBeNull();
        expect(player.contract!.wage).toBeGreaterThan(0);
        expect(Number.isFinite(player.value)).toBe(true);
        expect(player.value).toBeGreaterThanOrEqual(0);
        expect(player.currentAbility).toBeGreaterThan(0);
        expect(player.potentialAbility).toBeGreaterThanOrEqual(player.currentAbility);
      }
    }
  });

  it('is fully deterministic from the seed', () => {
    const a = createNewGame({ ...BASE_OPTIONS, seed: 31337 });
    const b = createNewGame({ ...BASE_OPTIONS, seed: 31337 });
    expect(a.manager.clubId).toBe(b.manager.clubId);
    expect(a.fixtures.map((f) => `${f.date}:${f.homeClubId}:${f.awayClubId}`))
      .toEqual(b.fixtures.map((f) => `${f.date}:${f.homeClubId}:${f.awayClubId}`));
  });

  it('keeps every league fixture inside the season window', () => {
    // A calendar that overruns pushes the whole season out — the ten-season soak caught this
    // happening whenever 8 August was not a Saturday, so pin it down for several start years.
    for (const year of [2026, 2027, 2028, 2029, 2030]) {
      const state = createNewGame({ ...BASE_OPTIONS, seed: 3000 + year, startDate: `${year}-07-01` });
      const league = state.fixtures.filter((f) => state.competitions[f.competitionId]?.kind === 'league');

      for (const fixture of league) {
        expect(fixture.date >= `${year}-08-01`).toBe(true);
        expect(fixture.date <= `${year + 1}-05-12`).toBe(true);
      }

      // Every division gets exactly one date per round.
      for (const compId of ['premier-league', 'championship']) {
        const fixtures = league.filter((f) => f.competitionId === compId);
        const rounds = new Set(fixtures.map((f) => f.round));
        const dates = new Set(fixtures.map((f) => f.date));
        expect(dates.size).toBe(rounds.size);
      }
    }
  });

  it('schedules a complete fixture list with no club double-booked', () => {
    const state = createNewGame({ ...BASE_OPTIONS, seed: 21 });
    const league = state.fixtures.filter((f) => state.competitions[f.competitionId]?.kind === 'league');
    // 20*19 + 3 * (24*23) = 380 + 1656 = 2036 league fixtures.
    expect(league).toHaveLength(2036);

    const byDate = new Map<string, Set<string>>();
    for (const fixture of league) {
      const set = byDate.get(fixture.date) ?? new Set();
      expect(set.has(fixture.homeClubId)).toBe(false);
      expect(set.has(fixture.awayClubId)).toBe(false);
      set.add(fixture.homeClubId);
      set.add(fixture.awayClubId);
      byDate.set(fixture.date, set);
    }
  });
});

describe('simulating a season', () => {
  it('plays a whole season and produces realistic statistics', () => {
    const state = createNewGame({ ...BASE_OPTIONS, seed: 2024 });
    state.autoPlayMatches = true;

    for (let i = 0; i < 80; i++) {
      const result = advance(state, 400);
      if (result.stop.kind === 'season-end' || result.stop.kind === 'sacked') break;
    }

    const played = state.fixtures.filter(
      (f) => f.played && state.competitions[f.competitionId]?.kind === 'league',
    );
    expect(played.length).toBe(2036);

    let goals = 0;
    let homeWins = 0;
    let draws = 0;
    let shots = 0;
    let yellows = 0;
    let reds = 0;

    for (const fixture of played) {
      const result = fixture.result!;
      goals += result.homeGoals + result.awayGoals;
      if (result.homeGoals > result.awayGoals) homeWins += 1;
      else if (result.homeGoals === result.awayGoals) draws += 1;
      shots += result.stats.home.shots + result.stats.away.shots;
      yellows += result.stats.home.yellowCards + result.stats.away.yellowCards;
      reds += result.stats.home.redCards + result.stats.away.redCards;

      // Nothing absurd should ever come out of the engine.
      expect(result.homeGoals).toBeLessThan(12);
      expect(result.awayGoals).toBeLessThan(12);
      expect(fixture.attendance).toBeGreaterThan(0);
    }

    const n = played.length;
    // Real English league football: ~2.6-2.8 goals, ~44% home wins, ~24 shots, ~3.5 cards.
    expect(goals / n).toBeGreaterThan(2.2);
    expect(goals / n).toBeLessThan(3.2);
    expect(homeWins / n).toBeGreaterThan(0.38);
    expect(homeWins / n).toBeLessThan(0.52);
    expect(draws / n).toBeGreaterThan(0.16);
    expect(draws / n).toBeLessThan(0.32);
    expect(shots / n).toBeGreaterThan(18);
    expect(shots / n).toBeLessThan(30);
    expect(yellows / n).toBeGreaterThan(2);
    expect(yellows / n).toBeLessThan(5.5);
    expect(reds / n).toBeLessThan(0.5);
  }, 240_000);

  it('keeps league tables consistent with the results', () => {
    const state = createNewGame({ ...BASE_OPTIONS, seed: 606 });
    state.autoPlayMatches = true;
    for (let i = 0; i < 40; i++) {
      const result = advance(state, 400);
      if (result.stop.kind === 'season-end' || result.stop.kind === 'sacked') break;
    }

    for (const compId of ['premier-league', 'championship', 'league-one', 'league-two']) {
      const table = state.tables[compId];
      const fixtures = state.fixtures.filter((f) => f.competitionId === compId && f.played);

      // Total played across the table is twice the number of matches.
      const totalPlayed = table.reduce((sum, r) => sum + r.played, 0);
      expect(totalPlayed).toBe(fixtures.length * 2);

      // Goals for across the division equals goals against.
      const gf = table.reduce((sum, r) => sum + r.goalsFor, 0);
      const ga = table.reduce((sum, r) => sum + r.goalsAgainst, 0);
      expect(gf).toBe(ga);

      // Points reconcile with W/D/L.
      for (const row of table) {
        expect(row.points).toBe(row.won * 3 + row.drawn);
        expect(row.played).toBe(row.won + row.drawn + row.lost);
      }
    }
  }, 180_000);
});

describe('financial invariants', () => {
  it('never produces NaN balances', () => {
    const state = createNewGame({ ...BASE_OPTIONS, seed: 808 });
    state.autoPlayMatches = true;
    for (let i = 0; i < 30; i++) {
      const result = advance(state, 200);
      if (result.stop.kind === 'season-end' || result.stop.kind === 'sacked') break;
      for (const club of Object.values(state.clubs)) {
        expect(Number.isFinite(club.finances.balance)).toBe(true);
        expect(Number.isFinite(club.finances.transferBudget)).toBe(true);
        expect(club.finances.transferBudget).toBeGreaterThanOrEqual(0);
      }
    }
  }, 180_000);
});
