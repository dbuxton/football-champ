/**
 * Team selection.
 *
 * Used by the AI for every unmanaged club, by the "pick team" button, and as the safety net that
 * stops a human manager kicking off with nine men because they forgot to replace an injured
 * defender. That safety net is deliberate: the brief asks for a game that's forgiving of obvious
 * mistakes, and fielding an illegal side is the most obvious mistake there is.
 */

import { Player, Position, Tactics } from './types';
import { GameState } from './gamestate';
import { isAvailable, matchEffectiveness, averageForm } from './players';
import { formationByName, emptySlot, defaultRole } from './formations';

interface Candidate {
  player: Player;
  score: number;
}

/**
 * Greedy assignment: fill the positions that are hardest to cover first (goalkeeper, then the
 * specialised wide and central roles), taking the best available player each time. Greedy is not
 * optimal, but ordering by scarcity gets within a whisker of it and is far easier to reason about.
 */
export function pickBestEleven(
  squad: Player[],
  formationName: string,
): { xi: (string | null)[]; bench: (string | null)[] } {
  const formation = formationByName(formationName);
  const available = squad.filter(isAvailable);
  const used = new Set<string>();

  // Scarcity: how many players in the squad are genuinely comfortable in each slot.
  const scarcity = formation.slots.map((position) => ({
    position,
    supply: available.filter((p) => p.positions[position] >= 15).length,
  }));

  const order = formation.slots
    .map((position, index) => ({ position, index }))
    .sort((a, b) => {
      if (a.position === 'GK') return -1;
      if (b.position === 'GK') return 1;
      return (scarcity[a.index].supply - scarcity[b.index].supply);
    });

  const xi: (string | null)[] = Array(11).fill(null);

  for (const { position, index } of order) {
    const candidates: Candidate[] = available
      .filter((p) => !used.has(p.id))
      // Never put an outfielder in goal, or a goalkeeper outfield, while alternatives exist.
      .filter((p) => (position === 'GK') === (p.naturalPosition === 'GK'))
      .map((player) => ({
        player,
        score: scoreForSlot(player, position),
      }))
      .sort((a, b) => b.score - a.score);

    const pick = candidates[0]
      // If we have literally nobody of the right type, fall back to anyone at all.
      ?? available.filter((p) => !used.has(p.id))
        .map((player) => ({ player, score: scoreForSlot(player, position) }))
        .sort((a, b) => b.score - a.score)[0];

    if (pick) {
      xi[index] = pick.player.id;
      used.add(pick.player.id);
    }
  }

  // Bench: a spare keeper first, then the best remaining players with an eye to covering each
  // area of the pitch.
  const remaining = available.filter((p) => !used.has(p.id));
  const bench: (string | null)[] = [];

  const spareKeeper = remaining
    .filter((p) => p.naturalPosition === 'GK')
    .sort((a, b) => b.currentAbility - a.currentAbility)[0];
  if (spareKeeper) {
    bench.push(spareKeeper.id);
    used.add(spareKeeper.id);
  }

  const outfield = remaining
    .filter((p) => !used.has(p.id) && p.naturalPosition !== 'GK')
    .sort((a, b) => b.currentAbility - a.currentAbility);

  for (const player of outfield) {
    if (bench.length >= 7) break;
    bench.push(player.id);
  }
  while (bench.length < 7) bench.push(null);

  return { xi, bench };
}

function scoreForSlot(player: Player, position: Position): number {
  // Effectiveness is the bulk of it; recent form and morale nudge close calls.
  const base = matchEffectiveness(player, position) * 1000;
  const form = averageForm(player) * 12;
  const potentialBias = player.potentialAbility > player.currentAbility + 25 ? 4 : 0;
  return base + form + potentialBias;
}

/** Apply a picked XI to a club's tactics, preserving roles where the position is unchanged. */
export function applySelection(
  tactics: Tactics,
  xi: (string | null)[],
  bench: (string | null)[],
): Tactics {
  const formation = formationByName(tactics.formationName);
  const slots = formation.slots.map((position, index) => {
    const existing = tactics.slots[index];
    const slot = existing && existing.position === position ? { ...existing } : emptySlot(position);
    slot.playerId = xi[index] ?? null;
    if (!slot.role) slot.role = defaultRole(position);
    return slot;
  });
  return { ...tactics, slots, bench: [...bench] };
}

/**
 * Pick the strongest available side for a club and write it into their tactics, including
 * set-piece takers and the captaincy.
 */
export function autoPickTeam(state: GameState, clubId: string): void {
  const club = state.clubs[clubId];
  if (!club) return;
  const squad = club.playerIds
    .map((id) => state.players[id])
    .filter((p): p is Player => Boolean(p) && !p.retired);
  if (squad.length === 0) return;

  const { xi, bench } = pickBestEleven(squad, club.tactics.formationName);
  club.tactics = applySelection(club.tactics, xi, bench);
  assignSetPieceTakers(state, clubId);
}

/** Choose penalty, free kick and corner takers, plus a captain, from the current XI. */
export function assignSetPieceTakers(state: GameState, clubId: string): void {
  const club = state.clubs[clubId];
  if (!club) return;
  const onPitch = club.tactics.slots
    .map((s) => (s.playerId ? state.players[s.playerId] : null))
    .filter((p): p is Player => Boolean(p));
  if (onPitch.length === 0) return;

  const best = (key: (p: Player) => number) =>
    onPitch.slice().sort((a, b) => key(b) - key(a))[0]?.id ?? null;

  const setPieces = club.tactics.setPieces;
  setPieces.penalties = best((p) => p.attributes.penalties * 2 + p.attributes.composure + p.attributes.finishing);
  setPieces.freeKicks = best((p) => p.attributes.freeKicks * 2 + p.attributes.technique);
  setPieces.corners = best((p) => p.attributes.corners * 2 + p.attributes.crossing);
  setPieces.longThrows = best((p) => p.attributes.strength + p.attributes.throwing);

  const leaders = onPitch
    .slice()
    .sort((a, b) =>
      (b.attributes.influence * 2 + b.attributes.determination + b.currentAbility / 20) -
      (a.attributes.influence * 2 + a.attributes.determination + a.currentAbility / 20));
  setPieces.captain = leaders[0]?.id ?? null;
  setPieces.viceCaptain = leaders[1]?.id ?? null;
}

/**
 * Validate a human manager's team sheet before kick-off. Returns a list of problems; the UI
 * shows these as warnings, and the day loop auto-repairs anything that would be illegal.
 */
export interface SelectionProblem {
  severity: 'error' | 'warning';
  message: string;
}

export function validateSelection(state: GameState, clubId: string): SelectionProblem[] {
  const club = state.clubs[clubId];
  const problems: SelectionProblem[] = [];
  const slots = club.tactics.slots;

  const selected = slots.filter((s) => s.playerId).map((s) => s.playerId as string);
  if (selected.length < 11) {
    problems.push({ severity: 'error', message: `Only ${selected.length} players selected — you need 11.` });
  }

  const duplicates = selected.filter((id, i) => selected.indexOf(id) !== i);
  if (duplicates.length) {
    problems.push({ severity: 'error', message: 'The same player is selected in more than one position.' });
  }

  for (const slot of slots) {
    if (!slot.playerId) continue;
    const player = state.players[slot.playerId];
    if (!player) continue;
    if (player.injury) {
      problems.push({ severity: 'error', message: `${player.shortName} is injured and cannot play.` });
    } else if (player.suspensionMatches > 0) {
      problems.push({ severity: 'error', message: `${player.shortName} is suspended.` });
    } else if (player.condition < 65) {
      problems.push({ severity: 'warning', message: `${player.shortName} is only ${Math.round(player.condition)}% match fit.` });
    }
    if (player.positions[slot.position] < 10 && player.naturalPosition !== 'GK') {
      problems.push({
        severity: 'warning',
        message: `${player.shortName} is uncomfortable at ${slot.position} and will underperform there.`,
      });
    }
  }

  const keepers = slots.filter((s) => s.position === 'GK' && s.playerId);
  if (keepers.length === 0) {
    problems.push({ severity: 'error', message: 'No goalkeeper selected.' });
  }

  const benchCount = club.tactics.bench.filter(Boolean).length;
  if (benchCount === 0) {
    problems.push({ severity: 'warning', message: 'You have named no substitutes.' });
  }

  return problems;
}

/**
 * Repair an invalid team sheet in place. Called automatically before kick-off so a forgotten
 * injury never costs the player a walkover.
 */
export function repairSelection(state: GameState, clubId: string): boolean {
  const problems = validateSelection(state, clubId);
  if (!problems.some((p) => p.severity === 'error')) return false;
  autoPickTeam(state, clubId);
  return true;
}
