/**
 * Club economics.
 *
 * The financial model is what gives the game its stakes. Promotion is transformative because the
 * Premier League's central distribution dwarfs the Championship's; relegation is ruinous because
 * wages don't fall as fast as income does; and the EFL's Profitability & Sustainability rules mean
 * you can't simply spend your way out of trouble.
 */

import { Rng, clamp, deriveSeed } from './rng';
import { addDaysISO, monthOf, parseISO, seasonLabel } from './date';
import {
  Club, FinanceCategory, FinanceLedgerEntry, Fixture,
} from './types';
import { GameState, getClub, squadOf, staffOf } from './gamestate';
import { addNews } from './news';
import {
  PARACHUTE_PAYMENTS, PS_ALLOWABLE_LOSS_3_YEARS, PS_POINTS_DEDUCTION_THRESHOLD,
} from '../data/competitions';
import { positionOf } from './table';

export function recordTransaction(
  state: GameState,
  clubId: string,
  category: FinanceCategory,
  description: string,
  amount: number,
): void {
  const club = state.clubs[clubId];
  if (!club) return;
  club.finances.balance += amount;

  const entry: FinanceLedgerEntry = { date: state.date, category, description, amount };
  club.finances.ledger.push(entry);
  // Only the human's club needs a detailed ledger; AI clubs just need the balance.
  if (!club.isPlayerControlled) {
    if (club.finances.ledger.length > 40) club.finances.ledger.splice(0, club.finances.ledger.length - 40);
  } else if (club.finances.ledger.length > 4000) {
    club.finances.ledger.splice(0, club.finances.ledger.length - 4000);
  }
}

/** Gate receipts, corporate hospitality and matchday spend, credited on the day of the match. */
export function creditMatchdayIncome(state: GameState, fixture: Fixture, attendance: number): void {
  const home = state.clubs[fixture.homeClubId];
  if (!home || !attendance) return;

  const comp = state.competitions[fixture.competitionId];
  const pricing = home.ticketPricing;

  // Season ticket holders are roughly two thirds of a typical gate and are billed in July, so
  // only the walk-up portion is matchday income.
  const walkUpShare = 0.34;
  const corporate = Math.min(home.corporateSeats, Math.round(attendance * 0.03));
  const general = Math.max(0, attendance - corporate);

  let gate = general * walkUpShare * pricing.general + corporate * pricing.corporate;

  // Cup ties split gate receipts with the visitors in the earlier rounds.
  if (comp?.kind === 'cup') gate *= 0.55;

  // Programmes, food, drink and merchandise on the day. Kept deliberately modest: an English
  // second-tier club's matchday revenue is a meaningful but not dominant part of its income, and
  // over-crediting it removes the financial pressure that makes the division interesting.
  const matchdaySpend = attendance * (3.5 + home.reputation * 0.05);

  recordTransaction(state, home.id, 'Gate Receipts',
    `${comp?.shortName ?? 'League'} v ${state.clubs[fixture.awayClubId]?.shortName ?? ''} (${attendance.toLocaleString()})`,
    Math.round(gate + matchdaySpend));

  // The away club gets a share of a cup gate.
  if (comp?.kind === 'cup' && state.clubs[fixture.awayClubId]) {
    recordTransaction(state, fixture.awayClubId, 'Gate Receipts',
      `Share of gate at ${home.shortName}`, Math.round(gate * 0.5));
  }
}

/** Weekly costs and income. Called by the day loop every Monday. */
export function processWeeklyFinances(state: GameState): void {
  const rng = new Rng(deriveSeed(state.rngState, `finance:${state.date}`));

  for (const club of Object.values(state.clubs)) {
    // Wages.
    const players = squadOf(state, club.id);
    let playerWages = 0;
    for (const player of players) {
      if (!player.contract) continue;
      // A player out on loan has some or all of their wage paid by the borrowing club.
      const share = player.loan && player.loan.parentClubId === club.id
        ? 1 - player.loan.wageShare
        : 1;
      playerWages += player.contract.wage * share;
    }
    recordTransaction(state, club.id, 'Player Wages', 'Weekly playing staff wages', -Math.round(playerWages));

    const staffWages = staffOf(state, club.id).reduce((sum, s) => sum + s.wage, 0);
    recordTransaction(state, club.id, 'Staff Wages', 'Weekly non-playing staff wages', -Math.round(staffWages));

    // Sponsorship and commercial, paid in weekly slices.
    const sponsorship = club.finances.sponsorships.reduce((sum, s) => sum + s.annualValue, 0) / 52;
    if (sponsorship > 0) {
      recordTransaction(state, club.id, 'Sponsorship', 'Commercial income', Math.round(sponsorship));
    }

    // Merchandise scales with fanbase, success and how happy supporters are.
    const merch = (club.fanbase * 0.9 + club.reputation * 900) *
      (0.6 + club.fanHappiness / 160) / 52;
    recordTransaction(state, club.id, 'Merchandise', 'Retail and merchandise', Math.round(merch));

    // Stadium upkeep scales with the size of the ground.
    const upkeep = club.stadiumCapacity * 1.35 + club.facilities.trainingGround * 900;
    recordTransaction(state, club.id, 'Stadium Maintenance', 'Ground and facility upkeep', -Math.round(upkeep));

    // Youth development is a standing cost that buys better intakes.
    const youthCost = club.facilities.youthAcademy * 1_100 + club.facilities.youthRecruitment * 700;
    recordTransaction(state, club.id, 'Youth Development', 'Academy running costs', -Math.round(youthCost));

    // Bank loans.
    for (const loan of club.finances.loans) {
      if (loan.weeksRemaining <= 0) continue;
      recordTransaction(state, club.id, 'Loan Repayment', 'Bank loan repayment', -loan.weeklyPayment);
      loan.principal = Math.max(0, loan.principal - loan.weeklyPayment * (1 - loan.rate / 52));
      loan.weeksRemaining -= 1;
    }
    club.finances.loans = club.finances.loans.filter((l) => l.weeksRemaining > 0);

    // TV money, distributed weekly through the season.
    const comp = state.competitions[club.leagueId];
    if (comp?.prizeMoney) {
      const position = Math.max(1, positionOf(state, comp.id, club.id));
      const annual = comp.prizeMoney[position - 1] ?? comp.prizeMoney[comp.prizeMoney.length - 1];
      recordTransaction(state, club.id, 'TV Revenue', 'Central distribution', Math.round(annual / 52));
    }

    // Parachute payments for the recently relegated.
    const parachuteYear = state.parachuteYears[club.id];
    if (parachuteYear && parachuteYear <= PARACHUTE_PAYMENTS.length) {
      recordTransaction(state, club.id, 'TV Revenue', 'Parachute payment',
        Math.round(PARACHUTE_PAYMENTS[parachuteYear - 1] / 52));
    }

    // Progress construction projects.
    advanceProjects(state, club);

    // Insolvency.
    checkInsolvency(state, club, rng);
  }

  // Transfer instalments falling due.
  processInstalments(state);
}

function advanceProjects(state: GameState, club: Club): void {
  for (const project of [...club.projects]) {
    project.daysRemaining -= 7;
    if (project.daysRemaining > 0) continue;

    club.projects = club.projects.filter((p) => p !== project);
    if (project.capacityDelta) {
      club.stadiumCapacity += project.capacityDelta;
      club.corporateSeats += Math.round(project.capacityDelta * 0.05);
    }
    if (project.ratingDelta) {
      switch (project.kind) {
        case 'training':
          club.facilities.trainingGround = clamp(club.facilities.trainingGround + project.ratingDelta, 1, 20);
          break;
        case 'youth':
          club.facilities.youthAcademy = clamp(club.facilities.youthAcademy + project.ratingDelta, 1, 20);
          club.facilities.youthRecruitment = clamp(club.facilities.youthRecruitment + project.ratingDelta, 1, 20);
          break;
        case 'facilities':
          club.facilities.medical = clamp(club.facilities.medical + project.ratingDelta, 1, 20);
          club.facilities.corporateFacilities = clamp(club.facilities.corporateFacilities + project.ratingDelta, 1, 20);
          break;
        default:
          break;
      }
    }

    if (club.isPlayerControlled) {
      addNews(state, {
        category: 'board',
        important: true,
        subject: 'Building work complete',
        body: `${project.description} has been completed.${project.capacityDelta ? ` ${club.stadiumName} now holds ${club.stadiumCapacity.toLocaleString()}.` : ''}`,
      });
    }
  }
}

function checkInsolvency(state: GameState, club: Club, rng: Rng): void {
  if (club.finances.balance >= -2_000_000) {
    if (club.finances.administration && club.finances.balance > 0) {
      club.finances.administration = false;
    }
    return;
  }

  // The board will usually arrange emergency funding before things get terminal — but not always,
  // and not for free.
  if (!club.finances.administration && rng.chance(0.5)) {
    const rescue = Math.abs(club.finances.balance) + 1_500_000;
    club.finances.loans.push({
      principal: rescue,
      rate: 0.11,
      weeksRemaining: 260,
      weeklyPayment: Math.round((rescue * 1.275) / 260),
    });
    recordTransaction(state, club.id, 'Board Grant', 'Emergency financing arranged by the board', rescue);
    if (club.isPlayerControlled) {
      addNews(state, {
        category: 'finance',
        important: true,
        subject: 'Emergency financing arranged',
        body: `The board has arranged a £${(rescue / 1_000_000).toFixed(1)}m facility to cover the shortfall, at 11% over five years. They are not happy about it, and your transfer budget has been frozen.`,
      });
      club.finances.transferBudget = 0;
      club.board.confidence = clamp(club.board.confidence - 15, 0, 100);
    }
    return;
  }

  if (!club.finances.administration) {
    club.finances.administration = true;
    // Administration in the EFL carries a 12-point deduction.
    const table = state.tables[club.leagueId];
    const row = table?.find((r) => r.clubId === club.id);
    if (row) row.pointsDeduction += 12;
    if (club.isPlayerControlled) {
      addNews(state, {
        category: 'finance',
        important: true,
        subject: 'The club has entered administration',
        body: 'Unable to meet its obligations, the club has entered administration and been docked 12 points. A transfer embargo is in place and the squad must be cut back.',
      });
      club.finances.embargoUntil = addDaysISO(state.date, 365);
      club.finances.transferBudget = 0;
    }
  }
}

function processInstalments(state: GameState): void {
  for (const club of Object.values(state.clubs)) {
    const due = club.finances.instalments.filter((i) => i.dueDate <= state.date);
    if (due.length === 0) continue;
    for (const instalment of due) {
      recordTransaction(
        state,
        club.id,
        instalment.amount > 0 ? 'Transfers In' : 'Transfers Out',
        `Instalment: ${instalment.playerName}`,
        instalment.amount,
      );
    }
    club.finances.instalments = club.finances.instalments.filter((i) => i.dueDate > state.date);
  }
}

/** Season ticket income, billed in one lump in July. */
export function billSeasonTickets(state: GameState): void {
  for (const club of Object.values(state.clubs)) {
    // Season ticket take-up rises with recent success and falls with price.
    const expectedPrice = (12 + club.reputation * 0.42) * 17;
    const priceFactor = clamp(1 - (club.ticketPricing.season - expectedPrice) / (expectedPrice * 2), 0.5, 1.2);
    const takeUp = clamp(0.36 + club.fanHappiness / 260, 0.2, 0.66) * priceFactor;
    const holders = Math.round(club.stadiumCapacity * takeUp);
    const income = holders * club.ticketPricing.season;
    recordTransaction(state, club.id, 'Season Tickets',
      `${holders.toLocaleString()} season tickets sold`, Math.round(income));
  }
}

/** Prize money for a final league position, paid at the end of the season. */
export function payLeaguePrizeMoney(state: GameState, competitionId: string, orderedClubIds: string[]): void {
  const comp = state.competitions[competitionId];
  if (!comp?.prizeMoney) return;
  orderedClubIds.forEach((clubId, index) => {
    const amount = comp.prizeMoney![index] ?? comp.prizeMoney![comp.prizeMoney!.length - 1];
    // The weekly TV distribution already paid an estimate; this settles the difference, so pay a
    // final-placement bonus rather than the whole sum again.
    recordTransaction(state, clubId, 'Prize Money',
      `${comp.name} final placing (${index + 1})`, Math.round(amount * 0.12));
  });
}

export function payCupPrizeMoney(
  state: GameState,
  competitionId: string,
  clubId: string,
  round: number,
): void {
  const comp = state.competitions[competitionId];
  if (!comp?.roundPrizeMoney) return;
  const amount = comp.roundPrizeMoney[Math.min(round, comp.roundPrizeMoney.length - 1)];
  if (!amount) return;
  recordTransaction(state, clubId, 'Prize Money', `${comp.name} round ${round + 1}`, amount);
}

// ---------------------------------------------------------------------------------------------
// Profitability & Sustainability
// ---------------------------------------------------------------------------------------------

/** Rolling three-season loss, as the EFL would assess it. */
export function rollingLoss(club: Club): number {
  const recent = club.finances.seasonProfits.slice(-3);
  const total = recent.reduce((sum, s) => sum + s.profit, 0);
  return total < 0 ? -total : 0;
}

export function assessProfitAndSustainability(state: GameState): void {
  for (const club of Object.values(state.clubs)) {
    const comp = state.competitions[club.leagueId];
    // The rules bite hardest in the Championship, which is exactly where the player is.
    if (!comp || comp.tier !== 2) continue;

    const loss = rollingLoss(club);
    if (loss <= PS_ALLOWABLE_LOSS_3_YEARS) continue;

    const excess = loss - PS_ALLOWABLE_LOSS_3_YEARS;
    club.finances.embargoUntil = addDaysISO(state.date, 365);

    if (excess > PS_POINTS_DEDUCTION_THRESHOLD) {
      const deduction = clamp(Math.round(4 + excess / 5_000_000), 4, 12);
      const table = state.tables[club.leagueId];
      const row = table?.find((r) => r.clubId === club.id);
      if (row) row.pointsDeduction += deduction;
      if (club.isPlayerControlled) {
        addNews(state, {
          category: 'finance',
          important: true,
          subject: `${deduction}-point deduction for financial breach`,
          body: `The EFL has found the club in breach of Profitability & Sustainability rules, with losses of £${(loss / 1_000_000).toFixed(1)}m over three seasons against a permitted £39m. The club has been deducted ${deduction} points and placed under a transfer embargo.`,
        });
      }
    } else if (club.isPlayerControlled) {
      addNews(state, {
        category: 'finance',
        important: true,
        subject: 'Transfer embargo imposed',
        body: `Losses of £${(loss / 1_000_000).toFixed(1)}m over three seasons have breached Profitability & Sustainability limits. The club is under a transfer embargo until the accounts are back in order.`,
      });
    }
  }
}

/** Close the books on a season and roll the P&S window forward. */
export function closeSeasonAccounts(state: GameState): void {
  for (const club of Object.values(state.clubs)) {
    const season = state.season;
    const profit = club.finances.ledger
      .filter((e) => seasonLabel(e.date) === season)
      .reduce((sum, e) => sum + e.amount, 0);
    club.finances.seasonProfits.push({ season, profit: Math.round(profit) });
    if (club.finances.seasonProfits.length > 5) club.finances.seasonProfits.shift();

    // Sponsorship deals run down and are renegotiated on the club's current standing.
    for (const sponsorship of club.finances.sponsorships) {
      sponsorship.seasonsRemaining -= 1;
    }
    club.finances.sponsorships = club.finances.sponsorships.filter((s) => s.seasonsRemaining > 0);

    // Keep the ledger from growing without bound across a long career.
    if (club.finances.ledger.length > 2000) {
      club.finances.ledger.splice(0, club.finances.ledger.length - 2000);
    }
  }
  assessProfitAndSustainability(state);
}

/** Total weekly wage bill for a club. */
export function wageBill(state: GameState, clubId: string): number {
  return squadOf(state, clubId).reduce((sum, p) => sum + (p.contract?.wage ?? 0), 0);
}

export function staffWageBill(state: GameState, clubId: string): number {
  return staffOf(state, clubId).reduce((sum, s) => sum + s.wage, 0);
}

/** Is the club allowed to sign players right now? */
export function canSign(state: GameState, clubId: string): { allowed: boolean; reason?: string } {
  const club = getClub(state, clubId);
  if (club.finances.embargoUntil && club.finances.embargoUntil > state.date) {
    return { allowed: false, reason: 'The club is under a transfer embargo.' };
  }
  if (club.finances.administration) {
    return { allowed: false, reason: 'The club is in administration.' };
  }
  return { allowed: true };
}

/** Projected end-of-season balance, shown on the finance screen. */
export function projectBalance(state: GameState, clubId: string): number {
  const club = getClub(state, clubId);
  const weeksLeft = Math.max(0, Math.round((seasonEndFor(state) - parseISO(state.date).getTime()) / (7 * 86_400_000)));

  const weeklyOut = wageBill(state, clubId) + staffWageBill(state, clubId) +
    club.stadiumCapacity * 1.35 + club.facilities.youthAcademy * 1_100 +
    club.finances.loans.reduce((sum, l) => sum + l.weeklyPayment, 0);

  const comp = state.competitions[club.leagueId];
  const position = Math.max(1, positionOf(state, comp?.id ?? '', clubId) || 12);
  const tv = comp?.prizeMoney ? (comp.prizeMoney[position - 1] ?? 0) / 52 : 0;
  const parachute = state.parachuteYears[clubId]
    ? (PARACHUTE_PAYMENTS[state.parachuteYears[clubId] - 1] ?? 0) / 52
    : 0;
  const sponsorship = club.finances.sponsorships.reduce((sum, s) => sum + s.annualValue, 0) / 52;
  const merch = (club.fanbase * 0.9 + club.reputation * 900) * (0.6 + club.fanHappiness / 160) / 52;

  const weeklyIn = tv + parachute + sponsorship + merch;
  return Math.round(club.finances.balance + (weeklyIn - weeklyOut) * weeksLeft);
}

function seasonEndFor(state: GameState): number {
  const year = monthOf(state.date) >= 7 ? parseISO(state.date).getUTCFullYear() + 1 : parseISO(state.date).getUTCFullYear();
  return parseISO(`${year}-06-15`).getTime();
}

/** Money the club can actually commit to a transfer right now. */
export function availableTransferFunds(state: GameState, clubId: string): number {
  const club = getClub(state, clubId);
  // A club can dip into the balance beyond the stated budget, but only so far.
  return Math.max(0, club.finances.transferBudget);
}
