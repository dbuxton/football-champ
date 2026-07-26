/**
 * Applying a finished match back to the world: statistics, condition, cards, injuries, morale,
 * fan happiness, gate receipts and the news feed.
 */

import { Rng, clamp, deriveSeed } from './rng';
import { Fixture, MatchResult, Player } from './types';
import { GameState, getClub, squadOf } from './gamestate';
import { MatchSim, MatchTeam } from './match';
import { seasonStatsFor } from './players';
import { rollInjury, describeLayoff } from './injuries';
import { applyResultToTable } from './table';
import { addNews } from './news';
import { creditMatchdayIncome, recordTransaction } from './finance';
import { settingsFor } from './difficulty';

/** Yellow cards needed for a one-match ban, as per the English game. */
const BOOKING_LIMIT = 5;

export function applyMatchResult(
  state: GameState,
  fixture: Fixture,
  sim: MatchSim,
  result: MatchResult,
): void {
  const rng = new Rng(deriveSeed(state.rngState, `post:${fixture.id}`));
  const settings = settingsFor(state.difficulty);

  fixture.played = true;
  fixture.result = result;
  fixture.attendance = sim.attendance;

  const comp = state.competitions[fixture.competitionId];
  if (comp?.kind === 'league') applyResultToTable(state, fixture, result);

  applyTeam(state, sim.home, fixture, result, 'home', rng, settings.injuryRate);
  applyTeam(state, sim.away, fixture, result, 'away', rng, settings.injuryRate);

  creditMatchdayIncome(state, fixture, sim.attendance);
  applyFanReaction(state, fixture, result);
  writeMatchNews(state, fixture, result);
  trimStoredResult(state, fixture);
}

/**
 * Keep the save a sane size.
 *
 * A full result carries ~90 commentary lines and a rating for every player involved. Across the
 * 2,200 matches an English season contains, storing all of that pushes a save past 35MB — well
 * beyond what a browser will hold. Only the human's own matches need the full record for the
 * result screen; for everyone else's, the score, the summary statistics and the goals and cards
 * are all the game ever reads back.
 */
function trimStoredResult(state: GameState, fixture: Fixture): void {
  const result = fixture.result;
  if (!result) return;

  const managedId = state.manager.clubId;
  const isOurs = fixture.homeClubId === managedId || fixture.awayClubId === managedId;

  if (!isOurs) {
    result.commentary = [];
    result.ratings = {};
    result.events = result.events.filter((event) =>
      event.type === 'goal' || event.type === 'penalty-goal' || event.type === 'own-goal' ||
      event.type === 'red' || event.type === 'second-yellow');
    return;
  }

  // Our own matches keep everything, but only for the most recent handful. Nobody re-reads the
  // minute-by-minute of a game from four months ago, and keeping them all doubles the save.
  const ours = state.fixtures
    .filter((f) => f.played && f.result &&
      (f.homeClubId === managedId || f.awayClubId === managedId))
    .sort((a, b) => b.date.localeCompare(a.date));

  for (const old of ours.slice(FULL_COMMENTARY_MATCHES)) {
    if (!old.result || old.result.commentary.length === 0) continue;
    old.result.commentary = [];
  }
}

/** How many of the manager's own recent matches keep their full commentary feed. */
const FULL_COMMENTARY_MATCHES = 12;

function applyTeam(
  state: GameState,
  team: MatchTeam,
  fixture: Fixture,
  result: MatchResult,
  side: 'home' | 'away',
  rng: Rng,
  injuryRateModifier: number,
): void {
  const club = getClub(state, team.clubId);
  const goalsFor = side === 'home' ? result.homeGoals : result.awayGoals;
  const goalsAgainst = side === 'home' ? result.awayGoals : result.homeGoals;
  const won = goalsFor > goalsAgainst;
  const drew = goalsFor === goalsAgainst;

  const medical = club.facilities.medical;
  const isHuman = club.isPlayerControlled;

  const participants = [...team.onPitch, ...team.bench].filter((mp) => mp.minutesPlayed > 0);

  // Contract bonuses are real money: appearance fees for everyone who featured, goal bonuses per
  // goal. Paid for every club symmetrically, so the market prices them fairly.
  let bonuses = 0;
  for (const mp of participants) {
    const contract = state.players[mp.player.id]?.contract;
    if (!contract) continue;
    bonuses += contract.appearanceFee + contract.goalBonus * mp.goals;
  }
  if (bonuses > 0) {
    recordTransaction(state, club.id, 'Bonuses', 'Appearance and goal bonuses', -Math.round(bonuses));
  }

  for (const mp of participants) {
    const player = state.players[mp.player.id];
    if (!player) continue;

    const stats = seasonStatsFor(player, fixture.competitionId);
    const startedOnPitch = team.tactics.slots.some((s) => s.playerId === player.id);
    if (startedOnPitch) stats.appearances += 1;
    else stats.substituteAppearances += 1;

    stats.minutes += mp.minutesPlayed;
    stats.goals += mp.goals;
    stats.assists += mp.assists;
    stats.yellowCards += Math.min(mp.yellow, 2);
    if (mp.red) stats.redCards += 1;
    if (mp.position === 'GK') {
      stats.goalsConceded += goalsAgainst;
      if (goalsAgainst === 0 && mp.minutesPlayed >= 80) stats.cleanSheets += 1;
    }

    const rating = result.ratings[player.id] ?? 6.5;
    stats.ratingSum += rating;
    if (result.motmPlayerId === player.id) stats.motm += 1;

    player.form.push(rating);
    if (player.form.length > 10) player.form = player.form.slice(-10);

    // Condition and sharpness.
    player.condition = clamp(mp.condition, 8, 100);
    player.matchSharpness = clamp(
      player.matchSharpness + (mp.minutesPlayed / 90) * 14 - 1,
      10,
      100,
    );

    // Discipline. Yellow cards accumulate toward a ban; reds are an immediate suspension.
    if (mp.red) {
      // A second yellow is a one-match ban; a straight red is three.
      player.suspensionMatches += mp.yellow >= 2 ? 1 : 3;
      player.bookingPoints = 0;
    } else if (mp.yellow > 0) {
      player.bookingPoints += mp.yellow;
      if (player.bookingPoints >= BOOKING_LIMIT) {
        player.suspensionMatches += 1;
        player.bookingPoints = 0;
        if (isHuman) {
          addNews(state, {
            category: 'squad',
            subject: `${player.shortName} suspended`,
            body: `${player.firstName} ${player.lastName} has reached ${BOOKING_LIMIT} bookings and will serve a one-match suspension.`,
            relatedPlayerId: player.id,
          });
        }
      }
    }

    // Injuries picked up in the match, plus a small chance of a knock that only shows up after.
    const proneness = player.attributes.injuryProneness / 10;
    const fatigueFactor = 1 + (100 - player.condition) / 120;
    const knockChance = 0.012 * proneness * fatigueFactor * (isHuman ? injuryRateModifier : 1);
    if (mp.injured || rng.chance(knockChance)) {
      player.injury = rollInjury(rng, player, medical, mp.injured ? 1.15 : 0.8);
      if (isHuman) {
        addNews(state, {
          category: 'injury',
          important: player.injury.totalDays > 21,
          subject: `${player.shortName} injured`,
          body: `${player.firstName} ${player.lastName} has picked up a ${player.injury.type.toLowerCase()} and is expected to be out for ${describeLayoff(player.injury)}.`,
          relatedPlayerId: player.id,
        });
      }
    }

    // Morale. Results move everyone; individual performance moves the individual.
    const teamSwing = won ? 4 : drew ? 0.5 : -3.5;
    const personalSwing = (rating - 6.6) * 2.2;
    const decay = isHuman ? settingsFor(state.difficulty).moraleDecay : 1;
    const swing = teamSwing + personalSwing;
    player.morale = clamp(player.morale + (swing < 0 ? swing * decay : swing), 5, 100);
  }

  // Players who didn't feature recover condition and lose a little sharpness.
  for (const player of squadOf(state, club.id)) {
    if (participants.some((mp) => mp.player.id === player.id)) continue;
    player.condition = clamp(player.condition + 6, 0, 100);
    player.matchSharpness = clamp(player.matchSharpness - 0.8, 10, 100);
  }

  // Serve suspensions: anyone banned who was unavailable for this fixture ticks down.
  for (const player of squadOf(state, club.id)) {
    const played = participants.some((mp) => mp.player.id === player.id);
    if (!played && player.suspensionMatches > 0 && !state.players[player.id]?.injury) {
      // Only decrement for bans incurred before this match.
      const bannedThisMatch = participants.some((mp) => mp.player.id === player.id && mp.red);
      if (!bannedThisMatch) player.suspensionMatches = Math.max(0, player.suspensionMatches - 1);
    }
  }
}

function applyFanReaction(state: GameState, fixture: Fixture, result: MatchResult): void {
  for (const [clubId, scored, conceded] of [
    [fixture.homeClubId, result.homeGoals, result.awayGoals] as const,
    [fixture.awayClubId, result.awayGoals, result.homeGoals] as const,
  ]) {
    const club = state.clubs[clubId];
    if (!club) continue;
    const opponentId = clubId === fixture.homeClubId ? fixture.awayClubId : fixture.homeClubId;
    const isDerby = club.rivalIds.includes(opponentId);
    const weight = isDerby ? 2.2 : 1;

    let swing = scored > conceded ? 2.2 : scored === conceded ? 0.2 : -1.8;
    // A thrashing either way lands harder.
    if (Math.abs(scored - conceded) >= 3) swing *= 1.5;
    club.fanHappiness = clamp(club.fanHappiness + swing * weight, 0, 100);
  }
}

function writeMatchNews(state: GameState, fixture: Fixture, result: MatchResult): void {
  const managedId = state.manager.clubId;
  if (fixture.homeClubId !== managedId && fixture.awayClubId !== managedId) return;

  const home = getClub(state, fixture.homeClubId);
  const away = getClub(state, fixture.awayClubId);
  const isHome = fixture.homeClubId === managedId;
  const us = isHome ? result.homeGoals : result.awayGoals;
  const them = isHome ? result.awayGoals : result.homeGoals;
  const comp = state.competitions[fixture.competitionId];

  const scorers = result.events
    .filter((e) => e.type === 'goal' || e.type === 'penalty-goal')
    .map((e) => {
      const player = e.playerId ? state.players[e.playerId] : null;
      return player ? `${player.shortName} ${e.minute}'` : null;
    })
    .filter(Boolean)
    .join(', ');

  const verdict = us > them ? 'A win' : us === them ? 'A draw' : 'A defeat';

  addNews(state, {
    category: 'match',
    subject: `${home.shortName} ${result.homeGoals} - ${result.awayGoals} ${away.shortName}`,
    body: [
      `${verdict} in the ${comp?.name ?? 'league'}.`,
      fixture.attendance ? `Attendance: ${fixture.attendance.toLocaleString()}.` : '',
      scorers ? `Scorers: ${scorers}.` : 'No goals to report.',
      result.penalties
        ? `The tie was settled on penalties, ${result.penalties.home}-${result.penalties.away}.`
        : '',
    ].filter(Boolean).join(' '),
    important: false,
  });
}

/** How many league games in a row the human has lost, feeding the Easy-mode guardrail. */
export function humanDefeatStreak(state: GameState): number {
  const clubId = state.manager.clubId;
  const club = state.clubs[clubId];
  if (!club) return 0;
  const table = state.tables[club.leagueId];
  const row = table?.find((r) => r.clubId === clubId);
  if (!row) return 0;
  let streak = 0;
  for (let i = row.form.length - 1; i >= 0; i--) {
    if (row.form[i] === 'L') streak += 1;
    else break;
  }
  return streak;
}

/** Convenience wrapper used everywhere a match needs to be played out of sight. */
export function simulateFixture(state: GameState, fixture: Fixture, opts: {
  needsWinner?: boolean;
  aggregate?: { home: number; away: number };
} = {}): { sim: MatchSim; result: MatchResult } {
  const rng = new Rng(deriveSeed(state.seed, `match:${fixture.id}`));
  const sim = new MatchSim(state, fixture, rng, {
    ...opts,
    humanDefeatStreak: humanDefeatStreak(state),
  });
  sim.simulateToEnd();
  const result = sim.toResult();
  applyMatchResult(state, fixture, sim, result);
  return { sim, result };
}

/** Winner of a tie, accounting for aggregate scores and shootouts. */
export function winnerOf(fixture: Fixture, aggregate?: { home: number; away: number }): string | null {
  if (!fixture.result) return null;
  const homeTotal = fixture.result.homeGoals + (aggregate?.home ?? 0);
  const awayTotal = fixture.result.awayGoals + (aggregate?.away ?? 0);
  if (homeTotal > awayTotal) return fixture.homeClubId;
  if (awayTotal > homeTotal) return fixture.awayClubId;
  if (fixture.result.penalties) {
    return fixture.result.penalties.home > fixture.result.penalties.away
      ? fixture.homeClubId
      : fixture.awayClubId;
  }
  return null;
}

/** Players who scored in a fixture, for headlines and awards. */
export function scorersOf(state: GameState, result: MatchResult): Player[] {
  return result.events
    .filter((e) => e.type === 'goal' || e.type === 'penalty-goal')
    .map((e) => (e.playerId ? state.players[e.playerId] : null))
    .filter((p): p is Player => Boolean(p));
}
