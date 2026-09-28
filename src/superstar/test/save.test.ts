/**
 * Superstar's save: whatever comes out of local storage goes through sanitizeSave. It must never
 * throw, must turn garbage into an empty save, must round-trip a real career unchanged, and must
 * clamp anything out of range, because a broken save costs a kid their footballer.
 */

import { describe, it, expect } from 'vitest';
import { CLUBS } from '../data/clubs';
import { nextMatch, recordMatch, startNextSeason, STARTING_ATTRIBUTES, type Career } from '../engine/career';
import { SAVE_VERSION, emptySave, sanitizeCareer, sanitizeSave, type SaveFile } from '../store/save';
import { finishedMatch, makeCareer, withScore } from './helpers';

const roundTrip = (save: SaveFile) => sanitizeSave(JSON.parse(JSON.stringify(save)));

/** A career that has really played: league matches, the cup draw, a cup tie on penalties, a season end. */
function playedCareer(): Career {
  let c = makeCareer();
  const state = finishedMatch();
  const scores: [number, number][] = [[2, 1], [0, 0], [1, 3], [1, 1]];
  let n = 0;
  while (nextMatch(c) && n < 40) {
    const next = nextMatch(c)!;
    const [a, b] = scores[n % scores.length];
    const penalties: [number, number] | null = next.competition !== 'league' && a === b ? [4, 3] : null;
    c = { ...recordMatch(c, n === 0 ? state : withScore(state, a, b), penalties).career, pending: null };
    n++;
  }
  c = startNextSeason(c, 4321).career;
  // A few matches into season two, with the cup still to come.
  for (let i = 0; i < 3; i++) c = recordMatch(c, withScore(state, 1, 0)).career;
  return c;
}

describe('sanitizeSave with garbage', () => {
  const garbage: unknown[] = [
    null,
    undefined,
    0,
    42,
    NaN,
    'hello',
    '',
    true,
    [],
    [1, 2, 3],
    { careers: 'x' },
    { careers: {} },
    { careers: [null, 1, 'x', [], {}, { clubId: 'nope' }] },
    { careers: null, activeId: 5 },
  ];

  it('gives an empty save and never throws', () => {
    for (const g of garbage) {
      let save: SaveFile | undefined;
      expect(() => (save = sanitizeSave(g)), String(g)).not.toThrow();
      expect(save!.version).toBe(SAVE_VERSION);
      expect(save!.careers).toEqual([]);
      expect(save!.activeId).toBeNull();
    }
    for (const g of [null, 42, 'hello', [], { careers: 'x' }]) expect(sanitizeSave(g)).toEqual(emptySave());
  });

  it('mends a career with broken fields instead of throwing', () => {
    const broken = [
      { clubId: 'ars' },
      { clubId: 'ars', matches: 'x', stints: 5, attributes: null, look: [], cup: { cup: 'fa-cup', opponents: ['ars'] }, pending: 'soon' },
      { clubId: 'ars', matches: [null, {}, { clubId: 'ars' }], results: { a: null, b: { home: 'ars' } }, world: { reputation: [] } },
      { clubId: 'ars', badges: { nope: 1, debut: 'x' }, seasons: [1, null], trophies: [{ clubId: 'zzz' }, 7] },
    ];
    for (const b of broken) {
      const save = sanitizeSave({ careers: [b] });
      expect(save.careers).toHaveLength(1);
      const c = save.careers[0];
      expect(c.clubId).toBe('ars');
      expect(c.stints.at(-1)?.clubId).toBe('ars');
      expect(Array.isArray(c.matches)).toBe(true);
      expect(c.cup).toBeNull();
      expect(c.pending).toBeNull();
      expect(c.attributes).toEqual(STARTING_ATTRIBUTES.striker);
      expect(c.trophies).toEqual([]);
    }
  });
});

describe('sanitizeSave with a real career', () => {
  it('round-trips unchanged through JSON', () => {
    const career = playedCareer();
    // Make sure the career really covers the interesting parts.
    expect(career.season).toBe(2);
    expect(career.matches.length).toBeGreaterThan(20);
    expect(career.seasons).toHaveLength(1);
    expect(Object.keys(career.world.reputation).length).toBeGreaterThan(0);
    expect(career.matches.some((m) => m.competition !== 'league')).toBe(true);
    expect(Object.keys(career.results).length).toBeGreaterThan(0);

    const save: SaveFile = { version: SAVE_VERSION, careers: [career, makeCareer({ id: 'second' }, 'ars')], activeId: career.id };
    const restored = roundTrip(save);
    expect(restored).toEqual(save);
    expect(JSON.stringify(restored)).toBe(JSON.stringify(save));
  });

  it('round-trips a career with a cup run and a pending move', () => {
    let c = makeCareer({ round: 7 });
    c = recordMatch({ ...c, round: 6 }, finishedMatch()).career;
    expect(c.cup).not.toBeNull();
    c = recordMatch(c, withScore(finishedMatch(), 2, 2), [5, 3]).career;
    c = { ...c, pending: { kind: 'up', offers: [CLUBS[0].id, CLUBS[1].id], form: 8.1 } };
    const save: SaveFile = { version: SAVE_VERSION, careers: [c], activeId: c.id };
    expect(roundTrip(save)).toEqual(save);
  });

  it('keeps fields it does not know about', () => {
    const save = { version: SAVE_VERSION, careers: [{ ...makeCareer(), futureField: { a: 1 } }], activeId: null, extra: 'kept' };
    const restored = roundTrip(save as unknown as SaveFile) as unknown as typeof save;
    expect(restored.extra).toBe('kept');
    expect(restored.careers[0].futureField).toEqual({ a: 1 });
  });
});

describe('sanitizeSave clamps out-of-range values', () => {
  const base = () => JSON.parse(JSON.stringify(makeCareer())) as Record<string, unknown>;

  it('clamps attributes, points and the rest into range', () => {
    const c = sanitizeCareer({
      ...base(),
      attributes: { pace: 150, shooting: -5, passing: 'fast', dribbling: 55.6, tackling: Infinity, stamina: 99 },
      points: -10,
      number: 250,
      age: 3,
      round: 50,
      season: 0,
      halfMinutes: 99,
      difficulty: 'impossible',
      position: 'goalkeeper',
      look: { skin: 'red', hair: '#12345', hairStyle: 'mohawk', boots: '#ABCDEF' },
      name: 'A'.repeat(100),
    })!;
    expect(c.attributes).toEqual({ pace: 99, shooting: 1, passing: STARTING_ATTRIBUTES.striker.passing, dribbling: 56, tackling: STARTING_ATTRIBUTES.striker.tackling, stamina: 99 });
    expect(c.points).toBe(0);
    expect(c.number).toBeLessThanOrEqual(99);
    expect(c.age).toBeGreaterThanOrEqual(10);
    expect(c.round).toBeLessThanOrEqual(20);
    expect(c.season).toBe(1);
    expect(c.halfMinutes).toBeLessThanOrEqual(5);
    expect(['easy', 'medium', 'hard']).toContain(c.difficulty);
    expect(c.position).toBe('striker');
    expect(c.look.skin).toMatch(/^#[0-9a-f]{6}$/i);
    expect(c.look.hair).toMatch(/^#[0-9a-f]{6}$/i);
    expect(c.look.hair).not.toBe('#12345');
    expect(c.look.hairStyle).toBe('short');
    expect(c.look.boots).toBe('#ABCDEF');
    expect(c.name.length).toBeLessThanOrEqual(16);
  });

  it('clamps match records and drops ones against unknown clubs', () => {
    const good = { season: 1, round: 1, competition: 'league', clubId: 'bha', opponentId: 'eve', home: true, goalsFor: -3, goalsAgainst: 500, rating: 15, goals: 2, assists: 0, shots: 3, passes: 10, tackles: 1 };
    const c = sanitizeCareer({ ...base(), matches: [good, { ...good, opponentId: 'xyz' }, { ...good, rating: -2, competition: 'world-cup' }] })!;
    expect(c.matches).toHaveLength(2);
    expect(c.matches[0]).toMatchObject({ goalsFor: 0, goalsAgainst: 99, rating: 10 });
    expect(c.matches[1]).toMatchObject({ rating: 4, competition: 'league' });
  });

  it('drops unknown club ids everywhere', () => {
    expect(sanitizeCareer({ ...base(), clubId: 'xyz' })).toBeNull();
    const c = sanitizeCareer({
      ...base(),
      world: { reputation: { ars: 3, xyz: 9, bha: 1000 } },
      pending: { kind: 'up', offers: ['xyz', 'ars'], form: 50 },
      results: { '1:ars-xyz': { home: 'ars', away: 'xyz', hg: 1, ag: 0, scorers: [] }, '1:ars-bha': { home: 'ars', away: 'bha', hg: -1, ag: 200, scorers: [{ name: 'X', clubId: 'nope' }] } },
      stints: [{ clubId: 'xyz', matches: 3 }, { clubId: 'bha', matches: -4 }],
      trophies: [{ kind: 'fa-cup', season: 1, clubId: 'xyz' }, { kind: 'fa-cup', season: 1, clubId: 'bha' }],
    })!;
    expect(c.world.reputation).toEqual({ ars: 3, bha: 50 });
    expect(c.pending).toEqual({ kind: 'up', offers: ['ars'], form: 10 });
    expect(Object.keys(c.results)).toEqual(['1:ars-bha']);
    expect(c.results['1:ars-bha']).toEqual({ home: 'ars', away: 'bha', hg: 0, ag: 99, scorers: [] });
    expect(c.stints).toHaveLength(1);
    expect(c.stints[0]).toMatchObject({ clubId: 'bha', matches: 0 });
    expect(c.trophies).toHaveLength(1);
    // A pending move with no real clubs left is dropped altogether.
    expect(sanitizeCareer({ ...base(), pending: { kind: 'down', offers: ['xyz'], form: 5 } })!.pending).toBeNull();
  });

  it('drops a cup run with too few real opponents', () => {
    expect(sanitizeCareer({ ...base(), cup: { cup: 'fa-cup', opponents: ['ars', 'xyz', 'nope'], ties: [], over: false } })!.cup).toBeNull();
    expect(sanitizeCareer({ ...base(), cup: { cup: 'league-cup', opponents: ['ars', 'che', 'liv'], ties: [], over: false } })!.cup).toBeNull();
  });

  it('makes duplicate career ids unique', () => {
    const a = base();
    const save = sanitizeSave({ careers: [a, a, { ...a, id: 'other' }, a], activeId: 'test' });
    const ids = save.careers.map((c) => c.id);
    expect(ids).toHaveLength(4);
    expect(new Set(ids).size).toBe(4);
    expect(ids[0]).toBe('test');
    expect(save.activeId).toBe('test');
  });

  it('makes duplicate ids unique even when the new name is already taken', () => {
    const a = base();
    const save = sanitizeSave({ careers: [{ ...a, id: 'a_2' }, { ...a, id: 'a' }, { ...a, id: 'a' }] });
    const ids = save.careers.map((c) => c.id);
    expect(new Set(ids).size).toBe(3);
  });

  it('keeps activeId only if that career exists', () => {
    const a = base();
    expect(sanitizeSave({ careers: [a], activeId: 'test' }).activeId).toBe('test');
    expect(sanitizeSave({ careers: [a], activeId: 'gone' }).activeId).toBeNull();
    expect(sanitizeSave({ careers: [a], activeId: 7 }).activeId).toBeNull();
    expect(sanitizeSave({ careers: [], activeId: 'test' }).activeId).toBeNull();
  });
});
