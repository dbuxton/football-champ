/**
 * Superstar balance tool: whole careers played by pretend kids of different skill, through the
 * real career rules (ratings, transfers, cups, seasons, training). Shows where each one ends up.
 * NOT YET RUN — the transfer thresholds in engine/career.ts still need checking with it.
 *
 *   npx vite-node scripts/superstar/journey.ts [skills] [matches] [difficulty] [startRank] [position] [halfSeconds] [notrain]
 *   e.g. npx vite-node scripts/superstar/journey.ts 0.2,0.5,0.8 30 easy 12 striker 60
 */
import { Rng } from '../../src/engine/rng';
import { CLUBS } from '../../src/superstar/data/clubs';
import { moveTo, newCareer, nextMatch, rankOf, recordMatch, startNextSeason, train, type Career } from '../../src/superstar/engine/career';
import { computerPick, shootoutWinner, takePenalty, type PenaltyOutcome } from '../../src/superstar/engine/cup';
import { lineUp } from '../../src/superstar/engine/lineup';
import { makeBot } from '../../src/superstar/engine/match/bot';
import { createMatch, stepMatch } from '../../src/superstar/engine/match/sim';
import type { Difficulty } from '../../src/superstar/engine/match/types';
import { ATTRIBUTE_KEYS } from '../../src/superstar/engine/skills';

const args = process.argv.slice(2);
const skills = (args[0] ?? '0.2,0.5,0.8').split(',').map(Number);
const matches = Number(args[1] ?? 30);
const difficulty = (args[2] ?? 'easy') as Difficulty;
const startRank = Number(args[3] ?? 12);
const position = (args[4] ?? 'striker') as any;
const halfSeconds = Number(args[5] ?? 60);
const trainSpend = args[6] !== 'notrain';

function shootout(rng: Rng): [number, number] {
  const ours: PenaltyOutcome[] = [];
  const theirs: PenaltyOutcome[] = [];
  while (shootoutWinner(ours, theirs) === null) {
    if (ours.length === theirs.length) ours.push(takePenalty(rng, computerPick(rng), computerPick(rng), 0.6));
    else theirs.push(takePenalty(rng, computerPick(rng), computerPick(rng), 0.6));
  }
  return [ours.filter((k) => k === 'goal').length, theirs.filter((k) => k === 'goal').length];
}

for (const skill of skills) {
  const t0 = Date.now();
  const clubId = CLUBS[startRank - 1].id;
  let career: Career = newCareer({ id: 'sim', name: 'Sim', number: 9, position, look: { skin: '#e0ac85', hair: '#000000', hairStyle: 'short', boots: '#ff0000' }, difficulty, halfMinutes: halfSeconds / 60, clubId, seed: 42, today: '2026-01-01' });
  const rng = new Rng(Math.round(skill * 1000) + 7);
  const path: string[] = [`${career.clubId}(${rankOf(career, career.clubId)})`];
  const ratings: number[] = [];
  let ups = 0, downs = 0, seasonEnds = 0;
  for (let m = 0; m < matches; m++) {
    const next = nextMatch(career);
    if (!next) {
      career = startNextSeason(career, 1000 + m).career;
      seasonEnds++;
      m--;
      continue;
    }
    const setup = lineUp({ seed: 777 + m * 31, clubId: career.clubId, opponentId: next.opponentId, home: next.home !== false, footballer: { name: career.name, number: career.number, position: career.position, attributes: career.attributes }, difficulty, halfSeconds, season: career.season });
    const s = createMatch(setup);
    const bot = makeBot(skill, 5000 + m);
    let guard = 0;
    while (s.phase !== 'fulltime' && guard++ < 60 * 1000) stepMatch(s, bot(s));
    const pens = next.competition !== 'league' && s.score[0] === s.score[1] ? shootout(rng) : null;
    const rec = recordMatch(career, s, pens);
    career = rec.career;
    ratings.push(rec.summary.rating);
    if (career.pending) {
      const pick = career.pending.offers[rng.int(0, career.pending.offers.length - 1)];
      if (career.pending.kind === 'up') ups++; else downs++;
      career = moveTo(career, pick).career;
      path.push(`${career.clubId}(${rankOf(career, career.clubId)})`);
    }
    if (trainSpend) {
      // Spend points on the position's key attributes.
      for (let guardT = 0; guardT < 50 && career.points > 0; guardT++) {
        const key = ATTRIBUTE_KEYS[guardT % ATTRIBUTE_KEYS.length];
        const before = career.points;
        career = train(career, key);
        if (career.points === before) break;
      }
    }
  }
  const avg = ratings.reduce((a, b) => a + b, 0) / ratings.length;
  const lastRank = rankOf(career, career.clubId);
  console.log(`skill ${skill}: avg rating ${avg.toFixed(2)} ups ${ups} downs ${downs} final rank ${lastRank} seasons ${career.season} | ${path.join(' → ')} | ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}
