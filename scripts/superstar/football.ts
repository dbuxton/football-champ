/**
 * Superstar balance tool: does it look like football? Measures how the computer players defend
 * and pass, alongside the goals, so AI changes can be judged by numbers as well as by eye.
 *
 *   npx vite-node scripts/superstar/football.ts [matches] [difficulty] [skill|auto] [halfSeconds]
 *   e.g. npx vite-node scripts/superstar/football.ts 12 medium 0.5
 *
 * "auto" lets the computer play the kid's position too (computer against computer).
 *
 *   step-out  metres from the ball carrier to the nearest defender between them and goal, when
 *             the carrier is within 30m of goal (smaller = defenders come out to meet attacks)
 *   marked    metres from each attacker without the ball in the final third to the nearest
 *             defender between them and goal (smaller = tighter marking); "kid" is the kid alone
 *             Only defenders goal-side count: one chasing from behind isn't stopping anybody.
 *             Distances are capped at 20m.
 *   led       share of passes to a moving teammate aimed at least 2m ahead of where they were
 *   complete  share of passes that reach a teammate
 *   line      spread (m) of the four defenders' distance from their own goal while defending
 *             (smaller = they move as a line)
 */
import { lineUp } from '../../src/superstar/engine/lineup';
import { makeBot } from '../../src/superstar/engine/match/bot';
import { predictBall } from '../../src/superstar/engine/match/core';
import { createMatch, stepMatch } from '../../src/superstar/engine/match/sim';
import type { Difficulty, Side } from '../../src/superstar/engine/match/types';
import { LENGTH, MID_Y, dist } from '../../src/superstar/engine/pitch';

const args = process.argv.slice(2);
const n = Number(args[0] ?? 12);
const difficulty = (args[1] ?? 'medium') as Difficulty;
const auto = args[2] === 'auto';
const skill = auto ? 0.5 : Number(args[2] ?? 0.5);
const halfSeconds = Number(args[3] ?? 120);

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const sd = (xs: number[]) => {
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
};

const stepOut: number[] = [];
const marked: number[] = [];
const kidMarked: number[] = [];
const line: number[] = [];
let passes = 0, led = 0, movingPasses = 0, completed = 0, goals = 0, kidGoals = 0, shots = 0;

for (let i = 0; i < n; i++) {
  const setup = lineUp({
    seed: 4100 + i * 11,
    clubId: i % 2 ? 'bha' : 'avl',
    opponentId: i % 2 ? 'eve' : 'new',
    home: i % 2 === 0,
    footballer: { name: 'Robin', number: 9, position: 'striker', attributes: { pace: 64, shooting: 66, passing: 55, dribbling: 62, tackling: 40, stamina: 60 } },
    difficulty,
    halfSeconds,
  });
  setup.autopilotKid = auto;
  const s = createMatch(setup);
  const bot = makeBot(skill, 700 + i);
  let lastPass: string | null = null;
  let frame = 0;
  while (s.phase !== 'fulltime' && frame++ < 60 * 60 * 20) {
    stepMatch(s, bot(s));
    const ball = s.ball;
    // A pass has just been played: where is it going compared with where the receiver is?
    const key = ball.pass ? `${ball.pass.from}>${ball.pass.to}@${ball.last}` : null;
    if (ball.pass && key !== lastPass) {
      const t = s.agents[ball.pass.to];
      passes++;
      if (Math.hypot(t.vx, t.vy) > 2) {
        movingPasses++;
        const end = predictBall(ball, 1.2);
        const ahead = ((end.x - t.x) * t.vx + (end.y - t.y) * t.vy) / Math.hypot(t.vx, t.vy);
        if (ahead > 2) led++;
      }
    }
    lastPass = key;
    if (s.phase !== 'play' || frame % 6) continue;
    const owner = ball.owner >= 0 ? s.agents[ball.owner] : null;
    if (!owner || owner.keeper) continue;
    const def: Side = owner.side === 0 ? 1 : 0;
    const goalX = def === 0 ? 0 : LENGTH;
    const defenders = s.agents.filter((a) => a.side === def && !a.keeper);
    // The nearest defender goal-side of (x, y), capped at 20m.
    const nearest = (x: number, y: number) =>
      Math.min(20, ...defenders.filter((d) => Math.abs(d.x - goalX) < Math.abs(x - goalX) + 0.5).map((d) => dist(d.x, d.y, x, y)));
    if (dist(owner.x, owner.y, goalX, MID_Y) < 30) stepOut.push(nearest(owner.x, owner.y));
    for (const a of s.agents) {
      if (a.side !== owner.side || a.keeper || a.id === owner.id) continue;
      if (Math.abs(a.x - goalX) > 35) continue;
      const d = nearest(a.x, a.y);
      marked.push(d);
      if (a.human) kidMarked.push(d);
    }
    const back = s.agents.filter((a) => a.side === def && (a.role === 'CB' || a.role === 'RB' || a.role === 'LB'));
    line.push(sd(back.map((a) => Math.abs(a.x - goalX))));
  }
  // Passes that found a teammate: counted by the match itself.
  for (const a of s.agents) completed += s.stats[a.id].passesDone;
  goals += s.score[0] + s.score[1];
  kidGoals += s.stats[s.humanId].goals;
  for (const a of s.agents) shots += s.stats[a.id].shots;
}

const f = (v: number) => v.toFixed(2);
console.log(
  `${difficulty} ${auto ? 'auto' : `skill ${skill}`} ${n} matches: goals ${f(goals / n)} (kid ${f(kidGoals / n)}) shots ${f(shots / n)} | ` +
    `step-out ${f(mean(stepOut))}m marked ${f(mean(marked))}m kid ${f(mean(kidMarked))}m line ${f(mean(line))}m | ` +
    `led ${f(led / Math.max(1, movingPasses))} complete ${f(completed / Math.max(1, passes))}`,
);
