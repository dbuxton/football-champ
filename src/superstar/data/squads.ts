/**
 * The real players you line up with and against, from the management game's Premier League squad
 * list (`src/data/squads/premier-league.ts`) — and how they change as the seasons go by.
 *
 * Season 1 is the squads as written (2025–26). Every season after that, each player is a year
 * older: youngsters grow towards their potential, players in their prime hold steady, and older
 * players slowly fade and eventually retire. It's all worked out from the season number, so
 * nothing about it needs saving.
 */

import { PREMIER_LEAGUE_SQUADS } from '../../data/squads/premier-league';
import type { Position } from '../../engine/types';

export type { Position };

/** The year season 1 starts in. */
export const FIRST_SEASON_YEAR = 2025;
/** Players retire at this age. */
export const RETIREMENT_AGE = 38;

export type SquadPlayer = {
  name: string;
  /** What goes above their head on the pitch: the surname, or the one name some players go by. */
  shortName: string;
  position: Position;
  /** 1–100: how good they are this season. */
  ability: number;
  /** How good they could become. */
  potential: number;
  age: number;
  nationality: string;
};

/** "Bukayo Saka" → "Saka", "Virgil van Dijk" → "van Dijk", "Rodri" → "Rodri". */
export function surname(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts.length === 1 ? parts[0] : parts.slice(1).join(' ');
}

/** One season older: how a player's ability changes, given their age that season. */
export function nextAbility(ability: number, potential: number, age: number): number {
  const room = Math.max(0, potential - ability);
  let change: number;
  if (age <= 21) change = Math.min(room, Math.max(2, Math.round(room * 0.3)));
  else if (age <= 24) change = Math.min(room, Math.max(1, Math.round(room * 0.25)));
  else if (age <= 29) change = Math.min(room, 1);
  else if (age <= 31) change = -1;
  else if (age <= 33) change = -2;
  else change = -3;
  return Math.min(95, Math.max(35, ability + change));
}

function progressed(ability: number, potential: number, birthYear: number, season: number): number {
  let value = ability;
  for (let s = 1; s < season; s++) value = nextAbility(value, potential, FIRST_SEASON_YEAR + s - 1 - birthYear);
  return value;
}

/**
 * As everyone ages, the league would slowly get worse (nobody new arrives). Nudge everyone so the
 * league's average stays where it started — the old stars fade, the young ones take over.
 */
const levelling = new Map<number, number>();
function levelFor(season: number): number {
  let offset = levelling.get(season);
  if (offset === undefined) {
    let first = 0;
    let now = 0;
    let count = 0;
    for (const seeds of Object.values(PREMIER_LEAGUE_SQUADS)) {
      for (const [, , birthYear, , ability, potential] of seeds) {
        if (FIRST_SEASON_YEAR + season - 1 - birthYear >= RETIREMENT_AGE) continue;
        first += ability;
        now += progressed(ability, potential, birthYear, season);
        count++;
      }
    }
    offset = count ? Math.round((first - now) / count) : 0;
    levelling.set(season, offset);
  }
  return offset;
}

const cache = new Map<string, SquadPlayer[]>();

/** A club's squad in a season (season 1 unless you say otherwise), without anyone who has retired. */
export function squadFor(clubId: string, season = 1): SquadPlayer[] {
  const key = `${clubId}:${season}`;
  let squad = cache.get(key);
  if (!squad) {
    const seeds = PREMIER_LEAGUE_SQUADS[clubId];
    if (!seeds) throw new Error(`No squad for club ${clubId}`);
    const offset = season > 1 ? levelFor(season) : 0;
    squad = seeds
      .map(([name, position, birthYear, nationality, ability, potential]) => ({
        name,
        shortName: surname(name),
        position,
        ability: Math.min(95, Math.max(35, progressed(ability, potential, birthYear, season) + offset)),
        potential,
        age: FIRST_SEASON_YEAR + season - 1 - birthYear,
        nationality,
      }))
      .filter((player) => player.age < RETIREMENT_AGE);
    cache.set(key, squad);
  }
  return squad;
}

/** Average ability of a club's best eleven. Roughly 67 (the smallest club) to 85 (the biggest). */
export function squadStrength(clubId: string, season = 1): number {
  const best = [...squadFor(clubId, season)].sort((a, b) => b.ability - a.ability).slice(0, 11);
  return best.reduce((sum, player) => sum + player.ability, 0) / Math.max(1, best.length);
}
