/**
 * Superstar balance tool: tactics-board snapshots of attacks, to check the computer players'
 * shape by eye. Writes SVGs (open them in a browser): blue is the kid's team, red the opponents,
 * the yellow ring is the kid; each player has a line to where they're heading and a label with
 * their role and defensive job (meet, chase, cover, mark) or ":run" for a run in behind.
 *
 *   npx vite-node scripts/superstar/frames.ts <outDir> [seed] [difficulty] [skill]
 *   e.g. npx vite-node scripts/superstar/frames.ts /tmp/frames 777 medium 0.6
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { lineUp } from '../../src/superstar/engine/lineup';
import { makeBot } from '../../src/superstar/engine/match/bot';
import { createMatch, stepMatch } from '../../src/superstar/engine/match/sim';
import { planDefence } from '../../src/superstar/engine/match/defend';
import type { Difficulty } from '../../src/superstar/engine/match/types';
import { LENGTH, WIDTH, MID_Y, dist } from '../../src/superstar/engine/pitch';
const out = process.argv[2] ?? 'frames';
mkdirSync(out, { recursive: true });
const setup = lineUp({ seed: Number(process.argv[3] ?? 777), clubId: 'avl', opponentId: 'new', home: true, footballer: { name: 'R', number: 9, position: 'striker', attributes: { pace: 64, shooting: 66, passing: 55, dribbling: 62, tackling: 40, stamina: 60 } }, difficulty: (process.argv[4] ?? 'medium') as Difficulty, halfSeconds: 120 });
const s = createMatch(setup);
const bot = makeBot(Number(process.argv[5] ?? 0.6), 3);
let f = 0, n = 0, last = -999;
const K = 8;
while (s.phase !== 'fulltime' && f++ < 60 * 300 && n < 10) {
  stepMatch(s, bot(s));
  const o = s.ball.owner >= 0 ? s.agents[s.ball.owner] : null;
  if (!o || o.keeper || s.phase !== 'play' || f - last < 150) continue;
  const gx = o.side === 0 ? LENGTH : 0;
  if (dist(o.x, o.y, gx, MID_Y) > 32) continue;
  last = f; n++;
  const plan = planDefence(s, o);
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${LENGTH * K}" height="${WIDTH * K + 30}" font-family="sans-serif"><rect width="100%" height="100%" fill="#3a9d3a"/>`;
  svg += `<rect x="0" y="0" width="${LENGTH * K}" height="${WIDTH * K}" fill="none" stroke="#fff" stroke-width="2"/><line x1="${LENGTH * K / 2}" y1="0" x2="${LENGTH * K / 2}" y2="${WIDTH * K}" stroke="#fff"/>`;
  for (const bx of [0, LENGTH - 16.5]) svg += `<rect x="${bx * K}" y="${(MID_Y - 20.16) * K}" width="${16.5 * K}" height="${40.32 * K}" fill="none" stroke="#fff"/>`;
  for (const a of s.agents) {
    const col = a.side === 0 ? '#2b6cff' : '#e53935';
    svg += `<line x1="${a.x * K}" y1="${a.y * K}" x2="${a.tx * K}" y2="${a.ty * K}" stroke="${col}" stroke-opacity="0.6" stroke-width="2"/>`;
    svg += `<circle cx="${a.x * K}" cy="${a.y * K}" r="${K * 0.9}" fill="${col}" stroke="${a.human ? '#ffeb3b' : '#000'}" stroke-width="${a.human ? 4 : 1}"/>`;
    const job = plan.jobs.get(a.id);
    const label = `${a.role}${job ? ':' + job.kind : ''}${a.run > 0 ? ':run' : ''}`;
    svg += `<text x="${a.x * K + 9}" y="${a.y * K - 8}" font-size="12" fill="#fff">${label}</text>`;
  }
  svg += `<circle cx="${s.ball.x * K}" cy="${s.ball.y * K}" r="5" fill="#fff" stroke="#000"/>`;
  svg += `<text x="6" y="${WIDTH * K + 20}" font-size="16" fill="#fff">${o.side === 0 ? 'Blue' : 'Red'} attacking ${o.side === 0 ? '→' : '←'}  t=${s.clock.toFixed(1)}s  carrier ${o.role}${o.human ? ' (kid)' : ''}  score ${s.score.join('-')}</text></svg>`;
  writeFileSync(`${out}/f${String(n).padStart(2, '0')}.svg`, svg);
}
console.log('frames', n);
