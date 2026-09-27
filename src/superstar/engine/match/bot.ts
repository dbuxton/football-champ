import { Rng } from '../../../engine/rng';
import { LENGTH, MID_Y, WIDTH, clamp, dist } from '../pitch';
import { goalAngle, interceptPoint } from './core';
import type { Input, MatchState } from './types';

/**
 * A pretend kid at the controls, for the tests and for the title screen's demo match.
 *
 * It presses the same buttons a kid would, through the same `Input`, so a simulated career plays
 * the real game. `skill` (0–1) is how a kid plays: a low-skill bot is slow to react, wobbles as
 * it runs, chases the ball wherever it goes, runs straight into defenders, and shoots from miles
 * out with a wild swing. A high-skill bot finds space, dodges tackles and picks its corner.
 */
export function makeBot(skill: number, seed: number): (s: MatchState) => Input {
  const rng = new Rng(seed);
  const reaction = Math.round(6 + (1 - skill) * 18);
  let held: Input = { x: 0, y: 0, sprint: false, pass: false, shoot: false };
  let timer = 0;
  let charge = -1;
  let chargeFor = 0;

  const steer = (dx: number, dy: number): { x: number; y: number } => {
    // Wobble: a shaky kid never quite runs where they mean to.
    const wobble = rng.gaussian(0, 1) * (1 - skill) * 0.55;
    const angle = Math.atan2(dy, dx) + wobble;
    return { x: Math.cos(angle), y: Math.sin(angle) };
  };

  return (s: MatchState): Input => {
    const me = s.agents[s.humanId];
    const ball = s.ball;
    const hasBall = ball.owner === me.id;

    // Charging a shot: keep holding until it's charged, then let go.
    if (charge >= 0) {
      if (!hasBall) charge = -1;
      else {
        charge += 1 / 60;
        if (charge < chargeFor) return { ...held, shoot: true, pass: false };
        charge = -1;
        return { ...held, shoot: false, pass: false };
      }
    }

    // A button press lasts one frame, so the next press registers.
    if (held.pass || held.shoot) held = { ...held, pass: false, shoot: false };
    if (timer-- > 0) return held;
    timer = reaction + rng.int(0, reaction);

    const toGoal = dist(me.x, me.y, LENGTH, MID_Y);
    if (hasBall) {
      let pressure = Infinity;
      for (const o of s.agents) if (o.side === 1) pressure = Math.min(pressure, dist(o.x, o.y, me.x, me.y));

      // Shoot? A careful kid waits for a good chance; an eager one has a go from anywhere.
      const range = 13 + 9 * skill + (rng.chance((1 - skill) * 0.5) ? 14 : 0);
      if (toGoal < range && goalAngle(0, me.x, me.y) > 0.16 - skill * 0.04) {
        charge = 0;
        chargeFor = 0.2 + rng.float(0, 0.45) + (1 - skill) * rng.float(0, 0.9);
        const corner = rng.chance(skill) ? (rng.chance(0.5) ? -1 : 1) : 0;
        held = { x: 1, y: corner, sprint: false, pass: false, shoot: true };
        return held;
      }

      // Pass when crowded — towards goal if sensible, anywhere if not.
      if (pressure < 2.5 && rng.chance(0.3 + 0.5 * skill)) {
        const dir = rng.chance(skill) ? steer(1, (MID_Y - me.y) / 25) : steer(rng.float(-1, 1), rng.float(-1, 1));
        held = { x: dir.x, y: dir.y, sprint: false, pass: true, shoot: false };
        return held;
      }

      // Run at goal; a skilful kid swerves round defenders, a beginner goes straight at them.
      let dx = 1;
      let dy = (MID_Y - me.y) / Math.max(12, toGoal);
      for (const o of s.agents) {
        if (o.side !== 1) continue;
        const rx = me.x - o.x;
        const ry = me.y - o.y;
        const d = Math.hypot(rx, ry);
        if (d > 6 || d < 0.01 || o.x < me.x - 1) continue;
        dx += (rx / d) * ((6 - d) / 6) * skill;
        dy += (ry / d) * ((6 - d) / 6) * 1.6 * skill;
      }
      const dir = steer(dx, dy);
      held = { x: dir.x, y: dir.y, sprint: pressure > 4 && me.energy > 0.3 && rng.chance(0.4 + 0.5 * skill), pass: false, shoot: false };
      return held;
    }

    const owner = ball.owner >= 0 ? s.agents[ball.owner] : null;
    let tx: number;
    let ty: number;
    let sprint = false;
    let pass = false;
    let slide = false;
    // Beginners chase the ball wherever it goes; better players hold their position.
    const ballWatcher = rng.chance((1 - skill) * 0.7);
    if (!owner) {
      const d = dist(me.x, me.y, ball.x, ball.y);
      if (d < 12 + 14 * skill || ball.pass?.to === me.id || ballWatcher) {
        const p = skill > 0.4 ? interceptPoint(ball, me) : { x: ball.x, y: ball.y };
        tx = p.x;
        ty = p.y;
        sprint = d > 6;
      } else {
        ({ x: tx, y: ty } = supportSpot(s));
      }
    } else if (owner.side === 1) {
      const d = dist(me.x, me.y, owner.x, owner.y);
      if (d < 10 + 8 * skill || ballWatcher) {
        tx = owner.x - 0.6;
        ty = owner.y;
        sprint = d > 4;
        // A good slide is timed; a wild one isn't.
        slide = skill > 0.5 ? d < 2 && rng.chance(0.3 * skill) : d < 4.5 && rng.chance(0.12);
      } else {
        ({ x: tx, y: ty } = supportSpot(s));
      }
    } else {
      if (ballWatcher) {
        tx = ball.x;
        ty = ball.y;
      } else {
        ({ x: tx, y: ty } = supportSpot(s));
      }
      pass = rng.chance(0.08 + 0.2 * skill) && dist(me.x, me.y, owner.x, owner.y) < 32;
    }
    const dx = tx - me.x;
    const dy = ty - me.y;
    const len = Math.hypot(dx, dy);
    const dir = len < 1 ? { x: 0, y: 0 } : steer(dx, dy);
    held = { x: dir.x, y: dir.y, sprint: sprint && me.energy > 0.25, pass, shoot: slide };
    return held;
  };
}

/** Somewhere useful to be when a teammate has the ball: ahead of it, towards goal. */
function supportSpot(s: MatchState): { x: number; y: number } {
  const me = s.agents[s.humanId];
  const ball = s.ball;
  const role = me.role;
  const ahead = role === 'ST' ? 14 : role === 'CB' || role === 'RB' || role === 'LB' ? -14 : 4;
  const x = clamp(ball.x + ahead, 8, LENGTH - 8);
  const lane =
    role === 'RM' || role === 'RB' ? WIDTH * 0.8 : role === 'LM' || role === 'LB' ? WIDTH * 0.2 : MID_Y + (me.slot % 2 === 0 ? 7 : -7);
  const y = clamp(lane + (ball.y - MID_Y) * 0.3, 4, WIDTH - 4);
  return { x, y };
}
