/**
 * Save round-trip: the thing that must never break, because breaking it costs somebody a career.
 */

import { describe, it, expect } from 'vitest';
import { createNewGame } from '../engine/generate';
import { advance } from '../game/loop';
import { compress, decompress, byteSize } from '../game/compress';
import { migrate } from '../game/save';
import { GameState } from '../engine/gamestate';

function play(state: GameState, iterations: number): void {
  state.autoPlayMatches = true;
  for (let i = 0; i < iterations; i++) {
    const result = advance(state, 200);
    if (result.stop.kind === 'season-end' || result.stop.kind === 'sacked') break;
  }
}

describe('saving', () => {
  it('round-trips a real game state through compression', () => {
    const state = createNewGame({
      seed: 555, managerFirstName: 'Save', managerLastName: 'Test',
      managerNationality: 'England', managerBackground: 'Professional Footballer',
      difficulty: 'Easy', preferredFormation: '4-4-2', startDate: '2026-07-01',
    });
    play(state, 20);

    const json = JSON.stringify(state);
    const packed = compress(json);
    const restored = JSON.parse(decompress(packed)) as GameState;

    expect(restored.date).toBe(state.date);
    expect(restored.manager.clubId).toBe(state.manager.clubId);
    expect(Object.keys(restored.players)).toHaveLength(Object.keys(state.players).length);
    expect(restored.fixtures).toHaveLength(state.fixtures.length);
    // Deep equality is the real test.
    expect(JSON.stringify(restored)).toBe(json);

    console.log(
      `Save: ${(byteSize(json) / 1024 / 1024).toFixed(2)}MB raw, ` +
      `${(byteSize(packed) / 1024 / 1024).toFixed(2)}MB packed ` +
      `(${((packed.length / json.length) * 100).toFixed(0)}%)`,
    );
    // Must fit inside a typical 5MB localStorage quota.
    expect(byteSize(packed)).toBeLessThan(5 * 1024 * 1024);
  }, 180_000);

  it('migrate fills in defaults for a save missing newer fields', () => {
    const state = createNewGame({
      seed: 1, managerFirstName: 'A', managerLastName: 'B',
      managerNationality: 'England', managerBackground: 'Professional Footballer',
      difficulty: 'Normal', preferredFormation: '4-4-2', startDate: '2026-07-01',
    });
    const stripped = JSON.parse(JSON.stringify(state)) as Partial<GameState>;
    delete stripped.shortlist;
    delete stripped.scoutReports;
    delete stripped.boardRequests;
    delete stripped.parachuteYears;
    delete stripped.training;
    delete stripped.pendingStop;

    const migrated = migrate(stripped as GameState);
    expect(migrated.shortlist).toEqual([]);
    expect(migrated.scoutReports).toEqual([]);
    expect(migrated.boardRequests).toEqual([]);
    expect(migrated.training.schedule).toBe('Balanced');
    expect(migrated.pendingStop.kind).toBe('none');
  });
});
