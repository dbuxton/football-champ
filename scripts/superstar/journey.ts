/**
 * Superstar balance tool: whole careers played by pretend kids of different skill, through the
 * real career rules (ratings, transfers, cups, seasons, training). Shows where each one ends up.
 *
 *   npx vite-node scripts/superstar/journey.ts [skills] [matches] [difficulty] [startRank] [position] [halfSeconds] [train|notrain] [careers]
 *   e.g. npx vite-node scripts/superstar/journey.ts 0.2,0.5,0.8 30 easy 12 striker 60
 *
 * With one career per skill (the default) it prints the path from club to club. With more, it
 * prints averages: the rank you end at, the rank you spent your matches at, moves up and down.
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
const careers = Number(args[7] ?? 1);

function shootout(rng: Rng): [number, number] {
  const ours: PenaltyOutcome[] = [];
  const theirs: PenaltyOutcome[] = [];
  while (shootoutWinner(ours, theirs) === null) {
    if (ours.length === theirs.length) ours.push(takePenalty(rng, computerPick(rng), computerPick(rng), 0.6));
    else theirs.push(takePenalty(rng, computerPick(rng), computerPick(rng), 0.6));
  }
  return [ours.filter((k) => k === 'goal').length, theirs.filter((k) => k === 'goal').length];
}

type Journey = { avg: number; ups: number; downs: number; lastRank: number; meanRank: number; seasons: number; path: string[]; goals: number };

function journey(skill: number, run: number): Journey {
  const clubId = CLUBS[startRank - 1].id;
  const salt = run * 100_003;
  let career: Career = newCareer({ id: 'sim', name: 'Sim', number: 9, position, look: { skin: '#e0ac85', hair: '#000000', hairStyle: 'short', boots: '#ff0000' }, difficulty, halfMinutes: halfSeconds / 60, clubId, seed: 42 + salt, today: '2026-01-01' });
  const rng = new Rng(Math.round(skill * 1000) + 7 + salt);
  const path: string[] = [`${career.clubId}(${rankOf(career, career.clubId)})`];
  const ratings: number[] = [];
  const ranks: number[] = [];
  let ups = 0, downs = 0, goals = 0;
  for (let m = 0; m < matches; m++) {
    const next = nextMatch(career);
    if (!next) {
      career = startNextSeason(career, 1000 + m + salt).career;
      m--;
      continue;
    }
    ranks.push(rankOf(career, career.clubId));
    const setup = lineUp({ seed: 777 + m * 31 + salt, clubId: career.clubId, opponentId: next.opponentId, home: next.home !== false, footballer: { name: career.name, number: career.number, position: career.position, attributes: career.attributes }, difficulty, halfSeconds, season: career.season });
    const s = createMatch(setup);
    const bot = makeBot(skill, 5000 + m + salt);
    let guard = 0;
    while (s.phase !== 'fulltime' && guard++ < 60 * 1000) stepMatch(s, bot(s));
    const pens = next.competition !== 'league' && s.score[0] === s.score[1] ? shootout(rng) : null;
    const rec = recordMatch(career, s, pens);
    career = rec.career;
    ratings.push(rec.summary.rating);
    goals += rec.summary.record.goals;
    if (career.pending) {
      const pick = career.pending.offers[rng.int(0, career.pending.offers.length - 1)];
      if (career.pending.kind === 'up') ups++; else downs++;
      career = moveTo(career, pick).career;
      path.push(`${career.clubId}(${rankOf(career, career.clubId)})`);
    }
    if (trainSpend) {
      // Spend points round the attributes in turn.
      for (let guardT = 0; guardT < 50 && career.points > 0; guardT++) {
        const key = ATTRIBUTE_KEYS[guardT % ATTRIBUTE_KEYS.length];
        const before = career.points;
        career = train(career, key);
        if (career.points === before) break;
      }
    }
  }
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  return { avg: mean(ratings), ups, downs, lastRank: rankOf(career, career.clubId), meanRank: mean(ranks), seasons: career.season, path, goals: goals / matches };
}

for (const skill of skills) {
  const t0 = Date.now();
  const runs = Array.from({ length: careers }, (_, run) => journey(skill, run));
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  if (careers === 1) {
    const j = runs[0];
    console.log(`skill ${skill}: avg rating ${j.avg.toFixed(2)} ups ${j.ups} downs ${j.downs} final rank ${j.lastRank} seasons ${j.seasons} | ${j.path.join(' → ')} | ${secs}s`);
    continue;
  }
  const mean = (f: (j: Journey) => number) => runs.reduce((a, j) => a + f(j), 0) / runs.length;
  const finals = runs.map((j) => j.lastRank).sort((a, b) => a - b).join(',');
  console.log(
    `skill ${skill}: rating ${mean((j) => j.avg).toFixed(2)} goals ${mean((j) => j.goals).toFixed(2)} ups ${mean((j) => j.ups).toFixed(1)} downs ${mean((j) => j.downs).toFixed(1)} ` +
      `mean rank ${mean((j) => j.meanRank).toFixed(1)} final rank ${mean((j) => j.lastRank).toFixed(1)} [${finals}] | ${careers} careers ${secs}s`,
  );
}
