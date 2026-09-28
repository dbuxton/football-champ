/**
 * Who a goal belongs to. A shot that goes in off the keeper (a save that isn't quite enough) or off
 * a defender who blocked it is the shooter's goal, not an own goal.
 */

import { describe, it, expect } from 'vitest';
import { STARTING_ATTRIBUTES } from '../engine/career';
import { lineUp } from '../engine/lineup';
import { createMatch, stepMatch } from '../engine/match/sim';
import { NO_INPUT, type MatchState } from '../engine/match/types';
import { LENGTH, MID_Y } from '../engine/pitch';

function match(): MatchState {
  const s = createMatch(
    lineUp({
      seed: 5,
      clubId: 'bha',
      opponentId: 'eve',
      home: true,
      footballer: { name: 'Robin', number: 9, position: 'striker', attributes: { ...STARTING_ATTRIBUTES.striker } },
      difficulty: 'medium',
      halfSeconds: 600,
    }),
  );
  s.phase = 'play';
  s.grace = 0;
  // Everyone well away from the goal, so nobody touches the ball on its way in.
  for (const a of s.agents) {
    a.x = 50;
    a.kickCd = 1;
  }
  return s;
}

/** The ball trickling over Everton's goal line, last touched by `lastId`. */
function trickleIn(s: MatchState, lastId: number): void {
  Object.assign(s.ball, { x: LENGTH - 1, y: MID_Y, z: 0, vx: 6, vy: 0, vz: 0, owner: -1, last: lastId, pass: null, shot: null });
  for (let f = 0; f < 30 && s.phase === 'play'; f++) stepMatch(s, NO_INPUT);
}

const keeperOf = (s: MatchState, side: 0 | 1) => s.agents.find((a) => a.side === side && a.keeper)!;

describe('who scored', () => {
  it("gives the kid the goal when their shot goes in off the keeper's hands", () => {
    const s = match();
    const kid = s.agents[s.humanId];
    // The keeper got a hand to the kid's shot, but not enough.
    s.ball.deflected = { by: kid.id, counted: true };
    trickleIn(s, keeperOf(s, 1).id);
    const goal = s.events.find((e) => e.kind === 'goal' || e.kind === 'own-goal');
    expect(goal?.kind).toBe('goal');
    expect(goal?.agent).toBe(kid.id);
    expect(s.stats[kid.id].goals).toBe(1);
  });

  it('still calls it an own goal when a defender puts it in with nobody shooting', () => {
    const s = match();
    const defender = s.agents.find((a) => a.side === 1 && a.role === 'CB')!;
    trickleIn(s, defender.id);
    const goal = s.events.find((e) => e.kind === 'goal' || e.kind === 'own-goal');
    expect(goal?.kind).toBe('own-goal');
    expect(goal?.side).toBe(0);
  });

  it('forgets the shot once somebody else plays the ball', () => {
    const s = match();
    const kid = s.agents[s.humanId];
    s.ball.deflected = { by: kid.id, counted: true };
    // A defender picks it up and then knocks it into his own net: that one is an own goal.
    const defender = s.agents.find((a) => a.side === 1 && a.role === 'CB')!;
    defender.x = LENGTH - 3;
    defender.y = MID_Y;
    defender.kickCd = 0;
    Object.assign(s.ball, { x: LENGTH - 3, y: MID_Y, z: 0, vx: 0, vy: 0, vz: 0, owner: -1 });
    stepMatch(s, NO_INPUT);
    expect(s.ball.deflected).toBeNull();
  });
});
