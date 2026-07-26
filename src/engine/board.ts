/**
 * The board: expectations, confidence, requests, job security and the sack.
 *
 * Board confidence is the game's real health bar. It moves on results measured against
 * expectation, on financial health, on fan happiness, and on whether you keep your promises.
 */

import { Rng, clamp, deriveSeed } from './rng';
import { addDaysISO } from './date';
import { BoardExpectation, Club } from './types';
import { BoardRequest, GameState, getClub, squadOf } from './gamestate';
import { positionOf, tableFor, effectivePoints } from './table';
import { addNews } from './news';
import { recordTransaction, wageBill, rollingLoss } from './finance';
import { settingsFor } from './difficulty';
import { nextId } from './players';

/** Where in the table the board expects to be, as a fraction of the division. */
function targetPosition(expectation: BoardExpectation, divisionSize: number): number {
  switch (expectation) {
    case 'Win the league': return 1;
    case 'Achieve promotion': return 2;
    case 'Challenge for promotion': return 6;
    case 'Finish in the top half': return Math.floor(divisionSize / 2);
    case 'Respectable mid-table finish': return Math.floor(divisionSize * 0.62);
    case 'Avoid relegation': return divisionSize - 4;
    case 'Survive and stabilise finances': return divisionSize - 3;
  }
}

/**
 * Weekly board assessment. Confidence drifts toward where results say it should be, rather than
 * jumping — a single bad week shouldn't cost you your job, and a single good one shouldn't save it.
 */
export function assessBoardConfidence(state: GameState): void {
  const club = getClub(state, state.manager.clubId);
  const settings = settingsFor(state.difficulty);
  const comp = state.competitions[club.leagueId];
  if (!comp) return;

  const table = tableFor(state, comp.id);
  const row = table.find((r) => r.clubId === club.id);
  if (!row || row.played < 3) {
    club.board.daysInCharge += 7;
    return;
  }

  const position = positionOf(state, comp.id, club.id);
  const target = targetPosition(club.board.expectation, comp.clubIds.length);

  // Positive when you're doing better than asked.
  const gap = target - position;
  let target_confidence = 55 + gap * 3.4;

  // Money matters as well as results.
  if (club.finances.balance < 0) target_confidence -= 12;
  if (club.finances.administration) target_confidence -= 25;
  if (rollingLoss(club) > 30_000_000) target_confidence -= 8;

  // Fans and board are not the same thing, but they influence each other.
  target_confidence += (club.fanHappiness - 55) * 0.14;

  // Cup runs buy goodwill.
  for (const cup of Object.values(state.cups)) {
    if (cup.remainingClubIds.includes(club.id) && cup.currentRound >= 3) target_confidence += 4;
  }

  target_confidence = clamp(target_confidence, 0, 100);

  // Move a fraction of the way toward the target each week; recovery is easier on lower
  // difficulties because the board is more patient.
  const rate = target_confidence > club.board.confidence ? 0.18 * settings.boardPatience : 0.14;
  club.board.confidence = clamp(
    club.board.confidence + (target_confidence - club.board.confidence) * clamp(rate, 0.05, 0.6),
    0,
    100,
  );

  club.board.daysInCharge += 7;
  considerSacking(state, club);
}

function considerSacking(state: GameState, club: Club): void {
  const settings = settingsFor(state.difficulty);
  const rng = new Rng(deriveSeed(state.rngState, `sack:${state.date}`));

  // A grace period, scaled by difficulty. Nobody gets sacked in September on Easy.
  const graceDays = 120 * settings.boardPatience;
  if (club.board.daysInCharge < graceDays) return;

  const threshold = 18 / settings.boardPatience;
  if (club.board.confidence > threshold) return;

  // Even at rock bottom the axe isn't guaranteed on any given week — but it's coming.
  const sackChance = clamp((threshold - club.board.confidence) / 60, 0.05, 0.5) / settings.boardPatience;
  if (!rng.chance(sackChance)) {
    if (club.board.confidence < threshold + 8 && rng.chance(0.3)) {
      addNews(state, {
        category: 'board',
        important: true,
        subject: 'The board expresses concern',
        body: `The board has made clear that results are not good enough. Their expectation this season was to ${club.board.expectation.toLowerCase()}, and on current form you are falling short. Your position is under review.`,
      });
    }
    return;
  }

  sackManager(state);
}

export function sackManager(state: GameState): void {
  const club = getClub(state, state.manager.clubId);
  const current = state.manager.career[state.manager.career.length - 1];
  if (current) current.to = state.date;
  club.isPlayerControlled = false;

  addNews(state, {
    category: 'board',
    important: true,
    subject: 'You have been sacked',
    body: `${club.name} have terminated your contract with immediate effect. The board thanked you for your efforts but felt a change was needed. Your record: ${current?.played ?? 0} games, ${current?.won ?? 0} wins.`,
  });

  state.pendingStop = { kind: 'sacked' };
}

// ---------------------------------------------------------------------------------------------
// Board requests
// ---------------------------------------------------------------------------------------------

export interface RequestOutcome {
  approved: boolean;
  reason: string;
}

/**
 * Ask the board for something. Approval depends on confidence, the club's finances and whether
 * the request is proportionate.
 */
export function makeBoardRequest(
  state: GameState,
  kind: BoardRequest['kind'],
  amount: number,
): RequestOutcome {
  const club = getClub(state, state.manager.clubId);
  const settings = settingsFor(state.difficulty);
  const rng = new Rng(deriveSeed(state.rngState, `request:${state.date}:${kind}`));

  const request: BoardRequest = {
    id: nextId('r'),
    kind,
    amount,
    date: state.date,
    status: 'pending',
  };
  state.boardRequests.unshift(request);

  // Recent requests annoy the board.
  const recent = state.boardRequests.filter(
    (r) => r.id !== request.id && r.date > addDaysISO(state.date, -60),
  ).length;

  const confidence = club.board.confidence;
  const affordability = club.finances.balance / Math.max(1, amount);

  let odds = 0.1 + confidence / 140 + clamp(affordability * 0.14, 0, 0.45) - recent * 0.12;
  odds *= settings.boardPatience;

  if (club.finances.administration || club.finances.embargoUntil && club.finances.embargoUntil > state.date) {
    request.status = 'rejected';
    request.reason = 'The club is under financial restrictions and cannot commit to anything.';
    return { approved: false, reason: request.reason };
  }

  const approved = rng.chance(clamp(odds, 0.02, 0.94));
  request.status = approved ? 'approved' : 'rejected';

  if (!approved) {
    request.reason = affordability < 0.7
      ? 'The board says the club simply cannot afford it at present.'
      : confidence < 45
        ? 'The board is not convinced you have earned that level of backing.'
        : 'The board has decided against it for now. Try again once you have built a case.';
    addNews(state, {
      category: 'board',
      subject: 'Board request declined',
      body: request.reason,
      action: { kind: 'board-request-response', approved: false },
    });
    return { approved: false, reason: request.reason };
  }

  applyApprovedRequest(state, club, kind, amount);
  request.reason = 'Approved.';
  return { approved: true, reason: 'The board has approved your request.' };
}

function applyApprovedRequest(
  state: GameState,
  club: Club,
  kind: BoardRequest['kind'],
  amount: number,
): void {
  switch (kind) {
    case 'transfer-budget':
      club.finances.transferBudget += amount;
      addNews(state, {
        category: 'board',
        important: true,
        subject: 'Transfer budget increased',
        body: `The board has released a further £${(amount / 1_000_000).toFixed(2)}m for transfers. Your budget is now £${(club.finances.transferBudget / 1_000_000).toFixed(2)}m.`,
        action: { kind: 'board-request-response', approved: true },
      });
      break;

    case 'wage-budget':
      club.finances.wageBudget += amount;
      addNews(state, {
        category: 'board',
        important: true,
        subject: 'Wage budget increased',
        body: `Your weekly wage budget has been raised by £${amount.toLocaleString()} to £${club.finances.wageBudget.toLocaleString()}.`,
        action: { kind: 'board-request-response', approved: true },
      });
      break;

    case 'stadium-expansion': {
      const added = Math.round(amount / 2_600);
      club.projects.push({
        kind: 'expansion',
        description: `Expansion of ${club.stadiumName} (+${added.toLocaleString()} seats)`,
        cost: amount,
        daysRemaining: 240 + Math.round(added / 40),
        totalDays: 240 + Math.round(added / 40),
        capacityDelta: added,
        ratingDelta: 0,
      });
      recordTransaction(state, club.id, 'Ground Improvements', 'Stadium expansion', -amount);
      addNews(state, {
        category: 'board',
        important: true,
        subject: 'Stadium expansion approved',
        body: `Work will begin on expanding ${club.stadiumName} by ${added.toLocaleString()} seats at a cost of £${(amount / 1_000_000).toFixed(1)}m. Completion is expected in around ${Math.round((240 + added / 40) / 30)} months.`,
        action: { kind: 'board-request-response', approved: true },
      });
      break;
    }

    case 'new-stadium': {
      const capacity = Math.round(amount / 4_200);
      club.projects.push({
        kind: 'new-build',
        description: `Construction of a new ${capacity.toLocaleString()}-seat stadium`,
        cost: amount,
        daysRemaining: 900,
        totalDays: 900,
        capacityDelta: Math.max(0, capacity - club.stadiumCapacity),
        ratingDelta: 0,
      });
      recordTransaction(state, club.id, 'Ground Improvements', 'New stadium construction', -amount);
      addNews(state, {
        category: 'board',
        important: true,
        subject: 'New stadium approved',
        body: `The board has committed £${(amount / 1_000_000).toFixed(0)}m to a new ${capacity.toLocaleString()}-capacity stadium. Construction will take around three years.`,
        action: { kind: 'board-request-response', approved: true },
      });
      break;
    }

    case 'training-upgrade':
      club.projects.push({
        kind: 'training',
        description: 'Training ground redevelopment',
        cost: amount,
        daysRemaining: 180,
        totalDays: 180,
        capacityDelta: 0,
        ratingDelta: clamp(Math.round(amount / 2_000_000), 1, 5),
      });
      recordTransaction(state, club.id, 'Ground Improvements', 'Training ground upgrade', -amount);
      addNews(state, {
        category: 'board',
        important: true,
        subject: 'Training ground upgrade approved',
        body: `£${(amount / 1_000_000).toFixed(1)}m has been allocated to redevelop the training ground. Work should complete within six months.`,
        action: { kind: 'board-request-response', approved: true },
      });
      break;

    case 'youth-upgrade':
      club.projects.push({
        kind: 'youth',
        description: 'Youth academy investment',
        cost: amount,
        daysRemaining: 210,
        totalDays: 210,
        capacityDelta: 0,
        ratingDelta: clamp(Math.round(amount / 1_500_000), 1, 5),
      });
      recordTransaction(state, club.id, 'Ground Improvements', 'Youth academy upgrade', -amount);
      addNews(state, {
        category: 'board',
        important: true,
        subject: 'Youth academy investment approved',
        body: `£${(amount / 1_000_000).toFixed(1)}m will be invested in the academy. The benefits will take a few seasons to show in the intake.`,
        action: { kind: 'board-request-response', approved: true },
      });
      break;

    case 'feeder-club':
      addNews(state, {
        category: 'board',
        subject: 'Feeder club arrangement agreed',
        body: 'The board has agreed a feeder club arrangement, giving you somewhere to send young players for competitive football.',
        action: { kind: 'board-request-response', approved: true },
      });
      break;
  }
}

/** What the board would consider a reasonable ask right now. */
export function suggestedRequestAmount(state: GameState, kind: BoardRequest['kind']): number {
  const club = getClub(state, state.manager.clubId);
  switch (kind) {
    case 'transfer-budget': return Math.max(250_000, Math.round(club.finances.balance * 0.2 / 250_000) * 250_000);
    case 'wage-budget': return Math.max(2_500, Math.round(wageBill(state, club.id) * 0.1 / 500) * 500);
    case 'stadium-expansion': return Math.max(4_000_000, Math.round(club.stadiumCapacity * 260));
    case 'new-stadium': return Math.max(60_000_000, club.stadiumCapacity * 5_000);
    case 'training-upgrade': return 4_000_000;
    case 'youth-upgrade': return 3_000_000;
    case 'feeder-club': return 0;
  }
}

// ---------------------------------------------------------------------------------------------
// End of season review
// ---------------------------------------------------------------------------------------------

export function endOfSeasonReview(state: GameState): void {
  const club = getClub(state, state.manager.clubId);
  const comp = state.competitions[club.leagueId];
  if (!comp) return;

  const table = tableFor(state, comp.id);
  const position = table.findIndex((r) => r.clubId === club.id) + 1;
  const target = targetPosition(club.board.expectation, comp.clubIds.length);
  const row = table[position - 1];

  const met = position <= target;
  const swing = met ? clamp((target - position) * 3 + 8, 5, 30) : clamp((target - position) * 4, -40, -5);
  club.board.confidence = clamp(club.board.confidence + swing, 0, 100);

  const verdict = position <= target - 4
    ? 'The board is delighted. That was well beyond what they asked for.'
    : met
      ? 'The board is satisfied that you met their expectations.'
      : position <= target + 3
        ? 'The board is disappointed but accepts there were mitigating factors.'
        : 'The board is deeply unhappy with how the season went.';

  addNews(state, {
    category: 'board',
    important: true,
    subject: 'End of season review',
    body: `You finished ${ordinal(position)} in the ${comp.name} on ${row ? effectivePoints(row) : 0} points. The board's expectation was to ${club.board.expectation.toLowerCase()}. ${verdict}`,
  });

  // Next season's expectation is set from where you actually finished.
  club.board.expectation = nextExpectation(position, comp.clubIds.length, club.board.expectation);

  if (club.board.confidence < 15) sackManager(state);
}

function nextExpectation(
  position: number,
  divisionSize: number,
  current: BoardExpectation,
): BoardExpectation {
  const ratio = position / divisionSize;
  if (ratio <= 0.1) return 'Achieve promotion';
  if (ratio <= 0.28) return 'Challenge for promotion';
  if (ratio <= 0.5) return 'Finish in the top half';
  if (ratio <= 0.78) return 'Respectable mid-table finish';
  return current === 'Avoid relegation' ? 'Avoid relegation' : 'Avoid relegation';
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

/** A short, human summary of job security, shown on the board screen. */
export function jobSecurityLabel(confidence: number): string {
  if (confidence >= 80) return 'Very secure';
  if (confidence >= 62) return 'Secure';
  if (confidence >= 45) return 'Stable';
  if (confidence >= 30) return 'Under pressure';
  if (confidence >= 18) return 'Precarious';
  return 'On the brink';
}

/** Set the season's transfer and wage budgets, called at each season rollover. */
export function setSeasonBudgets(state: GameState, clubId: string): void {
  const club = getClub(state, clubId);
  const settings = settingsFor(state.difficulty);
  const rng = new Rng(deriveSeed(state.rngState, `budget:${clubId}:${state.season}`));

  const currentWages = wageBill(state, clubId);
  const balance = club.finances.balance;

  // The board keeps a reserve; what's left is yours to spend.
  let transfer = Math.max(0, balance * rng.float(0.28, 0.48));
  let wages = currentWages * rng.float(1.04, 1.16);

  if (club.isPlayerControlled) {
    transfer *= settings.budgetMultiplier;
    wages *= 1 + (settings.budgetMultiplier - 1) * 0.4;
    // Board confidence buys backing.
    transfer *= 0.7 + club.board.confidence / 160;
  }

  if (club.finances.administration || (club.finances.embargoUntil && club.finances.embargoUntil > state.date)) {
    transfer = 0;
    wages = currentWages * 0.95;
  }

  club.finances.transferBudget = Math.round(transfer / 50_000) * 50_000;
  club.finances.wageBudget = Math.round(wages / 500) * 500;

  if (club.isPlayerControlled) {
    addNews(state, {
      category: 'board',
      important: true,
      subject: `Budgets for ${state.season}`,
      body: `The board has set your transfer budget at £${(club.finances.transferBudget / 1_000_000).toFixed(2)}m and your weekly wage budget at £${club.finances.wageBudget.toLocaleString()}. Their expectation this season is to ${club.board.expectation.toLowerCase()}.`,
    });
  }
}

/** Squad size warnings, part of the forgiving-of-mistakes remit. */
export function squadWarnings(state: GameState, clubId: string): string[] {
  const club = getClub(state, clubId);
  const squad = squadOf(state, clubId);
  const warnings: string[] = [];

  if (squad.length < 16) {
    warnings.push(`Your squad has only ${squad.length} players. You risk being unable to field a side.`);
  }
  const keepers = squad.filter((p) => p.naturalPosition === 'GK' && !p.injury);
  if (keepers.length < 2) {
    warnings.push('You have fewer than two fit goalkeepers.');
  }
  const bill = wageBill(state, clubId);
  if (bill > club.finances.wageBudget) {
    warnings.push(`Your wage bill of £${bill.toLocaleString()} exceeds the budget of £${club.finances.wageBudget.toLocaleString()}.`);
  }
  if (club.finances.balance < 0) {
    warnings.push(`The club is £${Math.abs(Math.round(club.finances.balance)).toLocaleString()} in the red.`);
  }
  return warnings;
}
