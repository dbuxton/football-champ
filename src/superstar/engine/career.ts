import { Rng, deriveSeed } from '../../engine/rng';
import { CLUBS, getClub, type Club } from '../data/clubs';
import { FIRST_SEASON_YEAR, squadStrength } from '../data/squads';
import { BADGES, type BadgeId } from './badges';
import { CUP_AFTER, CUP_STAGES, cupTieIsHome, enterCup, followTransfer, type CupId, type CupRun } from './cup';
import type { PlayerPosition } from './formation';
import type { MatchState, Difficulty } from './match/types';
import { clamp } from './pitch';
import { matchRating } from './rating';
import { ROUNDS, fixtureFor, fixtureKey, leagueTable, seasonResults, topScorers, type Result, type Scorer } from './season';
import { ATTRIBUTE_KEYS, type Attributes } from './skills';

/**
 * Your footballer's career: which club you're at, every match you've played, and the rules that
 * move you between clubs.
 *
 * The rule the whole game is built on: play well and a bigger club signs you, play badly and you
 * move to a smaller one. "Well" is your form — your average rating over your last three matches
 * at your club — and bigger clubs expect a bit more.
 */

export type Look = {
  skin: string;
  hair: string;
  hairStyle: 'short' | 'long' | 'curly' | 'bun' | 'buzz' | 'spiky';
  boots: string;
};

export type Competition = 'league' | CupId;

export type MatchRecord = {
  season: number;
  /** League round, or for a cup tie the league round it came after. */
  round: number;
  competition: Competition;
  /** A cup tie settled by penalties: [ours, theirs]. */
  penalties?: [number, number];
  clubId: string;
  opponentId: string;
  home: boolean;
  goalsFor: number;
  goalsAgainst: number;
  rating: number;
  goals: number;
  assists: number;
  shots: number;
  passes: number;
  tackles: number;
};

/** A spell at one club. */
export type Stint = {
  clubId: string;
  season: number;
  round: number;
  /** How you got there. */
  how: 'start' | 'up' | 'down';
  matches: number;
  goals: number;
  assists: number;
  ratingTotal: number;
};

export type Trophy = { kind: 'champions' | 'golden-boot' | 'player-of-the-season' | CupId; season: number; clubId: string };

export type SeasonRecord = {
  season: number;
  clubId: string;
  /** Where that club finished. */
  position: number;
  matches: number;
  goals: number;
  assists: number;
  averageRating: number;
};

/** A transfer waiting for the kid to choose. */
export type PendingMove = {
  kind: 'up' | 'down';
  offers: string[];
  form: number;
};

/**
 * How the football world has changed since season 1: clubs that finish high in the league grow
 * bigger, clubs that finish low shrink. Added to each club's starting reputation.
 */
export type World = { reputation: Record<string, number> };

export type Career = {
  id: string;
  name: string;
  number: number;
  /** The kid's footballer's age: 17 in their first season, a year older every season. */
  age: number;
  position: PlayerPosition;
  look: Look;
  attributes: Attributes;
  /** Training points waiting to be spent. */
  points: number;
  difficulty: Difficulty;
  /** Real minutes each half lasts. */
  halfMinutes: number;
  sound: boolean;
  clubId: string;
  season: number;
  /** The next round to play, 1–19. */
  round: number;
  seasonSeed: number;
  /** This season's league matches the kid played, by fixture. */
  results: Record<string, Result>;
  /** This season's cup run, once the draw is made. */
  cup: CupRun | null;
  world: World;
  matches: MatchRecord[];
  stints: Stint[];
  seasons: SeasonRecord[];
  trophies: Trophy[];
  /** Badges earned, with the season each was earned in. */
  badges: Partial<Record<BadgeId, number>>;
  pending: PendingMove | null;
  createdAt: string;
};

// ─── Starting out ───────────────────────────────────────────────────────────

/** Starting attributes for each position: a promising youngster, good at their own job. */
export const STARTING_ATTRIBUTES: Record<PlayerPosition, Attributes> = {
  striker: { pace: 64, shooting: 66, passing: 55, dribbling: 62, tackling: 40, stamina: 60 },
  winger: { pace: 68, shooting: 58, passing: 60, dribbling: 66, tackling: 42, stamina: 62 },
  midfielder: { pace: 60, shooting: 58, passing: 66, dribbling: 60, tackling: 55, stamina: 66 },
  defender: { pace: 60, shooting: 45, passing: 58, dribbling: 50, tackling: 68, stamina: 64 },
};

export const STARTING_AGE = 17;

// ─── The ladder of clubs ────────────────────────────────────────────────────

/** A club's reputation in this career's world: where it started, plus how its seasons have gone. */
export function reputationOf(career: Career, clubId: string): number {
  return getClub(clubId).reputation + (career.world.reputation[clubId] ?? 0);
}

/** Every club, biggest first, as things stand this season. */
export function ladder(career: Career): Club[] {
  return [...CLUBS].sort(
    (a, b) =>
      reputationOf(career, b.id) - reputationOf(career, a.id) ||
      squadStrength(b.id, career.season) - squadStrength(a.id, career.season) ||
      a.name.localeCompare(b.name),
  );
}

/** A club's place on the ladder this season: 1 is the biggest. */
export function rankOf(career: Career, clubId: string): number {
  return ladder(career).findIndex((club) => club.id === clubId) + 1;
}

/** The year a season starts, for "2026–27" labels. */
export function seasonLabel(season: number): string {
  const start = FIRST_SEASON_YEAR + season - 1;
  return `${start}–${String((start + 1) % 100).padStart(2, '0')}`;
}

export function newCareer(opts: {
  id: string;
  name: string;
  number: number;
  position: PlayerPosition;
  look: Look;
  difficulty: Difficulty;
  halfMinutes: number;
  clubId: string;
  seed: number;
  today: string;
}): Career {
  return {
    id: opts.id,
    name: opts.name,
    number: opts.number,
    age: STARTING_AGE,
    position: opts.position,
    look: opts.look,
    attributes: { ...STARTING_ATTRIBUTES[opts.position] },
    points: 0,
    difficulty: opts.difficulty,
    halfMinutes: opts.halfMinutes,
    sound: true,
    clubId: opts.clubId,
    season: 1,
    round: 1,
    seasonSeed: opts.seed,
    results: {},
    cup: null,
    world: { reputation: {} },
    matches: [],
    stints: [{ clubId: opts.clubId, season: 1, round: 1, how: 'start', matches: 0, goals: 0, assists: 0, ratingTotal: 0 }],
    seasons: [],
    trophies: [],
    badges: {},
    pending: null,
    createdAt: opts.today,
  };
}

// ─── The next match ─────────────────────────────────────────────────────────

export type NextMatch = {
  competition: Competition;
  opponentId: string;
  /** At home, away, or (a cup final) at Wembley. */
  home: boolean | 'neutral';
  /** The league round this is, or comes after. */
  round: number;
  /** Cup ties: which one. */
  stage?: number;
};

/** A cup tie is due once enough league matches have been played. */
function dueCupTie(career: Career): number | null {
  const run = career.cup;
  if (!run || run.over) return null;
  const stage = run.ties.length;
  if (stage >= CUP_STAGES.length) return null;
  return career.round - 1 >= CUP_AFTER[stage] ? stage : null;
}

export function nextMatch(career: Career): NextMatch | null {
  const stage = dueCupTie(career);
  if (stage !== null && career.cup) {
    return {
      competition: career.cup.cup,
      opponentId: career.cup.opponents[stage],
      home: cupTieIsHome(deriveSeed(career.seasonSeed, `${career.cup.cup}`), stage),
      round: career.round - 1,
      stage,
    };
  }
  if (career.round > ROUNDS) return null;
  const fixture = fixtureFor(career.seasonSeed, career.round, career.clubId);
  if (!fixture) return null;
  const home = fixture.home === career.clubId;
  return { competition: 'league', opponentId: home ? fixture.away : fixture.home, home, round: career.round };
}

/** The draw for the cups: once six league matches are played, your half of the table decides which one you're in. */
export function cupDrawDue(career: Career): boolean {
  return career.cup === null && career.round - 1 >= CUP_AFTER[0];
}

export function drawCup(career: Career): Career {
  if (!cupDrawDue(career)) return career;
  const { table } = currentTable(career);
  const ids = table.map((row) => row.clubId);
  const position = ids.indexOf(career.clubId) + 1;
  return { ...career, cup: enterCup(career.seasonSeed, career.season, position, career.clubId, ids) };
}

// ─── Form and transfers ─────────────────────────────────────────────────────

/** Matches you need at a club before anyone moves you on. */
export const SETTLE_MATCHES = 3;
/** Form is the average of this many recent ratings at your club. */
export const FORM_MATCHES = 3;

export function currentStint(career: Career): Stint {
  return career.stints[career.stints.length - 1];
}

/** Ratings at your current club, oldest first. */
export function clubRatings(career: Career): number[] {
  return career.matches.slice(career.matches.length - currentStint(career).matches).map((m) => m.rating);
}

/** Your form: the average of your last three ratings at this club, or null before you've played. */
export function form(career: Career): number | null {
  const ratings = clubRatings(career).slice(-FORM_MATCHES);
  if (ratings.length === 0) return null;
  return Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 100) / 100;
}

/**
 * The form a club needs to see to sell you on to a bigger club, and the form below which it moves
 * you to a smaller one.
 *
 * Every club has a level it expects (`EXPECTED`): the biggest club expects a lot, the smallest a
 * bit less. Play well above your club's level and a bigger one signs you; well below it and you
 * move to a smaller one. The levels are spread far enough apart that each kind of player has a
 * natural home on the ladder, and the band either side (`BAND`) is wide enough that one bad game
 * doesn't get you moved.
 *
 * `trained` is how far your overall rating has come since you started (see `trainedBy`). A
 * better-trained footballer plays better, so clubs expect more of you: training makes you stronger
 * on the pitch, but it's still how you play that moves you up or down. `difficulty` matters too:
 * matches on easy are kinder, so clubs expect a bit more.
 */
export function thresholds(rank: number, trained = 0, difficulty: Difficulty = 'medium'): { up: number; down: number } {
  const size = (CLUBS.length - rank) / (CLUBS.length - 1);
  const expected = Math.min(
    EXPECTED.most,
    EXPECTED.smallest +
      (EXPECTED.biggest - EXPECTED.smallest) * size +
      Math.min(Math.max(0, trained), TRAINED_MAX) * EXPECT_PER_OVERALL +
      EXPECT_FOR_DIFFICULTY[difficulty],
  );
  return { up: Math.round((expected + BAND) * 100) / 100, down: Math.round((expected - BAND) * 100) / 100 };
}

/**
 * The form each club expects, at the smallest club and at the biggest (on medium, untrained), and
 * the most any club ever expects (ratings bunch up near 10, so the bar to go up stays reachable).
 */
export const EXPECTED = { smallest: 6.0, biggest: 7.9, most: 8.8 };
/** How far above the expected form gets you a bigger club, and how far below a smaller one. */
export const BAND = 0.75;
/**
 * Matches on easy give higher ratings than on medium (about 0.6) and hard lower ones (about 1.4),
 * so clubs expect a little more on easy and less on hard. Not quite all of the difference: easy
 * still gives a small leg-up the ladder, and hard a small handicap.
 */
export const EXPECT_FOR_DIFFICULTY: Record<Difficulty, number> = { easy: 0.35, medium: 0, hard: -1.0 };
/** How much more form clubs expect for each point your overall rating has gone up through training. */
export const EXPECT_PER_OVERALL = 0.06;
/** Overall points past which clubs stop raising the bar (so it never goes out of reach). */
export const TRAINED_MAX = 30;

/** How many points your overall rating has gone up since you started. */
export function trainedBy(career: Career): number {
  return Math.max(0, overall(career.attributes, career.position) - overall(STARTING_ATTRIBUTES[career.position], career.position));
}

/** The bars at a club for this footballer, as they stand. */
export function barsFor(career: Career, clubId = career.clubId): { up: number; down: number } {
  return thresholds(rankOf(career, clubId), trainedBy(career), career.difficulty);
}

export type Verdict =
  | { kind: 'settling'; matchesLeft: number }
  | { kind: 'up'; form: number; jump: [number, number] }
  | { kind: 'down'; form: number; jump: [number, number] }
  | { kind: 'stay'; form: number; up: number; down: number };

/** After a match: should somebody move you on? */
export function verdict(career: Career): Verdict {
  const rank = rankOf(career, career.clubId);
  const played = currentStint(career).matches;
  const f = form(career);
  const { up, down } = barsFor(career);
  const ratings = clubRatings(career);
  // A wonderkid gets snapped up after two matches.
  const wonderkid = played >= 2 && ratings.slice(-2).every((r) => r >= up + 1.2);
  if (f === null || (played < SETTLE_MATCHES && !wonderkid)) return { kind: 'settling', matchesLeft: SETTLE_MATCHES - played };
  if (f >= up && rank > 1) {
    const margin = f - up;
    const jump: [number, number] = margin >= 1 ? [4, 8] : margin >= 0.5 ? [3, 6] : [2, 4];
    return { kind: 'up', form: f, jump };
  }
  if (f <= down && rank < CLUBS.length) {
    const jump: [number, number] = down - f >= 0.6 ? [3, 6] : [2, 4];
    return { kind: 'down', form: f, jump };
  }
  return { kind: 'stay', form: f, up, down };
}

/** Clubs interested in you: bigger ones for a move up, smaller ones for a move down. */
export function offersFor(career: Career, v: Extract<Verdict, { kind: 'up' | 'down' }>, seed: number): string[] {
  const clubs = ladder(career);
  const rank = clubs.findIndex((club) => club.id === career.clubId) + 1;
  const rankOfClub = (club: Club) => clubs.indexOf(club) + 1;
  const dir = v.kind === 'up' ? -1 : 1;
  const [near, far] = v.jump;
  // Clubs `near` to `far` places away; near the top or bottom of the ladder there may not be two
  // of those, so widen the band both ways (nearer and further) until there are.
  const within = (lo: number, hi: number) =>
    clubs.filter((club) => {
      const step = (rankOfClub(club) - rank) * dir;
      return step >= lo && step <= hi;
    });
  let lo = near;
  let hi = far;
  let band = within(lo, hi);
  while (band.length < 2 && (lo > 1 || hi < CLUBS.length)) {
    lo = Math.max(1, lo - 1);
    hi = Math.min(CLUBS.length, hi + 1);
    band = within(lo, hi);
  }
  const rng = new Rng(deriveSeed(seed, `offers:${career.matches.length}`));
  const picked = rng.shuffle([...band]).slice(0, v.kind === 'up' ? 3 : 2);
  return picked.sort((a, b) => rankOfClub(a) - rankOfClub(b)).map((club) => club.id);
}

/**
 * Move to a new club (or stay, when turning down a move up). Starts a new spell; the matches
 * already played are kept for ever.
 */
export function moveTo(career: Career, clubId: string | null): { career: Career; badges: BadgeId[] } {
  const pending = career.pending;
  if (!pending) return { career, badges: [] };
  if (clubId === null) {
    // Turning down a bigger club is allowed; being moved down is not optional.
    if (pending.kind === 'down') return { career, badges: [] };
    return { career: { ...career, pending: null }, badges: [] };
  }
  if (!pending.offers.includes(clubId)) return { career, badges: [] };
  const stint: Stint = { clubId, season: career.season, round: career.round, how: pending.kind, matches: 0, goals: 0, assists: 0, ratingTotal: 0 };
  const cup = career.cup && !career.cup.over ? followTransfer(career.cup, clubId) : career.cup;
  const next: Career = { ...career, clubId, cup, pending: null, stints: [...career.stints, stint] };
  const earned: BadgeId[] = [];
  if (pending.kind === 'up') earned.push('big-move');
  if (rankOf(next, clubId) === 1) earned.push('top-club');
  return awardBadges(next, earned);
}

// ─── After a match ──────────────────────────────────────────────────────────

export type MatchSummary = {
  rating: number;
  record: MatchRecord;
  /** Points earned for training. */
  points: number;
  badges: BadgeId[];
  verdict: Verdict;
  /** A cup tie: did it take you through (or win the cup)? */
  cup?: { cup: CupId; stage: number; won: boolean; trophy: boolean };
  /** The cup draw was made after this match. */
  drawnInto?: CupId;
  seasonOver: boolean;
};

/** Training points for a match: something for playing, more for playing well. */
export function pointsFor(rating: number, goals: number, assists: number): number {
  return 2 + (rating >= 7 ? 1 : 0) + (rating >= 8 ? 1 : 0) + Math.min(2, goals + assists);
}

/**
 * Record a finished match: rating, stats, badges, training points, the cup, and whether a club
 * moves you on. `penalties` settles a drawn cup tie: [ours, theirs].
 */
export function recordMatch(
  career: Career,
  state: MatchState,
  penalties: [number, number] | null = null,
): { career: Career; summary: MatchSummary } {
  const next = nextMatch(career);
  if (!next) throw new Error('No match to record');
  const kid = state.stats[state.humanId];
  const goalsFor = state.score[0];
  const goalsAgainst = state.score[1];
  const rating = matchRating({ stats: kid, position: career.position, goalsFor, goalsAgainst, halfSeconds: state.setup.halfSeconds });

  const record: MatchRecord = {
    season: career.season,
    round: next.round,
    competition: next.competition,
    ...(penalties ? { penalties } : {}),
    clubId: career.clubId,
    opponentId: next.opponentId,
    home: next.home !== false,
    goalsFor,
    goalsAgainst,
    rating,
    goals: kid.goals,
    assists: kid.assists,
    shots: kid.shots,
    passes: kid.passesDone,
    tackles: kid.tacklesWon,
  };

  const stints = [...career.stints];
  const stint = { ...stints[stints.length - 1] };
  stint.matches += 1;
  stint.goals += kid.goals;
  stint.assists += kid.assists;
  stint.ratingTotal += rating;
  stints[stints.length - 1] = stint;

  const points = pointsFor(rating, kid.goals, kid.assists);
  let updated: Career = {
    ...career,
    points: career.points + points,
    matches: [...career.matches, record],
    stints,
  };
  const earned = matchBadges(updated, record, kid.tacklesWon);
  let cupSummary: MatchSummary['cup'];

  if (next.competition === 'league') {
    // The result, for the league table and the Golden Boot race.
    const scorers: Scorer[] = [];
    for (const e of state.events) {
      if (e.kind !== 'goal') continue;
      const clubId = e.side === 0 ? career.clubId : next.opponentId;
      const kidGoal = e.agent === state.humanId;
      scorers.push({ name: kidGoal ? career.name : state.agents[e.agent].name, clubId, ...(kidGoal ? { kid: true } : {}) });
    }
    const fixture = next.home ? { home: career.clubId, away: next.opponentId } : { home: next.opponentId, away: career.clubId };
    const result: Result = { ...fixture, hg: next.home ? goalsFor : goalsAgainst, ag: next.home ? goalsAgainst : goalsFor, scorers };
    updated = {
      ...updated,
      round: career.round + 1,
      results: { ...career.results, [fixtureKey(career.round, fixture)]: result },
    };
  } else if (updated.cup && next.stage !== undefined) {
    const won = goalsFor > goalsAgainst || (goalsFor === goalsAgainst && penalties !== null && penalties[0] > penalties[1]);
    const ties = [...updated.cup.ties, { opponentId: next.opponentId, goalsFor, goalsAgainst, penalties, won }];
    const final = next.stage === CUP_STAGES.length - 1;
    const trophy = won && final;
    updated = { ...updated, cup: { ...updated.cup, ties, over: !won || final } };
    if (final) earned.push('cup-final');
    if (trophy) {
      earned.push('cup-winner');
      updated = { ...updated, trophies: [...updated.trophies, { kind: next.competition, season: career.season, clubId: career.clubId }] };
    }
    if (won && penalties) earned.push('penalty-hero');
    cupSummary = { cup: next.competition, stage: next.stage, won, trophy };
  }

  const awarded = awardBadges(updated, earned);
  updated = awarded.career;

  // After six league matches, the cup draw.
  let drawnInto: CupId | undefined;
  if (cupDrawDue(updated)) {
    updated = drawCup(updated);
    drawnInto = updated.cup?.cup;
  }

  const v = verdict(updated);
  if (v.kind === 'up' || v.kind === 'down') {
    const offers = offersFor(updated, v, updated.seasonSeed);
    if (offers.length > 0) updated = { ...updated, pending: { kind: v.kind, offers, form: v.form } };
  }

  return {
    career: updated,
    summary: {
      rating,
      record,
      points,
      badges: awarded.badges,
      verdict: v,
      cup: cupSummary,
      drawnInto,
      seasonOver: nextMatch(updated) === null,
    },
  };
}

function matchBadges(career: Career, m: MatchRecord, tackles: number): BadgeId[] {
  const out: BadgeId[] = ['debut'];
  const total = (key: 'goals' | 'assists') => career.matches.reduce((sum, r) => sum + r[key], 0);
  if (m.goals > 0) out.push('first-goal');
  if (m.goals >= 3) out.push('hat-trick');
  if (m.assists > 0) out.push('first-assist');
  if (m.rating >= 8.5) out.push('player-of-the-match');
  if (m.rating >= 10) out.push('perfect-ten');
  if (m.goalsFor > m.goalsAgainst) out.push('first-win');
  if (m.goalsAgainst === 0 && (career.position === 'defender' || career.position === 'midfielder')) out.push('clean-sheet');
  if (tackles >= 5) out.push('tackle-master');
  if (career.matches.length >= 10) out.push('ten-matches');
  if (career.matches.length >= 50) out.push('fifty-matches');
  if (total('goals') >= 25) out.push('twenty-five-goals');
  if (total('goals') >= 100) out.push('hundred-goals');
  return out;
}

/** Add any badges not already earned (in `season`, this one unless said); returns just the new ones. */
function awardBadges(career: Career, ids: BadgeId[], season = career.season): { career: Career; badges: BadgeId[] } {
  const fresh = ids.filter((id, index) => !career.badges[id] && ids.indexOf(id) === index && BADGES[id]);
  if (fresh.length === 0) return { career, badges: [] };
  const badges = { ...career.badges };
  for (const id of fresh) badges[id] = season;
  return { career: { ...career, badges }, badges: fresh };
}

// ─── The end of a season ────────────────────────────────────────────────────

export type SeasonReview = {
  season: number;
  clubId: string;
  position: number;
  table: ReturnType<typeof leagueTable>;
  scorers: ReturnType<typeof topScorers>;
  trophies: Trophy[];
  badges: BadgeId[];
  record: SeasonRecord;
};

/** What's different about the new season. */
export type SeasonChanges = {
  /** Clubs biggest first, before and after the reshuffle. */
  ladderBefore: string[];
  ladderAfter: string[];
  age: number;
  /** Training points from pre-season. */
  bonusPoints: number;
};

/** How much a club's reputation moves for finishing in each place (1st gets the most). */
export function reputationChange(position: number): number {
  return Math.round(clamp((CLUBS.length / 2 + 0.5 - position) * 0.6, -5, 5) * 10) / 10;
}

/** Last season's changes fade a little each year, so clubs drift back towards what they were. */
export const REPUTATION_MEMORY = 0.7;
/** A welcome-back gift of training points every pre-season. */
export const PRE_SEASON_POINTS = 3;

/** What the season came to: the final table, and any trophies. */
export function reviewSeason(career: Career): SeasonReview {
  const results = seasonResults(career.seasonSeed, ROUNDS, career.results, career.season);
  const table = leagueTable(results);
  const scorers = topScorers(results);
  const position = table.findIndex((row) => row.clubId === career.clubId) + 1;
  const mine = career.matches.filter((m) => m.season === career.season);
  const averageRating = mine.length ? mine.reduce((sum, m) => sum + m.rating, 0) / mine.length : 0;
  const trophies: Trophy[] = [];
  if (position === 1) trophies.push({ kind: 'champions', season: career.season, clubId: career.clubId });
  const kidRow = scorers.find((row) => row.kid);
  if (kidRow && scorers[0] === kidRow) trophies.push({ kind: 'golden-boot', season: career.season, clubId: career.clubId });
  if (mine.length >= 10 && averageRating >= 7.5) trophies.push({ kind: 'player-of-the-season', season: career.season, clubId: career.clubId });
  const badges: BadgeId[] = [];
  if (trophies.some((t) => t.kind === 'champions')) badges.push('champions');
  if (trophies.some((t) => t.kind === 'golden-boot')) badges.push('golden-boot');
  return {
    season: career.season,
    clubId: career.clubId,
    position,
    table,
    scorers,
    trophies,
    badges,
    record: {
      season: career.season,
      clubId: career.clubId,
      position,
      matches: mine.length,
      goals: mine.reduce((sum, m) => sum + m.goals, 0),
      assists: mine.reduce((sum, m) => sum + m.assists, 0),
      averageRating: Math.round(averageRating * 100) / 100,
    },
  };
}

/**
 * Put the season in the history books and start the next one. The world moves on: clubs grow or
 * shrink with where they finished, every player is a year older (see `squadFor`), and so are you.
 */
export function startNextSeason(
  career: Career,
  newSeed: number,
): { career: Career; review: SeasonReview; changes: SeasonChanges; badges: BadgeId[] } {
  const review = reviewSeason(career);
  const reputation: Record<string, number> = {};
  review.table.forEach((row, index) => {
    const before = career.world.reputation[row.clubId] ?? 0;
    const after = Math.round((before * REPUTATION_MEMORY + reputationChange(index + 1)) * 10) / 10;
    if (after !== 0) reputation[row.clubId] = after;
  });
  const next: Career = {
    ...career,
    age: career.age + 1,
    season: career.season + 1,
    round: 1,
    seasonSeed: newSeed,
    results: {},
    cup: null,
    world: { reputation },
    points: career.points + PRE_SEASON_POINTS,
    seasons: [...career.seasons, review.record],
    trophies: [...career.trophies, ...review.trophies],
  };
  // Champions and Golden Boot badges belong to the season just finished.
  const awarded = awardBadges(next, review.badges, career.season);
  const changes: SeasonChanges = {
    ladderBefore: ladder(career).map((c) => c.id),
    ladderAfter: ladder(next).map((c) => c.id),
    age: next.age,
    bonusPoints: PRE_SEASON_POINTS,
  };
  return { career: awarded.career, review, changes, badges: awarded.badges };
}

// ─── Training ───────────────────────────────────────────────────────────────

export const MAX_ATTRIBUTE = 99;

/** Points to raise an attribute by one: cheap at first, dearer near the top. */
export function trainingCost(value: number): number {
  return value < 75 ? 1 : value < 88 ? 2 : 3;
}

export function train(career: Career, key: keyof Attributes): Career {
  const value = career.attributes[key];
  const cost = trainingCost(value);
  if (value >= MAX_ATTRIBUTE || career.points < cost) return career;
  return { ...career, points: career.points - cost, attributes: { ...career.attributes, [key]: value + 1 } };
}

/** What each position leans on most, for the overall rating on the player card. */
const OVERALL_WEIGHTS: Record<PlayerPosition, Attributes> = {
  striker: { pace: 2, shooting: 3, passing: 1, dribbling: 2, tackling: 0.3, stamina: 1 },
  winger: { pace: 3, shooting: 1.5, passing: 1.5, dribbling: 3, tackling: 0.3, stamina: 1 },
  midfielder: { pace: 1, shooting: 1.5, passing: 3, dribbling: 1.5, tackling: 1.5, stamina: 1.5 },
  defender: { pace: 1.5, shooting: 0.3, passing: 1.5, dribbling: 0.7, tackling: 3, stamina: 1.5 },
};

export function overall(attributes: Attributes, position: PlayerPosition): number {
  const weights = OVERALL_WEIGHTS[position];
  let total = 0;
  let weight = 0;
  for (const key of ATTRIBUTE_KEYS) {
    total += attributes[key] * weights[key];
    weight += weights[key];
  }
  return Math.round(total / weight);
}

// ─── Reading the career ─────────────────────────────────────────────────────

export function careerTotals(career: Career): { matches: number; goals: number; assists: number; averageRating: number } {
  const matches = career.matches.length;
  const goals = career.matches.reduce((sum, m) => sum + m.goals, 0);
  const assists = career.matches.reduce((sum, m) => sum + m.assists, 0);
  const averageRating = matches ? career.matches.reduce((sum, m) => sum + m.rating, 0) / matches : 0;
  return { matches, goals, assists, averageRating: Math.round(averageRating * 10) / 10 };
}

/** The league table as it stands after the rounds played so far. */
export function currentTable(career: Career) {
  const results = seasonResults(career.seasonSeed, career.round - 1, career.results, career.season);
  return { table: leagueTable(results), scorers: topScorers(results) };
}

