/**
 * Difficulty.
 *
 * The brief asks for a game that is biased in the player's favour on Easy and forgiving of
 * obvious mistakes at every level. That bias is concentrated here rather than sprinkled through
 * the engine, so it stays honest and tunable: every number below is a multiplier or an additive
 * nudge applied to the human's club only.
 */

import { Difficulty } from './types';

export interface DifficultySettings {
  /** Multiplier on the human team's chance creation. */
  attackBonus: number;
  /** Multiplier on the human team's defensive solidity. */
  defenceBonus: number;
  /** Additive bonus to shot conversion, in absolute probability. */
  conversionBonus: number;
  /** Multiplier on injury frequency for the human's squad. */
  injuryRate: number;
  /** Multiplier on how fast morale decays. */
  moraleDecay: number;
  /** Multiplier on board patience and confidence recovery. */
  boardPatience: number;
  /** Multiplier on how likely a transfer target is to accept. */
  transferWillingness: number;
  /** Multiplier applied to fees AI clubs demand from the human. */
  transferFeeMultiplier: number;
  /** Multiplier on transfer and wage budgets granted by the board. */
  budgetMultiplier: number;
  /** Multiplier on how aggressively rivals bid for the human's players. */
  poachingAggression: number;
  /** Multiplier on youth intake quality. */
  youthQuality: number;
  /**
   * After this many consecutive league defeats, the engine starts nudging luck back toward the
   * human so a season never death-spirals. 0 disables the guardrail entirely.
   */
  badRunGuardrail: number;
  /** Whether the engine auto-repairs an illegal team sheet before kick-off. */
  autoRepairSelection: boolean;
  /** Whether the last transfer or contract action can be undone within the same day. */
  allowUndo: boolean;
}

export const DIFFICULTY_SETTINGS: Record<Difficulty, DifficultySettings> = {
  Easy: {
    attackBonus: 1.14,
    defenceBonus: 1.12,
    conversionBonus: 0.028,
    injuryRate: 0.6,
    moraleDecay: 0.6,
    boardPatience: 1.9,
    transferWillingness: 1.5,
    transferFeeMultiplier: 0.85,
    budgetMultiplier: 1.35,
    poachingAggression: 0.55,
    youthQuality: 1.2,
    badRunGuardrail: 3,
    autoRepairSelection: true,
    allowUndo: true,
  },
  Normal: {
    attackBonus: 1.04,
    defenceBonus: 1.03,
    conversionBonus: 0.008,
    injuryRate: 0.9,
    moraleDecay: 0.9,
    boardPatience: 1.25,
    transferWillingness: 1.15,
    transferFeeMultiplier: 0.97,
    budgetMultiplier: 1.1,
    poachingAggression: 0.85,
    youthQuality: 1.05,
    badRunGuardrail: 5,
    autoRepairSelection: true,
    allowUndo: true,
  },
  Hard: {
    attackBonus: 1,
    defenceBonus: 1,
    conversionBonus: 0,
    injuryRate: 1,
    moraleDecay: 1,
    boardPatience: 1,
    transferWillingness: 1,
    transferFeeMultiplier: 1.05,
    budgetMultiplier: 1,
    poachingAggression: 1.1,
    youthQuality: 1,
    badRunGuardrail: 0,
    autoRepairSelection: true,
    allowUndo: false,
  },
  Legend: {
    attackBonus: 0.96,
    defenceBonus: 0.96,
    conversionBonus: -0.008,
    injuryRate: 1.15,
    moraleDecay: 1.2,
    boardPatience: 0.75,
    transferWillingness: 0.85,
    transferFeeMultiplier: 1.15,
    budgetMultiplier: 0.9,
    poachingAggression: 1.35,
    youthQuality: 0.95,
    badRunGuardrail: 0,
    autoRepairSelection: false,
    allowUndo: false,
  },
};

export function settingsFor(difficulty: Difficulty): DifficultySettings {
  return DIFFICULTY_SETTINGS[difficulty] ?? DIFFICULTY_SETTINGS.Normal;
}

/**
 * The guardrail: how much extra help the human gets after a run of defeats. Returns a multiplier
 * applied on top of the standard attack bonus, tapering back to 1 as soon as they win again.
 */
export function guardrailBoost(settings: DifficultySettings, consecutiveDefeats: number): number {
  if (settings.badRunGuardrail <= 0) return 1;
  if (consecutiveDefeats < settings.badRunGuardrail) return 1;
  const excess = consecutiveDefeats - settings.badRunGuardrail + 1;
  return 1 + Math.min(excess * 0.05, 0.2);
}
