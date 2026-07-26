/**
 * New-game world generation.
 *
 * Builds the entire pyramid: 92 clubs, ~2,200 players, staff, contracts, finances, facilities and
 * a full fixture list — then appoints the manager to a mid-table Championship club.
 */

import { Rng, clamp, deriveSeed } from './rng';
import { addDaysISO, dateToISO, parseISO, seasonLabel } from './date';
import {
  buildPlayer, computeValue, makeContract, nextId, resetIdCounter, shortNameOf,
  PlayerSeed, ageOf,
} from './players';
import { defaultTactics } from './formations';
import { autoPickTeam } from './selection';
import {
  Club, ClubFacilities, ClubFinances, Competition, Difficulty, Manager, Player, Position,
  SquadStatus, Staff, StaffRole, BoardExpectation,
} from './types';
import { GameState, SAVE_VERSION, captureDevSnapshots } from './gamestate';
import {
  ALL_CLUB_SEEDS, CHAMPIONSHIP_CLUBS, ClubSeed, LEAGUE_ONE_CLUBS, LEAGUE_TWO_CLUBS,
  PREMIER_LEAGUE_CLUBS, RIVALRIES, STARTING_CLUB_POOL,
} from '../data/clubs';
import { PREMIER_LEAGUE_SQUADS } from '../data/squads/premier-league';
import { CHAMPIONSHIP_SQUADS } from '../data/squads/championship';
import { GENERATED_NATIONALITY_WEIGHTS, NAME_POOLS, SPONSOR_NAMES } from '../data/names';
import { COMPETITIONS } from '../data/competitions';
import { generateSeasonFixtures } from './fixtures';
import { emptyTable } from './table';
import { initialiseCups } from './cups';
import { billSeasonTickets } from './finance';
import { setSeasonBudgets, setSeasonObjectives } from './board';
import { publishPredictions } from './media';

export interface NewGameOptions {
  seed: number;
  managerFirstName: string;
  managerLastName: string;
  managerNationality: string;
  managerBackground: Manager['background'];
  difficulty: Difficulty;
  preferredFormation: string;
  /** Season start date. Defaults to 1 July of the current real year. */
  startDate?: string;
}

/** Shape of a generated squad: how many of each position a club needs. */
const SQUAD_TEMPLATE: { position: Position; count: number }[] = [
  { position: 'GK', count: 3 },
  { position: 'DR', count: 2 },
  { position: 'DC', count: 4 },
  { position: 'DL', count: 2 },
  { position: 'DM', count: 2 },
  { position: 'MC', count: 3 },
  { position: 'MR', count: 2 },
  { position: 'ML', count: 2 },
  { position: 'AMC', count: 2 },
  { position: 'ST', count: 3 },
];

function pickNationality(rng: Rng): string {
  const total = GENERATED_NATIONALITY_WEIGHTS.reduce((a, [, w]) => a + w, 0);
  let roll = rng.next() * total;
  for (const [nation, weight] of GENERATED_NATIONALITY_WEIGHTS) {
    roll -= weight;
    if (roll <= 0) return nation;
  }
  return 'England';
}

export function generateName(rng: Rng, nationality: string): { first: string; last: string } {
  const pool = NAME_POOLS[nationality] ?? NAME_POOLS.England;
  return { first: rng.pick(pool.first), last: rng.pick(pool.last) };
}

/**
 * Generate a squad for a club with no authored data (League One, League Two, and any club that
 * needs topping up). Ability is distributed around the club's own level so a strong League One
 * side genuinely is stronger than a weak one.
 */
export function generateSquad(
  clubLevel: number,
  currentDate: string,
  rng: Rng,
  usedNames: Set<string>,
): PlayerSeed[] {
  const seeds: PlayerSeed[] = [];
  const startYear = parseISO(currentDate).getUTCFullYear();

  for (const { position, count } of SQUAD_TEMPLATE) {
    for (let i = 0; i < count; i++) {
      // First-choice players sit at the club's level; the further down the depth chart, the worse.
      const depthPenalty = i * (position === 'GK' ? 8 : 5);
      const ability = clamp(Math.round(rng.gaussian(clubLevel - depthPenalty, 4)), 12, 95);

      // Age spread: mostly prime, with a few veterans and a few kids.
      const roll = rng.next();
      let age: number;
      if (roll < 0.16) age = rng.int(17, 20);
      else if (roll < 0.72) age = rng.int(21, 28);
      else if (roll < 0.93) age = rng.int(29, 33);
      else age = rng.int(34, 37);

      const potential = age < 23
        ? clamp(ability + rng.int(6, 30), ability, 92)
        : clamp(ability + rng.int(0, 5), ability, 95);

      const nationality = pickNationality(rng);
      let name = '';
      for (let attempt = 0; attempt < 12; attempt++) {
        const { first, last } = generateName(rng, nationality);
        name = `${first} ${last}`;
        if (!usedNames.has(name)) break;
      }
      usedNames.add(name);

      seeds.push([name, position, startYear - age, nationality, ability, potential]);
    }
  }
  return seeds;
}

function generateStaff(
  role: StaffRole,
  quality: number,
  clubId: string,
  currentDate: string,
  rng: Rng,
): Staff {
  const nationality = pickNationality(rng);
  const { first, last } = generateName(rng, nationality);
  const startYear = parseISO(currentDate).getUTCFullYear();
  const age = rng.int(34, 62);

  const base = () => clamp(Math.round(rng.gaussian(quality / 5, 2.6)), 1, 20);
  const specialist = () => clamp(Math.round(rng.gaussian(quality / 5 + 3, 2.4)), 1, 20);

  const attributes = {
    attacking: base(), defending: base(), technical: base(), tactical: base(),
    fitness: base(), goalkeeping: base(), youth: base(), physiotherapy: base(),
    judgingAbility: base(), judgingPotential: base(), manManagement: base(),
    discipline: base(), motivating: base(),
  };

  // Push the attributes that define the role.
  switch (role) {
    case 'Goalkeeping Coach': attributes.goalkeeping = specialist(); break;
    case 'Fitness Coach': attributes.fitness = specialist(); break;
    case 'Physio': attributes.physiotherapy = specialist(); break;
    case 'Scout':
      attributes.judgingAbility = specialist();
      attributes.judgingPotential = specialist();
      break;
    case 'Head of Youth': attributes.youth = specialist(); break;
    case 'Assistant Manager':
      attributes.tactical = specialist();
      attributes.manManagement = specialist();
      break;
    case 'Coach':
      attributes[rng.pick(['attacking', 'defending', 'technical', 'tactical'] as const)] = specialist();
      break;
  }

  return {
    id: nextId('s'),
    firstName: first,
    lastName: last,
    shortName: shortNameOf(first, last),
    nationality,
    birthDate: dateToISO(new Date(Date.UTC(startYear - age, rng.int(0, 11), rng.int(1, 28)))),
    clubId,
    role,
    attributes,
    wage: Math.round((300 + quality * 28) * rng.float(0.8, 1.3) / 50) * 50,
    contractExpires: addDaysISO(currentDate, rng.int(360, 1200)),
    reputation: clamp(Math.round(quality * rng.float(0.85, 1.15)), 1, 100),
    assignment: null,
  };
}

/** Board expectation, derived from where the club sits relative to its division. */
function expectationFor(reputation: number, tier: number, rng: Rng): BoardExpectation {
  const thresholds: Record<number, [number, BoardExpectation][]> = {
    1: [[88, 'Win the league'], [78, 'Finish in the top half'], [68, 'Respectable mid-table finish'], [0, 'Avoid relegation']],
    2: [[57, 'Achieve promotion'], [50, 'Challenge for promotion'], [45, 'Finish in the top half'], [40, 'Respectable mid-table finish'], [0, 'Avoid relegation']],
    3: [[36, 'Achieve promotion'], [31, 'Challenge for promotion'], [27, 'Finish in the top half'], [0, 'Respectable mid-table finish']],
    4: [[22, 'Achieve promotion'], [19, 'Challenge for promotion'], [0, 'Respectable mid-table finish']],
  };
  const ladder = thresholds[tier] ?? thresholds[4];
  // A little noise so two clubs of the same size don't always get identical demands.
  const effective = reputation + rng.gaussian(0, 1.5);
  for (const [threshold, expectation] of ladder) {
    if (effective >= threshold) return expectation;
  }
  return 'Avoid relegation';
}

function buildFinances(
  reputation: number,
  tier: number,
  fanbase: number,
  currentDate: string,
  rng: Rng,
): ClubFinances {
  // Cash reserves scale steeply with tier — the gulf between divisions is the point.
  const tierScale = [0, 1, 0.35, 0.09, 0.045][tier] ?? 0.045;
  const balance = Math.round(
    (reputation ** 2) * 4_000 * tierScale * rng.float(0.5, 1.8),
  );

  const shirtValue = Math.round(fanbase * 1_000 * tierScale * 12 * rng.float(0.8, 1.2));

  return {
    balance,
    transferBudget: Math.max(0, Math.round(balance * rng.float(0.25, 0.5) / 100_000) * 100_000),
    wageBudget: 0, // set once the squad exists
    sponsorships: [
      {
        kind: 'shirt',
        sponsor: rng.pick(SPONSOR_NAMES.shirt),
        annualValue: Math.max(40_000, shirtValue),
        seasonsRemaining: rng.int(1, 4),
      },
      {
        kind: 'kit',
        sponsor: rng.pick(SPONSOR_NAMES.kit),
        annualValue: Math.max(25_000, Math.round(shirtValue * 0.55)),
        seasonsRemaining: rng.int(1, 4),
      },
    ],
    loans: rng.chance(0.35)
      ? [{
        principal: Math.round(balance * rng.float(0.3, 1.4) / 100_000) * 100_000,
        rate: rng.float(0.045, 0.085),
        weeksRemaining: rng.int(80, 520),
        weeklyPayment: 0,
      }]
      : [],
    instalments: [],
    ledger: [],
    seasonProfits: [
      { season: seasonLabel(addDaysISO(currentDate, -730)), profit: Math.round(rng.gaussian(0, balance * 0.3)) },
      { season: seasonLabel(addDaysISO(currentDate, -365)), profit: Math.round(rng.gaussian(0, balance * 0.3)) },
    ],
    embargoUntil: null,
    administration: false,
  };
}

function buildFacilities(reputation: number, rng: Rng): ClubFacilities {
  const base = clamp(Math.round(reputation / 5.5), 2, 19);
  const jitter = () => clamp(Math.round(rng.gaussian(base, 2.2)), 1, 20);
  return {
    trainingGround: jitter(),
    youthAcademy: jitter(),
    youthRecruitment: jitter(),
    medical: jitter(),
    dataAnalysis: jitter(),
    corporateFacilities: jitter(),
    pitchQuality: clamp(Math.round(rng.gaussian(base + 3, 2)), 5, 20),
  };
}

/** How good a squad this club should have, on the 1-100 ability scale. */
function clubLevelFor(reputation: number, tier: number): number {
  const tierBase = [0, 66, 48, 36, 27][tier] ?? 27;
  const tierSpread = [0, 20, 12, 8, 6][tier] ?? 6;
  const tierRepRange: Record<number, [number, number]> = {
    1: [60, 96], 2: [38, 66], 3: [24, 42], 4: [14, 26],
  };
  const [lo, hi] = tierRepRange[tier] ?? [14, 26];
  const t = clamp((reputation - lo) / (hi - lo), 0, 1);
  return tierBase + (t - 0.5) * tierSpread * 2;
}

function buildClub(
  seed: ClubSeed,
  leagueId: string,
  tier: number,
  currentDate: string,
  rng: Rng,
): Club {
  const [id, name, shortName, nickname, city, founded, stadiumName, capacity, primary, secondary, text, reputation, fanbase] = seed;
  return {
    id,
    name,
    shortName,
    nickname,
    city,
    founded,
    leagueId,
    colors: { primary, secondary, text },
    reputation,
    fanbase: fanbase * 1000,
    fanHappiness: rng.int(50, 75),
    stadiumName,
    stadiumCapacity: capacity,
    corporateSeats: Math.round(capacity * rng.float(0.02, 0.07)),
    ticketPricing: {
      general: Math.round(clamp(12 + reputation * 0.42, 14, 65)),
      season: Math.round(clamp(12 + reputation * 0.42, 14, 65) * 17),
      corporate: Math.round(clamp(60 + reputation * 2.4, 70, 320)),
    },
    finances: buildFinances(reputation, tier, fanbase, currentDate, rng),
    facilities: buildFacilities(reputation, rng),
    projects: [],
    playerIds: [],
    staffIds: [],
    tactics: defaultTactics(rng.pick(['4-4-2', '4-2-3-1', '4-3-3', '4-4-1-1', '3-5-2'])),
    rivalIds: [],
    board: {
      confidence: rng.int(55, 78),
      expectation: expectationFor(reputation, tier, rng),
      patience: rng.int(45, 80),
      daysInCharge: 0,
    },
    isPlayerControlled: false,
    history: [],
    honours: [],
  };
}

function squadStatusFor(index: number, squadSize: number): SquadStatus {
  const ratio = index / squadSize;
  if (ratio < 0.09) return 'Key Player';
  if (ratio < 0.42) return 'First Team';
  if (ratio < 0.65) return 'Rotation';
  if (ratio < 0.85) return 'Backup';
  return 'Youngster';
}

/** Assign squad numbers 1-30 the way a real club would: 1 for the keeper, 9 for the striker. */
function assignSquadNumbers(players: Player[]): void {
  const taken = new Set<number>();
  const preferred: Partial<Record<Position, number[]>> = {
    GK: [1, 13, 25], DR: [2, 12, 22], DC: [5, 6, 4, 15, 26], DL: [3, 14, 23],
    DM: [4, 16, 24], MC: [8, 7, 18, 20], MR: [7, 17, 27], ML: [11, 19, 28],
    AMC: [10, 21, 29], ST: [9, 20, 30],
  };
  for (const player of players) {
    const options = preferred[player.naturalPosition] ?? [];
    let assigned = options.find((n) => !taken.has(n));
    if (!assigned) {
      for (let n = 2; n <= 45; n++) {
        if (!taken.has(n)) { assigned = n; break; }
      }
    }
    if (assigned) {
      taken.add(assigned);
      player.squadNumber = assigned;
    }
  }
}

export function createNewGame(options: NewGameOptions): GameState {
  resetIdCounter();
  const rng = new Rng(options.seed);
  const startDate = options.startDate ?? `${new Date().getUTCFullYear()}-07-01`;
  const season = seasonLabel(startDate);

  const clubs: Record<string, Club> = {};
  const players: Record<string, Player> = {};
  const staff: Record<string, Staff> = {};
  const competitions: Record<string, Competition> = {};

  for (const comp of COMPETITIONS) {
    competitions[comp.id] = { ...comp, clubIds: [] };
  }

  const usedNames = new Set<string>();
  for (const squad of [PREMIER_LEAGUE_SQUADS, CHAMPIONSHIP_SQUADS]) {
    for (const list of Object.values(squad)) {
      for (const [name] of list) usedNames.add(name);
    }
  }

  const authoredSquads: Record<string, PlayerSeed[]> = {
    ...PREMIER_LEAGUE_SQUADS,
    ...CHAMPIONSHIP_SQUADS,
  };

  const tierOf: Record<string, number> = {
    'premier-league': 1, championship: 2, 'league-one': 3, 'league-two': 4,
  };

  for (const { seeds, leagueId } of ALL_CLUB_SEEDS) {
    const tier = tierOf[leagueId];
    for (const seed of seeds) {
      const clubRng = new Rng(deriveSeed(options.seed, `club:${seed[0]}`));
      const club = buildClub(seed, leagueId, tier, startDate, clubRng);
      clubs[club.id] = club;
      competitions[leagueId].clubIds.push(club.id);

      // Players: authored where we have them, generated otherwise.
      const level = clubLevelFor(club.reputation, tier);
      const seedList = authoredSquads[club.id] ?? generateSquad(level, startDate, clubRng, usedNames);

      // Top the squad up to a workable size — an authored 21-man list still needs cover.
      const topUp = Math.max(0, 22 - seedList.length);
      const extras = topUp > 0
        ? generateSquad(level - 12, startDate, clubRng, usedNames).slice(0, topUp)
        : [];

      const squad: Player[] = [];
      for (const playerSeed of [...seedList, ...extras]) {
        const player = buildPlayer(playerSeed, club.id, startDate);
        players[player.id] = player;
        squad.push(player);
      }

      // Best players first, so squad status and shirt numbers line up with the pecking order.
      squad.sort((a, b) => b.currentAbility - a.currentAbility);
      squad.forEach((player, index) => {
        const status = squadStatusFor(index, squad.length);
        const age = ageOf(player, startDate);
        const years = age > 31 ? clubRng.int(1, 2) : age < 22 ? clubRng.int(2, 5) : clubRng.int(1, 4);
        player.contract = makeContract(player, club.reputation, startDate, years, status, clubRng);
        player.value = computeValue(player, startDate);
        player.homegrown = clubRng.chance(0.3);
        club.playerIds.push(player.id);
      });
      assignSquadNumbers(squad);

      // Staff.
      const staffPlan: [StaffRole, number][] = [
        ['Assistant Manager', 1], ['Coach', 3], ['Goalkeeping Coach', 1], ['Fitness Coach', 1],
        ['Physio', 2], ['Scout', tier <= 2 ? 3 : 2], ['Head of Youth', 1],
      ];
      for (const [role, count] of staffPlan) {
        for (let i = 0; i < count; i++) {
          const member = generateStaff(role, club.reputation, club.id, startDate, clubRng);
          staff[member.id] = member;
          club.staffIds.push(member.id);
        }
      }

      // Wage budget: current wage bill plus a little headroom.
      const wageBill = squad.reduce((sum, p) => sum + (p.contract?.wage ?? 0), 0);
      club.finances.wageBudget = Math.round(wageBill * clubRng.float(1.03, 1.18) / 500) * 500;

      // Amortise any starting loan into a weekly payment.
      for (const loan of club.finances.loans) {
        loan.weeklyPayment = Math.round(
          (loan.principal * (1 + loan.rate * (loan.weeksRemaining / 52))) / loan.weeksRemaining,
        );
      }

      // Pick a sensible starting XI so an unmanaged club is never fielding nobody.
      autoPickTeam({ clubs, players } as GameState, club.id);
    }
  }

  // Rivalries.
  for (const [a, b] of RIVALRIES) {
    if (clubs[a] && clubs[b]) {
      clubs[a].rivalIds.push(b);
      clubs[b].rivalIds.push(a);
    }
  }

  // Appoint the manager. The player does not choose — a mid-table Championship club chooses them.
  const eligible = STARTING_CLUB_POOL.filter((id) => clubs[id]);
  const clubId = rng.pick(eligible.length ? eligible : CHAMPIONSHIP_CLUBS.map((c) => c[0]));
  const managedClub = clubs[clubId];
  managedClub.isPlayerControlled = true;
  managedClub.board.confidence = 62;
  managedClub.board.daysInCharge = 0;

  const backgroundReputation: Record<Manager['background'], number> = {
    'Sunday League Footballer': 8,
    'Semi-Professional Footballer': 14,
    'Professional Footballer': 24,
    'International Footballer': 38,
    'National Coaching Badges': 20,
    'Continental Coaching Badges': 30,
  };

  const manager: Manager = {
    firstName: options.managerFirstName,
    lastName: options.managerLastName,
    nationality: options.managerNationality,
    birthDate: `${parseISO(startDate).getUTCFullYear() - 38}-05-14`,
    background: options.managerBackground,
    reputation: backgroundReputation[options.managerBackground],
    clubId,
    career: [{
      clubId,
      clubName: managedClub.name,
      from: startDate,
      to: null,
      played: 0, won: 0, drawn: 0, lost: 0,
      honours: [],
    }],
    totals: { played: 0, won: 0, drawn: 0, lost: 0 },
    honours: [],
  };

  managedClub.tactics = defaultTactics(options.preferredFormation);

  const state: GameState = {
    version: SAVE_VERSION,
    seed: options.seed,
    rngState: rng.state,
    date: startDate,
    season,
    difficulty: options.difficulty,
    manager,
    clubs,
    players,
    staff,
    competitions,
    fixtures: [],
    tables: {},
    cups: {},
    playoffs: {},
    news: [],
    transferOffers: [],
    contractOffers: [],
    scoutReports: [],
    shortlist: [],
    boardRequests: [],
    training: { schedule: 'Balanced', intensity: 3, individual: {} },
    transferWindowOpen: true,
    deadlineDay: false,
    history: [],
    parachuteYears: {},
    pendingStop: { kind: 'none' },
    processedToday: [],
    autoPlayMatches: false,
    lastUndo: null,
    attributeSnapshots: {},
    lastTrainingReportCA: null,
  };

  // Clubs relegated from the Premier League in recent seasons carry parachute money. We don't
  // simulate the seasons before the game starts, so seed a plausible set.
  for (const id of ['lei', 'ips', 'sou']) {
    if (state.clubs[id]) state.parachuteYears[id] = 1;
  }

  autoPickTeam(state, clubId);
  generateSeasonFixtures(state);

  for (const comp of Object.values(state.competitions)) {
    if (comp.kind === 'league') state.tables[comp.id] = emptyTable(comp.clubIds);
  }
  initialiseCups(state);

  // Season tickets are billed in July, so a new game starts with that income banked — otherwise
  // every club begins the season looking as though it is about to go under.
  billSeasonTickets(state);
  for (const club of Object.values(state.clubs)) setSeasonBudgets(state, club.id);
  publishPredictions(state);
  captureDevSnapshots(state);
  setSeasonObjectives(state);

  return state;
}

/** Exported for the fixture generator, which needs the same league membership ordering. */
export const LEAGUE_SEEDS: Record<string, ClubSeed[]> = {
  'premier-league': PREMIER_LEAGUE_CLUBS,
  championship: CHAMPIONSHIP_CLUBS,
  'league-one': LEAGUE_ONE_CLUBS,
  'league-two': LEAGUE_TWO_CLUBS,
};
