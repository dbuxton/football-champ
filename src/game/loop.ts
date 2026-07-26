/**
 * The day-advance loop — the "Continue" button.
 *
 * Advances one day at a time, running everything the world needs, and halts the moment something
 * requires the manager's attention: a match to play, a bid to answer, a board meeting, the end of
 * the season. This is the heartbeat of the whole game.
 */

import { Rng, deriveSeed } from './rngProxy';
import { addDaysISO, dayOfWeek, monthOf, parseISO } from '../engine/date';
import { GameState, PendingStop, getClub, fixturesOn } from '../engine/gamestate';
import { simulateFixture } from '../engine/postmatch';
import { processCupRound, processPlayoff, playoffNeedsWinner, aggregateFor } from '../engine/cups';
import { processWeeklyFinances } from '../engine/finance';
import {
  processDailyRecovery, processMorale, processWeeklyTraining, processYouthIntake,
} from '../engine/progression';
import { processScouting } from '../engine/scouting';
import {
  processTransferDay, processFreeAgents, windowOpenOn, isDeadlineDay,
} from '../engine/transfers';
import { assessBoardConfidence, assessObjectives } from '../engine/board';
import { maybeSchedulePressConference, monthlyAwards } from '../engine/media';
import {
  endSeason, leagueSeasonComplete, playoffsComplete, preSeasonHousekeeping, startPlayoffsIfReady,
} from '../engine/season';
import { repairSelection } from '../engine/selection';
import { settingsFor } from '../engine/difficulty';
import { addNews, stoppingNews } from '../engine/news';

export interface AdvanceResult {
  stop: PendingStop;
  /** Days actually advanced. */
  days: number;
}

/**
 * Advance the world until something needs the manager. `maxDays` is a safety valve so a bug can
 * never spin the loop forever.
 */
export function advance(state: GameState, maxDays = 400): AdvanceResult {
  let days = 0;

  while (days < maxDays) {
    const stop = advanceOneDay(state);
    days += 1;
    if (stop.kind !== 'none') {
      state.pendingStop = stop;
      return { stop, days };
    }
  }

  state.pendingStop = { kind: 'none' };
  return { stop: { kind: 'none' }, days };
}

/** Advance a single day and report whether the manager is needed. */
export function advanceOneDay(state: GameState): PendingStop {
  const previousDate = state.date;
  state.date = addDaysISO(state.date, 1);
  state.processedToday = [];

  const rng = new Rng(deriveSeed(state.rngState, `day:${state.date}`));
  state.rngState = rng.state;

  // --- Window state --------------------------------------------------------------------------
  state.transferWindowOpen = windowOpenOn(state.date);
  state.deadlineDay = isDeadlineDay(state.date);

  // --- Daily processes -----------------------------------------------------------------------
  processDailyRecovery(state);
  processTransferDay(state);
  processFreeAgents(state);
  processScouting(state);

  // --- Weekly processes ----------------------------------------------------------------------
  if (dayOfWeek(state.date) === 1) {
    processWeeklyFinances(state);
    processWeeklyTraining(state);
    processMorale(state);
    assessBoardConfidence(state);
    assessObjectives(state);
    if (state.pendingStop.kind === 'sacked') return { kind: 'sacked' };
  }

  // --- Monthly processes ---------------------------------------------------------------------
  if (parseISO(state.date).getUTCDate() === 1 && monthOf(state.date) !== 7) {
    monthlyAwards(state);
  }

  // --- Season milestones ---------------------------------------------------------------------
  if (state.date.endsWith('-03-14')) processYouthIntake(state);
  if (state.date.endsWith('-07-01')) preSeasonHousekeeping(state);

  // --- Fixtures ------------------------------------------------------------------------------
  const todaysFixtures = fixturesOn(state, state.date);
  const managedId = state.manager.clubId;
  const humanFixture = todaysFixtures.find(
    (f) => f.homeClubId === managedId || f.awayClubId === managedId,
  );

  if (humanFixture && !state.autoPlayMatches) {
    // Stop here so the manager can pick a team and watch the game. Everything else on the card
    // is played once they've finished, in `playRemainingFixtures`.
    return { kind: 'match', fixtureId: humanFixture.id };
  }

  playAllFixtures(state, todaysFixtures.map((f) => f.id));

  // --- Post-fixture competition bookkeeping ---------------------------------------------------
  processCompetitionState(state);

  // --- Press ---------------------------------------------------------------------------------
  maybeOfferPressConference(state);

  // --- Season end ----------------------------------------------------------------------------
  if (leagueSeasonComplete(state)) {
    startPlayoffsIfReady(state);
    if (playoffsComplete(state) && noFixturesLeft(state)) {
      return { kind: 'season-end' };
    }
  }

  // --- Anything in the inbox worth stopping for? ----------------------------------------------
  const stopping = stoppingNews(state, previousDate);
  if (stopping.length > 0) {
    return { kind: 'news', newsIds: stopping.map((n) => n.id) };
  }

  return { kind: 'none' };
}

/** Play a set of fixtures by id, repairing the human's team sheet first if it's illegal. */
export function playAllFixtures(state: GameState, fixtureIds: string[]): void {
  const settings = settingsFor(state.difficulty);

  for (const id of fixtureIds) {
    const fixture = state.fixtures.find((f) => f.id === id);
    if (!fixture || fixture.played) continue;

    // Forgiving-of-mistakes: never let the manager forfeit because of a forgotten injury.
    for (const clubId of [fixture.homeClubId, fixture.awayClubId]) {
      const club = state.clubs[clubId];
      if (!club) continue;
      if (club.isPlayerControlled && !settings.autoRepairSelection) continue;
      if (repairSelection(state, clubId) && club.isPlayerControlled) {
        addNews(state, {
          category: 'squad',
          subject: 'Team sheet corrected',
          body: 'Your selected side was not legal — an injured, suspended or missing player was in the line-up — so your assistant picked the strongest available team.',
        });
      }
    }

    const needsWinner = playoffNeedsWinner(fixture) ||
      (state.competitions[fixture.competitionId]?.kind === 'cup' &&
        fixture.roundName === 'Final');

    simulateFixture(state, fixture, {
      needsWinner,
      aggregate: aggregateFor(state, fixture),
    });
    state.processedToday.push(fixture.id);
  }
}

/** After the human's match, play everything else on the card and finish the day. */
export function completeMatchDay(state: GameState): PendingStop {
  const remaining = fixturesOn(state, state.date).map((f) => f.id);
  playAllFixtures(state, remaining);
  processCompetitionState(state);
  maybeOfferPressConference(state);

  if (leagueSeasonComplete(state)) {
    startPlayoffsIfReady(state);
    if (playoffsComplete(state) && noFixturesLeft(state)) {
      return { kind: 'season-end' };
    }
  }

  const stopping = stoppingNews(state, state.date);
  if (stopping.length > 0) return { kind: 'news', newsIds: stopping.map((n) => n.id) };
  return { kind: 'none' };
}

function processCompetitionState(state: GameState): void {
  for (const competitionId of Object.keys(state.cups)) {
    processCupRound(state, competitionId);
  }
  for (const playoffId of Object.keys(state.playoffs)) {
    processPlayoff(state, playoffId);
  }
}

function noFixturesLeft(state: GameState): boolean {
  return state.fixtures.every((f) => f.played);
}

function maybeOfferPressConference(state: GameState): void {
  const managedId = state.manager.clubId;
  const next = state.fixtures
    .filter((f) => !f.played && (f.homeClubId === managedId || f.awayClubId === managedId))
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  if (!next) return;

  // The press turn up two days before a game.
  const twoDaysOut = addDaysISO(state.date, 2);
  if (next.date !== twoDaysOut) return;

  const alreadyAsked = state.news.some(
    (n) => n.date === state.date && n.action?.kind === 'press-conference',
  );
  if (alreadyAsked) return;

  const opponent = next.homeClubId === managedId ? next.awayClubId : next.homeClubId;
  maybeSchedulePressConference(state, opponent);
}

/** Roll into the next season once the manager acknowledges the end-of-season screen. */
export function rolloverSeason(state: GameState): void {
  endSeason(state);
}

/** Convenience for the UI: is the human's next fixture today? */
export function isMatchDay(state: GameState): boolean {
  const managedId = state.manager.clubId;
  return state.fixtures.some(
    (f) => f.date <= state.date && !f.played &&
      (f.homeClubId === managedId || f.awayClubId === managedId),
  );
}

/** The human's next fixture, whenever it is. */
export function nextHumanFixture(state: GameState) {
  const managedId = state.manager.clubId;
  return state.fixtures
    .filter((f) => !f.played && (f.homeClubId === managedId || f.awayClubId === managedId))
    .sort((a, b) => a.date.localeCompare(b.date))[0] ?? null;
}

/** Days until the next fixture, for the home screen. */
export function daysUntilNextFixture(state: GameState): number | null {
  const next = nextHumanFixture(state);
  if (!next) return null;
  return Math.round(
    (parseISO(next.date).getTime() - parseISO(state.date).getTime()) / 86_400_000,
  );
}

export function managedClubName(state: GameState): string {
  return getClub(state, state.manager.clubId).name;
}
