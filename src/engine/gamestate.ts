/**
 * The complete game state — everything that gets saved.
 *
 * Entities live in flat id-keyed maps rather than nested objects so that a player can be looked
 * up in constant time from anywhere and so the whole graph serialises without cycles.
 */

import {
  Club, Competition, ContractOffer, Difficulty, Fixture, LeagueTableRow, Manager, NewsItem,
  Player, ScoutReport, Staff, TransferOffer, Tactics,
} from './types';

export interface CupTie {
  fixtureId: string;
  round: number;
  /** Winner once decided. */
  winnerClubId: string | null;
}

export interface CupState {
  competitionId: string;
  /** Clubs still in the competition. */
  remainingClubIds: string[];
  currentRound: number;
  roundNames: string[];
  /** Set once the competition is finished. */
  winnerClubId: string | null;
  /** Clubs eliminated, in order, so we can award round prize money. */
  eliminatedInRound: Record<string, number>;
}

export interface PlayoffState {
  competitionId: string;
  /** Parent league. */
  leagueId: string;
  semiFinalists: string[];
  finalists: string[];
  winnerClubId: string | null;
  stage: 'pending' | 'semis' | 'final' | 'complete';
}

export interface SeasonHistory {
  season: string;
  /** competitionId -> final ordered club ids. */
  finalTables: Record<string, string[]>;
  cupWinners: Record<string, string>;
  playerOfTheYear: string | null;
  youngPlayerOfTheYear: string | null;
  topScorer: { playerId: string; goals: number } | null;
  managerClubId: string;
  managerPosition: number;
}

/** Board requests the manager has made, awaiting an answer. */
export interface BoardRequest {
  id: string;
  kind: 'transfer-budget' | 'wage-budget' | 'stadium-expansion' | 'training-upgrade'
    | 'youth-upgrade' | 'new-stadium' | 'feeder-club';
  amount: number;
  date: string;
  status: 'pending' | 'approved' | 'rejected';
  reason?: string;
}

/** Training focus per squad unit, plus individual assignments. */
export interface TrainingState {
  /** Overall emphasis. */
  schedule: 'Balanced' | 'Fitness' | 'Attacking' | 'Defending' | 'Tactical' | 'Technical' | 'Light';
  /** Intensity 1-5. High intensity develops faster but risks injury and fatigue. */
  intensity: number;
  /** playerId -> individual focus area. */
  individual: Record<string, IndividualFocus>;
}

export type IndividualFocus =
  | 'None' | 'Finishing' | 'Passing' | 'Tackling' | 'Fitness' | 'Strength' | 'Pace'
  | 'Technique' | 'Heading' | 'Positioning' | 'Goalkeeping';

/**
 * What the day-advance loop stopped for. The UI turns each of these into a screen or a modal.
 */
export type PendingStop =
  | { kind: 'match'; fixtureId: string }
  | { kind: 'news'; newsIds: string[] }
  | { kind: 'season-end' }
  | { kind: 'sacked' }
  | { kind: 'none' };

export interface GameState {
  /** Bumped when the shape changes; `migrate()` upgrades older saves. */
  version: number;
  seed: number;
  rngState: number;
  /** ISO date. */
  date: string;
  season: string;
  difficulty: Difficulty;

  manager: Manager;

  clubs: Record<string, Club>;
  players: Record<string, Player>;
  staff: Record<string, Staff>;
  competitions: Record<string, Competition>;

  fixtures: Fixture[];
  /** competitionId -> table rows, kept sorted. */
  tables: Record<string, LeagueTableRow[]>;
  cups: Record<string, CupState>;
  playoffs: Record<string, PlayoffState>;

  news: NewsItem[];
  transferOffers: TransferOffer[];
  contractOffers: ContractOffer[];
  scoutReports: ScoutReport[];
  shortlist: string[];
  boardRequests: BoardRequest[];
  training: TrainingState;

  /** Set while a window is open; transfers outside a window are loans and frees only. */
  transferWindowOpen: boolean;
  /** Countdown shown on deadline day. */
  deadlineDay: boolean;

  history: SeasonHistory[];
  /** clubId -> seasons since relegation from the Premier League, for parachute payments. */
  parachuteYears: Record<string, number>;

  /** Set when the day loop halts and hands control back to the UI. */
  pendingStop: PendingStop;
  /** Ids of fixtures already simulated today, so re-entry doesn't double-process. */
  processedToday: string[];

  /** Whether the human's next match should be played out or auto-simulated. */
  autoPlayMatches: boolean;
  /** Undo snapshot for the forgiving-mistakes guardrail: the last reversible action. */
  lastUndo: { label: string; date: string; snapshot: string } | null;
}

export const SAVE_VERSION = 1;

// ---------------------------------------------------------------------------------------------
// Convenience accessors. Every one of these is used in dozens of places, so they earn their keep.
// ---------------------------------------------------------------------------------------------

export function getClub(state: GameState, id: string): Club {
  const club = state.clubs[id];
  if (!club) throw new Error(`Unknown club: ${id}`);
  return club;
}

export function getPlayer(state: GameState, id: string): Player {
  const player = state.players[id];
  if (!player) throw new Error(`Unknown player: ${id}`);
  return player;
}

export function getCompetition(state: GameState, id: string): Competition {
  const comp = state.competitions[id];
  if (!comp) throw new Error(`Unknown competition: ${id}`);
  return comp;
}

export function squadOf(state: GameState, clubId: string): Player[] {
  return getClub(state, clubId).playerIds
    .map((id) => state.players[id])
    .filter((p): p is Player => Boolean(p) && !p.retired);
}

export function staffOf(state: GameState, clubId: string): Staff[] {
  return getClub(state, clubId).staffIds
    .map((id) => state.staff[id])
    .filter((s): s is Staff => Boolean(s));
}

export function playerClub(state: GameState, player: Player): Club | null {
  return player.clubId ? state.clubs[player.clubId] ?? null : null;
}

export function managedClub(state: GameState): Club {
  return getClub(state, state.manager.clubId);
}

export function leagueOf(state: GameState, clubId: string): Competition {
  return getCompetition(state, getClub(state, clubId).leagueId);
}

/** All fixtures for a club this season, in date order. */
export function clubFixtures(state: GameState, clubId: string): Fixture[] {
  return state.fixtures
    .filter((f) => f.homeClubId === clubId || f.awayClubId === clubId)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function nextFixtureFor(state: GameState, clubId: string): Fixture | null {
  return clubFixtures(state, clubId).find((f) => !f.played && f.date >= state.date) ?? null;
}

/**
 * Fixtures due on or before a date.
 *
 * Deliberately not an exact date match: cup rounds and play-offs are booked onto fixed calendar
 * slots, and if the league programme overruns, a tie can end up dated in the past. Catching
 * everything overdue means a fixture can never be stranded, which would otherwise stall the season
 * forever.
 */
export function fixturesOn(state: GameState, date: string): Fixture[] {
  return state.fixtures.filter((f) => f.date <= date && !f.played);
}

export function unreadNews(state: GameState): NewsItem[] {
  return state.news.filter((n) => !n.read);
}

export function activeTactics(state: GameState, clubId: string): Tactics {
  return getClub(state, clubId).tactics;
}

/** Free agents: no club, not retired. */
export function freeAgents(state: GameState): Player[] {
  return Object.values(state.players).filter((p) => !p.clubId && !p.retired);
}
