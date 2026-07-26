/**
 * Core domain types for the simulation.
 *
 * Nothing in this file imports React or touches the DOM. The entire game state is a plain,
 * JSON-serialisable object graph referenced by string ids, which keeps saving cheap and makes
 * the engine straightforward to test headlessly.
 */

// ---------------------------------------------------------------------------------------------
// Positions
// ---------------------------------------------------------------------------------------------

export type Position =
  | 'GK'
  | 'DL' | 'DC' | 'DR'
  | 'WBL' | 'WBR'
  | 'DM'
  | 'ML' | 'MC' | 'MR'
  | 'AML' | 'AMC' | 'AMR'
  | 'ST';

export const POSITIONS: readonly Position[] = [
  'GK', 'DR', 'DC', 'DL', 'WBR', 'WBL', 'DM', 'MR', 'MC', 'ML', 'AMR', 'AMC', 'AML', 'ST',
];

/** Broad grouping used for squad balance checks, training units and AI needs analysis. */
export type PositionGroup = 'GK' | 'DEF' | 'MID' | 'ATT';

export function positionGroup(pos: Position): PositionGroup {
  if (pos === 'GK') return 'GK';
  if (pos === 'DL' || pos === 'DC' || pos === 'DR' || pos === 'WBL' || pos === 'WBR') return 'DEF';
  if (pos === 'ST' || pos === 'AML' || pos === 'AMC' || pos === 'AMR') return 'ATT';
  return 'MID';
}

/** Where on the pitch a position nominally sits, in 0..1 (x = width, y = length toward goal). */
export const POSITION_COORDS: Record<Position, { x: number; y: number }> = {
  GK: { x: 0.5, y: 0.05 },
  DR: { x: 0.85, y: 0.2 },
  DC: { x: 0.5, y: 0.16 },
  DL: { x: 0.15, y: 0.2 },
  WBR: { x: 0.9, y: 0.34 },
  WBL: { x: 0.1, y: 0.34 },
  DM: { x: 0.5, y: 0.32 },
  MR: { x: 0.86, y: 0.5 },
  MC: { x: 0.5, y: 0.48 },
  ML: { x: 0.14, y: 0.5 },
  AMR: { x: 0.85, y: 0.68 },
  AMC: { x: 0.5, y: 0.66 },
  AML: { x: 0.15, y: 0.68 },
  ST: { x: 0.5, y: 0.84 },
};

export type Foot = 'L' | 'R' | 'B';

// ---------------------------------------------------------------------------------------------
// Attributes — the CM 01/02 model, all on the 1-20 scale
// ---------------------------------------------------------------------------------------------

export interface TechnicalAttributes {
  crossing: number;
  dribbling: number;
  finishing: number;
  heading: number;
  longShots: number;
  marking: number;
  passing: number;
  penalties: number;
  tackling: number;
  technique: number;
  freeKicks: number;
  corners: number;
}

export interface MentalAttributes {
  aggression: number;
  anticipation: number;
  bravery: number;
  composure: number;
  concentration: number;
  creativity: number;
  decisions: number;
  determination: number;
  flair: number;
  influence: number;
  offTheBall: number;
  positioning: number;
  teamwork: number;
  workRate: number;
}

export interface PhysicalAttributes {
  acceleration: number;
  agility: number;
  balance: number;
  jumping: number;
  naturalFitness: number;
  pace: number;
  stamina: number;
  strength: number;
}

export interface GoalkeepingAttributes {
  handling: number;
  reflexes: number;
  oneOnOnes: number;
  aerialAbility: number;
  commandOfArea: number;
  communication: number;
  eccentricity: number;
  rushingOut: number;
  throwing: number;
  kicking: number;
}

/**
 * Hidden attributes. The player never sees these numbers directly — at most they're hinted at
 * through scout reports and behaviour — exactly as in the original games.
 */
export interface HiddenAttributes {
  consistency: number;
  importantMatches: number;
  injuryProneness: number;
  dirtiness: number;
  versatility: number;
  ambition: number;
  loyalty: number;
  pressure: number;
  professionalism: number;
  sportsmanship: number;
  temperament: number;
  adaptability: number;
}

export interface Attributes
  extends TechnicalAttributes, MentalAttributes, PhysicalAttributes, GoalkeepingAttributes, HiddenAttributes {}

export const TECHNICAL_KEYS: readonly (keyof TechnicalAttributes)[] = [
  'crossing', 'dribbling', 'finishing', 'heading', 'longShots', 'marking',
  'passing', 'penalties', 'tackling', 'technique', 'freeKicks', 'corners',
];

export const MENTAL_KEYS: readonly (keyof MentalAttributes)[] = [
  'aggression', 'anticipation', 'bravery', 'composure', 'concentration', 'creativity',
  'decisions', 'determination', 'flair', 'influence', 'offTheBall', 'positioning',
  'teamwork', 'workRate',
];

export const PHYSICAL_KEYS: readonly (keyof PhysicalAttributes)[] = [
  'acceleration', 'agility', 'balance', 'jumping', 'naturalFitness', 'pace', 'stamina', 'strength',
];

export const GOALKEEPING_KEYS: readonly (keyof GoalkeepingAttributes)[] = [
  'handling', 'reflexes', 'oneOnOnes', 'aerialAbility', 'commandOfArea', 'communication',
  'eccentricity', 'rushingOut', 'throwing', 'kicking',
];

export const HIDDEN_KEYS: readonly (keyof HiddenAttributes)[] = [
  'consistency', 'importantMatches', 'injuryProneness', 'dirtiness', 'versatility', 'ambition',
  'loyalty', 'pressure', 'professionalism', 'sportsmanship', 'temperament', 'adaptability',
];

export const ATTRIBUTE_LABELS: Record<keyof Attributes, string> = {
  crossing: 'Crossing', dribbling: 'Dribbling', finishing: 'Finishing', heading: 'Heading',
  longShots: 'Long Shots', marking: 'Marking', passing: 'Passing', penalties: 'Penalties',
  tackling: 'Tackling', technique: 'Technique', freeKicks: 'Free Kicks', corners: 'Corners',
  aggression: 'Aggression', anticipation: 'Anticipation', bravery: 'Bravery', composure: 'Composure',
  concentration: 'Concentration', creativity: 'Creativity', decisions: 'Decisions',
  determination: 'Determination', flair: 'Flair', influence: 'Influence', offTheBall: 'Off the Ball',
  positioning: 'Positioning', teamwork: 'Teamwork', workRate: 'Work Rate',
  acceleration: 'Acceleration', agility: 'Agility', balance: 'Balance', jumping: 'Jumping',
  naturalFitness: 'Natural Fitness', pace: 'Pace', stamina: 'Stamina', strength: 'Strength',
  handling: 'Handling', reflexes: 'Reflexes', oneOnOnes: 'One on Ones', aerialAbility: 'Aerial Ability',
  commandOfArea: 'Command of Area', communication: 'Communication', eccentricity: 'Eccentricity',
  rushingOut: 'Rushing Out', throwing: 'Throwing', kicking: 'Kicking',
  consistency: 'Consistency', importantMatches: 'Important Matches', injuryProneness: 'Injury Proneness',
  dirtiness: 'Dirtiness', versatility: 'Versatility', ambition: 'Ambition', loyalty: 'Loyalty',
  pressure: 'Pressure', professionalism: 'Professionalism', sportsmanship: 'Sportsmanship',
  temperament: 'Temperament', adaptability: 'Adaptability',
};

// ---------------------------------------------------------------------------------------------
// Players
// ---------------------------------------------------------------------------------------------

export type SquadStatus =
  | 'Key Player' | 'First Team' | 'Rotation' | 'Backup' | 'Hot Prospect' | 'Youngster';

export interface Contract {
  /** ISO date the contract expires. */
  expires: string;
  /** Weekly wage in GBP. */
  wage: number;
  /** Release clause in GBP, 0 for none. */
  releaseClause: number;
  /** Annual loyalty bonus in GBP. */
  loyaltyBonus: number;
  /** Per-appearance fee in GBP. */
  appearanceFee: number;
  /** Per-goal bonus in GBP. */
  goalBonus: number;
  squadStatus: SquadStatus;
  /** Signing-on fee paid when the deal was struck, kept for the finance ledger. */
  signingOnFee: number;
}

export interface Injury {
  type: string;
  /** Days remaining until fit. */
  daysRemaining: number;
  /** Total length of the layoff, used for the "back in N weeks" text. */
  totalDays: number;
  /** Injuries leave a lingering susceptibility. */
  recurring: boolean;
}

export interface PlayerSeasonStats {
  competitionId: string;
  appearances: number;
  substituteAppearances: number;
  minutes: number;
  goals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
  cleanSheets: number;
  goalsConceded: number;
  /** Running total of match ratings; average = ratingSum / appearances. */
  ratingSum: number;
  motm: number;
}

export interface CareerHistoryEntry {
  season: string;
  clubId: string;
  clubName: string;
  competitionName: string;
  appearances: number;
  goals: number;
  assists: number;
  averageRating: number;
}

export interface Player {
  id: string;
  firstName: string;
  lastName: string;
  /** Cached "F. Lastname" for dense table rendering. */
  shortName: string;
  clubId: string | null;
  nationality: string;
  secondNationality?: string;
  /** ISO date. */
  birthDate: string;
  foot: Foot;
  /** Height in cm, weight in kg — used by the aerial model. */
  height: number;
  weight: number;

  naturalPosition: Position;
  /** Familiarity 1-20 for every position. 20 = natural, <10 = notably uncomfortable. */
  positions: Record<Position, number>;

  attributes: Attributes;
  /** Current ability 1-200, as in CM. Derived from attributes but stored for AI valuation. */
  currentAbility: number;
  potentialAbility: number;

  contract: Contract | null;
  /** 0-100. Drives performance, transfer requests and contract talks. */
  morale: number;
  /** 0-100 match sharpness — low means rusty, and it rises with minutes played. */
  matchSharpness: number;
  /** 0-100 condition. Depleted by matches, recovered by rest. */
  condition: number;
  /** Rolling form indicator, average rating over recent matches. */
  form: number[];

  injury: Injury | null;
  /** Yellow cards accrued toward a suspension, per competition. */
  bookingPoints: number;
  /** Matches still to serve. */
  suspensionMatches: number;

  /** Value in GBP, recalculated as ability, age and contract change. */
  value: number;
  /** True when the player has asked to leave. */
  transferListed: boolean;
  loanListed: boolean;
  /** Set while out on loan. */
  loan: { parentClubId: string; returnDate: string; wageShare: number; canRecall: boolean } | null;

  stats: PlayerSeasonStats[];
  history: CareerHistoryEntry[];
  /** International caps and goals. */
  caps: number;
  internationalGoals: number;
  /** True for players generated by the youth intake, used for homegrown rules. */
  homegrown: boolean;
  retired: boolean;
  /** Squad number, 0 when unassigned. */
  squadNumber: number;
}

// ---------------------------------------------------------------------------------------------
// Staff
// ---------------------------------------------------------------------------------------------

export type StaffRole =
  | 'Assistant Manager' | 'Coach' | 'Goalkeeping Coach' | 'Fitness Coach'
  | 'Physio' | 'Scout' | 'Head of Youth';

export interface Staff {
  id: string;
  firstName: string;
  lastName: string;
  shortName: string;
  nationality: string;
  birthDate: string;
  clubId: string | null;
  role: StaffRole;
  /** All 1-20. Which ones matter depends on the role. */
  attributes: {
    attacking: number;
    defending: number;
    technical: number;
    tactical: number;
    fitness: number;
    goalkeeping: number;
    youth: number;
    physiotherapy: number;
    judgingAbility: number;
    judgingPotential: number;
    manManagement: number;
    discipline: number;
    motivating: number;
  };
  /** Weekly wage in GBP. */
  wage: number;
  contractExpires: string;
  reputation: number;
  /** Scout only: the region they're assigned to, or a specific player/club assignment. */
  assignment: ScoutAssignment | null;
}

export interface ScoutAssignment {
  kind: 'region' | 'player' | 'competition';
  target: string;
  /** Days spent so far — report accuracy improves with time. */
  daysElapsed: number;
}

export interface ScoutReport {
  playerId: string;
  scoutId: string;
  /** 0-1, how confident the report is. Drives how wide the reported ranges are. */
  accuracy: number;
  /** Estimated current and potential ability, as a range. */
  abilityRange: [number, number];
  potentialRange: [number, number];
  /** Star rating 0.5-5 in half steps. */
  stars: number;
  potentialStars: number;
  verdict: string;
  date: string;
}

// ---------------------------------------------------------------------------------------------
// Tactics
// ---------------------------------------------------------------------------------------------

export type Mentality = 'Defensive' | 'Counter' | 'Balanced' | 'Attacking' | 'Overload';
export type Tempo = 'Slow' | 'Normal' | 'Fast';
export type Width = 'Narrow' | 'Normal' | 'Wide';
export type PassingStyle = 'Short' | 'Mixed' | 'Direct' | 'Long Ball';
export type Pressing = 'Deep' | 'Standard' | 'High' | 'Gegenpress';
export type MarkingStyle = 'Zonal' | 'Man';
export type TacklingStyle = 'Cautious' | 'Normal' | 'Hard';
export type DefensiveLine = 'Deep' | 'Normal' | 'High';

export type PlayerRole =
  | 'Goalkeeper' | 'Sweeper Keeper'
  | 'Full Back' | 'Wing Back' | 'Centre Back' | 'Ball Playing Defender' | 'Stopper'
  | 'Anchor Man' | 'Deep Lying Playmaker' | 'Box to Box' | 'Ball Winner' | 'Advanced Playmaker'
  | 'Winger' | 'Inside Forward' | 'Wide Playmaker'
  | 'Attacking Midfielder' | 'Shadow Striker'
  | 'Target Man' | 'Poacher' | 'Complete Forward' | 'Deep Lying Forward' | 'Pressing Forward';

export interface Formation {
  name: string;
  /** Exactly 11 slots, first is always the goalkeeper. */
  slots: Position[];
}

export interface TacticSlot {
  position: Position;
  playerId: string | null;
  role: PlayerRole;
  /** Individual instruction toggles. Every one of these is read by the match engine. */
  instructions: {
    forwardRuns: 'Rarely' | 'Mixed' | 'Often';
    longShots: 'Rarely' | 'Mixed' | 'Often';
    crossBall: 'Rarely' | 'Mixed' | 'Often';
    throughBalls: 'Rarely' | 'Mixed' | 'Often';
    tackling: TacklingStyle;
  };
}

export interface SetPieceTakers {
  penalties: string | null;
  freeKicks: string | null;
  corners: string | null;
  longThrows: string | null;
  captain: string | null;
  viceCaptain: string | null;
}

export interface Tactics {
  formationName: string;
  slots: TacticSlot[];
  /** Ordered list of substitutes on the bench (7 max). */
  bench: (string | null)[];
  mentality: Mentality;
  tempo: Tempo;
  width: Width;
  passingStyle: PassingStyle;
  pressing: Pressing;
  marking: MarkingStyle;
  tackling: TacklingStyle;
  defensiveLine: DefensiveLine;
  /** Time wasting 1-20 and counter-attack toggle, as per the classics. */
  timeWasting: number;
  counterAttack: boolean;
  offsideTrap: boolean;
  setPieces: SetPieceTakers;
}

// ---------------------------------------------------------------------------------------------
// Clubs
// ---------------------------------------------------------------------------------------------

export interface StadiumProject {
  kind: 'expansion' | 'new-build' | 'training' | 'youth' | 'facilities';
  description: string;
  cost: number;
  /** Days remaining until completion. */
  daysRemaining: number;
  totalDays: number;
  /** Capacity added on completion, for stadium work. */
  capacityDelta: number;
  /** Facility rating added on completion, for training/youth work. */
  ratingDelta: number;
}

export interface Sponsorship {
  kind: 'shirt' | 'stadium' | 'kit';
  sponsor: string;
  /** Annual value in GBP. */
  annualValue: number;
  /** Seasons remaining. */
  seasonsRemaining: number;
}

export interface Loan {
  /** Outstanding principal in GBP. */
  principal: number;
  /** Annual interest rate, e.g. 0.06. */
  rate: number;
  /** Weeks remaining on the term. */
  weeksRemaining: number;
  weeklyPayment: number;
}

export interface TransferInstalment {
  /** Positive = money owed to us, negative = money we owe. */
  amount: number;
  dueDate: string;
  counterpartyClubId: string;
  playerName: string;
}

export interface FinanceLedgerEntry {
  date: string;
  category: FinanceCategory;
  description: string;
  amount: number;
}

export type FinanceCategory =
  | 'Gate Receipts' | 'Season Tickets' | 'TV Revenue' | 'Prize Money' | 'Sponsorship'
  | 'Merchandise' | 'Corporate' | 'Transfers In' | 'Player Wages' | 'Staff Wages'
  | 'Stadium Maintenance' | 'Ground Improvements' | 'Transfers Out' | 'Agent Fees'
  | 'Bonuses' | 'Loan Repayment' | 'Board Grant' | 'Youth Development' | 'Other';

export interface ClubFinances {
  balance: number;
  /** Remaining transfer kitty for the window. */
  transferBudget: number;
  /** Remaining weekly wage headroom. */
  wageBudget: number;
  sponsorships: Sponsorship[];
  loans: Loan[];
  instalments: TransferInstalment[];
  ledger: FinanceLedgerEntry[];
  /** Rolling pre-tax profit per season, used for FFP / P&S assessment. */
  seasonProfits: { season: string; profit: number }[];
  /** Set when the club is under a transfer embargo. */
  embargoUntil: string | null;
  administration: boolean;
}

export interface ClubFacilities {
  /** All 1-20. */
  trainingGround: number;
  youthAcademy: number;
  youthRecruitment: number;
  medical: number;
  dataAnalysis: number;
  corporateFacilities: number;
  pitchQuality: number;
}

export interface TicketPricing {
  general: number;
  season: number;
  corporate: number;
}

export interface Club {
  id: string;
  name: string;
  shortName: string;
  nickname: string;
  city: string;
  founded: number;
  /** Competition id of the league the club currently plays in. */
  leagueId: string;
  colors: { primary: string; secondary: string; text: string };
  /** 1-100. Drives player interest, sponsorship, attendance, media attention. */
  reputation: number;
  fanbase: number;
  /** 0-100. Falls with poor results and high ticket prices. */
  fanHappiness: number;

  stadiumName: string;
  stadiumCapacity: number;
  /** Portion of capacity that is seated corporate/hospitality. */
  corporateSeats: number;
  ticketPricing: TicketPricing;

  finances: ClubFinances;
  facilities: ClubFacilities;
  projects: StadiumProject[];

  playerIds: string[];
  staffIds: string[];
  tactics: Tactics;

  /** Ids of rival clubs — derby fixtures carry extra weight. */
  rivalIds: string[];

  board: {
    /** 0-100. Below ~25 and your job is in danger. */
    confidence: number;
    /** What they expect this season. */
    expectation: BoardExpectation;
    /** Promises made to the manager, e.g. budget increases. */
    patience: number;
    /** Days since appointment, used to soften early sackings. */
    daysInCharge: number;
    /** Concrete season targets shown on the objectives scoreboard. Human club only. */
    objectives?: SeasonObjective[];
  };

  /** Filled for the club the human manages. */
  isPlayerControlled: boolean;

  history: ClubHistoryEntry[];
  honours: { competitionName: string; season: string }[];
}

export type BoardExpectation =
  | 'Win the league' | 'Achieve promotion' | 'Challenge for promotion' | 'Finish in the top half'
  | 'Respectable mid-table finish' | 'Avoid relegation' | 'Survive and stabilise finances';

/** A concrete season target the board tracks alongside the headline league expectation. */
export interface SeasonObjective {
  kind: 'league' | 'cup' | 'finance';
  /** Human-readable, e.g. "Challenge for promotion" or "Reach the FA Cup fourth round". */
  label: string;
  competitionId?: string;
  /** League objectives: the position to reach (or better). */
  targetPosition?: number;
  /** Cup objectives: the round to reach (0-indexed). */
  targetRound?: number;
  status: 'on-track' | 'behind' | 'met' | 'failed';
}

export interface ClubHistoryEntry {
  season: string;
  competitionName: string;
  position: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
  averageAttendance: number;
  managerName: string;
}

// ---------------------------------------------------------------------------------------------
// Competitions
// ---------------------------------------------------------------------------------------------

export type CompetitionKind = 'league' | 'cup' | 'playoff' | 'continental';

export interface Competition {
  id: string;
  name: string;
  shortName: string;
  kind: CompetitionKind;
  /** 1 = Premier League, 2 = Championship, etc. Cups use the tier of their strongest entrant. */
  tier: number;
  /** 1-100, feeds player interest and prize money. */
  reputation: number;
  clubIds: string[];
  /** League only. */
  promotionSpots?: number;
  playoffSpots?: number;
  relegationSpots?: number;
  /** Prize money by final position, in GBP. */
  prizeMoney?: number[];
  /** Cup only: round prize money. */
  roundPrizeMoney?: number[];
  /** Set for cups whose earlier rounds are replayed. */
  hasReplays?: boolean;
}

export interface LeagueTableRow {
  clubId: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
  /** Applied by the board for financial breaches. */
  pointsDeduction: number;
  /** Most recent results, newest last: 'W' | 'D' | 'L'. */
  form: string[];
  homeRecord: { w: number; d: number; l: number; gf: number; ga: number };
  awayRecord: { w: number; d: number; l: number; gf: number; ga: number };
}

// ---------------------------------------------------------------------------------------------
// Fixtures and results
// ---------------------------------------------------------------------------------------------

export type Weather = 'Sunny' | 'Overcast' | 'Rain' | 'Heavy Rain' | 'Snow' | 'Windy';

export interface Fixture {
  id: string;
  competitionId: string;
  /** ISO date. */
  date: string;
  round: number;
  /** Cup rounds get a human label, e.g. "Third Round". */
  roundName?: string;
  homeClubId: string;
  awayClubId: string;
  played: boolean;
  result: MatchResult | null;
  /** Two-legged ties reference their partner. */
  legOf?: string;
  isSecondLeg?: boolean;
  /** Set for finals played at a neutral venue. */
  neutralVenue?: string;
  attendance?: number;
  weather?: Weather;
}

export interface MatchResult {
  homeGoals: number;
  awayGoals: number;
  /** Populated when the tie went to extra time / penalties. */
  extraTime?: boolean;
  penalties?: { home: number; away: number };
  events: MatchEvent[];
  stats: { home: MatchTeamStats; away: MatchTeamStats };
  /** playerId -> rating 1-10. */
  ratings: Record<string, number>;
  motmPlayerId: string | null;
  /** Ordered commentary lines with the minute they occurred. */
  commentary: CommentaryLine[];
}

export interface MatchTeamStats {
  shots: number;
  shotsOnTarget: number;
  possession: number;
  corners: number;
  fouls: number;
  offsides: number;
  yellowCards: number;
  redCards: number;
  passes: number;
  passesCompleted: number;
  tackles: number;
  saves: number;
  /** Expected goals, for the post-match analysis screen. */
  xg: number;
}

export type MatchEventType =
  | 'goal' | 'own-goal' | 'penalty-goal' | 'penalty-miss' | 'yellow' | 'second-yellow' | 'red'
  | 'injury' | 'substitution' | 'kickoff' | 'half-time' | 'full-time' | 'shot' | 'save'
  | 'corner' | 'offside' | 'foul' | 'chance' | 'woodwork' | 'extra-time' | 'penalties';

export interface MatchEvent {
  minute: number;
  type: MatchEventType;
  side: 'home' | 'away' | 'neutral';
  playerId?: string;
  secondaryPlayerId?: string;
  text: string;
}

export interface CommentaryLine {
  minute: number;
  text: string;
  /** Where the ball is when this line fires, in 0..1 pitch coordinates from the home team's view. */
  ball: { x: number; y: number };
  /** Highlight lines get emphasised in the feed. */
  important: boolean;
  side: 'home' | 'away' | 'neutral';
  score: [number, number];
}

// ---------------------------------------------------------------------------------------------
// Transfers and negotiations
// ---------------------------------------------------------------------------------------------

export type TransferOfferStatus =
  | 'pending' | 'accepted' | 'rejected' | 'negotiating' | 'withdrawn' | 'completed' | 'expired';

export interface TransferOffer {
  id: string;
  playerId: string;
  fromClubId: string;
  toClubId: string;
  /** Up-front fee. */
  fee: number;
  /** Number of instalments the balance is spread over, 0 for none. */
  instalments: number;
  sellOnPercent: number;
  appearanceBonus: number;
  goalBonus: number;
  promotionBonus: number;
  isLoan: boolean;
  loanWageShare: number;
  loanMonths: number;
  status: TransferOfferStatus;
  date: string;
  /** Free text from the selling club, e.g. "we want £4m". */
  responseText?: string;
  /** The fee the selling club would accept, revealed during negotiation. */
  counterFee?: number;
  /** Days before the offer lapses. */
  expiresInDays: number;
}

export interface ContractOffer {
  id: string;
  playerId: string;
  clubId: string;
  wage: number;
  /** Length in years. */
  years: number;
  signingOnFee: number;
  releaseClause: number;
  loyaltyBonus: number;
  appearanceFee: number;
  goalBonus: number;
  squadStatus: SquadStatus;
  status: TransferOfferStatus;
  date: string;
  responseText?: string;
  /** What the player actually wants, revealed as talks progress. */
  demands?: { wage: number; years: number; signingOnFee: number; squadStatus: SquadStatus };
  expiresInDays: number;
}

// ---------------------------------------------------------------------------------------------
// News and media
// ---------------------------------------------------------------------------------------------

export type NewsCategory =
  | 'board' | 'transfer' | 'match' | 'injury' | 'media' | 'squad' | 'finance' | 'youth'
  | 'competition' | 'staff' | 'award' | 'general';

export interface NewsItem {
  id: string;
  date: string;
  category: NewsCategory;
  subject: string;
  body: string;
  read: boolean;
  important: boolean;
  /** Attaches an interactive decision to the item. */
  action?: NewsAction;
  relatedClubId?: string;
  relatedPlayerId?: string;
}

export type NewsAction =
  | { kind: 'press-conference'; questions: PressQuestion[] }
  | { kind: 'transfer-offer'; offerId: string }
  | { kind: 'contract-response'; offerId: string }
  | { kind: 'board-request-response'; approved: boolean }
  | { kind: 'job-offer'; clubId: string; expiresInDays: number }
  | { kind: 'player-unhappy'; playerId: string }
  | { kind: 'acknowledge' };

export interface PressQuestion {
  question: string;
  options: PressAnswer[];
  /** Set once answered. */
  answeredIndex?: number;
}

export interface PressAnswer {
  text: string;
  /** Effect on squad morale, board confidence and fan happiness. */
  moraleDelta: number;
  boardDelta: number;
  fanDelta: number;
  /** Some answers target a specific player. */
  targetPlayerId?: string;
}

// ---------------------------------------------------------------------------------------------
// Manager
// ---------------------------------------------------------------------------------------------

export interface ManagerCareerEntry {
  clubId: string;
  clubName: string;
  from: string;
  to: string | null;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  honours: string[];
}

export interface Manager {
  firstName: string;
  lastName: string;
  nationality: string;
  birthDate: string;
  /** Background sets a small starting reputation and coaching bias. */
  background: 'Sunday League Footballer' | 'Semi-Professional Footballer' | 'Professional Footballer'
    | 'International Footballer' | 'Continental Coaching Badges' | 'National Coaching Badges';
  reputation: number;
  clubId: string;
  career: ManagerCareerEntry[];
  /** Aggregate record across the whole career. */
  totals: { played: number; won: number; drawn: number; lost: number };
  honours: { competitionName: string; season: string; clubName: string }[];
}

export type Difficulty = 'Easy' | 'Normal' | 'Hard' | 'Legend';
