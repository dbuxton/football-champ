/**
 * The staff market. Coaching quality is the single biggest lever on player development, physio
 * quality on recovery, scout quality on information — so the backroom has to be improvable, not
 * just sackable. A rolling pool of free-agent staff keeps the market honest.
 */

import { Rng, clamp, deriveSeed } from './rng';
import { Staff, StaffRole } from './types';
import { GameState, getClub, staffOf } from './gamestate';
import { generateStaff } from './generate';

/**
 * How many of each role a club will carry. Slightly above the complement clubs start with, so
 * there is genuine room to invest in depth — not just swap like for like.
 */
export const ROLE_CAPS: Record<StaffRole, number> = {
  'Assistant Manager': 1,
  Coach: 4,
  'Goalkeeping Coach': 1,
  'Fitness Coach': 1,
  Physio: 3,
  Scout: 4,
  'Head of Youth': 1,
};

const POOL_MIN = 30;
const POOL_MAX = 60;

export function freeAgentStaff(state: GameState): Staff[] {
  return Object.values(state.staff).filter((s) => !s.clubId);
}

/**
 * Keep the free-agent pool stocked, weekly. Quality is spread wide — from journeymen to the
 * occasional genuinely good operator worth fighting the wage demand for.
 */
export function replenishStaffMarket(state: GameState): void {
  const pool = freeAgentStaff(state);
  if (pool.length >= POOL_MIN) {
    // Trim if the pool has somehow ballooned.
    if (pool.length > POOL_MAX) {
      for (const member of pool.slice(POOL_MAX)) delete state.staff[member.id];
    }
    return;
  }

  const rng = new Rng(deriveSeed(state.rngState, `staffmkt:${state.date}`));
  const roles: StaffRole[] = [
    'Assistant Manager', 'Coach', 'Coach', 'Goalkeeping Coach', 'Fitness Coach',
    'Physio', 'Scout', 'Scout', 'Head of Youth',
  ];
  const shortfall = POOL_MIN + rng.int(0, POOL_MAX - POOL_MIN) - pool.length;
  for (let i = 0; i < shortfall; i++) {
    const role = rng.pick(roles);
    // Quality on the club-reputation scale: mostly lower-league, occasionally excellent.
    const quality = clamp(Math.round(rng.gaussian(42, 16)), 12, 92);
    const member = generateStaff(role, quality, null, state.date, rng);
    state.staff[member.id] = member;
  }
}

/**
 * What a free agent wants to join this club. Better staff cost more, and stepping down to a
 * club beneath their standing costs a premium.
 */
export function staffWageDemand(state: GameState, member: Staff): number {
  const club = getClub(state, state.manager.clubId);
  let wage = 300 + member.reputation * 32;
  if (member.reputation > club.reputation + 15) wage *= 1.25;
  return Math.round(wage / 50) * 50;
}

/** Whether the club has room for another member of staff in this role. */
export function roleCapReached(state: GameState, clubId: string, role: StaffRole): boolean {
  const current = staffOf(state, clubId).filter((s) => s.role === role).length;
  return current >= (ROLE_CAPS[role] ?? 1);
}
