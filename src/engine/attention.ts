/**
 * The attention system: one place that answers "what needs me right now?".
 *
 * Everything here is derived from state the engine already tracks — unread actionable news,
 * squad problems, contracts running down, deals mid-flight, reports filed. The UI renders the
 * list and deep-links each item to the screen where it gets dealt with; nothing is stored.
 */

import { GameState, squadOf } from './gamestate';
import { newsRequiringAction } from './news';
import { wageBill } from './finance';
import { monthsUntil } from './players';

export type AttentionTarget =
  | 'home' | 'squad' | 'tactics' | 'training' | 'transfers' | 'scouting' | 'finances'
  | 'staff' | 'board';

export interface AttentionItem {
  id: string;
  /** 'action' needs a decision; 'warn' needs fixing; 'info' is worth a look. */
  severity: 'action' | 'warn' | 'info';
  label: string;
  detail?: string;
  /** Where dealing with this happens. */
  target: AttentionTarget;
  /** Set when the item is an inbox message — the UI opens it directly. */
  newsId?: string;
  playerId?: string;
  offerId?: string;
}

const SEVERITY_ORDER: Record<AttentionItem['severity'], number> = { action: 0, warn: 1, info: 2 };

/** Everything needing the manager, most urgent first. */
export function attentionItems(state: GameState): AttentionItem[] {
  const items: AttentionItem[] = [];
  const club = state.clubs[state.manager.clubId];
  if (!club) return items;
  const squad = squadOf(state, club.id);

  // --- Decisions sitting in the inbox ---------------------------------------------------------
  for (const item of newsRequiringAction(state)) {
    items.push({
      id: `news:${item.id}`,
      severity: 'action',
      label: item.subject,
      target: 'home',
      newsId: item.id,
      playerId: item.relatedPlayerId,
    });
  }

  // --- Deals mid-flight -----------------------------------------------------------------------
  for (const offer of state.contractOffers) {
    if (offer.clubId !== club.id || offer.status !== 'accepted') continue;
    const player = state.players[offer.playerId];
    if (!player || player.clubId === club.id) continue;
    items.push({
      id: `signing:${offer.id}`,
      severity: 'action',
      label: `${player.shortName} has agreed terms — complete the signing`,
      target: 'transfers',
      playerId: player.id,
      offerId: offer.id,
    });
  }
  for (const offer of state.transferOffers) {
    if (offer.toClubId !== club.id || offer.status !== 'pending') continue;
    const player = state.players[offer.playerId];
    if (!player) continue;
    items.push({
      id: `bid:${offer.id}`,
      severity: 'action',
      label: `${state.clubs[offer.fromClubId]?.shortName ?? 'A club'} have bid for ${player.shortName}`,
      target: 'transfers',
      playerId: player.id,
      offerId: offer.id,
    });
  }

  // --- Squad problems (the old warnings, now clickable) ---------------------------------------
  if (squad.length < 16) {
    items.push({
      id: 'squad-size',
      severity: 'warn',
      label: `Only ${squad.length} players in the squad`,
      detail: 'You risk being unable to field a side. Sign players or recall loans.',
      target: 'transfers',
    });
  }
  const keepers = squad.filter((p) => p.naturalPosition === 'GK' && !p.injury);
  if (keepers.length < 2) {
    items.push({
      id: 'keepers',
      severity: 'warn',
      label: keepers.length === 0 ? 'No fit goalkeeper' : 'Only one fit goalkeeper',
      detail: 'An injury or suspension would leave an outfielder in goal.',
      target: 'transfers',
    });
  }
  const bill = wageBill(state, club.id);
  if (bill > club.finances.wageBudget) {
    items.push({
      id: 'wages',
      severity: 'warn',
      label: 'Wage bill exceeds the budget',
      detail: `£${bill.toLocaleString()} a week against a budget of £${club.finances.wageBudget.toLocaleString()}.`,
      target: 'finances',
    });
  }
  if (club.finances.balance < 0) {
    items.push({
      id: 'balance',
      severity: 'warn',
      label: `The club is £${Math.abs(Math.round(club.finances.balance)).toLocaleString()} in the red`,
      detail: 'Sell, release or renegotiate before the board steps in.',
      target: 'finances',
    });
  }
  if (club.board.confidence < 30) {
    items.push({
      id: 'board',
      severity: 'warn',
      label: 'The board is losing faith',
      detail: 'Results need to improve quickly.',
      target: 'board',
    });
  }

  // --- Contracts running down -----------------------------------------------------------------
  for (const player of squad) {
    if (!player.contract || player.loan) continue;
    const status = player.contract.squadStatus;
    if (status !== 'Key Player' && status !== 'First Team') continue;
    const months = monthsUntil(state.date, player.contract.expires);
    if (months > 0 && months < 6) {
      items.push({
        id: `contract:${player.id}`,
        severity: 'warn',
        label: `${player.shortName}'s contract expires in ${Math.max(1, Math.round(months))} month${Math.round(months) > 1 ? 's' : ''}`,
        detail: `A ${status.toLowerCase()} you could lose for nothing. Offer terms or cash in.`,
        target: 'squad',
        playerId: player.id,
      });
    }
  }

  // --- Unsettled players ----------------------------------------------------------------------
  for (const player of squad) {
    if (player.morale < 30 && !player.transferListed) {
      items.push({
        id: `morale:${player.id}`,
        severity: 'info',
        label: `${player.shortName} is deeply unhappy`,
        detail: 'Play him, praise him or move him on before he asks to leave.',
        target: 'squad',
        playerId: player.id,
      });
    }
  }

  // --- Scouting -------------------------------------------------------------------------------
  const freshReports = state.scoutReports.filter(
    (r) => daysBetween(r.date, state.date) <= 7,
  );
  if (freshReports.length > 0) {
    items.push({
      id: 'scout-reports',
      severity: 'info',
      label: `${freshReports.length} new scout report${freshReports.length > 1 ? 's' : ''} filed`,
      target: 'scouting',
    });
  }

  // --- The window -----------------------------------------------------------------------------
  if (state.deadlineDay) {
    items.push({
      id: 'deadline',
      severity: 'warn',
      label: 'Transfer deadline day',
      detail: 'Any business must be finished today.',
      target: 'transfers',
    });
  }

  // --- Match preparation ----------------------------------------------------------------------
  const nextMatch = daysToNextFixture(state);
  if (nextMatch !== null && nextMatch <= 2) {
    const xiIds = new Set(club.tactics.slots.map((s) => s.playerId).filter(Boolean) as string[]);
    const tired = squad.filter((p) => xiIds.has(p.id) && (p.condition < 70 || p.matchSharpness < 55));
    if (tired.length > 0) {
      items.push({
        id: 'tired-xi',
        severity: 'info',
        label: `${tired.length} of your starting XI ${tired.length > 1 ? 'are' : 'is'} short of fitness or sharpness`,
        detail: tired.slice(0, 4).map((p) => p.shortName).join(', '),
        target: 'tactics',
      });
    }
  }

  return items.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}

function daysBetween(a: string, b: string): number {
  return Math.abs(Date.parse(b) - Date.parse(a)) / 86_400_000;
}

function daysToNextFixture(state: GameState): number | null {
  const managedId = state.manager.clubId;
  const next = state.fixtures
    .filter((f) => !f.played && (f.homeClubId === managedId || f.awayClubId === managedId))
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  if (!next) return null;
  return Math.round((Date.parse(next.date) - Date.parse(state.date)) / 86_400_000);
}
