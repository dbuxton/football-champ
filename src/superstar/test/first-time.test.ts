/**
 * First-time shots: without the ball, holding shoot gets the kid ready to strike the ball the
 * moment it arrives (a corner, a cross, a pass, a rebound), at their feet or at head height. It
 * only means a slide tackle when the other team has the ball.
 */

import { describe, it, expect } from 'vitest';
import { STARTING_ATTRIBUTES } from '../engine/career';
import { lineUp } from '../engine/lineup';
import { createMatch, stepMatch } from '../engine/match/sim';
import { NO_INPUT, type Input, type MatchState } from '../engine/match/types';
import { LENGTH, MID_Y } from '../engine/pitch';

function match(): MatchState {
  const s = createMatch(
    lineUp({
      seed: 8,
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
  // Clear the area: everyone but the kid well away from the action.
  for (const a of s.agents) if (!a.human) a.x = a.side === 0 ? 30 : 40;
  const kid = s.agents[s.humanId];
  kid.x = LENGTH - 12;
  kid.y = MID_Y;
  kid.vx = 0;
  kid.vy = 0;
  return s;
}

const hold: Input = { ...NO_INPUT, shoot: true };

/**
 * A ball from a teammate out wide, arriving at the kid about `height` metres up (it's 6m away,
 * crossing at 8 m/s: thrown up just enough to come down to that height as it arrives).
 */
function crossIn(s: MatchState, height: number): void {
  const kid = s.agents[s.humanId];
  const winger = s.agents.find((a) => a.side === 0 && a.role === 'RM')!;
  const vz = height > 0.9 ? 3.6 : 0;
  Object.assign(s.ball, { x: kid.x - 1.5, y: kid.y + 6, z: height, vx: 2, vy: -8, vz, owner: -1, last: winger.id, pass: null, shot: null });
}

/** Step until the ball is shot, owned or a second has passed. Returns how high the ball was just before. */
function play(s: MatchState, input: Input): number {
  let z = s.ball.z;
  for (let f = 0; f < 60 && !s.ball.shot && s.ball.owner < 0; f++) {
    z = s.ball.z;
    stepMatch(s, input);
  }
  return z;
}

describe('first-time shots', () => {
  it('still slides in when the other team has the ball', () => {
    const s = match();
    const kid = s.agents[s.humanId];
    const opponent = s.agents.find((a) => a.side === 1 && a.role === 'CB')!;
    opponent.x = kid.x + 3;
    opponent.y = kid.y;
    Object.assign(s.ball, { x: opponent.x, y: opponent.y, owner: opponent.id, last: opponent.id });
    stepMatch(s, NO_INPUT);
    stepMatch(s, hold);
    expect(kid.slide).toBeGreaterThan(0);
  });

  it("gets ready instead of sliding when the ball is coming the kid's way", () => {
    const s = match();
    crossIn(s, 0.2);
    stepMatch(s, NO_INPUT);
    stepMatch(s, hold);
    expect(s.agents[s.humanId].slide).toBe(0);
    expect(s.charge).toBeGreaterThanOrEqual(0);
  });

  it('strikes a low cross first time, without stopping it', () => {
    const s = match();
    const kid = s.agents[s.humanId];
    crossIn(s, 0.2);
    stepMatch(s, NO_INPUT);
    play(s, hold);
    expect(s.ball.shot?.by).toBe(kid.id);
    expect(s.ball.owner).toBe(-1);
    // Towards the goal the kid attacks.
    expect(s.ball.vx).toBeGreaterThan(0);
  });

  it('heads a high cross at goal', () => {
    const s = match();
    const kid = s.agents[s.humanId];
    crossIn(s, 1.7);
    stepMatch(s, NO_INPUT);
    const height = play(s, hold);
    expect(height).toBeGreaterThan(1);
    expect(s.ball.shot?.by).toBe(kid.id);
    expect(s.ball.vx).toBeGreaterThan(0);
  });

  it('controls it as usual if shoot was let go before it arrived', () => {
    const s = match();
    const kid = s.agents[s.humanId];
    crossIn(s, 0.2);
    stepMatch(s, NO_INPUT);
    stepMatch(s, hold);
    stepMatch(s, NO_INPUT);
    play(s, NO_INPUT);
    expect(s.ball.owner).toBe(kid.id);
    expect(s.ball.shot).toBeNull();
  });

  it('gives the crosser the assist when a first-time shot goes in', () => {
    const s = match();
    const kid = s.agents[s.humanId];
    const winger = s.agents.find((a) => a.side === 0 && a.role === 'RM')!;
    crossIn(s, 0.2);
    stepMatch(s, NO_INPUT);
    play(s, hold);
    expect(kid.receivedFrom).toBe(winger.id);
  });

  it('works when shoot was already held while the corner was being set up', () => {
    const s = match();
    const kid = s.agents[s.humanId];
    s.phase = 'restart';
    stepMatch(s, hold);
    s.phase = 'play';
    crossIn(s, 0.2);
    play(s, hold);
    expect(s.ball.shot?.by).toBe(kid.id);
  });
});
