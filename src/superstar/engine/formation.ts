import type { Position, SquadPlayer } from '../data/squads';

/**
 * Everyone plays 4-4-2. It's the shape a kid can read at a glance, and it gives a striker a
 * partner up front, so you line up next to Haaland rather than instead of him.
 *
 * Slots are written for a team attacking to the right: x runs from 0 (own goal line) to 1 (the
 * goal being attacked), y from 0 (the left touchline, facing that goal) to 1 (the right). The
 * other team's slots are mirrored when they're placed on the pitch.
 */

export type Role = 'GK' | 'RB' | 'CB' | 'LB' | 'RM' | 'CM' | 'LM' | 'ST';

export type Slot = { role: Role; x: number; y: number; number: number; label: string };

export const FORMATION: readonly Slot[] = [
  { role: 'GK', x: 0.025, y: 0.5, number: 1, label: 'Goalkeeper' },
  { role: 'RB', x: 0.2, y: 0.83, number: 2, label: 'Right back' },
  { role: 'CB', x: 0.17, y: 0.62, number: 5, label: 'Centre back' },
  { role: 'CB', x: 0.17, y: 0.38, number: 6, label: 'Centre back' },
  { role: 'LB', x: 0.2, y: 0.17, number: 3, label: 'Left back' },
  { role: 'RM', x: 0.45, y: 0.84, number: 7, label: 'Right wing' },
  { role: 'CM', x: 0.4, y: 0.6, number: 8, label: 'Midfield' },
  { role: 'CM', x: 0.4, y: 0.4, number: 4, label: 'Midfield' },
  { role: 'LM', x: 0.45, y: 0.16, number: 11, label: 'Left wing' },
  { role: 'ST', x: 0.64, y: 0.6, number: 9, label: 'Striker' },
  { role: 'ST', x: 0.64, y: 0.4, number: 10, label: 'Striker' },
];

/** The positions a kid can choose, and the slot each one takes. */
export type PlayerPosition = 'striker' | 'winger' | 'midfielder' | 'defender';

export const POSITION_SLOT: Record<PlayerPosition, number> = {
  striker: 9,
  winger: 5,
  midfielder: 6,
  defender: 2,
};

export const PLAYER_POSITIONS: readonly PlayerPosition[] = ['striker', 'winger', 'midfielder', 'defender'];

/** Which real positions suit each slot, best first. */
const SUITS: Record<Role, Position[][]> = {
  GK: [['GK']],
  RB: [['DR', 'WBR'], ['DC'], ['DL', 'WBL', 'DM']],
  CB: [['DC'], ['DM', 'DR', 'DL']],
  LB: [['DL', 'WBL'], ['DC'], ['DR', 'WBR', 'DM']],
  RM: [['AMR', 'MR'], ['AML', 'ML', 'AMC'], ['MC', 'ST']],
  LM: [['AML', 'ML'], ['AMR', 'MR', 'AMC'], ['MC', 'ST']],
  CM: [['MC', 'DM'], ['AMC'], ['DC', 'AMR', 'AML']],
  ST: [['ST'], ['AMC'], ['AMR', 'AML']],
};

/** Slots are filled in this order, so the scarce positions get the right players first. */
const FILL_ORDER = [0, 9, 10, 2, 3, 6, 7, 5, 8, 1, 4];

/**
 * Pick a starting eleven from a squad: for each slot, the best player whose position suits it.
 * `skip` is the slot the kid plays in, left empty for them. Returns one entry per slot.
 */
export function pickEleven(squad: readonly SquadPlayer[], skip: number | null): (SquadPlayer | null)[] {
  const used = new Set<SquadPlayer>();
  const eleven: (SquadPlayer | null)[] = FORMATION.map(() => null);
  const byAbility = [...squad].sort((a, b) => b.ability - a.ability);

  for (const index of FILL_ORDER) {
    if (index === skip) continue;
    const role = FORMATION[index].role;
    let chosen: SquadPlayer | undefined;
    for (const tier of SUITS[role]) {
      chosen = byAbility.find((player) => !used.has(player) && tier.includes(player.position));
      if (chosen) break;
    }
    // A squad short of a position still puts out eleven: the best player left will do.
    chosen ??= byAbility.find((player) => !used.has(player) && (role === 'GK') === (player.position === 'GK'));
    chosen ??= byAbility.find((player) => !used.has(player));
    if (chosen) {
      used.add(chosen);
      eleven[index] = chosen;
    }
  }
  return eleven;
}
