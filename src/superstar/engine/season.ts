import { Rng, deriveSeed } from '../../engine/rng';
import { CLUBS, getClub } from '../data/clubs';
import { squadFor, squadStrength } from '../data/squads';
import { pickEleven } from './formation';
import { clamp } from './pitch';

/**
 * A Premier League season: every club plays every other club once, 19 rounds. You play your own
 * club's match each round; every other match is worked out from how good the two squads are, so
 * the league table moves on with you.
 *
 * Everything here is worked out from the season's seed, so the fixtures and the other results
 * never need saving — only your own matches do.
 */

export const ROUNDS = CLUBS.length - 1;

export type Fixture = { home: string; away: string };

export type Scorer = { name: string; clubId: string; kid?: boolean };

export type Result = { home: string; away: string; hg: number; ag: number; scorers: Scorer[] };

const fixtureCache = new Map<number, Fixture[][]>();

/** The season's rounds of fixtures (the "circle" method: everyone meets everyone once). */
export function seasonFixtures(seed: number): Fixture[][] {
  const cached = fixtureCache.get(seed);
  if (cached) return cached;
  const rng = new Rng(deriveSeed(seed, 'fixtures'));
  const ids = rng.shuffle(CLUBS.map((club) => club.id));
  const n = ids.length;
  const rounds: Fixture[][] = [];
  for (let r = 0; r < n - 1; r++) {
    const round: Fixture[] = [];
    for (let i = 0; i < n / 2; i++) {
      const a = ids[i];
      const b = ids[n - 1 - i];
      // Swap home and away round by round so nobody plays at home every week.
      const flip = i === 0 ? r % 2 === 1 : (i + r) % 2 === 1;
      round.push(flip ? { home: b, away: a } : { home: a, away: b });
    }
    rounds.push(round);
    ids.splice(1, 0, ids.pop()!);
  }
  fixtureCache.set(seed, rounds);
  return rounds;
}

/** A club's match in a round (rounds count from 1). */
export function fixtureFor(seed: number, round: number, clubId: string): Fixture | null {
  const fixtures = seasonFixtures(seed)[round - 1];
  return fixtures?.find((f) => f.home === clubId || f.away === clubId) ?? null;
}

export function fixtureKey(round: number, fixture: Fixture): string {
  return `${round}:${fixture.home}-${fixture.away}`;
}

function poisson(rng: Rng, mean: number): number {
  const limit = Math.exp(-mean);
  let k = 0;
  let p = rng.next();
  while (p > limit && k < 9) {
    k++;
    p *= rng.next();
  }
  return k;
}

/** How likely each starter is to score: strikers most, then attacking midfielders, and so on. */
const SCORING: Record<string, number> = {
  ST: 6,
  AMC: 3.5,
  AML: 3.2,
  AMR: 3.2,
  MR: 2.4,
  ML: 2.4,
  MC: 1.5,
  DM: 0.8,
  WBR: 0.6,
  WBL: 0.6,
  DC: 0.6,
  DR: 0.45,
  DL: 0.45,
  GK: 0,
};

const elevenCache = new Map<string, ReturnType<typeof pickEleven>>();
function eleven(clubId: string, season: number) {
  const key = `${clubId}:${season}`;
  let xi = elevenCache.get(key);
  if (!xi) {
    xi = pickEleven(squadFor(clubId, season), null);
    elevenCache.set(key, xi);
  }
  return xi;
}

function pickScorer(rng: Rng, clubId: string, season: number): Scorer {
  const players = eleven(clubId, season).filter((p) => p !== null);
  const pick = rng.weighted(players, (p) => SCORING[p.position] * (p.ability / 75) ** 2);
  return { name: pick.name, clubId };
}

/** A match you're not playing in, worked out from the two squads and a little luck. */
export function simulatedResult(seed: number, round: number, fixture: Fixture, season = 1): Result {
  const rng = new Rng(deriveSeed(seed, fixtureKey(round, fixture)));
  const gap = squadStrength(fixture.home, season) - squadStrength(fixture.away, season);
  const hg = poisson(rng, clamp(1.5 * Math.exp(gap * 0.055), 0.3, 3.6));
  const ag = poisson(rng, clamp(1.15 * Math.exp(-gap * 0.055), 0.2, 3.2));
  const scorers: Scorer[] = [];
  for (let i = 0; i < hg; i++) scorers.push(pickScorer(rng, fixture.home, season));
  for (let i = 0; i < ag; i++) scorers.push(pickScorer(rng, fixture.away, season));
  return { ...fixture, hg, ag, scorers };
}

export type TableRow = {
  clubId: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
};

/**
 * Every result up to and including `upToRound`: your matches as you played them, everyone
 * else's worked out.
 */
export function seasonResults(seed: number, upToRound: number, played: Record<string, Result>, season = 1): Result[] {
  const out: Result[] = [];
  const fixtures = seasonFixtures(seed);
  for (let round = 1; round <= Math.min(upToRound, ROUNDS); round++) {
    for (const fixture of fixtures[round - 1]) {
      out.push(played[fixtureKey(round, fixture)] ?? simulatedResult(seed, round, fixture, season));
    }
  }
  return out;
}

export function leagueTable(results: readonly Result[]): TableRow[] {
  const rows = new Map<string, TableRow>(
    CLUBS.map((club) => [club.id, { clubId: club.id, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0 }]),
  );
  for (const r of results) {
    const home = rows.get(r.home)!;
    const away = rows.get(r.away)!;
    home.played++;
    away.played++;
    home.goalsFor += r.hg;
    home.goalsAgainst += r.ag;
    away.goalsFor += r.ag;
    away.goalsAgainst += r.hg;
    if (r.hg > r.ag) {
      home.won++;
      home.points += 3;
      away.lost++;
    } else if (r.hg < r.ag) {
      away.won++;
      away.points += 3;
      home.lost++;
    } else {
      home.drawn++;
      away.drawn++;
      home.points++;
      away.points++;
    }
  }
  return [...rows.values()].sort(
    (a, b) =>
      b.points - a.points ||
      b.goalsFor - b.goalsAgainst - (a.goalsFor - a.goalsAgainst) ||
      b.goalsFor - a.goalsFor ||
      getClub(a.clubId).name.localeCompare(getClub(b.clubId).name),
  );
}

export type ScorerRow = { name: string; clubId: string; goals: number; kid: boolean };

/** The Golden Boot race. The kid's goals all count together, whichever clubs they scored for. */
export function topScorers(results: readonly Result[], limit = 10): ScorerRow[] {
  const tally = new Map<string, ScorerRow>();
  for (const r of results) {
    for (const s of r.scorers) {
      const key = s.kid ? 'kid' : `${s.name}|${s.clubId}`;
      const row = tally.get(key) ?? { name: s.name, clubId: s.clubId, goals: 0, kid: Boolean(s.kid) };
      row.goals++;
      // The kid's row shows the club they're at now.
      if (s.kid) row.clubId = s.clubId;
      tally.set(key, row);
    }
  }
  // Level on goals, the kid goes first: it's their game.
  return [...tally.values()].sort((a, b) => b.goals - a.goals || Number(b.kid) - Number(a.kid) || a.name.localeCompare(b.name)).slice(0, limit);
}
