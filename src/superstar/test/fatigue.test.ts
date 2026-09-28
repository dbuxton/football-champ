/**
 * Sprint fatigue: the kid can only sprint for a few seconds; run the bar empty and they're tired,
 * unable to sprint again until it has refilled to half. It refills faster standing or walking
 * than running.
 */

import { describe, it, expect } from 'vitest';
import { STARTING_ATTRIBUTES } from '../engine/career';
import { lineUp } from '../engine/lineup';
import { createMatch, stepMatch } from '../engine/match/sim';
import { TIRED_UNTIL } from '../engine/match/tuning';
import type { Input, MatchState } from '../engine/match/types';

function match(): MatchState {
  const s = createMatch(
    lineUp({
      seed: 3,
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
  return s;
}

const sprint: Input = { x: 0, y: 1, sprint: true, pass: false, shoot: false };
const jog: Input = { x: 0, y: 1, sprint: false, pass: false, shoot: false };
const rest: Input = { x: 0, y: 0, sprint: false, pass: false, shoot: false };

/** Seconds of `input` until `until` is true (up to a minute). */
function secondsUntil(s: MatchState, input: (s: MatchState) => Input, until: (s: MatchState) => boolean): number {
  for (let f = 0; f < 60 * 60; f++) {
    if (until(s)) return f / 60;
    // Run up and down the touchline, so the kid never reaches the edge of the pitch.
    const i = input(s);
    const kid = s.agents[s.humanId];
    stepMatch(s, { ...i, y: kid.y > 60 ? -Math.abs(i.y) : kid.y < 8 ? Math.abs(i.y) : i.y });
  }
  return Infinity;
}

const kid = (s: MatchState) => s.agents[s.humanId];

describe('sprint fatigue', () => {
  it('lets the kid sprint for a few seconds, then they are tired', () => {
    const s = match();
    const t = secondsUntil(s, () => sprint, (m) => kid(m).tired);
    expect(t).toBeGreaterThan(3);
    expect(t).toBeLessThan(7);
    expect(kid(s).energy).toBeLessThan(0.05);
  });

  it("won't let a tired kid sprint until the bar is back to half", () => {
    const s = match();
    secondsUntil(s, () => sprint, (m) => kid(m).tired);
    // Keep holding sprint: no faster than a jog while tired.
    for (let f = 0; f < 30; f++) stepMatch(s, sprint);
    const jogSpeed = kid(s).maxSpeed;
    expect(Math.hypot(kid(s).vx, kid(s).vy)).toBeLessThanOrEqual(jogSpeed + 0.01);
    const t = secondsUntil(s, () => sprint, (m) => !kid(m).tired);
    expect(kid(s).energy).toBeGreaterThanOrEqual(TIRED_UNTIL - 0.01);
    expect(t).toBeGreaterThan(2);
  });

  it('gets its breath back faster standing still than running', () => {
    const resting = match();
    secondsUntil(resting, () => sprint, (m) => kid(m).tired);
    const restT = secondsUntil(resting, () => rest, (m) => !kid(m).tired);
    const jogging = match();
    secondsUntil(jogging, () => sprint, (m) => kid(m).tired);
    const jogT = secondsUntil(jogging, () => jog, (m) => !kid(m).tired);
    expect(restT).toBeLessThan(jogT);
  });

  it('a fitter kid can sprint for longer', () => {
    const fit = match();
    kid(fit).skills.stamina = 0.95;
    const unfit = match();
    kid(unfit).skills.stamina = 0.3;
    const fitT = secondsUntil(fit, () => sprint, (m) => kid(m).tired);
    const unfitT = secondsUntil(unfit, () => sprint, (m) => kid(m).tired);
    expect(fitT).toBeGreaterThan(unfitT);
  });
});
