/**
 * Superstar balance tool: average match rating by the kid's skill and by the size of their club.
 * Use it when changing the rating formula (engine/rating.ts) or the transfer thresholds (engine/career.ts).
 *
 *   npx vite-node scripts/superstar/rating.ts [ranks] [skills] [matches] [difficulty] [position] [attributes]
 *   e.g. npx vite-node scripts/superstar/rating.ts 1,10,20 0.2,0.5,0.8 12 medium striker 62
 */
import { CLUBS, clubAtRank } from '../../src/superstar/data/clubs';
import { lineUp } from '../../src/superstar/engine/lineup';
import { createMatch, stepMatch } from '../../src/superstar/engine/match/sim';
import { makeBot } from '../../src/superstar/engine/match/bot';
import { matchRating } from '../../src/superstar/engine/rating';
import type { Difficulty } from '../../src/superstar/engine/match/types';
import { Rng } from '../../src/engine/rng';

const args = process.argv.slice(2);
const ranks = (args[0] ?? '1,5,10,15,20').split(',').map(Number);
const skills = (args[1] ?? '0.2,0.5,0.8').split(',').map(Number);
const n = Number(args[2] ?? 12);
const difficulty = (args[3] ?? 'medium') as Difficulty;
const position = (args[4] ?? 'striker') as any;
const attr = Number(args[5] ?? 62);

for (const rank of ranks) {
  const club = clubAtRank(rank);
  const line: string[] = [];
  for (const skill of skills) {
    const rng = new Rng(rank * 100 + skill * 10);
    const ratings: number[] = [];
    let w = 0, gls = 0;
    for (let i = 0; i < n; i++) {
      let opp = club;
      while (opp.id === club.id) opp = CLUBS[rng.int(0, CLUBS.length - 1)];
      const setup = lineUp({
        seed: 7000 + i * 13 + rank,
        clubId: club.id,
        opponentId: opp.id,
        home: i % 2 === 0,
        footballer: { name: 'Robin', number: 7, position, attributes: { pace: attr, shooting: attr, passing: attr, dribbling: attr, tackling: attr, stamina: attr } },
        difficulty,
        halfSeconds: 120,
      });
      const s = createMatch(setup);
      const bot = makeBot(skill, 300 + i + rank);
      let guard = 0;
      while (s.phase !== 'fulltime' && guard++ < 60 * 400) stepMatch(s, bot(s));
      const r = matchRating({ stats: s.stats[s.humanId], position, goalsFor: s.score[0], goalsAgainst: s.score[1] });
      ratings.push(r);
      gls += s.stats[s.humanId].goals;
      if (s.score[0] > s.score[1]) w++;
    }
    const mean = ratings.reduce((a, b) => a + b, 0) / n;
    const sd = Math.sqrt(ratings.reduce((a, b) => a + (b - mean) ** 2, 0) / n);
    line.push(`s${skill}: ${mean.toFixed(2)}±${sd.toFixed(2)} g${(gls / n).toFixed(1)} w${w}`);
  }
  console.log(`rank ${String(rank).padStart(2)} ${club.shortName.padEnd(14)} ${line.join(' | ')}`);
}
