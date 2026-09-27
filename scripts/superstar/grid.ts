/**
 * Superstar balance tool: the kid's goals and the team's results across skill levels and difficulties.
 *
 *   npx vite-node scripts/superstar/grid.ts [club] [opponent] [matches] [position] [skills] [difficulties] [auto]
 *   e.g. npx vite-node scripts/superstar/grid.ts bha eve 12 striker 0.2,0.5,0.8 easy,medium,hard
 *
 * Pass "auto" last to let the computer play the kid's position too (checks AI v AI balance).
 */
import { lineUp } from '../../src/superstar/engine/lineup';
import { createMatch, stepMatch } from '../../src/superstar/engine/match/sim';
import { makeBot } from '../../src/superstar/engine/match/bot';
import type { Difficulty } from '../../src/superstar/engine/match/types';

const args = process.argv.slice(2);
const club = args[0] ?? 'bha';
const opp = args[1] ?? 'eve';
const n = Number(args[2] ?? 12);
const position = (args[3] ?? 'striker') as any;
const skills = (args[4] ?? '0.2,0.5,0.8').split(',').map(Number);
const diffs = (args[5] ?? 'easy,medium,hard').split(',') as Difficulty[];
const autoKid = args[6] === 'auto';

for (const difficulty of diffs) {
  for (const skill of skills) {
    let os = 0, sv = 0, kg = 0, ka = 0, ks = 0, gf = 0, ga = 0, w = 0, d = 0, l = 0, touches = 0, tk = 0, lost = 0, passes = 0;
    for (let i = 0; i < n; i++) {
      const setup = lineUp({
        seed: 5000 + i * 7,
        clubId: club,
        opponentId: opp,
        home: i % 2 === 0,
        footballer: { name: 'Robin', number: 7, position, attributes: { pace: 64, shooting: 64, passing: 60, dribbling: 62, tackling: 50, stamina: 60 } },
        difficulty,
        halfSeconds: 120,
      });
      setup.autopilotKid = autoKid;
      const s = createMatch(setup);
      const bot = makeBot(skill, 900 + i);
      let guard = 0;
      while (s.phase !== 'fulltime' && guard++ < 60 * 400) stepMatch(s, bot(s));
      const h = s.stats[s.humanId];
      kg += h.goals; ka += h.assists; ks += h.shots; touches += h.touches; tk += h.tacklesWon; lost += h.dispossessed; passes += h.passesDone;
      gf += s.score[0]; ga += s.score[1];
      for (const a of s.agents) if (a.side === 1) os += s.stats[a.id].shots;
      sv += s.events.filter((e) => e.kind === 'save' && e.side === 0).length;
      if (s.score[0] > s.score[1]) w++; else if (s.score[0] === s.score[1]) d++; else l++;
    }
    const f = (v: number) => (v / n).toFixed(2);
    console.log(`${difficulty.padEnd(6)} skill ${skill}: kid goals ${f(kg)} assists ${f(ka)} shots ${f(ks)} touches ${f(touches)} passes ${f(passes)} tackles ${f(tk)} lost ${f(lost)} | opp shots ${f(os)} our saves ${f(sv)} | score ${f(gf)}-${f(ga)} W${w} D${d} L${l}`);
  }
}
