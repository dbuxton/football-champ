/**
 * Transfers, contracts and loans.
 *
 * The selling club and the player are separate negotiations, exactly as in the real game and the
 * games this one is modelled on: you agree a fee, then you have to persuade the player. Both
 * sides have hidden reservation prices that only partially reveal themselves as talks progress.
 */

import { Rng, clamp, deriveSeed } from './rng';
import { addDaysISO, seasonLabel } from './date';
import {
  ContractOffer, Player, SquadStatus, TransferOffer, TransferOfferStatus,
} from './types';
import { GameState, getClub, squadOf, freeAgents } from './gamestate';
import {
  ageOf, computeValue, expectedWage, monthsUntil, nextId, roundMoney, totalStats,
} from './players';
import { addNews } from './news';
import { recordTransaction, canSign, wageBill } from './finance';
import { settingsFor } from './difficulty';
import { autoPickTeam } from './selection';
import { positionGroup } from './types';

// ---------------------------------------------------------------------------------------------
// Valuation
// ---------------------------------------------------------------------------------------------

/**
 * What a selling club will actually hold out for. Always above the raw market value — clubs don't
 * sell assets at book price, especially not to a rival.
 */
export function askingPrice(state: GameState, player: Player, buyerClubId: string): number {
  if (!player.clubId) return 0;
  const seller = getClub(state, player.clubId);
  const buyer = getClub(state, buyerClubId);
  const settings = settingsFor(state.difficulty);

  let price = player.value;

  // A club with money doesn't need to sell.
  const wealth = clamp(seller.finances.balance / 20_000_000, -1, 3);
  price *= 1.25 + wealth * 0.12;

  // Squad importance. Losing a key player means replacing them.
  const status = player.contract?.squadStatus ?? 'Rotation';
  const statusMultiplier: Record<SquadStatus, number> = {
    'Key Player': 1.5, 'First Team': 1.25, Rotation: 1.05, Backup: 0.9,
    'Hot Prospect': 1.4, Youngster: 0.95,
  };
  price *= statusMultiplier[status];

  // Contract situation cuts both ways.
  if (player.contract) {
    const months = monthsUntil(state.date, player.contract.expires);
    if (months < 6) price *= 0.45;
    else if (months < 12) price *= 0.7;
    else if (months > 36) price *= 1.15;
  }

  // A player who has asked to leave is cheaper; a happy one is dearer.
  if (player.transferListed) price *= 0.72;
  if (player.morale < 35) price *= 0.85;
  if (player.morale > 80) price *= 1.08;

  // Selling to a direct rival costs extra.
  if (seller.rivalIds.includes(buyer.id)) price *= 1.3;

  // Buying club's reputation: big clubs get quoted big numbers.
  price *= clamp(0.85 + (buyer.reputation - seller.reputation) / 220, 0.8, 1.35);

  if (buyer.isPlayerControlled) price *= settings.transferFeeMultiplier;

  return roundMoney(Math.max(25_000, price));
}

/** Would this club even entertain selling? */
export function willingToSell(state: GameState, player: Player, rng: Rng): boolean {
  if (!player.clubId) return true;
  const club = getClub(state, player.clubId);
  if (player.transferListed) return true;
  if (club.finances.balance < 0) return true;

  const squad = squadOf(state, club.id);
  const ranked = squad.slice().sort((a, b) => b.currentAbility - a.currentAbility);
  const rank = ranked.indexOf(player);

  // A club won't sell its best player unless the money is silly or they're unhappy.
  if (rank < 3 && player.morale > 55) return rng.chance(0.12);
  if (rank < 8) return rng.chance(0.45);
  return rng.chance(0.8);
}

// ---------------------------------------------------------------------------------------------
// Making offers
// ---------------------------------------------------------------------------------------------

export interface OfferTerms {
  fee: number;
  instalments?: number;
  sellOnPercent?: number;
  appearanceBonus?: number;
  goalBonus?: number;
  promotionBonus?: number;
  isLoan?: boolean;
  loanWageShare?: number;
  loanMonths?: number;
}

export function createTransferOffer(
  state: GameState,
  playerId: string,
  fromClubId: string,
  terms: OfferTerms,
): TransferOffer {
  const player = state.players[playerId];
  const offer: TransferOffer = {
    id: nextId('t'),
    playerId,
    fromClubId,
    toClubId: player?.clubId ?? '',
    fee: terms.fee,
    instalments: terms.instalments ?? 0,
    sellOnPercent: terms.sellOnPercent ?? 0,
    appearanceBonus: terms.appearanceBonus ?? 0,
    goalBonus: terms.goalBonus ?? 0,
    promotionBonus: terms.promotionBonus ?? 0,
    isLoan: terms.isLoan ?? false,
    loanWageShare: terms.loanWageShare ?? 0.5,
    loanMonths: terms.loanMonths ?? 6,
    status: 'pending',
    date: state.date,
    expiresInDays: 5,
  };
  state.transferOffers.push(offer);
  return offer;
}

/** The selling club's answer. Mutates the offer and returns its new status. */
export function evaluateTransferOffer(state: GameState, offer: TransferOffer, rng: Rng): TransferOfferStatus {
  const player = state.players[offer.playerId];
  if (!player) return 'withdrawn';

  // Free agents have no selling club to negotiate with.
  if (!player.clubId) {
    offer.status = 'accepted';
    offer.responseText = 'The player is a free agent — you need only agree personal terms.';
    return 'accepted';
  }

  const buying = state.clubs[offer.fromClubId];
  if (!buying) return 'withdrawn';

  if (offer.isLoan) {
    return evaluateLoanOffer(state, offer, rng);
  }

  const asking = askingPrice(state, player, offer.fromClubId);

  if (!willingToSell(state, player, rng)) {
    offer.status = 'rejected';
    offer.responseText = `${state.clubs[player.clubId]?.name} have no interest in selling ${player.lastName} at any price.`;
    return 'rejected';
  }

  // Add-ons are worth something, but a selling club discounts them heavily.
  const effective = offer.fee +
    (offer.sellOnPercent / 100) * player.value * 0.35 +
    offer.appearanceBonus * 0.25 +
    offer.goalBonus * 0.2 +
    offer.promotionBonus * 0.3 -
    // Spreading the fee over instalments costs the seller.
    offer.fee * offer.instalments * 0.03;

  if (effective >= asking) {
    offer.status = 'accepted';
    offer.responseText = `${state.clubs[player.clubId]?.name} have accepted your offer for ${player.lastName}.`;
    return 'accepted';
  }

  if (effective >= asking * 0.82) {
    offer.status = 'negotiating';
    offer.counterFee = roundMoney(asking);
    offer.responseText = `${state.clubs[player.clubId]?.name} value ${player.lastName} at £${formatShort(asking)}. Improve your bid and they will talk.`;
    return 'negotiating';
  }

  offer.status = 'rejected';
  offer.counterFee = roundMoney(asking);
  offer.responseText = `Your bid has been dismissed out of hand. ${state.clubs[player.clubId]?.name} want around £${formatShort(asking)}.`;
  return 'rejected';
}

function evaluateLoanOffer(state: GameState, offer: TransferOffer, rng: Rng): TransferOfferStatus {
  const player = state.players[offer.playerId];
  if (!player?.clubId) return 'withdrawn';
  const seller = getClub(state, player.clubId);
  const squad = squadOf(state, seller.id);
  const ranked = squad.slice().sort((a, b) => b.currentAbility - a.currentAbility);
  const rank = ranked.indexOf(player);

  // Clubs loan out fringe players and young prospects, not first-teamers.
  const isFringe = rank > 13 || player.loanListed;
  const isProspect = ageOf(player, state.date) <= 21 && player.potentialAbility > player.currentAbility + 20;

  if (!isFringe && !isProspect) {
    offer.status = 'rejected';
    offer.responseText = `${seller.name} are not prepared to let ${player.lastName} leave on loan.`;
    return 'rejected';
  }

  const wantedShare = isProspect ? 0.4 : 0.75;
  if (offer.loanWageShare >= wantedShare - 0.01 || rng.chance(0.25)) {
    offer.status = 'accepted';
    offer.responseText = `${seller.name} will let ${player.lastName} join on loan.`;
    return 'accepted';
  }

  offer.status = 'negotiating';
  offer.responseText = `${seller.name} want you to cover at least ${Math.round(wantedShare * 100)}% of ${player.lastName}'s wages.`;
  return 'negotiating';
}

function formatShort(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}m`;
  return `${Math.round(value / 1000)}k`;
}

// ---------------------------------------------------------------------------------------------
// Contract negotiation
// ---------------------------------------------------------------------------------------------

/** What the player wants. Revealed to the manager once talks open. */
export function contractDemands(state: GameState, player: Player, clubId: string): {
  wage: number; years: number; signingOnFee: number; squadStatus: SquadStatus;
} {
  const club = getClub(state, clubId);
  const age = ageOf(player, state.date);
  const settings = settingsFor(state.difficulty);

  let wage = expectedWage(player, club.reputation, state.date);
  // Moving to a smaller club than they're used to costs a premium.
  const current = player.clubId ? state.clubs[player.clubId] : null;
  if (current && current.reputation > club.reputation + 8) {
    wage *= 1 + (current.reputation - club.reputation) / 130;
  }
  if (club.isPlayerControlled) wage /= settings.transferWillingness ** 0.5;

  const years = age > 32 ? 1 : age > 29 ? 2 : age < 22 ? 4 : 3;

  const stats = totalStats(player);
  const squad = squadOf(state, clubId);
  const better = squad.filter((p) => p.currentAbility > player.currentAbility).length;
  const squadStatus: SquadStatus =
    better <= 2 ? 'Key Player'
      : better <= 7 ? 'First Team'
        : better <= 13 ? 'Rotation'
          : age < 21 ? 'Hot Prospect' : 'Backup';

  return {
    wage: Math.round(wage / 250) * 250,
    years,
    signingOnFee: Math.round(wage * (stats.appearances > 20 ? 22 : 10) / 1000) * 1000,
    squadStatus,
  };
}

export function createContractOffer(
  state: GameState,
  playerId: string,
  clubId: string,
  terms: Omit<ContractOffer, 'id' | 'playerId' | 'clubId' | 'status' | 'date' | 'expiresInDays'>,
): ContractOffer {
  const offer: ContractOffer = {
    id: nextId('c'),
    playerId,
    clubId,
    ...terms,
    status: 'pending',
    date: state.date,
    expiresInDays: 4,
  };
  state.contractOffers.push(offer);
  return offer;
}

export function evaluateContractOffer(state: GameState, offer: ContractOffer, rng: Rng): TransferOfferStatus {
  const player = state.players[offer.playerId];
  const club = state.clubs[offer.clubId];
  if (!player || !club) return 'withdrawn';

  const demands = contractDemands(state, player, offer.clubId);
  offer.demands = demands;
  const settings = settingsFor(state.difficulty);

  // How attractive is the move in itself?
  let appeal = 0;
  const currentClub = player.clubId ? state.clubs[player.clubId] : null;
  appeal += (club.reputation - (currentClub?.reputation ?? 30)) * 0.9;
  appeal += (state.manager.reputation - 30) * 0.15;

  // Ambitious players care about the level; loyal ones resist leaving.
  appeal *= 1 + (player.attributes.ambition - 10) * 0.03;
  if (currentClub) appeal -= (player.attributes.loyalty - 10) * 1.4;
  if (player.morale < 40) appeal += 12;
  if (player.transferListed) appeal += 18;

  // Money.
  const wageRatio = offer.wage / Math.max(1, demands.wage);
  const statusRank: Record<SquadStatus, number> = {
    'Key Player': 5, 'First Team': 4, Rotation: 3, 'Hot Prospect': 3, Backup: 2, Youngster: 1,
  };
  const statusGap = statusRank[offer.squadStatus] - statusRank[demands.squadStatus];

  let score = (wageRatio - 1) * 100 + appeal + statusGap * 8 +
    (offer.years - demands.years) * -3 +
    (offer.signingOnFee >= demands.signingOnFee ? 6 : -4) +
    (offer.releaseClause > 0 ? 5 : 0);

  if (club.isPlayerControlled) score *= settings.transferWillingness;
  score += rng.gaussian(0, 6);

  if (score >= 6 && wageRatio >= 0.97) {
    offer.status = 'accepted';
    offer.responseText = `${player.lastName} is happy with the terms and wants to sign.`;
    return 'accepted';
  }

  if (score > -20) {
    offer.status = 'negotiating';
    offer.responseText = wageRatio < 0.97
      ? `${player.lastName} is interested but wants £${demands.wage.toLocaleString()} per week${statusGap < 0 ? ` and to be a ${demands.squadStatus.toLowerCase()}` : ''}.`
      : `${player.lastName} is weighing it up, but wants to be a ${demands.squadStatus.toLowerCase()}.`;
    return 'negotiating';
  }

  offer.status = 'rejected';
  offer.responseText = currentClub && currentClub.reputation > club.reputation + 12
    ? `${player.lastName} has no interest in dropping to this level.`
    : `${player.lastName} has rejected your offer.`;
  return 'rejected';
}

// ---------------------------------------------------------------------------------------------
// Completing deals
// ---------------------------------------------------------------------------------------------

export function completeTransfer(
  state: GameState,
  player: Player,
  toClubId: string,
  fee: number,
  contract: ContractOffer,
  instalments = 0,
  sellOnPercent = 0,
): void {
  const buyer = getClub(state, toClubId);
  const sellerId = player.clubId;
  const seller = sellerId ? state.clubs[sellerId] : null;

  // Money.
  if (fee > 0 && seller) {
    const upFront = instalments > 0 ? Math.round(fee / (instalments + 1)) : fee;
    recordTransaction(state, buyer.id, 'Transfers Out', `${player.shortName} from ${seller.name}`, -upFront);
    recordTransaction(state, seller.id, 'Transfers In', `${player.shortName} to ${buyer.name}`, upFront);
    buyer.finances.transferBudget = Math.max(0, buyer.finances.transferBudget - upFront);
    seller.finances.transferBudget += Math.round(upFront * 0.6);

    if (instalments > 0) {
      const perInstalment = Math.round((fee - upFront) / instalments);
      for (let i = 1; i <= instalments; i++) {
        const dueDate = addDaysISO(state.date, 365 * i);
        buyer.finances.instalments.push({
          amount: -perInstalment, dueDate, counterpartyClubId: seller.id, playerName: player.shortName,
        });
        seller.finances.instalments.push({
          amount: perInstalment, dueDate, counterpartyClubId: buyer.id, playerName: player.shortName,
        });
      }
    }
  }

  // Agent fee: a real and irritating cost.
  if (fee > 0) {
    const agentFee = Math.round(fee * 0.06);
    recordTransaction(state, buyer.id, 'Agent Fees', `Agent fee for ${player.shortName}`, -agentFee);
  }
  if (contract.signingOnFee > 0) {
    recordTransaction(state, buyer.id, 'Bonuses', `Signing-on fee for ${player.shortName}`, -contract.signingOnFee);
  }

  // Move the player.
  if (seller) {
    seller.playerIds = seller.playerIds.filter((id) => id !== player.id);
    autoPickTeam(state, seller.id);
  }
  buyer.playerIds.push(player.id);
  player.clubId = buyer.id;
  player.transferListed = false;
  player.loanListed = false;
  player.loan = null;
  player.stats = [];
  player.form = [];
  player.morale = clamp(72 + (contract.wage > 0 ? 8 : 0), 40, 95);
  player.squadNumber = nextFreeSquadNumber(state, buyer.id);

  player.contract = {
    expires: addDaysISO(state.date, Math.round(contract.years * 365)),
    wage: contract.wage,
    releaseClause: contract.releaseClause,
    loyaltyBonus: contract.loyaltyBonus,
    appearanceFee: contract.appearanceFee,
    goalBonus: contract.goalBonus,
    squadStatus: contract.squadStatus,
    signingOnFee: contract.signingOnFee,
  };
  player.value = computeValue(player, state.date);

  // Sell-on clauses attach to a future sale, which we approximate by paying it now out of the fee.
  if (sellOnPercent > 0 && seller && fee > 0) {
    const sellOn = Math.round(fee * (sellOnPercent / 100) * 0.2);
    recordTransaction(state, seller.id, 'Transfers In', `Sell-on clause: ${player.shortName}`, sellOn);
  }

  autoPickTeam(state, buyer.id);

  const managed = state.manager.clubId;
  if (buyer.id === managed) {
    addNews(state, {
      category: 'transfer',
      important: true,
      subject: `Signed: ${player.firstName} ${player.lastName}`,
      body: `${player.firstName} ${player.lastName} (${ageOf(player, state.date)}, ${player.naturalPosition}) has joined from ${seller?.name ?? 'free agency'}${fee > 0 ? ` for £${formatShort(fee)}` : ' on a free transfer'} on £${contract.wage.toLocaleString()} per week.`,
      relatedPlayerId: player.id,
    });
  } else if (sellerId === managed) {
    addNews(state, {
      category: 'transfer',
      important: true,
      subject: `Sold: ${player.firstName} ${player.lastName}`,
      body: `${player.firstName} ${player.lastName} has joined ${buyer.name}${fee > 0 ? ` for £${formatShort(fee)}` : ' on a free transfer'}.`,
      relatedPlayerId: player.id,
    });
  }
}

export function completeLoan(
  state: GameState,
  player: Player,
  toClubId: string,
  months: number,
  wageShare: number,
  canRecall: boolean,
): void {
  const parentId = player.clubId;
  if (!parentId) return;
  const parent = getClub(state, parentId);
  const borrower = getClub(state, toClubId);

  parent.playerIds = parent.playerIds.filter((id) => id !== player.id);
  borrower.playerIds.push(player.id);
  player.clubId = borrower.id;
  player.loan = {
    parentClubId: parentId,
    returnDate: addDaysISO(state.date, Math.round(months * 30.44)),
    wageShare,
    canRecall,
  };
  player.morale = clamp(player.morale + 6, 5, 100);
  player.squadNumber = nextFreeSquadNumber(state, borrower.id);

  autoPickTeam(state, parent.id);
  autoPickTeam(state, borrower.id);

  const managed = state.manager.clubId;
  if (borrower.id === managed || parentId === managed) {
    addNews(state, {
      category: 'transfer',
      important: true,
      subject: borrower.id === managed
        ? `Loan signing: ${player.shortName}`
        : `${player.shortName} loaned out`,
      body: borrower.id === managed
        ? `${player.firstName} ${player.lastName} joins on loan from ${parent.name} until ${player.loan.returnDate}. You are covering ${Math.round(wageShare * 100)}% of his wages.`
        : `${player.firstName} ${player.lastName} joins ${borrower.name} on loan until ${player.loan.returnDate}.`,
      relatedPlayerId: player.id,
    });
  }
}

function nextFreeSquadNumber(state: GameState, clubId: string): number {
  const taken = new Set(squadOf(state, clubId).map((p) => p.squadNumber));
  for (let n = 2; n <= 60; n++) if (!taken.has(n)) return n;
  return 0;
}

/** Return loaned players when their spell is up. */
export function processLoanReturns(state: GameState): void {
  for (const player of Object.values(state.players)) {
    if (!player.loan || player.loan.returnDate > state.date) continue;
    const borrowerId = player.clubId;
    const parent = state.clubs[player.loan.parentClubId];
    if (!parent) { player.loan = null; continue; }

    if (borrowerId && state.clubs[borrowerId]) {
      state.clubs[borrowerId].playerIds = state.clubs[borrowerId].playerIds.filter((id) => id !== player.id);
      autoPickTeam(state, borrowerId);
    }
    parent.playerIds.push(player.id);
    player.clubId = parent.id;
    player.loan = null;
    player.squadNumber = nextFreeSquadNumber(state, parent.id);
    autoPickTeam(state, parent.id);

    if (parent.id === state.manager.clubId) {
      addNews(state, {
        category: 'squad',
        subject: `${player.shortName} returns from loan`,
        body: `${player.firstName} ${player.lastName} has returned from his loan spell and is available for selection.`,
        relatedPlayerId: player.id,
      });
    }
  }
}

// ---------------------------------------------------------------------------------------------
// The daily transfer tick
// ---------------------------------------------------------------------------------------------

export function processTransferDay(state: GameState): void {
  const rng = new Rng(deriveSeed(state.rngState, `transfers:${state.date}`));

  expireOffers(state);
  respondToHumanOffers(state, rng);
  aiTransferActivity(state, rng);
  processLoanReturns(state);
  handleExpiringContracts(state, rng);
}

function expireOffers(state: GameState): void {
  for (const offer of state.transferOffers) {
    if (offer.status === 'pending' || offer.status === 'negotiating') {
      offer.expiresInDays -= 1;
      if (offer.expiresInDays <= 0) offer.status = 'expired';
    }
  }
  for (const offer of state.contractOffers) {
    if (offer.status === 'pending' || offer.status === 'negotiating') {
      offer.expiresInDays -= 1;
      if (offer.expiresInDays <= 0) offer.status = 'expired';
    }
  }
  // Keep the lists from growing unbounded across a career.
  state.transferOffers = state.transferOffers.filter(
    (o) => o.status === 'pending' || o.status === 'negotiating' || o.date >= addDaysISO(state.date, -30),
  );
  state.contractOffers = state.contractOffers.filter(
    (o) => o.status === 'pending' || o.status === 'negotiating' || o.date >= addDaysISO(state.date, -30),
  );
}

/** AI clubs answer the human's bids after a realistic delay. */
function respondToHumanOffers(state: GameState, rng: Rng): void {
  const managed = state.manager.clubId;
  for (const offer of state.transferOffers) {
    if (offer.status !== 'pending' || offer.fromClubId !== managed) continue;
    // A club takes a day or two to come back to you.
    if (offer.date === state.date && !rng.chance(0.35)) continue;

    const outcome = evaluateTransferOffer(state, offer, rng);
    if (outcome !== 'pending') {
      const player = state.players[offer.playerId];
      addNews(state, {
        category: 'transfer',
        important: outcome === 'accepted',
        subject: `Bid for ${player?.lastName ?? 'player'}: ${outcome}`,
        body: offer.responseText ?? '',
        action: { kind: 'transfer-offer', offerId: offer.id },
        relatedPlayerId: offer.playerId,
      });
    }
  }

  for (const offer of state.contractOffers) {
    if (offer.status !== 'pending' || offer.clubId !== managed) continue;
    if (offer.date === state.date && !rng.chance(0.4)) continue;

    const outcome = evaluateContractOffer(state, offer, rng);
    const player = state.players[offer.playerId];
    addNews(state, {
      category: 'transfer',
      important: outcome === 'accepted',
      subject: `Contract talks: ${player?.lastName ?? 'player'}`,
      body: offer.responseText ?? '',
      action: { kind: 'contract-response', offerId: offer.id },
      relatedPlayerId: offer.playerId,
    });
  }
}

/** AI clubs strengthening their squads, and bidding for the human's players. */
function aiTransferActivity(state: GameState, rng: Rng): void {
  if (!state.transferWindowOpen) return;
  const settings = settingsFor(state.difficulty);

  // Only a handful of clubs act each day, so the window has a rhythm rather than resolving at once.
  const clubs = Object.values(state.clubs).filter((c) => !c.isPlayerControlled);
  const actors = rng.shuffle(clubs).slice(0, 6);

  for (const club of actors) {
    if (!canSign(state, club.id).allowed) continue;
    if (club.finances.transferBudget < 100_000) continue;

    const squad = squadOf(state, club.id);
    if (squad.length >= 32) continue;

    // Where is the squad thin?
    const need = weakestArea(squad);
    const level = squad.reduce((s, p) => s + p.currentAbility, 0) / Math.max(1, squad.length);

    const targets = Object.values(state.players).filter((p) => {
      if (p.retired || p.clubId === club.id || p.loan) return false;
      if (positionGroup(p.naturalPosition) !== need) return false;
      if (p.currentAbility < level * 0.95) return false;
      const price = p.clubId ? askingPrice(state, p, club.id) : p.value * 0.4;
      return price <= club.finances.transferBudget;
    });
    if (targets.length === 0) continue;

    const target = rng.weighted(targets.slice(0, 60), (p) => p.currentAbility ** 2);

    // Bidding for the human's players is where the Easy-mode bias shows up most.
    if (target.clubId === state.manager.clubId) {
      if (!rng.chance(0.22 * settings.poachingAggression)) continue;
      const price = askingPrice(state, target, club.id);
      const offer = createTransferOffer(state, target.id, club.id, {
        fee: roundMoney(price * rng.float(0.85, 1.15)),
        sellOnPercent: rng.chance(0.3) ? rng.int(5, 20) : 0,
        instalments: rng.chance(0.4) ? rng.int(1, 3) : 0,
      });
      offer.status = 'pending';
      addNews(state, {
        category: 'transfer',
        important: true,
        subject: `Bid received for ${target.lastName}`,
        body: `${club.name} have bid £${formatShort(offer.fee)} for ${target.firstName} ${target.lastName}.${offer.instalments ? ` The fee would be paid over ${offer.instalments + 1} instalments.` : ''}${offer.sellOnPercent ? ` They are offering a ${offer.sellOnPercent}% sell-on clause.` : ''}`,
        action: { kind: 'transfer-offer', offerId: offer.id },
        relatedPlayerId: target.id,
        relatedClubId: club.id,
      });
      continue;
    }

    // AI-to-AI transfers resolve immediately, so the world keeps moving without a queue.
    if (!target.clubId) {
      // Free agent.
      const demands = contractDemands(state, target, club.id);
      if (demands.wage > club.finances.wageBudget - wageBill(state, club.id)) continue;
      completeTransfer(state, target, club.id, 0, freeContractOffer(state, target, club.id, demands), 0, 0);
      continue;
    }

    const price = askingPrice(state, target, club.id);
    if (price > club.finances.transferBudget) continue;
    if (!willingToSell(state, target, rng)) continue;
    const demands = contractDemands(state, target, club.id);
    if (demands.wage > (club.finances.wageBudget - wageBill(state, club.id)) * 1.2) continue;

    completeTransfer(state, target, club.id, price, freeContractOffer(state, target, club.id, demands), 0, 0);
  }
}

function freeContractOffer(
  state: GameState,
  player: Player,
  clubId: string,
  demands: { wage: number; years: number; signingOnFee: number; squadStatus: SquadStatus },
): ContractOffer {
  return {
    id: nextId('c'),
    playerId: player.id,
    clubId,
    wage: demands.wage,
    years: demands.years,
    signingOnFee: demands.signingOnFee,
    releaseClause: 0,
    loyaltyBonus: 0,
    appearanceFee: Math.round(demands.wage * 0.08),
    goalBonus: Math.round(demands.wage * 0.12),
    squadStatus: demands.squadStatus,
    status: 'accepted',
    date: state.date,
    expiresInDays: 0,
  };
}

function weakestArea(squad: Player[]): 'GK' | 'DEF' | 'MID' | 'ATT' {
  const targets: Record<string, number> = { GK: 3, DEF: 8, MID: 8, ATT: 5 };
  let worst: 'GK' | 'DEF' | 'MID' | 'ATT' = 'MID';
  let worstRatio = Infinity;
  for (const group of ['GK', 'DEF', 'MID', 'ATT'] as const) {
    const count = squad.filter((p) => positionGroup(p.naturalPosition) === group).length;
    const ratio = count / targets[group];
    if (ratio < worstRatio) {
      worstRatio = ratio;
      worst = group;
    }
  }
  return worst;
}

/** Contracts running down: renewals for the AI, warnings for the human. */
function handleExpiringContracts(state: GameState, rng: Rng): void {
  for (const player of Object.values(state.players)) {
    if (!player.contract || !player.clubId || player.retired) continue;
    const months = monthsUntil(state.date, player.contract.expires);
    const club = state.clubs[player.clubId];
    if (!club) continue;

    if (months <= 0) {
      // Contract has run out. The player becomes a free agent.
      club.playerIds = club.playerIds.filter((id) => id !== player.id);
      player.clubId = null;
      player.contract = null;
      player.value = computeValue(player, state.date);
      autoPickTeam(state, club.id);

      if (club.id === state.manager.clubId) {
        addNews(state, {
          category: 'squad',
          important: true,
          subject: `${player.shortName} has left the club`,
          body: `${player.firstName} ${player.lastName}'s contract has expired and he has left on a free transfer.`,
          relatedPlayerId: player.id,
        });
      }
      continue;
    }

    // AI clubs renew their own players.
    if (!club.isPlayerControlled && months < 8 && rng.chance(0.06)) {
      const demands = contractDemands(state, player, club.id);
      const affordable = demands.wage < club.finances.wageBudget * 0.25;
      if (affordable && rng.chance(0.75)) {
        player.contract = {
          ...player.contract,
          expires: addDaysISO(state.date, demands.years * 365),
          wage: demands.wage,
          squadStatus: demands.squadStatus,
        };
        player.value = computeValue(player, state.date);
      }
      continue;
    }

    // The human gets a nudge before it's too late.
    if (club.isPlayerControlled && months < 6 && months > 5.8) {
      addNews(state, {
        category: 'squad',
        important: true,
        subject: `${player.shortName} enters the last six months of his contract`,
        body: `${player.firstName} ${player.lastName} can begin negotiating with foreign clubs on a free transfer. Offer him new terms or consider cashing in now.`,
        relatedPlayerId: player.id,
      });
    }
  }
}

/** Free agents drifting into clubs, so the pool doesn't fill up with good players nobody signs. */
export function processFreeAgents(state: GameState): void {
  const rng = new Rng(deriveSeed(state.rngState, `freeagents:${state.date}`));
  const pool = freeAgents(state).filter((p) => p.currentAbility > 60);
  for (const player of pool.slice(0, 10)) {
    if (!rng.chance(0.04)) continue;
    const suitors = Object.values(state.clubs).filter(
      (c) => !c.isPlayerControlled &&
        squadOf(state, c.id).length < 30 &&
        canSign(state, c.id).allowed,
    );
    if (suitors.length === 0) continue;
    const club = rng.weighted(suitors, (c) => Math.max(1, c.reputation - Math.abs(c.reputation - player.currentAbility / 2)));
    const demands = contractDemands(state, player, club.id);
    completeTransfer(state, player, club.id, 0, freeContractOffer(state, player, club.id, demands), 0, 0);
  }
}

/** Transfer window state for a given date. */
export function windowOpenOn(date: string): boolean {
  const [, month, day] = date.split('-').map(Number);
  const summer = month === 7 || month === 8 || (month === 9 && day === 1);
  const winter = month === 1 || (month === 2 && day <= 2);
  return summer || winter;
}

export function isDeadlineDay(date: string): boolean {
  const [, month, day] = date.split('-').map(Number);
  return (month === 9 && day === 1) || (month === 2 && day === 2);
}

/** Record of every completed deal this season, for the transfer history screen. */
export function seasonTransfers(state: GameState): { date: string; text: string }[] {
  return Object.values(state.clubs)
    .flatMap((club) => club.finances.ledger
      .filter((e) => (e.category === 'Transfers In' || e.category === 'Transfers Out') &&
        seasonLabel(e.date) === state.season && e.amount !== 0)
      .map((e) => ({ date: e.date, text: `${club.shortName}: ${e.description}` })))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 100);
}
