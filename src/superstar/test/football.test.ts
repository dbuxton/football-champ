/**
 * Does it look like football? Set-up moments on the pitch, checking what the computer players
 * decide: the defender in front of an attack steps out to meet it, somebody chases back, strikers
 * (the kid included) are marked from the goal side, the back line moves together, and passes go
 * into the space in front of a runner rather than to where they were standing.
 */

import { describe, it, expect } from 'vitest';
import { lineUp } from '../engine/lineup';
import { leadPoint } from '../engine/match/actions';
import { planRuns, updateChasers } from '../engine/match/ai';
import { createMatch, stepMatch } from '../engine/match/sim';
import { DIFFICULTY, DT, MARK_TIGHT } from '../engine/match/tuning';
import { NO_INPUT, type Agent, type MatchState } from '../engine/match/types';
import { LENGTH, MID_Y, dist } from '../engine/pitch';
import { STARTING_ATTRIBUTES } from '../engine/career';

/** A match in open play, everyone standing still where they'd kick off. */
function scene(): MatchState {
  const s = createMatch(
    lineUp({
      seed: 11,
      clubId: 'bha',
      opponentId: 'eve',
      home: true,
      footballer: { name: 'Robin', number: 9, position: 'striker', attributes: { ...STARTING_ATTRIBUTES.striker } },
      difficulty: 'medium',
      halfSeconds: 60,
    }),
  );
  s.phase = 'play';
  s.grace = 0;
  s.restart = null;
  for (const a of s.agents) {
    a.vx = 0;
    a.vy = 0;
    a.kickCd = 0;
  }
  return s;
}

function place(a: Agent, x: number, y: number, vx = 0, vy = 0): void {
  a.x = x;
  a.y = y;
  a.vx = vx;
  a.vy = vy;
}

function giveTo(s: MatchState, a: Agent): void {
  s.ball.owner = a.id;
  s.ball.last = a.id;
  s.ball.x = a.x;
  s.ball.y = a.y;
  s.ball.vx = 0;
  s.ball.vy = 0;
}

const bySlot = (s: MatchState, side: 0 | 1, slot: number) => s.agents.find((a) => a.side === side && a.slot === slot)!;
const think = (s: MatchState) => {
  updateChasers(s);
  planRuns(s, DT);
};

/** The goal Everton (side 1) defend: the kid's side always attacks the right-hand goal. */
const GOAL_X = LENGTH;

describe('defending', () => {
  /**
   * One of our midfielders runs at the Everton defence, 25m out. An Everton midfielder is
   * trailing 4m behind him; an Everton centre back is 7m in front, between him and the goal.
   */
  function attack(): { s: MatchState; carrier: Agent; centreBack: Agent; trailing: Agent } {
    const s = scene();
    const carrier = bySlot(s, 0, 6);
    place(carrier, GOAL_X - 25, MID_Y, 6, 0);
    giveTo(s, carrier);
    const centreBack = bySlot(s, 1, 3);
    place(centreBack, GOAL_X - 18, MID_Y + 2);
    const trailing = bySlot(s, 1, 7);
    place(trailing, GOAL_X - 29, MID_Y - 1);
    return { s, carrier, centreBack, trailing };
  }

  it('the defender in front of an attack steps out to meet it', () => {
    const { s, carrier, centreBack } = attack();
    think(s);
    // Heading for the carrier, from the goal side.
    expect(dist(centreBack.tx, centreBack.ty, carrier.x, carrier.y)).toBeLessThan(3.5);
    expect(centreBack.tx).toBeGreaterThan(carrier.x);
  });

  it('a player caught behind the ball chases back to get goal-side of it again', () => {
    const { s, carrier, trailing } = attack();
    think(s);
    // Back past the carrier, towards goal, rather than lunging in from behind.
    expect(trailing.tx).toBeGreaterThan(carrier.x);
    expect(dist(trailing.tx, trailing.ty, carrier.x, carrier.y)).toBeLessThan(8);
  });

  it('marks the kid from the goal side when the kid is in the box without the ball', () => {
    const s = scene();
    const carrier = bySlot(s, 0, 7);
    place(carrier, GOAL_X - 35, MID_Y + 10);
    giveTo(s, carrier);
    const kid = s.agents[s.humanId];
    place(kid, GOAL_X - 12, MID_Y - 4);
    think(s);
    // Close, allowing for the room the difficulty gives the kid (and no double-marking).
    const reach = MARK_TIGHT + DIFFICULTY.medium.markSlack + 2;
    const markers = s.agents.filter((a) => a.side === 1 && !a.keeper && dist(a.tx, a.ty, kid.x, kid.y) < reach && a.tx > kid.x);
    expect(markers.length).toBe(1);
  });

  it('marks a striker running in behind where they are going, not where they were', () => {
    const s = scene();
    const carrier = bySlot(s, 0, 7);
    place(carrier, GOAL_X - 40, MID_Y);
    giveTo(s, carrier);
    const runner = bySlot(s, 0, 10);
    place(runner, GOAL_X - 22, MID_Y + 6, 7, 0);
    think(s);
    const marker = s.agents.find((a) => a.side === 1 && !a.keeper && dist(a.tx, a.ty, runner.x, runner.y) < 8 && a.tx > runner.x);
    expect(marker).toBeDefined();
    // Ahead of the runner, along their run.
    expect(marker!.tx).toBeGreaterThan(runner.x + 1);
  });

  it('the back four hold a line instead of scattering', () => {
    const s = scene();
    const carrier = bySlot(s, 0, 7);
    place(carrier, 55, MID_Y);
    giveTo(s, carrier);
    think(s);
    const attackers = s.agents.filter((a) => a.side === 0);
    const back = s.agents.filter(
      (a) => a.side === 1 && (a.role === 'CB' || a.role === 'RB' || a.role === 'LB') && !attackers.some((o) => dist(a.tx, a.ty, o.x, o.y) < 5),
    );
    expect(back.length).toBeGreaterThanOrEqual(2);
    const xs = back.map((a) => a.tx);
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(2.5);
  });
});

describe('passing into space', () => {
  it('plays it to the feet of a teammate standing still', () => {
    const s = scene();
    const passer = bySlot(s, 0, 6);
    const target = bySlot(s, 0, 10);
    place(passer, 40, MID_Y);
    place(target, 55, MID_Y + 8);
    const p = leadPoint(s, passer, target);
    expect(dist(p.x, p.y, target.x, target.y)).toBeLessThan(0.6);
  });

  it('plays it into the space in front of a runner', () => {
    const s = scene();
    for (const o of s.agents.filter((a) => a.side === 1 && !a.keeper)) place(o, 20, o.y);
    const passer = bySlot(s, 0, 6);
    const runner = bySlot(s, 0, 10);
    place(passer, 45, MID_Y);
    place(runner, 60, MID_Y + 8, 7, 0);
    const p = leadPoint(s, passer, runner);
    const ahead = p.x - runner.x;
    expect(ahead).toBeGreaterThan(2);
    expect(ahead).toBeLessThan(16);
    expect(Math.abs(p.y - runner.y)).toBeLessThan(1);
  });

  it("doesn't play it ahead of a runner straight into a defender", () => {
    const s = scene();
    for (const o of s.agents.filter((a) => a.side === 1 && !a.keeper)) place(o, 20, o.y);
    const passer = bySlot(s, 0, 6);
    const runner = bySlot(s, 0, 10);
    place(passer, 45, MID_Y);
    place(runner, 60, MID_Y + 8, 7, 0);
    const open = leadPoint(s, passer, runner);
    place(bySlot(s, 1, 2), 66, MID_Y + 8);
    const blocked = leadPoint(s, passer, runner);
    expect(blocked.x).toBeLessThan(open.x - 1);
    expect(blocked.x).toBeLessThan(64);
  });

  it('leads the kid too, when the kid is running', () => {
    const s = scene();
    for (const o of s.agents.filter((a) => a.side === 1 && !a.keeper)) place(o, 20, o.y);
    const passer = bySlot(s, 0, 6);
    const kid = s.agents[s.humanId];
    place(passer, 45, MID_Y);
    place(kid, 62, MID_Y - 6, 6.5, 0);
    const p = leadPoint(s, passer, kid);
    expect(p.x - kid.x).toBeGreaterThan(2);
  });

  it('plays it where the kid will be, whichever way the kid is running', () => {
    const s = scene();
    for (const o of s.agents.filter((a) => a.side === 1 && !a.keeper)) place(o, 20, o.y);
    const passer = bySlot(s, 0, 6);
    const kid = s.agents[s.humanId];
    place(passer, 45, MID_Y);
    // Running sideways, across the pitch.
    place(kid, 62, MID_Y - 6, 0, 6.5);
    const p = leadPoint(s, passer, kid);
    expect(p.y - kid.y).toBeGreaterThan(2);
    expect(Math.abs(p.x - kid.x)).toBeLessThan(0.5);
  });

  it("never plays it behind a running kid, even with a defender about", () => {
    const s = scene();
    for (const o of s.agents.filter((a) => a.side === 1 && !a.keeper)) place(o, 20, o.y);
    const passer = bySlot(s, 0, 6);
    const kid = s.agents[s.humanId];
    place(passer, 45, MID_Y);
    place(kid, 62, MID_Y - 6, 6.5, 0);
    const open = leadPoint(s, passer, kid);
    place(bySlot(s, 1, 2), 68, MID_Y - 6);
    const marked = leadPoint(s, passer, kid);
    expect(marked.x).toBeCloseTo(open.x, 5);
  });
});

describe("the kid's teammates", () => {
  it("don't just give the kid the ball every time: most of their passes go to others", () => {
    let toKid = 0;
    let passes = 0;
    for (let i = 0; i < 4; i++) {
      // A kid standing still and never calling: the team has to play without them.
      const s = createMatch(
        lineUp({
          seed: 60 + i,
          clubId: 'bha',
          opponentId: 'eve',
          home: true,
          footballer: { name: 'Robin', number: 9, position: 'striker', attributes: { ...STARTING_ATTRIBUTES.striker } },
          difficulty: 'easy',
          halfSeconds: 40,
        }),
      );
      let key = '';
      while (s.phase !== 'fulltime') {
        stepMatch(s, NO_INPUT);
        const p = s.ball.pass;
        const k = p ? `${p.from}>${p.to}@${s.ball.last}` : '';
        if (p && k !== key && s.agents[p.from].side === 0 && p.from !== s.humanId) {
          passes++;
          if (p.to === s.humanId) toKid++;
        }
        key = k;
      }
    }
    expect(passes).toBeGreaterThan(20);
    expect(toKid / passes).toBeLessThan(0.35);
  });
});
