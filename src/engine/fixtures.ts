/**
 * Fixture scheduling.
 *
 * League fixtures use the circle method to build a balanced double round-robin, then get laid out
 * across the calendar on Saturdays with midweek rounds inserted where needed. Cup rounds are
 * booked into their traditional weekends so the FA Cup third round still lands in early January.
 */

import { Rng, deriveSeed } from './rng';
import { addDaysISO, nextWeekday, parseISO, dateToISO } from './date';
import { Fixture, Weather } from './types';
import { GameState } from './gamestate';
import { nextId } from './players';

/**
 * Balanced double round-robin. The circle method pairs one fixed club against a rotating
 * carousel, which guarantees every club plays every other exactly once per half-season and
 * nobody appears twice in a round.
 */
export function roundRobin(clubIds: string[], rng: Rng): string[][][] {
  const teams = rng.shuffle([...clubIds]);
  // An odd number of clubs needs a bye. Our divisions are all even, but the helper shouldn't
  // silently produce a broken schedule if that ever changes.
  const hasBye = teams.length % 2 === 1;
  if (hasBye) teams.push('__BYE__');

  const n = teams.length;
  const roundsPerHalf = n - 1;
  const half: string[][][] = [];

  const rotating = teams.slice(1);
  for (let round = 0; round < roundsPerHalf; round++) {
    const pairs: string[][] = [];
    const fixed = teams[0];
    const opponent = rotating[round % rotating.length];

    // Alternate home and away for the fixed club so it doesn't play every game at home.
    pairs.push(round % 2 === 0 ? [fixed, opponent] : [opponent, fixed]);

    for (let i = 1; i < n / 2; i++) {
      const homeIndex = (round + i) % rotating.length;
      const awayIndex = (round - i + rotating.length * 2) % rotating.length;
      const home = rotating[homeIndex];
      const away = rotating[awayIndex];
      pairs.push(i % 2 === 0 ? [home, away] : [away, home]);
    }

    half.push(pairs.filter(([a, b]) => a !== '__BYE__' && b !== '__BYE__'));
  }

  // Second half of the season is the same rounds with home and away reversed, shuffled so the
  // return fixtures don't arrive in the same order.
  const secondHalf = rng.shuffle(half.map((round) => round.map(([h, a]) => [a, h])));
  return [...half, ...secondHalf];
}

/** Weather is picked per match day, weighted by the month. */
export function pickWeather(date: string, rng: Rng): Weather {
  const month = parseISO(date).getUTCMonth() + 1;
  const winter = month <= 2 || month >= 11;
  const table: [Weather, number][] = winter
    ? [['Overcast', 34], ['Rain', 26], ['Heavy Rain', 12], ['Windy', 14], ['Snow', 6], ['Sunny', 8]]
    : [['Sunny', 40], ['Overcast', 30], ['Rain', 15], ['Windy', 10], ['Heavy Rain', 5], ['Snow', 0]];
  const total = table.reduce((a, [, w]) => a + w, 0);
  let roll = rng.next() * total;
  for (const [weather, weight] of table) {
    roll -= weight;
    if (roll <= 0) return weather;
  }
  return 'Overcast';
}

/**
 * Dates reserved for cup rounds. League rounds skip these weekends so the calendar reads like a
 * real English season.
 */
export function cupDatesFor(seasonStartYear: number): Record<string, string[]> {
  const y = seasonStartYear;
  return {
    'efl-cup': [
      `${y}-08-12`, `${y}-08-26`, `${y}-09-23`, `${y}-10-28`, `${y}-12-16`,
      `${y + 1}-01-07`, `${y + 1}-03-15`,
    ],
    'fa-cup': [
      `${y}-11-01`, `${y}-11-29`, `${y + 1}-01-10`, `${y + 1}-01-31`, `${y + 1}-02-28`,
      `${y + 1}-03-21`, `${y + 1}-04-18`, `${y + 1}-05-16`,
    ],
    'efl-trophy': [
      `${y}-09-02`, `${y}-10-07`, `${y}-11-11`, `${y + 1}-01-14`, `${y + 1}-02-11`,
      `${y + 1}-03-04`, `${y + 1}-04-06`,
    ],
    'champions-league': [
      `${y}-09-16`, `${y}-10-01`, `${y}-10-22`, `${y}-11-05`, `${y}-11-26`, `${y}-12-10`,
      `${y + 1}-01-21`, `${y + 1}-02-17`, `${y + 1}-03-10`, `${y + 1}-04-08`, `${y + 1}-04-29`,
      `${y + 1}-05-30`,
    ],
    'europa-league': [
      `${y}-09-24`, `${y}-10-02`, `${y}-10-23`, `${y}-11-06`, `${y}-11-27`, `${y}-12-11`,
      `${y + 1}-01-22`, `${y + 1}-02-19`, `${y + 1}-03-12`, `${y + 1}-04-09`, `${y + 1}-04-30`,
      `${y + 1}-05-20`,
    ],
    'conference-league': [
      `${y}-09-25`, `${y}-10-03`, `${y}-10-24`, `${y}-11-07`, `${y}-11-28`, `${y}-12-12`,
      `${y + 1}-01-23`, `${y + 1}-02-20`, `${y + 1}-03-13`, `${y + 1}-04-10`, `${y + 1}-05-01`,
      `${y + 1}-05-14`,
    ],
  };
}

/**
 * Allocate one date per league round.
 *
 * Saturdays are the backbone of an English season, but a 46-game Championship programme needs more
 * slots than there are free Saturdays between August and May, so midweek rounds fill the gap. The
 * chosen dates are spread evenly across the window rather than packed at the front, which is both
 * how a real fixture list looks and what stops a season finishing in February.
 *
 * This must always return exactly `roundCount` dates. Returning fewer used to leave later rounds
 * falling back to an ad-hoc date months past the end of the season, which pushed the whole
 * calendar out by a year — the ten-season soak test is what caught it.
 */
function leagueDates(seasonStartYear: number, roundCount: number, reserved: Set<string>): string[] {
  const seasonEnd = `${seasonStartYear + 1}-05-10`;
  const usable = (date: string) => !reserved.has(date) && !isWinterBreak(date);

  const collect = (from: string, weekday: number): string[] => {
    const out: string[] = [];
    let cursor = nextWeekday(from, weekday);
    while (cursor <= seasonEnd) {
      if (usable(cursor)) out.push(cursor);
      cursor = addDaysISO(cursor, 7);
    }
    return out;
  };

  const saturdays = collect(`${seasonStartYear}-08-08`, 6);
  // Midweek slots, in the order a real calendar would reach for them.
  const midweek = [
    ...collect(`${seasonStartYear}-08-15`, 2),
    ...collect(`${seasonStartYear}-08-15`, 3),
  ].filter((date) => !saturdays.includes(date));

  /** Take `count` items spread evenly across a list. */
  const spread = (list: string[], count: number): string[] => {
    if (count <= 0) return [];
    if (count >= list.length) return [...list];
    const step = list.length / count;
    return Array.from({ length: count }, (_, i) => list[Math.floor(i * step)]);
  };

  let chosen: string[];
  if (saturdays.length >= roundCount) {
    chosen = spread(saturdays, roundCount);
  } else {
    const needed = roundCount - saturdays.length;
    chosen = [...saturdays, ...spread(midweek, needed)];
  }

  chosen = [...new Set(chosen)].sort();

  // Belt and braces: if the calendar somehow still came up short, extend rather than leave the
  // season unfinishable.
  let last = chosen[chosen.length - 1] ?? `${seasonStartYear}-08-08`;
  while (chosen.length < roundCount) {
    last = addDaysISO(last, 4);
    if (!chosen.includes(last)) chosen.push(last);
  }

  return chosen.slice(0, roundCount);
}

/** A short break around the turn of the year keeps Christmas fixtures from stacking absurdly. */
function isWinterBreak(date: string): boolean {
  const d = parseISO(date);
  const month = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  return month === 12 && day >= 24 && day <= 25;
}

export function generateSeasonFixtures(state: GameState): void {
  const rng = new Rng(deriveSeed(state.seed, `fixtures:${state.season}`));
  const seasonStartYear = parseISO(state.date).getUTCFullYear();
  const cupDates = cupDatesFor(seasonStartYear);
  const reserved = new Set<string>(Object.values(cupDates).flat());

  // Boxing Day and New Year's Day are traditional league dates, so un-reserve them.
  reserved.delete(`${seasonStartYear}-12-26`);
  reserved.delete(`${seasonStartYear + 1}-01-01`);

  const fixtures: Fixture[] = [];

  for (const comp of Object.values(state.competitions)) {
    if (comp.kind !== 'league') continue;
    const rounds = roundRobin(comp.clubIds, rng);
    const dates = leagueDates(seasonStartYear, rounds.length, reserved);

    // Festive fixtures: nudge the rounds nearest Boxing Day and New Year's Day onto them, rather
    // than appending dates and pushing rounds off the end of the list.
    const allDates = withFestiveDates(dates, seasonStartYear);

    rounds.forEach((pairs, roundIndex) => {
      const date = allDates[roundIndex];
      const weather = pickWeather(date, rng);
      for (const [home, away] of pairs) {
        fixtures.push({
          id: nextId('f'),
          competitionId: comp.id,
          date,
          round: roundIndex + 1,
          homeClubId: home,
          awayClubId: away,
          played: false,
          result: null,
          weather,
        });
      }
    });
  }

  state.fixtures = fixtures.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Move the rounds closest to Boxing Day and New Year's Day onto them. English football plays on
 * both, and it's one of the details that makes a fixture list feel real.
 */
function withFestiveDates(dates: string[], seasonStartYear: number): string[] {
  const out = [...dates];
  for (const festive of [`${seasonStartYear}-12-26`, `${seasonStartYear + 1}-01-01`]) {
    if (out.includes(festive)) continue;
    let closest = -1;
    let bestGap = Infinity;
    for (let i = 0; i < out.length; i++) {
      const gap = Math.abs(daysBetweenDates(out[i], festive));
      if (gap < bestGap) { bestGap = gap; closest = i; }
    }
    // Only reassign a round that is genuinely nearby, so we never drag an August game into winter.
    if (closest >= 0 && bestGap <= 10) out[closest] = festive;
  }
  return [...new Set(out)].sort();
}

function daysBetweenDates(a: string, b: string): number {
  return Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / 86_400_000);
}

/** Create a one-off fixture, used by cups and play-offs as rounds are drawn. */
export function createFixture(
  competitionId: string,
  date: string,
  homeClubId: string,
  awayClubId: string,
  round: number,
  rng: Rng,
  extra: Partial<Fixture> = {},
): Fixture {
  return {
    id: nextId('f'),
    competitionId,
    date,
    round,
    homeClubId,
    awayClubId,
    played: false,
    result: null,
    weather: pickWeather(date, rng),
    ...extra,
  };
}

/** Next free date at or after `from` that doesn't clash with either club's existing fixtures. */
export function findFreeDate(
  state: GameState,
  clubIds: string[],
  from: string,
  preferredWeekday = 6,
): string {
  let candidate = nextWeekday(from, preferredWeekday);
  for (let attempt = 0; attempt < 30; attempt++) {
    const clash = state.fixtures.some(
      (f) => f.date === candidate && !f.played &&
        (clubIds.includes(f.homeClubId) || clubIds.includes(f.awayClubId)),
    );
    if (!clash) return candidate;
    candidate = addDaysISO(candidate, attempt % 2 === 0 ? 3 : 4);
  }
  return candidate;
}

/** Season boundary dates, used by the day loop for windows, intake and rollover. */
export function seasonDates(seasonStartYear: number) {
  return {
    seasonStart: `${seasonStartYear}-07-01`,
    summerWindowOpens: `${seasonStartYear}-07-01`,
    summerWindowCloses: `${seasonStartYear}-09-01`,
    winterWindowOpens: `${seasonStartYear + 1}-01-01`,
    winterWindowCloses: `${seasonStartYear + 1}-02-02`,
    youthIntake: `${seasonStartYear + 1}-03-14`,
    lastLeagueDate: `${seasonStartYear + 1}-05-10`,
    playoffSemiFirst: `${seasonStartYear + 1}-05-15`,
    playoffSemiSecond: `${seasonStartYear + 1}-05-18`,
    playoffFinal: `${seasonStartYear + 1}-05-25`,
    seasonEnd: `${seasonStartYear + 1}-06-15`,
    dateToISO,
  };
}
