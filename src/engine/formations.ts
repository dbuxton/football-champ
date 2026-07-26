/**
 * Formations, roles and the default tactical setup.
 */

import { Formation, PlayerRole, Position, TacticSlot, Tactics } from './types';

export const FORMATIONS: Formation[] = [
  { name: '4-4-2', slots: ['GK', 'DR', 'DC', 'DC', 'DL', 'MR', 'MC', 'MC', 'ML', 'ST', 'ST'] },
  { name: '4-4-1-1', slots: ['GK', 'DR', 'DC', 'DC', 'DL', 'MR', 'MC', 'MC', 'ML', 'AMC', 'ST'] },
  { name: '4-2-3-1', slots: ['GK', 'DR', 'DC', 'DC', 'DL', 'DM', 'DM', 'AMR', 'AMC', 'AML', 'ST'] },
  { name: '4-3-3', slots: ['GK', 'DR', 'DC', 'DC', 'DL', 'MC', 'MC', 'MC', 'AMR', 'AML', 'ST'] },
  { name: '4-1-4-1', slots: ['GK', 'DR', 'DC', 'DC', 'DL', 'DM', 'MR', 'MC', 'MC', 'ML', 'ST'] },
  { name: '4-3-1-2', slots: ['GK', 'DR', 'DC', 'DC', 'DL', 'DM', 'MC', 'MC', 'AMC', 'ST', 'ST'] },
  { name: '3-5-2', slots: ['GK', 'DC', 'DC', 'DC', 'WBR', 'MC', 'MC', 'MC', 'WBL', 'ST', 'ST'] },
  { name: '3-4-3', slots: ['GK', 'DC', 'DC', 'DC', 'WBR', 'MC', 'MC', 'WBL', 'AMR', 'AML', 'ST'] },
  { name: '5-3-2', slots: ['GK', 'DR', 'DC', 'DC', 'DC', 'DL', 'MC', 'MC', 'MC', 'ST', 'ST'] },
  { name: '4-5-1', slots: ['GK', 'DR', 'DC', 'DC', 'DL', 'MR', 'MC', 'MC', 'MC', 'ML', 'ST'] },
  { name: '4-2-2-2', slots: ['GK', 'DR', 'DC', 'DC', 'DL', 'DM', 'DM', 'AMR', 'AML', 'ST', 'ST'] },
  { name: '5-4-1', slots: ['GK', 'DR', 'DC', 'DC', 'DC', 'DL', 'MR', 'MC', 'MC', 'ML', 'ST'] },
];

export function formationByName(name: string): Formation {
  return FORMATIONS.find((f) => f.name === name) ?? FORMATIONS[0];
}

/** Roles that make sense in each position, first entry being the sensible default. */
export const ROLES_BY_POSITION: Record<Position, PlayerRole[]> = {
  GK: ['Goalkeeper', 'Sweeper Keeper'],
  DR: ['Full Back', 'Wing Back'],
  DL: ['Full Back', 'Wing Back'],
  DC: ['Centre Back', 'Ball Playing Defender', 'Stopper'],
  WBR: ['Wing Back', 'Full Back'],
  WBL: ['Wing Back', 'Full Back'],
  DM: ['Anchor Man', 'Deep Lying Playmaker', 'Ball Winner'],
  MC: ['Box to Box', 'Deep Lying Playmaker', 'Advanced Playmaker', 'Ball Winner'],
  MR: ['Winger', 'Wide Playmaker', 'Inside Forward'],
  ML: ['Winger', 'Wide Playmaker', 'Inside Forward'],
  AMC: ['Attacking Midfielder', 'Advanced Playmaker', 'Shadow Striker'],
  AMR: ['Winger', 'Inside Forward', 'Wide Playmaker'],
  AML: ['Winger', 'Inside Forward', 'Wide Playmaker'],
  ST: ['Complete Forward', 'Poacher', 'Target Man', 'Deep Lying Forward', 'Pressing Forward'],
};

export function defaultRole(position: Position): PlayerRole {
  return ROLES_BY_POSITION[position][0];
}

/**
 * Role modifiers applied in the match engine. Each is a multiplier on the contribution a player
 * makes to a phase of play — a Poacher adds almost nothing to build-up but is lethal in the box.
 */
export interface RoleProfile {
  defending: number;
  buildUp: number;
  creation: number;
  finishing: number;
  width: number;
  /** How far up the pitch the role naturally operates, -1 (deeper) to +1 (higher). */
  advance: number;
}

export const ROLE_PROFILES: Record<PlayerRole, RoleProfile> = {
  'Goalkeeper': { defending: 1, buildUp: 0.5, creation: 0.1, finishing: 0, width: 0, advance: 0 },
  'Sweeper Keeper': { defending: 1.05, buildUp: 0.9, creation: 0.2, finishing: 0, width: 0, advance: 0.15 },
  'Full Back': { defending: 1, buildUp: 0.8, creation: 0.5, finishing: 0.15, width: 0.7, advance: 0 },
  'Wing Back': { defending: 0.8, buildUp: 0.9, creation: 0.8, finishing: 0.3, width: 1.1, advance: 0.45 },
  'Centre Back': { defending: 1.15, buildUp: 0.6, creation: 0.15, finishing: 0.2, width: 0, advance: -0.1 },
  'Ball Playing Defender': { defending: 1, buildUp: 1.1, creation: 0.45, finishing: 0.2, width: 0, advance: 0 },
  'Stopper': { defending: 1.2, buildUp: 0.5, creation: 0.1, finishing: 0.25, width: 0, advance: 0.1 },
  'Anchor Man': { defending: 1.2, buildUp: 0.8, creation: 0.3, finishing: 0.1, width: 0, advance: -0.2 },
  'Deep Lying Playmaker': { defending: 0.85, buildUp: 1.3, creation: 1.0, finishing: 0.2, width: 0, advance: -0.05 },
  'Box to Box': { defending: 0.95, buildUp: 1.0, creation: 0.8, finishing: 0.65, width: 0.2, advance: 0.25 },
  'Ball Winner': { defending: 1.25, buildUp: 0.7, creation: 0.35, finishing: 0.15, width: 0, advance: 0 },
  'Advanced Playmaker': { defending: 0.6, buildUp: 1.05, creation: 1.35, finishing: 0.6, width: 0.2, advance: 0.4 },
  'Winger': { defending: 0.5, buildUp: 0.7, creation: 1.1, finishing: 0.55, width: 1.3, advance: 0.5 },
  'Inside Forward': { defending: 0.4, buildUp: 0.7, creation: 0.9, finishing: 1.0, width: 0.6, advance: 0.65 },
  'Wide Playmaker': { defending: 0.55, buildUp: 1.0, creation: 1.25, finishing: 0.4, width: 1.0, advance: 0.35 },
  'Attacking Midfielder': { defending: 0.45, buildUp: 0.9, creation: 1.25, finishing: 0.8, width: 0.2, advance: 0.55 },
  'Shadow Striker': { defending: 0.35, buildUp: 0.7, creation: 0.85, finishing: 1.15, width: 0.1, advance: 0.75 },
  'Target Man': { defending: 0.4, buildUp: 0.9, creation: 0.6, finishing: 1.05, width: 0, advance: 0.8 },
  'Poacher': { defending: 0.15, buildUp: 0.3, creation: 0.35, finishing: 1.4, width: 0, advance: 0.95 },
  'Complete Forward': { defending: 0.4, buildUp: 0.85, creation: 0.85, finishing: 1.25, width: 0.2, advance: 0.8 },
  'Deep Lying Forward': { defending: 0.5, buildUp: 1.1, creation: 1.05, finishing: 0.9, width: 0.1, advance: 0.55 },
  'Pressing Forward': { defending: 0.85, buildUp: 0.7, creation: 0.6, finishing: 1.0, width: 0.2, advance: 0.85 },
};

export function emptySlot(position: Position): TacticSlot {
  return {
    position,
    playerId: null,
    role: defaultRole(position),
    instructions: {
      forwardRuns: 'Mixed',
      runWithBall: 'Mixed',
      longShots: 'Mixed',
      crossBall: 'Mixed',
      throughBalls: 'Mixed',
      tackling: 'Normal',
    },
  };
}

export function defaultTactics(formationName = '4-4-2'): Tactics {
  const formation = formationByName(formationName);
  return {
    formationName: formation.name,
    slots: formation.slots.map(emptySlot),
    bench: Array(7).fill(null),
    mentality: 'Balanced',
    tempo: 'Normal',
    width: 'Normal',
    passingStyle: 'Mixed',
    pressing: 'Standard',
    marking: 'Zonal',
    tackling: 'Normal',
    defensiveLine: 'Normal',
    timeWasting: 5,
    counterAttack: true,
    offsideTrap: false,
    setPieces: {
      penalties: null, freeKicks: null, corners: null, longThrows: null,
      captain: null, viceCaptain: null,
    },
  };
}

/** Swap the formation while keeping as many players in sensible places as possible. */
export function changeFormation(tactics: Tactics, formationName: string): Tactics {
  const formation = formationByName(formationName);
  const available = tactics.slots.map((s) => s.playerId).filter((id): id is string => Boolean(id));
  const oldByPosition = new Map<Position, string[]>();
  for (const slot of tactics.slots) {
    if (!slot.playerId) continue;
    const list = oldByPosition.get(slot.position) ?? [];
    list.push(slot.playerId);
    oldByPosition.set(slot.position, list);
  }

  const used = new Set<string>();
  const slots = formation.slots.map((position) => {
    const slot = emptySlot(position);
    // Prefer somebody who was already playing in this exact position.
    const candidates = oldByPosition.get(position) ?? [];
    const match = candidates.find((id) => !used.has(id));
    if (match) {
      slot.playerId = match;
      used.add(match);
    }
    return slot;
  });

  // Fill any gaps with whoever's left, in the order they were previously listed.
  for (const slot of slots) {
    if (slot.playerId) continue;
    const next = available.find((id) => !used.has(id));
    if (next) {
      slot.playerId = next;
      used.add(next);
    }
  }

  return { ...tactics, formationName: formation.name, slots };
}

/** Mentality as a numeric bias: negative is cautious, positive is gung-ho. */
export function mentalityValue(tactics: Tactics): number {
  switch (tactics.mentality) {
    case 'Defensive': return -0.35;
    case 'Counter': return -0.15;
    case 'Balanced': return 0;
    case 'Attacking': return 0.2;
    case 'Overload': return 0.4;
  }
}
