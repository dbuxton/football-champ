/**
 * The match rating out of 10: always in range, goes the right way with goals, assists and the
 * result, and is always described kindly. Weights are being tuned, so only directions are checked.
 */

import { describe, it, expect } from 'vitest';
import { colourDistance } from '../data/colour';
import { PLAYER_POSITIONS } from '../engine/formation';
import { emptyStats, type PlayerStats } from '../engine/match/types';
import { MAX_RATING, MIN_RATING, STANDARD_HALF_SECONDS, lengthScale, matchRating, ratingColour, ratingWord } from '../engine/rating';

const stats = (over: Partial<PlayerStats> = {}): PlayerStats => ({
  ...emptyStats(),
  touches: 20,
  passes: 10,
  passesDone: 8,
  ...over,
});

const everyRating = () => Array.from({ length: 121 }, (_, i) => i / 10 - 1); // -1 … 11

describe('match rating', () => {
  it('stays within MIN_RATING..MAX_RATING, even for absurd stats', () => {
    const extremes: PlayerStats[] = [
      emptyStats(),
      stats({ touches: 0, passes: 500, passesDone: 0, dispossessed: 500 }),
      stats({ goals: 50, assists: 50, onTarget: 60, keyPasses: 99, tacklesWon: 99, interceptions: 99, passesDone: 999, passes: 999 }),
      stats({ goals: -5, assists: -5, dispossessed: -10 }),
    ];
    for (const position of PLAYER_POSITIONS) {
      for (const s of extremes) {
        for (const [gf, ga] of [[0, 0], [0, 12], [12, 0], [5, 5]]) {
          const r = matchRating({ stats: s, position, goalsFor: gf, goalsAgainst: ga });
          expect(Number.isFinite(r)).toBe(true);
          expect(r).toBeGreaterThanOrEqual(MIN_RATING);
          expect(r).toBeLessThanOrEqual(MAX_RATING);
        }
      }
    }
  });

  it('goes up with every goal, until it hits the top', () => {
    for (const position of PLAYER_POSITIONS) {
      let previous = -Infinity;
      for (let goals = 0; goals <= 6; goals++) {
        const r = matchRating({ stats: stats({ goals, shots: goals, onTarget: goals }), position, goalsFor: goals, goalsAgainst: 0 });
        if (previous < MAX_RATING) expect(r, `${position} ${goals} goals`).toBeGreaterThan(previous);
        else expect(r).toBe(MAX_RATING);
        previous = r;
      }
    }
  });

  it('goes up with assists', () => {
    for (const position of PLAYER_POSITIONS) {
      const none = matchRating({ stats: stats(), position, goalsFor: 1, goalsAgainst: 1 });
      const one = matchRating({ stats: stats({ assists: 1 }), position, goalsFor: 1, goalsAgainst: 1 });
      const two = matchRating({ stats: stats({ assists: 2 }), position, goalsFor: 1, goalsAgainst: 1 });
      expect(one).toBeGreaterThan(none);
      expect(two).toBeGreaterThan(one);
    }
  });

  it('rates a loss lower than a draw, and a draw lower than a win, for the same stats', () => {
    for (const position of PLAYER_POSITIONS) {
      for (const s of [stats(), stats({ goals: 1, onTarget: 1 }), stats({ tacklesWon: 3 })]) {
        const win = matchRating({ stats: s, position, goalsFor: 2, goalsAgainst: 1 });
        const draw = matchRating({ stats: s, position, goalsFor: 1, goalsAgainst: 1 });
        const loss = matchRating({ stats: s, position, goalsFor: 1, goalsAgainst: 2 });
        expect(loss).toBeLessThan(win);
        expect(loss).toBeLessThanOrEqual(draw);
        expect(draw).toBeLessThanOrEqual(win);
      }
    }
  });

  it('is rounded to one decimal place', () => {
    const r = matchRating({ stats: stats({ goals: 1, assists: 1, keyPasses: 3 }), position: 'winger', goalsFor: 3, goalsAgainst: 2 });
    expect(Math.round(r * 10) / 10).toBe(r);
  });
});

describe('rating words and colours', () => {
  it('never uses a harsh word', () => {
    const harsh = /bad|wrong|terrible|poor|awful|rubbish|fail/i;
    for (const r of everyRating()) {
      const word = ratingWord(r);
      expect(word.length).toBeGreaterThan(0);
      expect(word).not.toMatch(harsh);
    }
  });

  it('gets no less enthusiastic as the rating goes up', () => {
    const words = everyRating().map(ratingWord);
    const order = [...new Set(words)];
    // Each word covers one unbroken band of ratings.
    const firsts = order.map((w) => words.indexOf(w));
    const lasts = order.map((w) => words.lastIndexOf(w));
    for (let i = 1; i < order.length; i++) expect(firsts[i]).toBeGreaterThan(lasts[i - 1]);
  });

  it('never paints a rating red', () => {
    for (const r of everyRating()) {
      const colour = ratingColour(r);
      expect(colour).toMatch(/^#[0-9a-f]{6}$/i);
      expect(colourDistance(colour, '#ff0000')).toBeGreaterThan(150);
    }
  });

  it('counts what you did per standard-length match, so longer matches are not an easy route up', () => {
    const busy = stats({ goals: 2, assists: 1, onTarget: 3, tacklesWon: 2 });
    const rate = (halfSeconds?: number) => matchRating({ stats: busy, position: 'striker', goalsFor: 2, goalsAgainst: 1, halfSeconds });
    expect(rate(STANDARD_HALF_SECONDS)).toBe(rate());
    expect(rate(90)).toBeGreaterThan(rate(120));
    expect(rate(180)).toBeLessThan(rate(120));
    // Tiny test matches and silly lengths are only scaled so far.
    expect(lengthScale(6)).toBe(lengthScale(1));
    expect(lengthScale(10_000)).toBe(lengthScale(100_000));
    expect(lengthScale(0)).toBe(1);
  });
});
