/**
 * The match engine, played headlessly with the robot kid: the same seed replays the same match,
 * every match finishes cleanly (no NaN runaway), goals come at a sensible rate, and a better kid
 * does better. Short halves keep it quick; the numbers here are properties, not tuned values.
 */

import { describe, it, expect } from 'vitest';
import { lineUp } from '../engine/lineup';
import { makeBot } from '../engine/match/bot';
import { createMatch, stepMatch } from '../engine/match/sim';
import type { MatchState } from '../engine/match/types';
import { matchRating } from '../engine/rating';
import { STARTING_ATTRIBUTES } from '../engine/career';
import { playMatch } from './helpers';

const finite = (s: MatchState) =>
  [s.ball.x, s.ball.y, s.ball.z, s.ball.vx, s.ball.vy, s.ball.vz].every(Number.isFinite) &&
  s.agents.every((a) => [a.x, a.y, a.vx, a.vy].every(Number.isFinite));

const kidRating = (s: MatchState) =>
  matchRating({ stats: s.stats[s.humanId], position: 'striker', goalsFor: s.score[0], goalsAgainst: s.score[1], halfSeconds: s.setup.halfSeconds });

describe('line-up', () => {
  it('puts the kid in their slot, eleven a side', () => {
    const setup = lineUp({
      seed: 1,
      clubId: 'ars',
      opponentId: 'bur',
      home: false,
      footballer: { name: 'Robin', number: 9, position: 'winger', attributes: { ...STARTING_ATTRIBUTES.winger } },
      difficulty: 'easy',
      halfSeconds: 20,
    });
    expect(setup.teams[0].clubId).toBe('ars');
    expect(setup.teams[1].clubId).toBe('bur');
    expect(setup.homeSide).toBe(1);
    for (const team of setup.teams) expect(team.players).toHaveLength(11);
    expect(setup.teams[0].players.filter((p) => p.human)).toHaveLength(1);
    expect(setup.teams[0].players[setup.humanSlot].human).toBe(true);
    // Nobody else in the kid's team wears the kid's number.
    expect(setup.teams[0].players.filter((p) => p.number === 9)).toHaveLength(1);
    const s = createMatch(setup);
    expect(s.agents).toHaveLength(22);
    expect(s.agents[s.humanId].human).toBe(true);
  });
});

describe('the match engine', () => {
  it('replays exactly from the same seed and the same buttons', () => {
    const a = playMatch({ seed: 4242, halfSeconds: 20, botSkill: 0.6 });
    const b = playMatch({ seed: 4242, halfSeconds: 20, botSkill: 0.6 });
    expect(b.score).toEqual(a.score);
    expect(b.events).toEqual(a.events);
    expect(b.frame).toBe(a.frame);
    expect(b.agents.map((x) => [x.x, x.y])).toEqual(a.agents.map((x) => [x.x, x.y]));
    expect([b.ball.x, b.ball.y]).toEqual([a.ball.x, a.ball.y]);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });

  it('plays a different match from a different seed', () => {
    const a = playMatch({ seed: 1, halfSeconds: 20 });
    const b = playMatch({ seed: 2, halfSeconds: 20 });
    expect(JSON.stringify(b.events) === JSON.stringify(a.events) && b.frame === a.frame).toBe(false);
  });

  it('always reaches full time with nothing gone to NaN', () => {
    const cases = [
      { seed: 11, clubId: 'mci', opponentId: 'bur', difficulty: 'hard' as const, position: 'defender' as const, botSkill: 0.2 },
      { seed: 12, clubId: 'bur', opponentId: 'mci', difficulty: 'easy' as const, position: 'winger' as const, botSkill: 0.9, home: false },
      { seed: 13, clubId: 'new', opponentId: 'ful', difficulty: 'medium' as const, position: 'midfielder' as const, botSkill: 0.5 },
    ];
    for (const c of cases) {
      const setup = lineUp({
        seed: c.seed,
        clubId: c.clubId,
        opponentId: c.opponentId,
        home: c.home ?? true,
        footballer: { name: 'Robin', number: 7, position: c.position, attributes: { ...STARTING_ATTRIBUTES[c.position] } },
        difficulty: c.difficulty,
        halfSeconds: 20,
      });
      const s = createMatch(setup);
      const bot = makeBot(c.botSkill, c.seed);
      let guard = 0;
      let checkedEveryFrame = true;
      while (s.phase !== 'fulltime' && guard++ < 60 * 600) {
        stepMatch(s, bot(s));
        if (!finite(s)) checkedEveryFrame = false;
      }
      expect(s.phase, `match ${c.seed}`).toBe('fulltime');
      expect(checkedEveryFrame, `match ${c.seed} went non-finite`).toBe(true);
      expect(s.half).toBe(2);
      expect(s.events.some((e) => e.kind === 'half-time')).toBe(true);
      expect(s.events.some((e) => e.kind === 'full-time')).toBe(true);
      // The score agrees with the goals in the event list.
      const goals = s.events.filter((e) => e.kind === 'goal' || e.kind === 'own-goal');
      expect(goals.filter((e) => e.side === 0)).toHaveLength(s.score[0]);
      expect(goals.filter((e) => e.side === 1)).toHaveLength(s.score[1]);
      // Stepping after full time changes nothing.
      const frozen = JSON.stringify(s);
      stepMatch(s, bot(s));
      expect(JSON.stringify(s)).toBe(frozen);
    }
  });

  it('scores goals at a sensible rate', () => {
    let goals = 0;
    let shots = 0;
    const n = 6;
    for (let i = 0; i < n; i++) {
      const s = playMatch({ seed: 700 + i, halfSeconds: 40, botSkill: 0.5 });
      goals += s.score[0] + s.score[1];
      shots += s.stats.reduce((sum, st) => sum + st.shots, 0);
    }
    // Forty-second halves are short: some goals, but nothing silly.
    expect(goals).toBeGreaterThan(0);
    expect(goals / n).toBeLessThan(6);
    expect(shots).toBeGreaterThan(goals);
  });

  it('a better robot kid does better than a worse one', () => {
    // Short matches are streaky (an eager beginner's long shots can go in), so this plays enough
    // of them for skill to show, and leans on the match rating, which is what careers run on.
    const n = 14;
    const tally = (skill: number) => {
      let kidGoals = 0;
      let goalDiff = 0;
      let rating = 0;
      for (let i = 0; i < n; i++) {
        const s = playMatch({ seed: 500 + i, halfSeconds: 40, botSkill: skill, botSeed: 500 + i });
        kidGoals += s.stats[s.humanId].goals;
        goalDiff += s.score[0] - s.score[1];
        rating += kidRating(s);
      }
      return { kidGoals, goalDiff, rating: rating / n };
    };
    const weak = tally(0.15);
    const strong = tally(0.85);
    expect(strong.rating).toBeGreaterThan(weak.rating + 0.3);
    expect(strong.kidGoals).toBeGreaterThanOrEqual(weak.kidGoals);
    expect(strong.goalDiff).toBeGreaterThanOrEqual(weak.goalDiff);
  });
});
