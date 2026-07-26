/**
 * Everything the manager can actually *do*.
 *
 * The UI never mutates game state directly — it calls one of these. That keeps the rules in one
 * place, makes the undo guardrail possible, and means the engine can be driven headlessly by a
 * test with exactly the same code paths the player uses.
 */

import { Rng, deriveSeed } from '../engine/rng';
import { GameState, getClub, squadOf } from '../engine/gamestate';
import {
  ContractOffer, PressAnswer, SquadStatus, Tactics, TransferOffer,
} from '../engine/types';
import {
  askingPrice, completeLoan, completeTransfer, contractDemands, createContractOffer,
  createTransferOffer, evaluateContractOffer, evaluateTransferOffer, OfferTerms,
} from '../engine/transfers';
import { applySelection, autoPickTeam, assignSetPieceTakers } from '../engine/selection';
import { changeFormation } from '../engine/formations';
import { addNews, markRead } from '../engine/news';
import { applyPressAnswers } from '../engine/media';
import { canSign, recordTransaction, wageBill } from '../engine/finance';
import { settingsFor } from '../engine/difficulty';
import { assignScout, unassignScout } from '../engine/scouting';
import { IndividualFocus, TrainingState } from '../engine/gamestate';
import { computeValue } from '../engine/players';
import { snapshot, restore } from './save';
import { makeBoardRequest } from '../engine/board';

// ---------------------------------------------------------------------------------------------
// Undo guardrail
// ---------------------------------------------------------------------------------------------

/**
 * Record a restore point before a reversible action. Part of the "forgiving of obvious errors"
 * remit: a misclicked transfer shouldn't cost you a season.
 */
export function recordUndo(state: GameState, label: string): void {
  if (!settingsFor(state.difficulty).allowUndo) return;
  state.lastUndo = { label, date: state.date, snapshot: snapshot(state) };
}

export function canUndo(state: GameState): boolean {
  return Boolean(state.lastUndo && state.lastUndo.date === state.date);
}

export function undo(state: GameState): GameState | null {
  if (!canUndo(state) || !state.lastUndo) return null;
  const restored = restore(state.lastUndo.snapshot);
  restored.lastUndo = null;
  return restored;
}

// ---------------------------------------------------------------------------------------------
// Tactics and selection
// ---------------------------------------------------------------------------------------------

export function setFormation(state: GameState, formationName: string): void {
  const club = getClub(state, state.manager.clubId);
  club.tactics = changeFormation(club.tactics, formationName);
  assignSetPieceTakers(state, club.id);
}

export function setPlayerInSlot(state: GameState, slotIndex: number, playerId: string | null): void {
  const club = getClub(state, state.manager.clubId);
  const slots = club.tactics.slots.map((s) => ({ ...s }));
  if (!slots[slotIndex]) return;

  // If the player is already elsewhere in the XI, swap the two rather than duplicating them.
  if (playerId) {
    const existingIndex = slots.findIndex((s) => s.playerId === playerId);
    if (existingIndex >= 0 && existingIndex !== slotIndex) {
      slots[existingIndex].playerId = slots[slotIndex].playerId;
    }
    // Remove from the bench if they were named there.
    club.tactics.bench = club.tactics.bench.map((id) => (id === playerId ? null : id));
  }
  slots[slotIndex].playerId = playerId;
  club.tactics = { ...club.tactics, slots };
}

export function setBenchSlot(state: GameState, index: number, playerId: string | null): void {
  const club = getClub(state, state.manager.clubId);
  const bench = [...club.tactics.bench];
  if (playerId) {
    // Can't be on the bench and in the XI.
    const inXi = club.tactics.slots.findIndex((s) => s.playerId === playerId);
    if (inXi >= 0) return;
    const existing = bench.indexOf(playerId);
    if (existing >= 0) bench[existing] = null;
  }
  bench[index] = playerId;
  club.tactics = { ...club.tactics, bench };
}

export function setSlotRole(state: GameState, slotIndex: number, role: string): void {
  const club = getClub(state, state.manager.clubId);
  const slots = club.tactics.slots.map((s, i) =>
    i === slotIndex ? { ...s, role: role as Tactics['slots'][number]['role'] } : s);
  club.tactics = { ...club.tactics, slots };
}

export function updateTactics(state: GameState, changes: Partial<Tactics>): void {
  const club = getClub(state, state.manager.clubId);
  club.tactics = { ...club.tactics, ...changes };
}

export function setSetPieceTaker(
  state: GameState,
  key: keyof Tactics['setPieces'],
  playerId: string | null,
): void {
  const club = getClub(state, state.manager.clubId);
  club.tactics = {
    ...club.tactics,
    setPieces: { ...club.tactics.setPieces, [key]: playerId },
  };
}

export function pickTeamAutomatically(state: GameState): void {
  autoPickTeam(state, state.manager.clubId);
}

export function applyBestEleven(state: GameState, xi: (string | null)[], bench: (string | null)[]): void {
  const club = getClub(state, state.manager.clubId);
  club.tactics = applySelection(club.tactics, xi, bench);
}

// ---------------------------------------------------------------------------------------------
// Training
// ---------------------------------------------------------------------------------------------

export function setTrainingSchedule(state: GameState, schedule: TrainingState['schedule']): void {
  state.training.schedule = schedule;
}

export function setTrainingIntensity(state: GameState, intensity: number): void {
  state.training.intensity = Math.max(1, Math.min(5, Math.round(intensity)));
}

export function setIndividualFocus(state: GameState, playerId: string, focus: IndividualFocus): void {
  if (focus === 'None') delete state.training.individual[playerId];
  else state.training.individual[playerId] = focus;
}

// ---------------------------------------------------------------------------------------------
// Transfers
// ---------------------------------------------------------------------------------------------

export interface BidResult {
  ok: boolean;
  message: string;
  offer?: TransferOffer;
}

export function bidForPlayer(state: GameState, playerId: string, terms: OfferTerms): BidResult {
  const club = getClub(state, state.manager.clubId);
  const player = state.players[playerId];
  if (!player) return { ok: false, message: 'Unknown player.' };

  const permitted = canSign(state, club.id);
  if (!permitted.allowed) return { ok: false, message: permitted.reason ?? 'You cannot sign players.' };

  if (!terms.isLoan) {
    if (!state.transferWindowOpen) {
      return { ok: false, message: 'The transfer window is closed. You can still sign free agents and arrange loans.' };
    }
    const upFront = terms.instalments ? terms.fee / (terms.instalments + 1) : terms.fee;
    if (upFront > club.finances.transferBudget) {
      return {
        ok: false,
        message: `That would commit £${Math.round(upFront).toLocaleString()} up front, but your transfer budget is £${club.finances.transferBudget.toLocaleString()}.`,
      };
    }
  }

  if (squadOf(state, club.id).length >= 34) {
    return { ok: false, message: 'Your squad is already at the maximum size of 34. Move someone on first.' };
  }

  recordUndo(state, `Bid for ${player.shortName}`);
  const offer = createTransferOffer(state, playerId, club.id, terms);
  return {
    ok: true,
    message: `Your ${terms.isLoan ? 'loan enquiry' : 'bid'} for ${player.firstName} ${player.lastName} has been submitted.`,
    offer,
  };
}

/** Improve an existing bid, keeping the negotiation thread going. */
export function improveBid(state: GameState, offerId: string, terms: OfferTerms): BidResult {
  const offer = state.transferOffers.find((o) => o.id === offerId);
  if (!offer) return { ok: false, message: 'That offer no longer exists.' };
  const club = getClub(state, state.manager.clubId);

  const upFront = terms.instalments ? terms.fee / (terms.instalments + 1) : terms.fee;
  if (!terms.isLoan && upFront > club.finances.transferBudget) {
    return { ok: false, message: 'That exceeds your transfer budget.' };
  }

  recordUndo(state, 'Improve bid');
  Object.assign(offer, terms, { status: 'pending', date: state.date, expiresInDays: 5 });
  return { ok: true, message: 'Your improved offer has been submitted.', offer };
}

export function withdrawBid(state: GameState, offerId: string): void {
  const offer = state.transferOffers.find((o) => o.id === offerId);
  if (offer) offer.status = 'withdrawn';
}

/** Answer a bid another club has made for one of your players. */
export function respondToIncomingBid(state: GameState, offerId: string, accept: boolean): BidResult {
  const offer = state.transferOffers.find((o) => o.id === offerId);
  if (!offer) return { ok: false, message: 'That bid is no longer on the table.' };
  const player = state.players[offer.playerId];
  if (!player) return { ok: false, message: 'Unknown player.' };

  if (!accept) {
    offer.status = 'rejected';
    // Turning down good money for an unsettled player makes him unhappier still.
    if (player.morale < 45) player.morale = Math.max(5, player.morale - 6);
    return { ok: false, message: `You have rejected ${state.clubs[offer.fromClubId]?.name}'s bid.` };
  }

  recordUndo(state, `Accept bid for ${player.shortName}`);

  const rng = new Rng(deriveSeed(state.rngState, `sale:${offer.id}`));
  const demands = contractDemands(state, player, offer.fromClubId);
  const contract: ContractOffer = {
    id: 'auto', playerId: player.id, clubId: offer.fromClubId,
    wage: demands.wage, years: demands.years, signingOnFee: demands.signingOnFee,
    releaseClause: 0, loyaltyBonus: 0,
    appearanceFee: Math.round(demands.wage * 0.08), goalBonus: Math.round(demands.wage * 0.12),
    squadStatus: demands.squadStatus, status: 'accepted', date: state.date, expiresInDays: 0,
  };

  // The player has to want to go. Usually they do — an unhappy or ambitious one certainly will.
  const wantsToGo = player.transferListed || player.morale < 50 ||
    (state.clubs[offer.fromClubId]?.reputation ?? 0) > getClub(state, state.manager.clubId).reputation ||
    rng.chance(0.6);

  if (!wantsToGo) {
    offer.status = 'rejected';
    return {
      ok: false,
      message: `${player.lastName} has turned down the move. You accepted the fee, but he does not want to go.`,
    };
  }

  offer.status = 'completed';
  completeTransfer(state, player, offer.fromClubId, offer.fee, contract, offer.instalments, offer.sellOnPercent);
  return { ok: true, message: `${player.firstName} ${player.lastName} has been sold.` };
}

/** Open contract talks with a player whose club has accepted your bid, or who is a free agent. */
export function offerContract(
  state: GameState,
  playerId: string,
  terms: {
    wage: number; years: number; signingOnFee: number; releaseClause: number;
    loyaltyBonus: number; appearanceFee: number; goalBonus: number; squadStatus: SquadStatus;
  },
): BidResult {
  const club = getClub(state, state.manager.clubId);
  const player = state.players[playerId];
  if (!player) return { ok: false, message: 'Unknown player.' };

  const currentBill = wageBill(state, club.id);
  const isRenewal = player.clubId === club.id;
  const delta = terms.wage - (isRenewal ? player.contract?.wage ?? 0 : 0);
  if (currentBill + delta > club.finances.wageBudget) {
    return {
      ok: false,
      message: `That would take your wage bill to £${(currentBill + delta).toLocaleString()} against a budget of £${club.finances.wageBudget.toLocaleString()}. Ask the board for more, or free up wages first.`,
    };
  }

  recordUndo(state, `Contract offer to ${player.shortName}`);
  createContractOffer(state, playerId, club.id, { ...terms });
  return { ok: true, message: `Terms have been offered to ${player.firstName} ${player.lastName}.` };
}

/** Complete a signing once both the fee and personal terms are agreed. */
export function confirmSigning(state: GameState, contractOfferId: string): BidResult {
  const contract = state.contractOffers.find((o) => o.id === contractOfferId);
  if (!contract || contract.status !== 'accepted') {
    return { ok: false, message: 'Personal terms have not been agreed.' };
  }
  const player = state.players[contract.playerId];
  if (!player) return { ok: false, message: 'Unknown player.' };

  const club = getClub(state, state.manager.clubId);

  // Renewal: just replace the contract.
  if (player.clubId === club.id) {
    recordUndo(state, `Renew ${player.shortName}`);
    player.contract = {
      expires: new Date(new Date(state.date).getTime() + contract.years * 365 * 86_400_000)
        .toISOString().slice(0, 10),
      wage: contract.wage,
      releaseClause: contract.releaseClause,
      loyaltyBonus: contract.loyaltyBonus,
      appearanceFee: contract.appearanceFee,
      goalBonus: contract.goalBonus,
      squadStatus: contract.squadStatus,
      signingOnFee: contract.signingOnFee,
    };
    player.morale = Math.min(100, player.morale + 10);
    player.value = computeValue(player, state.date);
    if (contract.signingOnFee > 0) {
      recordTransaction(state, club.id, 'Bonuses', `Signing-on fee for ${player.shortName}`, -contract.signingOnFee);
    }
    contract.status = 'completed';
    addNews(state, {
      category: 'squad',
      subject: `${player.shortName} signs a new contract`,
      body: `${player.firstName} ${player.lastName} has committed to a new ${contract.years}-year deal on £${contract.wage.toLocaleString()} per week.`,
      relatedPlayerId: player.id,
    });
    return { ok: true, message: 'New contract agreed.' };
  }

  // New signing: a fee must have been agreed unless he's a free agent.
  const transferOffer = state.transferOffers.find(
    (o) => o.playerId === player.id && o.fromClubId === club.id && o.status === 'accepted',
  );
  if (player.clubId && !transferOffer) {
    return { ok: false, message: 'No agreed fee is in place with the selling club.' };
  }

  recordUndo(state, `Sign ${player.shortName}`);

  if (transferOffer?.isLoan) {
    completeLoan(state, player, club.id, transferOffer.loanMonths, transferOffer.loanWageShare, true);
  } else {
    completeTransfer(
      state, player, club.id, transferOffer?.fee ?? 0, contract,
      transferOffer?.instalments ?? 0, transferOffer?.sellOnPercent ?? 0,
    );
  }
  if (transferOffer) transferOffer.status = 'completed';
  contract.status = 'completed';
  return { ok: true, message: `${player.firstName} ${player.lastName} is your player.` };
}

export function setTransferStatus(
  state: GameState,
  playerId: string,
  options: { transferListed?: boolean; loanListed?: boolean },
): void {
  const player = state.players[playerId];
  if (!player || player.clubId !== state.manager.clubId) return;
  if (options.transferListed !== undefined) player.transferListed = options.transferListed;
  if (options.loanListed !== undefined) player.loanListed = options.loanListed;
}

export function toggleShortlist(state: GameState, playerId: string): void {
  const index = state.shortlist.indexOf(playerId);
  if (index >= 0) state.shortlist.splice(index, 1);
  else state.shortlist.push(playerId);
}

/** Terminate a contract by mutual consent, paying up the remainder. */
export function releasePlayer(state: GameState, playerId: string): BidResult {
  const club = getClub(state, state.manager.clubId);
  const player = state.players[playerId];
  if (!player || player.clubId !== club.id) return { ok: false, message: 'Not your player.' };
  if (!player.contract) return { ok: false, message: 'That player has no contract to terminate.' };

  const weeksLeft = Math.max(
    0,
    (new Date(player.contract.expires).getTime() - new Date(state.date).getTime()) / (7 * 86_400_000),
  );
  const payoff = Math.round(player.contract.wage * weeksLeft * 0.6);

  recordUndo(state, `Release ${player.shortName}`);
  recordTransaction(state, club.id, 'Bonuses', `Contract termination: ${player.shortName}`, -payoff);

  club.playerIds = club.playerIds.filter((id) => id !== player.id);
  player.clubId = null;
  player.contract = null;
  player.value = computeValue(player, state.date);
  autoPickTeam(state, club.id);

  return { ok: true, message: `${player.shortName} has been released. Pay-off: £${payoff.toLocaleString()}.` };
}

// ---------------------------------------------------------------------------------------------
// Board, staff, stadium
// ---------------------------------------------------------------------------------------------

export { makeBoardRequest };

export function setTicketPrices(
  state: GameState,
  prices: { general?: number; season?: number; corporate?: number },
): void {
  const club = getClub(state, state.manager.clubId);
  club.ticketPricing = { ...club.ticketPricing, ...prices };
}

export function assignScoutTo(
  state: GameState,
  scoutId: string,
  kind: 'player' | 'region' | 'competition',
  target: string,
): void {
  assignScout(state, scoutId, kind, target);
}

export function recallScout(state: GameState, scoutId: string): void {
  unassignScout(state, scoutId);
}

export function sackStaff(state: GameState, staffId: string): BidResult {
  const club = getClub(state, state.manager.clubId);
  const member = state.staff[staffId];
  if (!member || member.clubId !== club.id) return { ok: false, message: 'Not your staff member.' };

  const weeksLeft = Math.max(
    0,
    (new Date(member.contractExpires).getTime() - new Date(state.date).getTime()) / (7 * 86_400_000),
  );
  const payoff = Math.round(member.wage * weeksLeft * 0.5);
  recordTransaction(state, club.id, 'Staff Wages', `Severance: ${member.shortName}`, -payoff);

  club.staffIds = club.staffIds.filter((id) => id !== staffId);
  member.clubId = null;
  return { ok: true, message: `${member.shortName} has left the club. Severance: £${payoff.toLocaleString()}.` };
}

// ---------------------------------------------------------------------------------------------
// Media and news
// ---------------------------------------------------------------------------------------------

export function answerPressConference(
  state: GameState,
  newsId: string,
  answers: PressAnswer[],
): void {
  applyPressAnswers(state, answers);
  markRead(state, newsId);
}

export function readNews(state: GameState, newsId: string): void {
  markRead(state, newsId);
}

/** Answer a transfer request from an unhappy player. */
export function respondToTransferRequest(state: GameState, playerId: string, grant: boolean): void {
  const player = state.players[playerId];
  if (!player) return;
  if (grant) {
    player.transferListed = true;
    player.morale = Math.min(100, player.morale + 10);
  } else {
    player.transferListed = false;
    player.morale = Math.max(5, player.morale - 8);
  }
}

/** The asking price the manager should expect to pay, exposed for the bid dialog. */
export function suggestedBid(state: GameState, playerId: string): number {
  const player = state.players[playerId];
  if (!player) return 0;
  if (!player.clubId) return 0;
  return askingPrice(state, player, state.manager.clubId);
}

/** The wage the player will want, exposed for the contract dialog. */
export function suggestedTerms(state: GameState, playerId: string) {
  const player = state.players[playerId];
  if (!player) return null;
  return contractDemands(state, player, state.manager.clubId);
}

/** Force an immediate answer from the AI — used by the "negotiate" button. */
export function pressForAnswer(state: GameState, offerId: string): void {
  const rng = new Rng(deriveSeed(state.rngState, `press-answer:${offerId}`));
  const transfer = state.transferOffers.find((o) => o.id === offerId);
  if (transfer) {
    evaluateTransferOffer(state, transfer, rng);
    return;
  }
  const contract = state.contractOffers.find((o) => o.id === offerId);
  if (contract) evaluateContractOffer(state, contract, rng);
}
