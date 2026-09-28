/**
 * The FA Cup and EFL Cup: the draw by half of the table, ties that take you through or knock you
 * out, a trophy for winning the final, drawn ties settled by penalties, and the shootout rules
 * (best of five, finishing early, then sudden death).
 */

import { describe, it, expect } from 'vitest';
import { Rng } from '../../engine/rng';
import { CLUBS } from '../data/clubs';
import { cupDrawDue, currentTable, drawCup, nextMatch, recordMatch, type Career } from '../engine/career';
import {
  CUP_AFTER,
  CUP_STAGES,
  computerPick,
  cupForPosition,
  cupTieIsHome,
  enterCup,
  followTransfer,
  shootoutWinner,
  takePenalty,
  type Aim,
  type PenaltyOutcome,
} from '../engine/cup';
import { finishedMatch, makeCareer, withScore } from './helpers';

const HALF = CLUBS.length / 2;

/** A career that has just played enough league matches for the draw. */
const atDraw = (clubId: string, seed = 12345): Career => makeCareer({ round: CUP_AFTER[0] + 1, seasonSeed: seed }, clubId);

/** A career in the cup, with the next tie due. */
function inCup(clubId = 'bha'): Career {
  const c = drawCup(atDraw(clubId));
  if (!c.cup) throw new Error('no cup');
  return c;
}

/** Jump the league on to the next cup tie and play it with this score. */
function playTie(c: Career, ours: number, theirs: number, penalties: [number, number] | null = null) {
  const stage = c.cup!.ties.length;
  const due: Career = { ...c, round: Math.max(c.round, CUP_AFTER[stage] + 1), pending: null };
  const next = nextMatch(due)!;
  expect(next.competition).toBe(c.cup!.cup);
  expect(next.stage).toBe(stage);
  return recordMatch(due, withScore(finishedMatch(), ours, theirs), penalties);
}

describe('the cup draw', () => {
  it(`is made after ${CUP_AFTER[0]} league matches, not before`, () => {
    expect(cupDrawDue(makeCareer({ round: CUP_AFTER[0] }))).toBe(false);
    expect(drawCup(makeCareer({ round: CUP_AFTER[0] })).cup).toBeNull();
    expect(cupDrawDue(atDraw('bha'))).toBe(true);
    const drawn = drawCup(atDraw('bha'));
    expect(drawn.cup).not.toBeNull();
    expect(cupDrawDue(drawn)).toBe(false);
    expect(drawCup(drawn)).toBe(drawn);
  });

  it('puts the top half in the FA Cup and the bottom half in the EFL Cup', () => {
    for (const seed of [1, 2]) {
      for (const club of CLUBS) {
        const c = atDraw(club.id, seed);
        const ids = currentTable(c).table.map((row) => row.clubId);
        const position = ids.indexOf(club.id) + 1;
        const { cup } = drawCup(c);
        expect(cup!.cup, `${club.id} in position ${position}`).toBe(position <= HALF ? 'fa-cup' : 'efl-cup');
        // Opponents come from the same half, are all different, and never your own club.
        const half = position <= HALF ? ids.slice(0, HALF) : ids.slice(HALF);
        expect(cup!.opponents).toHaveLength(CUP_STAGES.length);
        expect(new Set(cup!.opponents).size).toBe(CUP_STAGES.length);
        expect(cup!.opponents).not.toContain(club.id);
        for (const id of cup!.opponents) expect(half).toContain(id);
        expect(cup!.ties).toEqual([]);
        expect(cup!.over).toBe(false);
      }
    }
    expect(cupForPosition(1)).toBe('fa-cup');
    expect(cupForPosition(HALF)).toBe('fa-cup');
    expect(cupForPosition(HALF + 1)).toBe('efl-cup');
    expect(cupForPosition(CLUBS.length)).toBe('efl-cup');
  });

  it('happens by itself when the sixth league match is recorded', () => {
    const c = makeCareer({ round: CUP_AFTER[0] });
    const { career, summary } = recordMatch(c, finishedMatch());
    expect(career.cup).not.toBeNull();
    expect(summary.drawnInto).toBe(career.cup!.cup);
    expect(nextMatch(career)?.competition).toBe(career.cup!.cup);
  });

  it('plays the final at Wembley and the other ties home or away', () => {
    for (let stage = 0; stage < CUP_STAGES.length - 1; stage++) expect(typeof cupTieIsHome(5, stage)).toBe('boolean');
    expect(cupTieIsHome(5, CUP_STAGES.length - 1)).toBe('neutral');
  });

  it('is the same draw for the same seed', () => {
    const table = CLUBS.map((c) => c.id);
    expect(enterCup(9, 1, 3, table[2], table)).toEqual(enterCup(9, 1, 3, table[2], table));
  });
});

describe('cup ties', () => {
  it('winning takes you through, and winning the final adds a trophy', () => {
    let c = inCup();
    const cupId = c.cup!.cup;
    for (let stage = 0; stage < CUP_STAGES.length; stage++) {
      const { career, summary } = playTie(c, 2, 0);
      expect(summary.cup).toEqual({ cup: cupId, stage, won: true, trophy: stage === CUP_STAGES.length - 1 });
      expect(career.cup!.ties).toHaveLength(stage + 1);
      expect(career.cup!.ties[stage]).toMatchObject({ opponentId: c.cup!.opponents[stage], won: true, penalties: null });
      expect(career.matches.at(-1)?.competition).toBe(cupId);
      c = career;
    }
    expect(c.cup!.over).toBe(true);
    expect(c.trophies).toEqual([{ kind: cupId, season: 1, clubId: c.clubId }]);
    expect(c.badges['cup-final']).toBe(1);
    expect(c.badges['cup-winner']).toBe(1);
    // No more cup ties once it's won.
    expect(nextMatch({ ...c, round: CUP_AFTER[2] + 1 })?.competition).toBe('league');
  });

  it('losing ends the run, with no trophy', () => {
    const { career, summary } = playTie(inCup(), 0, 1);
    expect(summary.cup?.won).toBe(false);
    expect(summary.cup?.trophy).toBe(false);
    expect(career.cup!.over).toBe(true);
    expect(career.trophies).toEqual([]);
    expect(nextMatch({ ...career, round: CUP_AFTER[1] + 1 })?.competition).toBe('league');
  });

  it('losing the final ends the run without a trophy', () => {
    let c = inCup();
    c = playTie(c, 1, 0).career;
    c = playTie(c, 1, 0).career;
    const { career, summary } = playTie(c, 0, 3);
    expect(summary.cup).toMatchObject({ stage: 2, won: false, trophy: false });
    expect(career.cup!.over).toBe(true);
    expect(career.trophies).toEqual([]);
    expect(career.badges['cup-final']).toBe(1);
    expect(career.badges['cup-winner']).toBeUndefined();
  });

  it('a drawn tie goes to whoever won the shootout', () => {
    const won = playTie(inCup(), 1, 1, [5, 4]);
    expect(won.summary.cup?.won).toBe(true);
    expect(won.career.cup!.over).toBe(false);
    expect(won.career.cup!.ties[0].penalties).toEqual([5, 4]);
    expect(won.career.matches.at(-1)?.penalties).toEqual([5, 4]);
    expect(won.career.badges['penalty-hero']).toBe(1);

    const lost = playTie(inCup(), 2, 2, [3, 4]);
    expect(lost.summary.cup?.won).toBe(false);
    expect(lost.career.cup!.over).toBe(true);
    expect(lost.career.badges['penalty-hero']).toBeUndefined();
  });

  it('a transfer takes the cup run along, never drawing you against your new club', () => {
    const run = inCup().cup!;
    const target = run.opponents[1];
    const moved = followTransfer(run, target);
    expect(moved.opponents).not.toContain(target);
    expect(new Set(moved.opponents).size).toBe(CUP_STAGES.length);
    expect(followTransfer(run, 'zzz')).toBe(run);
  });
});

describe('penalties', () => {
  it('never saves a kick that goes the other way from the dive', () => {
    const rng = new Rng(31);
    const aims: Aim[] = [-1, 0, 1];
    for (let i = 0; i < 3000; i++) {
      const aim = aims[i % 3];
      const dive = aims[Math.floor(i / 3) % 3];
      const outcome = takePenalty(rng, aim, dive, 0.7);
      if (aim !== dive) expect(outcome).not.toBe('saved');
    }
  });

  it('saves more when the keeper guesses right', () => {
    const rate = (same: boolean) => {
      const rng = new Rng(7);
      let saved = 0;
      let goals = 0;
      for (let i = 0; i < 2000; i++) {
        const outcome = takePenalty(rng, 1, same ? 1 : -1, 0.7);
        if (outcome === 'saved') saved++;
        if (outcome === 'goal') goals++;
      }
      return { saved, goals };
    };
    const right = rate(true);
    const wrong = rate(false);
    expect(right.saved).toBeGreaterThan(wrong.saved);
    expect(wrong.goals).toBeGreaterThan(right.goals);
    expect(wrong.goals).toBeGreaterThan(1500);
  });

  it('the computer picks every side sometimes', () => {
    const rng = new Rng(3);
    const seen = new Set<Aim>();
    for (let i = 0; i < 200; i++) seen.add(computerPick(rng));
    expect([...seen].sort()).toEqual([-1, 0, 1]);
  });
});

describe('the shootout', () => {
  const G: PenaltyOutcome = 'goal';
  const S: PenaltyOutcome = 'saved';
  const M: PenaltyOutcome = 'missed';

  it('is undecided at the start and while it can still go either way', () => {
    expect(shootoutWinner([], [])).toBeNull();
    expect(shootoutWinner([G], [])).toBeNull();
    expect(shootoutWinner([G, G, G], [S, S])).toBeNull();
    expect(shootoutWinner([G, G, G, G], [G, G, G, S])).toBeNull();
    expect(shootoutWinner([G, G, G, G, G], [G, G, G, G, G])).toBeNull();
  });

  it('finishes early when one side cannot catch up', () => {
    expect(shootoutWinner([G, G, G], [S, M, S])).toBe(0);
    expect(shootoutWinner([S, S, S], [G, G, G])).toBe(1);
    expect(shootoutWinner([G, G, G, G], [S, G, S])).toBe(0);
    expect(shootoutWinner([S, S, G, S], [G, G, G, G])).toBe(1);
  });

  it('is best of five', () => {
    expect(shootoutWinner([G, G, G, G, G], [G, G, G, G, S])).toBe(0);
    expect(shootoutWinner([G, S, G, S, G], [G, G, G, S, G])).toBe(1);
  });

  it('goes to sudden death after five each', () => {
    const level = [G, G, S, G, G];
    expect(shootoutWinner([...level, G], [...level])).toBeNull();
    expect(shootoutWinner([...level, G], [...level, G])).toBeNull();
    expect(shootoutWinner([...level, G], [...level, S])).toBe(0);
    expect(shootoutWinner([...level, S], [...level, G])).toBe(1);
    expect(shootoutWinner([...level, G, S], [...level, G, S])).toBeNull();
    expect(shootoutWinner([...level, G, S, G], [...level, G, S, M])).toBe(0);
  });

  it('always ends with a winner, and never stops mid-pair in sudden death', () => {
    const rng = new Rng(2024);
    for (let n = 0; n < 300; n++) {
      const ours: PenaltyOutcome[] = [];
      const theirs: PenaltyOutcome[] = [];
      let winner: 0 | 1 | null = null;
      for (let kick = 0; kick < 200 && winner === null; kick++) {
        const side = kick % 2 === 0 ? ours : theirs;
        side.push(takePenalty(rng, computerPick(rng), computerPick(rng), 0.6));
        winner = shootoutWinner(ours, theirs);
      }
      expect(winner).not.toBeNull();
      const us = ours.filter((k) => k === 'goal').length;
      const them = theirs.filter((k) => k === 'goal').length;
      expect(winner === 0 ? us > them : them > us).toBe(true);
      if (ours.length > 5) expect(ours.length).toBe(theirs.length);
    }
  });
});
