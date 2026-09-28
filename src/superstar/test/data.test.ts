/**
 * Superstar's data: the twenty clubs, their squads and kits, the flags on the player cards, and
 * how the squads age from season to season. If any of this breaks, a kid can't even line up.
 */

import { describe, it, expect } from 'vitest';
import { PREMIER_LEAGUE_SQUADS } from '../../data/squads/premier-league';
import { CLUBS, CLUB_COUNT, getClub, isClubId, keeperColours, kitsClash, matchKits } from '../data/clubs';
import { flagFor } from '../data/flags';
import { RETIREMENT_AGE, nextAbility, squadFor, type SquadPlayer } from '../data/squads';
import { FORMATION, PLAYER_POSITIONS, POSITION_SLOT, pickEleven } from '../engine/formation';

const average = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const allPlayers = (season: number): SquadPlayer[] => CLUBS.flatMap((club) => squadFor(club.id, season));

describe('clubs', () => {
  it('has the 20 Premier League clubs with unique ids', () => {
    expect(CLUBS).toHaveLength(20);
    expect(CLUB_COUNT).toBe(20);
    expect(new Set(CLUBS.map((c) => c.id)).size).toBe(20);
    expect(new Set(CLUBS.map((c) => c.code)).size).toBe(20);
  });

  it('ranks the ladder 1 to 20, biggest reputation first', () => {
    expect(CLUBS.map((c) => c.rank)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    for (let i = 1; i < CLUBS.length; i++) expect(CLUBS[i - 1].reputation).toBeGreaterThanOrEqual(CLUBS[i].reputation);
  });

  it('looks clubs up by id and rejects unknown ones', () => {
    for (const club of CLUBS) {
      expect(getClub(club.id)).toBe(club);
      expect(isClubId(club.id)).toBe(true);
    }
    expect(isClubId('nope')).toBe(false);
    expect(isClubId(42)).toBe(false);
    expect(() => getClub('nope')).toThrow();
  });
});

describe('squads', () => {
  it('every club has a squad big enough for a match day', () => {
    for (const club of CLUBS) {
      const squad = squadFor(club.id);
      expect(squad.length, club.id).toBeGreaterThanOrEqual(16);
      expect(squad.some((p) => p.position === 'GK'), club.id).toBe(true);
    }
  });

  it('picks a full eleven with exactly one keeper, in goal', () => {
    for (const club of CLUBS) {
      const eleven = pickEleven(squadFor(club.id), null);
      expect(eleven).toHaveLength(FORMATION.length);
      expect(eleven.every((p) => p !== null), club.id).toBe(true);
      expect(eleven.filter((p) => p?.position === 'GK'), club.id).toHaveLength(1);
      expect(eleven[0]?.position, club.id).toBe('GK');
      expect(new Set(eleven).size).toBe(11);
    }
  });

  it('leaves the kid their slot and still has exactly one keeper', () => {
    for (const club of CLUBS) {
      for (const position of PLAYER_POSITIONS) {
        const slot = POSITION_SLOT[position];
        const eleven = pickEleven(squadFor(club.id), slot);
        expect(eleven[slot]).toBeNull();
        expect(eleven.filter((p) => p !== null)).toHaveLength(10);
        expect(eleven.filter((p) => p?.position === 'GK')).toHaveLength(1);
      }
    }
  });
});

describe('kits', () => {
  it('never puts two clashing kits on the pitch, for every pairing', () => {
    const clashes: string[] = [];
    for (const home of CLUBS) {
      for (const away of CLUBS) {
        if (home.id === away.id) continue;
        const kits = matchKits(home.id, away.id);
        expect(kits.home).toBe(home.home);
        if (kitsClash(kits.home, kits.away)) clashes.push(`${home.id} v ${away.id}`);
      }
    }
    expect(clashes).toEqual([]);
  });

  it('gives the two keepers different shirts', () => {
    for (const home of CLUBS) {
      for (const away of CLUBS) {
        if (home.id === away.id) continue;
        const kits = matchKits(home.id, away.id);
        const [a, b] = keeperColours(kits.home, kits.away);
        expect(a).not.toBe(b);
      }
    }
  });
});

describe('flags', () => {
  it('has a flag for every nationality in the squads', () => {
    const nationalities = new Set(Object.values(PREMIER_LEAGUE_SQUADS).flatMap((squad) => squad.map((p) => p[3])));
    const missing = [...nationalities].filter((n) => flagFor(n) === '🏳️');
    expect(missing).toEqual([]);
  });
});

describe('ageing', () => {
  it('keeps the league average roughly level over the seasons', () => {
    const first = average(allPlayers(1).map((p) => p.ability));
    for (const season of [2, 3, 4, 5]) {
      const now = average(allPlayers(season).map((p) => p.ability));
      expect(Math.abs(now - first), `season ${season}`).toBeLessThan(2);
    }
  });

  it('makes everyone a year older each season', () => {
    const one = squadFor('ars', 1);
    const two = new Map(squadFor('ars', 2).map((p) => [p.name, p]));
    for (const p of one) {
      const later = two.get(p.name);
      if (later) expect(later.age).toBe(p.age + 1);
    }
  });

  it('young players with room to grow improve', () => {
    for (let ability = 40; ability < 90; ability += 5) {
      for (const age of [17, 19, 21, 23]) {
        expect(nextAbility(ability, ability + 10, age)).toBeGreaterThan(ability);
      }
    }
    // Across the league, the teenagers of season 1 are better two seasons later.
    const young = allPlayers(1).filter((p) => p.age <= 20 && p.potential > p.ability);
    expect(young.length).toBeGreaterThan(10);
    const later = new Map(CLUBS.flatMap((c) => squadFor(c.id, 3).map((p) => [`${c.id}|${p.name}`, p])));
    const club = (p: SquadPlayer) => CLUBS.find((c) => squadFor(c.id, 1).includes(p))!.id;
    const before = average(young.map((p) => p.ability));
    const after = average(young.map((p) => later.get(`${club(p)}|${p.name}`)!.ability));
    expect(after).toBeGreaterThan(before);
  });

  it('older players decline, and never grow past their potential', () => {
    expect(nextAbility(80, 90, 32)).toBeLessThan(80);
    expect(nextAbility(80, 90, 35)).toBeLessThan(nextAbility(80, 90, 31));
    expect(nextAbility(80, 80, 20)).toBeLessThanOrEqual(80);
  });

  it('retires players at 38', () => {
    for (const season of [1, 2, 3, 6]) {
      for (const p of allPlayers(season)) expect(p.age).toBeLessThan(RETIREMENT_AGE);
    }
    // Somebody who is 37 in one season has gone the next.
    let checked = 0;
    for (let season = 1; season <= 6; season++) {
      for (const club of CLUBS) {
        const veterans = squadFor(club.id, season).filter((p) => p.age === RETIREMENT_AGE - 1);
        const next = new Set(squadFor(club.id, season + 1).map((p) => p.name));
        for (const v of veterans) {
          expect(next.has(v.name), `${v.name} should have retired`).toBe(false);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('keeps every ability in range', () => {
    for (const season of [1, 4, 8]) {
      for (const p of allPlayers(season)) {
        expect(p.ability).toBeGreaterThanOrEqual(35);
        expect(p.ability).toBeLessThanOrEqual(95);
      }
    }
  });
});
