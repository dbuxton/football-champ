/**
 * The season and the end of it: fixtures and the league table, then startNextSeason — a year older,
 * pre-season points, a fresh round 1, the season in the history books, trophies for champions,
 * and the ladder reshuffling as clubs that finished high grow and clubs that finished low shrink.
 */

import { describe, it, expect } from 'vitest';
import { CLUBS } from '../data/clubs';
import {
  PRE_SEASON_POINTS,
  ladder,
  rankOf,
  reputationChange,
  reputationOf,
  reviewSeason,
  startNextSeason,
  type Career,
} from '../engine/career';
import { ROUNDS, leagueTable, seasonFixtures, seasonResults, topScorers } from '../engine/season';
import { makeCareer, record } from './helpers';

/** A career whose season is over, at `clubId`, with a few matches played. */
function seasonOver(clubId = 'bha', seed = 12345): Career {
  const c = makeCareer({ round: ROUNDS + 1, seasonSeed: seed, points: 4 }, clubId);
  const matches = [7, 7.5, 6.5, 8].map((rating, i) => record(rating, { clubId, round: i + 1, goals: i % 2 }));
  return { ...c, matches, stints: [{ ...c.stints[0], matches: matches.length }] };
}

describe('the season', () => {
  it('has every club play every other club exactly once', () => {
    const rounds = seasonFixtures(77);
    expect(rounds).toHaveLength(ROUNDS);
    const pairs = new Set<string>();
    for (const round of rounds) {
      expect(round).toHaveLength(CLUBS.length / 2);
      const playing = round.flatMap((f) => [f.home, f.away]);
      expect(new Set(playing).size).toBe(CLUBS.length);
      for (const f of round) pairs.add([f.home, f.away].sort().join('-'));
    }
    expect(pairs.size).toBe((CLUBS.length * (CLUBS.length - 1)) / 2);
  });

  it('builds a table that adds up', () => {
    const results = seasonResults(77, ROUNDS, {});
    const table = leagueTable(results);
    expect(table).toHaveLength(CLUBS.length);
    for (const row of table) {
      expect(row.played).toBe(ROUNDS);
      expect(row.won + row.drawn + row.lost).toBe(ROUNDS);
      expect(row.points).toBe(row.won * 3 + row.drawn);
    }
    for (let i = 1; i < table.length; i++) expect(table[i - 1].points).toBeGreaterThanOrEqual(table[i].points);
    const goals = results.reduce((sum, r) => sum + r.hg + r.ag, 0);
    expect(table.reduce((sum, r) => sum + r.goalsFor, 0)).toBe(goals);
    const scorers = topScorers(results, 1000);
    expect(scorers.reduce((sum, s) => sum + s.goals, 0)).toBe(goals);
  });

  it('is the same season from the same seed', () => {
    expect(seasonResults(5, ROUNDS, {})).toEqual(seasonResults(5, ROUNDS, {}));
  });
});

describe('reputation', () => {
  it('rewards finishing high and punishes finishing low, more the further from the middle', () => {
    expect(reputationChange(1)).toBeGreaterThan(0);
    expect(reputationChange(CLUBS.length)).toBeLessThan(0);
    for (let p = 1; p < CLUBS.length; p++) expect(reputationChange(p)).toBeGreaterThanOrEqual(reputationChange(p + 1));
  });
});

describe('starting the next season', () => {
  const before = seasonOver();
  const { career: after, review, changes, badges } = startNextSeason(before, 999);

  it('makes the kid a year older, with pre-season points', () => {
    expect(after.age).toBe(before.age + 1);
    expect(changes.age).toBe(after.age);
    expect(after.points).toBe(before.points + PRE_SEASON_POINTS);
    expect(changes.bonusPoints).toBe(PRE_SEASON_POINTS);
  });

  it('starts a fresh season at round 1 with no cup and a new seed', () => {
    expect(after.season).toBe(before.season + 1);
    expect(after.round).toBe(1);
    expect(after.cup).toBeNull();
    expect(after.results).toEqual({});
    expect(after.seasonSeed).toBe(999);
    // Careers go on: matches, stints and club are kept.
    expect(after.matches).toEqual(before.matches);
    expect(after.stints).toEqual(before.stints);
    expect(after.clubId).toBe(before.clubId);
  });

  it('puts the season in the history books', () => {
    expect(after.seasons).toHaveLength(before.seasons.length + 1);
    const rec = after.seasons.at(-1)!;
    expect(rec).toEqual(review.record);
    expect(rec).toMatchObject({ season: 1, clubId: before.clubId, matches: 4, goals: 2 });
    expect(rec.averageRating).toBeCloseTo(7.25, 2);
    expect(rec.position).toBe(review.table.findIndex((row) => row.clubId === before.clubId) + 1);
  });

  it('grows the champions and shrinks the bottom club', () => {
    const champions = review.table[0].clubId;
    const last = review.table.at(-1)!.clubId;
    expect(after.world.reputation[champions]).toBeGreaterThan(0);
    expect(after.world.reputation[last]).toBeLessThan(0);
    expect(reputationOf(after, champions)).toBeGreaterThan(reputationOf(before, champions));
    expect(reputationOf(after, last)).toBeLessThan(reputationOf(before, last));
    // And their places on the ladder follow.
    expect(rankOf(after, champions)).toBeLessThanOrEqual(rankOf(before, champions));
    expect(rankOf(after, last)).toBeGreaterThanOrEqual(rankOf(before, last));
    // Higher finishers never lose more reputation than lower ones.
    const shift = (id: string) => after.world.reputation[id] ?? 0;
    for (let i = 1; i < review.table.length; i++) {
      expect(shift(review.table[i - 1].clubId)).toBeGreaterThanOrEqual(shift(review.table[i].clubId));
    }
  });

  it('reports the ladder before and after', () => {
    expect(changes.ladderBefore).toEqual(ladder(before).map((c) => c.id));
    expect(changes.ladderAfter).toEqual(ladder(after).map((c) => c.id));
    expect([...changes.ladderAfter].sort()).toEqual([...changes.ladderBefore].sort());
  });

  it('gives trophies only to the champions', () => {
    const championsId = review.table[0].clubId;
    if (before.clubId !== championsId) {
      expect(after.trophies.some((t) => t.kind === 'champions')).toBe(false);
      expect(badges).not.toContain('champions');
    }
    const winner = seasonOver(championsId);
    const won = startNextSeason(winner, 999);
    expect(won.review.position).toBe(1);
    expect(won.career.trophies).toContainEqual({ kind: 'champions', season: 1, clubId: championsId });
    expect(won.badges).toContain('champions');
    // Recorded against the season it was won in, not the new one.
    expect(won.career.badges.champions).toBe(won.review.season);
  });

  it('keeps last season in mind, but lets it fade', () => {
    const second = startNextSeason({ ...after, round: ROUNDS + 1 }, 1000).career;
    const table1 = review.table.map((r) => r.clubId);
    const table2 = reviewSeason({ ...after, round: ROUNDS + 1 }).table.map((r) => r.clubId);
    // A club that won both seasons has grown by more than one season's worth.
    if (table1[0] === table2[0]) {
      expect(second.world.reputation[table1[0]]).toBeGreaterThan(after.world.reputation[table1[0]]);
    }
    for (const shift of Object.values(second.world.reputation)) expect(Number.isFinite(shift)).toBe(true);
  });
});
