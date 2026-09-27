/**
 * Superstar balance tool: play N whole matches headlessly and print averages.
 *
 *   npx vite-node scripts/superstar/sim.ts [club] [opponent] [matches] [difficulty] [botSkill] [position]
 *   e.g. npx vite-node scripts/superstar/sim.ts ars bur 10 medium 0.5 striker
 *
 * Leave botSkill off and the kid's player stands still (useful to watch the AI on its own).
 */
import { lineUp } from '../../src/superstar/engine/lineup';
import { createMatch, stepMatch } from '../../src/superstar/engine/match/sim';
import { NO_INPUT } from '../../src/superstar/engine/match/types';
import { makeBot } from '../../src/superstar/engine/match/bot';

const args = process.argv.slice(2);
const club = args[0] ?? 'ars';
const opp = args[1] ?? 'bur';
const n = Number(args[2] ?? 10);
const difficulty = (args[3] ?? 'medium') as 'easy' | 'medium' | 'hard';
const botSkill = args[4] === undefined ? -1 : Number(args[4]);
const position = (args[5] ?? 'striker') as any;

let totals = { g0: 0, g1: 0, shots: [0, 0], saves: 0, miss: 0, wood: 0, blocked: 0, tackles: 0, inter: 0, corners: 0, throws: 0, pos0: 0, humanTouches: 0, frames: 0 };
const t0 = Date.now();
for (let i = 0; i < n; i++) {
  const setup = lineUp({
    seed: 1000 + i,
    clubId: club,
    opponentId: opp,
    home: true,
    footballer: { name: 'Robin', number: 7, position, attributes: { pace: 64, shooting: 66, passing: 55, dribbling: 62, tackling: 40, stamina: 60 } },
    difficulty,
    halfSeconds: 120,
  });
  const s = createMatch(setup);
  let guard = 0;
  const bot = botSkill >= 0 ? makeBot(botSkill, 77 + i) : null;
  while (s.phase !== 'fulltime' && guard++ < 60 * 400) stepMatch(s, bot ? bot(s) : NO_INPUT);
  const h = s.stats[s.humanId];
  (totals as any).hg = ((totals as any).hg ?? 0) + h.goals; (totals as any).hs = ((totals as any).hs ?? 0) + h.shots; (totals as any).ha = ((totals as any).ha ?? 0) + h.assists; (totals as any).ht = ((totals as any).ht ?? 0) + h.tacklesWon; (totals as any).hp = ((totals as any).hp ?? 0) + h.passesDone; (totals as any).hd = ((totals as any).hd ?? 0) + h.dispossessed;
  totals.g0 += s.score[0];
  totals.g1 += s.score[1];
  for (const a of s.agents) totals.shots[a.side] += s.stats[a.id].shots;
  totals.saves += s.events.filter((e) => e.kind === 'save').length;
  totals.miss += s.events.filter((e) => e.kind === 'miss').length;
  totals.wood += s.events.filter((e) => e.kind === 'woodwork').length;
  totals.blocked += s.events.filter((e) => e.kind === 'blocked').length;
  totals.tackles += s.events.filter((e) => e.kind === 'tackle').length;
  totals.inter += s.events.filter((e) => e.kind === 'interception').length;
  totals.corners += s.events.filter((e) => e.kind === 'corner').length;
  totals.pos0 += s.possession[0] / (s.possession[0] + s.possession[1]);
  totals.humanTouches += s.stats[s.humanId].touches;
  totals.frames += s.frame;
  if (i < 3) {
    console.log(`match ${i}: ${s.score[0]}-${s.score[1]} frames ${s.frame} goals:`, s.events.filter((e) => e.kind === 'goal' || e.kind === 'own-goal').map((e) => `${e.minute}' ${s.agents[e.agent]?.shortName}${e.other >= 0 ? ' (' + s.agents[e.other].shortName + ')' : ''}`).join(', '));
    const bad = s.agents.filter((a) => !Number.isFinite(a.x) || !Number.isFinite(a.y));
    if (bad.length) console.log('NaN agents!', bad.length);
    if (!Number.isFinite(s.ball.x)) console.log('NaN ball!');
  }
}
const per = (v: number) => (v / n).toFixed(2);
console.log(`${club} v ${opp} (${difficulty}) x${n}: goals ${per(totals.g0)}-${per(totals.g1)} shots ${per(totals.shots[0])}-${per(totals.shots[1])} saves ${per(totals.saves)} miss ${per(totals.miss)} wood ${per(totals.wood)} blocked ${per(totals.blocked)} tackles ${per(totals.tackles)} interceptions ${per(totals.inter)} corners ${per(totals.corners)} poss ${(totals.pos0 / n * 100).toFixed(0)}% humanTouches ${per(totals.humanTouches)} ms/match ${((Date.now() - t0) / n).toFixed(0)}`);
const T = totals as any;
console.log(`  human: goals ${per(T.hg)} shots ${per(T.hs)} assists ${per(T.ha)} tacklesWon ${per(T.ht)} passesDone ${per(T.hp)} dispossessed ${per(T.hd)}`);
