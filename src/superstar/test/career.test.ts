/**
 * The career rules the whole game hangs on: form, the bars each club sets, who gets moved up or
 * down, the offers, accepting or turning them down, and recording a real match. The bars are being
 * tuned, so these check directions and orderings, not the tuned numbers.
 */

import { describe, it, expect } from 'vitest';
import { CLUBS } from '../data/clubs';
import {
  FORM_MATCHES,
  SETTLE_MATCHES,
  STARTING_AGE,
  STARTING_ATTRIBUTES,
  clubRatings,
  form,
  ladder,
  moveTo,
  newCareer,
  nextMatch,
  offersFor,
  rankOf,
  recordMatch,
  thresholds,
  barsFor,
  trainedBy,
  TRAINED_MAX,
  train,
  trainingCost,
  verdict,
  type Career,
  type Verdict,
} from '../engine/career';
import { MAX_RATING } from '../engine/rating';
import { ROUNDS } from '../engine/season';
import { finishedMatch, makeCareer, withRatings, withScore } from './helpers';

const TOP = CLUBS[0].id;
const BOTTOM = CLUBS[CLUBS.length - 1].id;
const MIDDLE = CLUBS[9].id;

/** A form well clear of the middle: always above the bar to go up, or below the one to go down. */
const HIGH = 10;
const LOW = 4;
const mid = (rank: number) => {
  const { up, down } = thresholds(rank);
  return Math.round(((up + down) / 2) * 10) / 10;
};

describe('a new career', () => {
  it('starts a 17-year-old at their chosen club, round 1 of season 1', () => {
    const c = newCareer({
      id: 'abc',
      name: 'Robin',
      number: 11,
      position: 'winger',
      look: { skin: '#e0ac85', hair: '#4a2c16', hairStyle: 'curly', boots: '#ff4f9a' },
      difficulty: 'easy',
      halfMinutes: 3,
      clubId: 'cry',
      seed: 7,
      today: '2026-01-01',
    });
    expect(c.age).toBe(STARTING_AGE);
    expect(c.clubId).toBe('cry');
    expect(c.season).toBe(1);
    expect(c.round).toBe(1);
    expect(c.points).toBe(0);
    expect(c.attributes).toEqual(STARTING_ATTRIBUTES.winger);
    expect(c.attributes).not.toBe(STARTING_ATTRIBUTES.winger);
    expect(c.matches).toEqual([]);
    expect(c.stints).toEqual([{ clubId: 'cry', season: 1, round: 1, how: 'start', matches: 0, goals: 0, assists: 0, ratingTotal: 0 }]);
    expect(c.cup).toBeNull();
    expect(c.pending).toBeNull();
    expect(form(c)).toBeNull();
    const next = nextMatch(c);
    expect(next?.competition).toBe('league');
    expect(next?.round).toBe(1);
    expect(next?.opponentId).not.toBe('cry');
  });

  it('starts with the ladder in reputation order', () => {
    const c = makeCareer();
    expect(ladder(c).map((club) => club.id)).toEqual(CLUBS.map((club) => club.id));
    expect(rankOf(c, TOP)).toBe(1);
    expect(rankOf(c, BOTTOM)).toBe(CLUBS.length);
  });

  it('plays every other club once in the season', () => {
    let c = makeCareer();
    const opponents = new Set<string>();
    for (let round = 1; round <= ROUNDS; round++) {
      c = { ...c, round };
      const next = nextMatch(c)!;
      expect(next.round).toBe(round);
      opponents.add(next.opponentId);
    }
    expect(opponents.size).toBe(CLUBS.length - 1);
    expect(opponents.has(c.clubId)).toBe(false);
    expect(nextMatch({ ...c, round: ROUNDS + 1 })).toBeNull();
  });
});

describe('form', () => {
  it(`averages the last ${FORM_MATCHES} ratings`, () => {
    const c = withRatings(makeCareer(), [9, 9, 9, 5, 6, 7]);
    expect(clubRatings(c)).toEqual([9, 9, 9, 5, 6, 7]);
    expect(form(c)).toBeCloseTo(6, 5);
    expect(form(withRatings(makeCareer(), [7]))).toBe(7);
    expect(form(withRatings(makeCareer(), [6, 8]))).toBe(7);
  });

  it('only counts matches at the current club', () => {
    const before = withRatings(makeCareer(), [9, 9, 9, 9]);
    const moved: Career = {
      ...before,
      clubId: 'ars',
      stints: [...before.stints, { clubId: 'ars', season: 1, round: 5, how: 'up', matches: 0, goals: 0, assists: 0, ratingTotal: 0 }],
    };
    expect(form(moved)).toBeNull();
    const oneGame = withRatings(moved, [5]);
    expect(clubRatings(oneGame)).toEqual([5]);
    expect(form(oneGame)).toBe(5);
  });
});

describe('thresholds', () => {
  it('sets the bar to go up above the bar to go down, for every club', () => {
    for (let rank = 1; rank <= CLUBS.length; rank++) {
      const { up, down } = thresholds(rank);
      expect(up, `rank ${rank}`).toBeGreaterThan(down);
      // Reachable ratings, so that both moves can happen.
      expect(up).toBeLessThan(HIGH);
      expect(down).toBeGreaterThan(LOW);
    }
  });

  it('bigger clubs expect at least as much as smaller ones', () => {
    for (let rank = 1; rank < CLUBS.length; rank++) {
      const bigger = thresholds(rank);
      const smaller = thresholds(rank + 1);
      expect(bigger.up, `rank ${rank} up`).toBeGreaterThanOrEqual(smaller.up);
      expect(bigger.down, `rank ${rank} down`).toBeGreaterThanOrEqual(smaller.down);
    }
    expect(thresholds(1).up).toBeGreaterThan(thresholds(CLUBS.length).up);
  });

  it('expects more of a better-trained footballer, up to a limit', () => {
    for (const rank of [1, 10, 20]) {
      const fresh = thresholds(rank, 0);
      const trained = thresholds(rank, 10);
      expect(trained.up).toBeGreaterThan(fresh.up);
      expect(trained.down).toBeGreaterThan(fresh.down);
      // Never out of reach, however much you train.
      expect(thresholds(rank, 1000).up).toBe(thresholds(rank, TRAINED_MAX).up);
      expect(thresholds(rank, 1000).up).toBeLessThan(MAX_RATING);
    }
  });

  it('expects more on easy than on medium, and more on medium than on hard', () => {
    for (const rank of [1, 10, 20]) {
      expect(thresholds(rank, 0, 'easy').up).toBeGreaterThan(thresholds(rank, 0, 'medium').up);
      expect(thresholds(rank, 0, 'medium').up).toBeGreaterThan(thresholds(rank, 0, 'hard').up);
    }
  });

  it('barsFor uses your club, your training and your difficulty', () => {
    const career = makeCareer({ difficulty: 'easy' }, CLUBS[9].id);
    expect(barsFor(career)).toEqual(thresholds(rankOf(career, career.clubId), 0, 'easy'));
    const trained = { ...career, attributes: { ...career.attributes, shooting: career.attributes.shooting + 20 } };
    expect(trainedBy(trained)).toBeGreaterThan(0);
    expect(barsFor(trained).up).toBeGreaterThan(barsFor(career).up);
  });
});

describe('verdict', () => {
  it(`is 'settling' before ${SETTLE_MATCHES} matches, however it's going`, () => {
    expect(verdict(makeCareer({}, MIDDLE))).toEqual({ kind: 'settling', matchesLeft: SETTLE_MATCHES });
    for (let played = 1; played < SETTLE_MATCHES; played++) {
      for (const r of [LOW, mid(10)]) {
        const v = verdict(withRatings(makeCareer({}, MIDDLE), Array(played).fill(r)));
        expect(v).toEqual({ kind: 'settling', matchesLeft: SETTLE_MATCHES - played });
      }
    }
    // Even brilliant, one match is never enough.
    expect(verdict(withRatings(makeCareer({}, MIDDLE), [HIGH])).kind).toBe('settling');
  });

  it('snaps up a wonderkid after two brilliant matches', () => {
    const rank = 10;
    if (thresholds(rank).up + 1.2 > HIGH) return; // bar tuned too high for this to be possible
    expect(verdict(withRatings(makeCareer({}, MIDDLE), [HIGH, HIGH])).kind).toBe('up');
  });

  it("says 'up' with high form and 'down' with low form", () => {
    for (const club of CLUBS) {
      const up = verdict(withRatings(makeCareer({}, club.id), [HIGH, HIGH, HIGH]));
      const down = verdict(withRatings(makeCareer({}, club.id), [LOW, LOW, LOW]));
      const stay = verdict(withRatings(makeCareer({}, club.id), [mid(club.rank), mid(club.rank), mid(club.rank)]));
      if (club.rank > 1) expect(up.kind, club.id).toBe('up');
      if (club.rank < CLUBS.length) expect(down.kind, club.id).toBe('down');
      expect(stay.kind, club.id).toBe('stay');
      if (up.kind === 'up') {
        expect(up.form).toBe(HIGH);
        expect(up.jump[0]).toBeGreaterThan(0);
        expect(up.jump[1]).toBeGreaterThanOrEqual(up.jump[0]);
      }
    }
  });

  it("is never 'up' at the biggest club, or 'down' at the smallest", () => {
    for (const r of [HIGH, 9, 8.5]) expect(verdict(withRatings(makeCareer({}, TOP), [r, r, r])).kind).not.toBe('up');
    for (const r of [LOW, 5, 5.5]) expect(verdict(withRatings(makeCareer({}, BOTTOM), [r, r, r])).kind).not.toBe('down');
  });

  it('only looks at the last few matches', () => {
    const c = withRatings(makeCareer({}, MIDDLE), [LOW, LOW, LOW, HIGH, HIGH, HIGH]);
    expect(verdict(c).kind).toBe('up');
  });
});

describe('offers', () => {
  const moveVerdicts = (kind: 'up' | 'down'): Extract<Verdict, { kind: 'up' | 'down' }>[] => [
    { kind, form: 8, jump: [1, 2] },
    { kind, form: 8, jump: [2, 4] },
    { kind, form: 8, jump: [3, 6] },
    { kind, form: 8, jump: [4, 8] },
    { kind, form: 8, jump: [8, 15] },
  ];

  for (const kind of ['up', 'down'] as const) {
    it(`offers ${kind === 'up' ? 'bigger' : 'smaller'} clubs for a move ${kind}`, () => {
      for (const club of CLUBS) {
        const available = kind === 'up' ? club.rank - 1 : CLUBS.length - club.rank;
        if (available === 0) continue;
        const career = makeCareer({}, club.id);
        const real = verdict(withRatings(career, kind === 'up' ? [HIGH, HIGH, HIGH] : [LOW, LOW, LOW]));
        const verdicts = [...moveVerdicts(kind), ...(real.kind === kind ? [real] : [])];
        for (const v of verdicts) {
          for (const seed of [1, 2, 3]) {
            const offers = offersFor(career, v, seed);
            const label = `${club.id} ${kind} ${v.jump} seed ${seed}`;
            expect(offers.length, label).toBeGreaterThanOrEqual(1);
            expect(offers.length, label).toBeLessThanOrEqual(kind === 'up' ? 3 : 2);
            expect(new Set(offers).size, label).toBe(offers.length);
            expect(offers, label).not.toContain(club.id);
            for (const id of offers) {
              if (kind === 'up') expect(rankOf(career, id), label).toBeLessThan(club.rank);
              else expect(rankOf(career, id), label).toBeGreaterThan(club.rank);
            }
          }
        }
      }
    });
  }

  // Near the top or bottom of the ladder the band of clubs widens both ways, so there's still a choice.
  it('offers at least two clubs whenever two exist in that direction', () => {
    for (const kind of ['up', 'down'] as const) {
      for (const club of CLUBS) {
        const available = kind === 'up' ? club.rank - 1 : CLUBS.length - club.rank;
        const career = makeCareer({}, club.id);
        const v = verdict(withRatings(career, kind === 'up' ? [HIGH, HIGH, HIGH] : [LOW, LOW, LOW]));
        if (v.kind !== kind) continue;
        expect(offersFor(career, v, 1).length, `${club.id} ${kind}`).toBeGreaterThanOrEqual(Math.min(2, available));
      }
    }
  });

  it('offers two or more clubs from mid-table, where there is plenty of room', () => {
    for (const club of CLUBS.filter((c) => c.rank >= 9 && c.rank <= 12)) {
      const career = makeCareer({}, club.id);
      for (const ratings of [[HIGH, HIGH, HIGH], [LOW, LOW, LOW]]) {
        const v = verdict(withRatings(career, ratings));
        if (v.kind !== 'up' && v.kind !== 'down') throw new Error(`expected a move for ${club.id}`);
        const offers = offersFor(career, v, 1);
        expect(offers.length).toBeGreaterThanOrEqual(2);
        expect(offers.length).toBeLessThanOrEqual(v.kind === 'up' ? 3 : 2);
      }
    }
  });

  it('gives the same offers for the same seed', () => {
    const career = withRatings(makeCareer({}, MIDDLE), [HIGH, HIGH, HIGH]);
    const v = verdict(career);
    if (v.kind !== 'up') throw new Error('expected up');
    expect(offersFor(career, v, 5)).toEqual(offersFor(career, v, 5));
  });
});

describe('moving clubs', () => {
  const pendingCareer = (kind: 'up' | 'down', offers: string[]) =>
    ({ ...withRatings(makeCareer({}, MIDDLE), [7, 7, 7]), pending: { kind, offers, form: 7 } }) as Career;

  it('accepting an offer starts a new stint at the new club', () => {
    const before = pendingCareer('up', [TOP, CLUBS[1].id]);
    const { career, badges } = moveTo(before, TOP);
    expect(career.clubId).toBe(TOP);
    expect(career.pending).toBeNull();
    expect(career.stints).toHaveLength(before.stints.length + 1);
    expect(career.stints.at(-1)).toMatchObject({ clubId: TOP, how: 'up', matches: 0, season: before.season, round: before.round });
    expect(career.matches).toEqual(before.matches);
    expect(form(career)).toBeNull();
    expect(badges).toContain('big-move');
    expect(badges).toContain('top-club');
  });

  it('a move down is recorded as one', () => {
    const { career } = moveTo(pendingCareer('down', [BOTTOM]), BOTTOM);
    expect(career.clubId).toBe(BOTTOM);
    expect(career.stints.at(-1)?.how).toBe('down');
  });

  it('turning down a bigger club is allowed', () => {
    const before = pendingCareer('up', [TOP]);
    const { career } = moveTo(before, null);
    expect(career.pending).toBeNull();
    expect(career.clubId).toBe(MIDDLE);
    expect(career.stints).toEqual(before.stints);
  });

  it('a move down cannot be turned down', () => {
    const before = pendingCareer('down', [BOTTOM]);
    const { career } = moveTo(before, null);
    expect(career).toBe(before);
    expect(career.pending).not.toBeNull();
  });

  it('choosing a club that did not make an offer does nothing', () => {
    const before = pendingCareer('up', [CLUBS[1].id]);
    expect(moveTo(before, TOP).career).toBe(before);
    const none = makeCareer({}, MIDDLE);
    expect(moveTo(none, TOP).career).toBe(none);
  });
});

describe('recording a match', () => {
  it('records a real finished league match', () => {
    const state = finishedMatch();
    const before = makeCareer();
    const next = nextMatch(before)!;
    const { career, summary } = recordMatch(before, state);

    expect(career.round).toBe(before.round + 1);
    expect(career.matches).toHaveLength(1);
    const rec = career.matches[0];
    expect(rec).toMatchObject({
      season: 1,
      round: 1,
      competition: 'league',
      clubId: before.clubId,
      opponentId: next.opponentId,
      home: next.home,
      goalsFor: state.score[0],
      goalsAgainst: state.score[1],
      goals: state.stats[state.humanId].goals,
      assists: state.stats[state.humanId].assists,
    });
    expect(rec.rating).toBe(summary.rating);
    expect(rec.rating).toBeGreaterThanOrEqual(4);
    expect(rec.rating).toBeLessThanOrEqual(10);

    const stint = career.stints.at(-1)!;
    expect(stint.matches).toBe(1);
    expect(stint.goals).toBe(rec.goals);
    expect(stint.ratingTotal).toBeCloseTo(rec.rating, 5);

    expect(summary.points).toBeGreaterThan(0);
    expect(career.points).toBe(before.points + summary.points);
    expect(career.badges.debut).toBe(1);
    expect(summary.verdict.kind).toBe('settling');
    expect(summary.seasonOver).toBe(false);

    const results = Object.values(career.results);
    expect(results).toHaveLength(1);
    const ourGoals = next.home ? results[0].hg : results[0].ag;
    const theirGoals = next.home ? results[0].ag : results[0].hg;
    expect([ourGoals, theirGoals]).toEqual(state.score);
    expect(results[0].scorers).toHaveLength(state.score[0] + state.score[1]);

    // The input career is left alone.
    expect(before.matches).toHaveLength(0);
    expect(before.round).toBe(1);
  });

  it('plays out a whole season and then stops', () => {
    let c = makeCareer();
    const state = finishedMatch();
    let guard = 0;
    while (nextMatch(c) && guard++ < 40) {
      const done = recordMatch(c, withScore(state, 1, 1), c.cup && nextMatch(c)?.competition !== 'league' ? [5, 4] : null);
      c = { ...done.career, pending: null };
      if (!nextMatch(c)) expect(done.summary.seasonOver).toBe(true);
    }
    expect(c.round).toBe(ROUNDS + 1);
    expect(c.matches.filter((m) => m.competition === 'league')).toHaveLength(ROUNDS);
    expect(c.cup?.over).toBe(true);
    expect(() => recordMatch(c, state)).toThrow();
  });
});

describe('training', () => {
  it('spends points to raise a skill, dearer near the top, never past 99', () => {
    const c = makeCareer({ points: 5 });
    const trained = train(c, 'pace');
    expect(trained.attributes.pace).toBe(c.attributes.pace + 1);
    expect(trained.points).toBe(5 - trainingCost(c.attributes.pace));
    expect(train({ ...c, points: 0 }, 'pace')).toEqual({ ...c, points: 0 });
    const maxed = { ...c, points: 100, attributes: { ...c.attributes, pace: 99 } };
    expect(train(maxed, 'pace')).toBe(maxed);
    for (let v = 1; v < 99; v++) expect(trainingCost(v + 1)).toBeGreaterThanOrEqual(trainingCost(v));
  });
});
