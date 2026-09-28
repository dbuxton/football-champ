import { Rng } from '../../../engine/rng';
import { FORMATION } from '../formation';
import {
  CENTRE_RADIUS,
  GOAL_DEPTH,
  GOAL_HALF,
  GOAL_HEIGHT,
  LENGTH,
  MID_X,
  MID_Y,
  SIX_DEPTH,
  WIDTH,
  attackGoalX,
  attackSign,
  clamp,
  dist,
  inOwnBox,
  ownGoalX,
} from '../pitch';
import { adjustSkills } from '../skills';
import { crossTo, header, humanPassTarget, keeperDistribute, passTo, passValue, shoot, smartAim } from './actions';
import { ownerThink, planRuns, updateChasers } from './ai';
import { ballSpeed, giveBall, interceptPoint, minuteOf, record, slotToWorld } from './core';
import {
  ACCEL,
  ADDED_TIME,
  AIR_DRAG,
  BOUNCE,
  CONTROL_RADIUS,
  DIFFICULTY,
  DRIBBLE_OFFSET,
  DRIBBLE_SLOWDOWN,
  DT,
  GOAL_PAUSE,
  GRAVITY,
  HALF_TIME_PAUSE,
  HEADER_RADIUS,
  HEADER_RECEIVE_RADIUS,
  HEAD_MAX,
  HEAD_MIN,
  HUMAN_ACCEL,
  HUMAN_TACKLE_RANGE,
  KEEPER_RADIUS,
  RECEIVE_RADIUS,
  ROLL_DECEL,
  SLIDE_REACH,
  SLIDE_RECOVER,
  SLIDE_SPEED,
  SLIDE_TIME,
  FIRST_TIME_ERROR,
  FIRST_TIME_MAX_CHARGE,
  HEADER_ERROR,
  SPRINT_BOOST,
  SPRINT_DRAIN,
  SPRINT_RECOVER_RESTING,
  SPRINT_RECOVER_RUNNING,
  TIRED_UNTIL,
  TACKLE_RANGE,
  TACKLE_RATE,
  humanRunSpeed,
  keeperAbility,
  runSpeed,
} from './tuning';
import { emptyStats, type Agent, type Input, type MatchSetup, type MatchState, type RestartKind, type Side } from './types';

/**
 * One football match, a sixtieth of a second at a time.
 *
 * `stepMatch` is the whole game: it reads the kid's buttons, lets the computer players think,
 * moves everyone and the ball, and applies the rules. It changes the state in place (a match is
 * thousands of steps; copying it each time would be wasteful) but is otherwise pure: the same
 * setup and the same buttons always play out the same match, which is what lets the tests play
 * whole matches without a screen.
 */

export function createMatch(setup: MatchSetup): MatchState {
  const tuning = DIFFICULTY[setup.difficulty];
  const agents: Agent[] = [];
  let humanId = -1;
  for (const side of [0, 1] as Side[]) {
    const team = setup.teams[side];
    FORMATION.forEach((slot, index) => {
      const player = team.players[index];
      const isKid = side === 0 && index === setup.humanSlot;
      const isHuman = isKid && !setup.autopilotKid;
      const skills = side === 1 ? adjustSkills(player.skills, tuning.opponentSkill) : player.skills;
      const keeper = slot.role === 'GK';
      const id = agents.length;
      if (isKid) humanId = id;
      const home = slotToWorld(side, slot.x, slot.y);
      agents.push({
        id,
        side,
        slot: index,
        role: slot.role,
        name: player.name,
        shortName: player.shortName,
        number: player.number,
        human: isHuman,
        keeper,
        skills,
        maxSpeed: isHuman ? humanRunSpeed(skills.pace, setup.difficulty) : runSpeed(skills.pace) * (keeper ? 0.9 : 1),
        x: home.x,
        y: home.y,
        vx: 0,
        vy: 0,
        fx: side === 0 ? 1 : -1,
        fy: 0,
        kickCd: 0,
        tackleCd: 0,
        stun: 0,
        slide: 0,
        decide: 0,
        hold: 0,
        energy: 1,
        tired: false,
        receivedFrom: -1,
        dribbleX: side === 0 ? 1 : -1,
        dribbleY: 0,
        run: 0,
        tx: home.x,
        ty: home.y,
        urgency: 0,
        react: 0,
        diving: false,
        stride: 0,
      });
    });
  }
  if (humanId < 0) throw new Error('The match needs the kid in it');

  const s: MatchState = {
    setup,
    rng: new Rng(setup.seed),
    frame: 0,
    clock: 0,
    half: 1,
    phase: 'kickoff',
    phaseTime: 0,
    score: [0, 0],
    agents,
    humanId,
    ball: { x: MID_X, y: MID_Y, z: 0, vx: 0, vy: 0, vz: 0, owner: -1, last: -1, pass: null, shot: null, deflected: null, spin: 0, inNet: false },
    restart: null,
    grace: 0,
    chasers: [-1, -1],
    events: [],
    seq: 0,
    stats: agents.map(() => emptyStats()),
    possession: [0, 0],
    prevPass: false,
    prevShoot: false,
    charge: -1,
    aimY: 0,
    calling: 0,
    sinceTouch: 0,
  };
  // The kid's team kicks off: the first touch of the match is theirs to watch, or to take.
  setupKickoff(s, 0);
  return s;
}

export function stepMatch(s: MatchState, input: Input, dt = DT): void {
  if (s.phase === 'fulltime') return;
  s.frame += 1;

  const kid = s.agents[s.humanId];
  if (s.phase === 'goal' || s.phase === 'halftime') {
    s.phaseTime -= dt;
    if (kid.human) humanControl(s, input, dt);
    for (const a of s.agents) {
      if (!a.human) {
        a.tx = a.x;
        a.ty = a.y;
        a.urgency = 0;
      }
      moveAgent(s, a, dt);
    }
    if (s.phase === 'goal') settleInNet(s, dt);
    if (s.phaseTime <= 0) {
      if (s.phase === 'halftime') {
        s.half = 2;
        s.clock = 0;
        setupKickoff(s, 1);
      } else {
        // Whoever conceded kicks off.
        let scored: Side = 0;
        for (const e of s.events) if (e.kind === 'goal' || e.kind === 'own-goal') scored = e.side;
        setupKickoff(s, scored === 0 ? 1 : 0);
      }
    }
    return;
  }

  if (s.phase === 'play' || s.phase === 'restart') s.clock += dt;
  s.grace = Math.max(0, s.grace - dt);

  if (kid.human) humanControl(s, input, dt);
  if (s.frame % 6 === 0 || s.ball.owner < 0) updateChasers(s);
  planRuns(s, dt);

  if (s.phase === 'kickoff' || s.phase === 'restart') {
    stepRestart(s, dt);
  } else {
    const owner = s.ball.owner >= 0 ? s.agents[s.ball.owner] : null;
    if (owner && !owner.human) ownerThink(s, owner, dt);
    else if (owner) owner.hold += dt;
  }

  for (const a of s.agents) moveAgent(s, a, dt);
  separate(s);

  const prevX = s.ball.x;
  const prevY = s.ball.y;
  const prevZ = s.ball.z;
  moveBall(s, dt);

  if (s.phase === 'play') {
    keeperSaves(s, prevX, prevY, prevZ);
    headers(s);
    pickups(s);
    tackles(s, dt);
    slideContact(s);
    checkLines(s, prevX, prevY, prevZ);
    if (s.ball.owner >= 0) s.possession[s.agents[s.ball.owner].side] += dt;
  }

  checkClock(s);
}

// ─── The kid ────────────────────────────────────────────────────────────────

function humanControl(s: MatchState, input: Input, dt: number): void {
  const h = s.agents[s.humanId];
  const pressedPass = input.pass && !s.prevPass;
  const pressedShoot = input.shoot && !s.prevShoot;
  const releasedShoot = !input.shoot && s.prevShoot;
  s.prevPass = input.pass;
  s.prevShoot = input.shoot;
  s.calling = Math.max(0, s.calling - dt);
  s.sinceTouch += dt;

  let mx = input.x;
  let my = input.y;
  const mag = Math.hypot(mx, my);
  if (mag > 1) {
    mx /= mag;
    my /= mag;
  }
  const moving = mag > 0.15;
  const hasBall = s.ball.owner === h.id;

  // Sprinting uses energy; run out and you're tired until you've got half of it back.
  const sprinting = input.sprint && moving && !h.tired && s.phase !== 'goal' && s.phase !== 'halftime';
  if (sprinting) {
    h.energy = Math.max(0, h.energy - SPRINT_DRAIN * (1.3 - 0.6 * h.skills.stamina) * dt);
    if (h.energy <= 0) h.tired = true;
  } else {
    const resting = mag < 0.5 || s.phase === 'goal' || s.phase === 'halftime';
    h.energy = Math.min(1, h.energy + (resting ? SPRINT_RECOVER_RESTING : SPRINT_RECOVER_RUNNING) * dt);
    if (h.tired && h.energy >= TIRED_UNTIL) h.tired = false;
  }

  if (moving) {
    const len = Math.hypot(mx, my);
    h.tx = h.x + (mx / len) * 10;
    h.ty = h.y + (my / len) * 10;
    h.urgency = Math.min(1, mag) * (sprinting ? SPRINT_BOOST : 1) * (hasBall ? DRIBBLE_SLOWDOWN : 1);
    if (h.slide <= 0 && h.stun <= 0) {
      h.fx = mx / len;
      h.fy = my / len;
    }
  } else if (s.ball.pass?.to === h.id) {
    // A pass is coming: step towards it so it doesn't roll past a kid who's standing still.
    const p = interceptPoint(s.ball, h);
    h.tx = p.x;
    h.ty = p.y;
    h.urgency = 0.7;
  } else {
    h.tx = h.x;
    h.ty = h.y;
    h.urgency = 0;
  }

  if (s.phase !== 'play') {
    // At a kick-off the kid (if it's theirs) can pass, shoot or run with it straight away.
    if (!(s.phase === 'kickoff' && hasBall)) {
      if (!input.shoot) s.charge = -1;
      return;
    }
    if (moving) startPlay(s);
  }

  if (hasBall) {
    if (pressedPass) {
      const target = humanPassTarget(s, h, input.x, input.y);
      if (target) {
        startPlay(s);
        passTo(s, h, target);
      }
      s.charge = -1;
      return;
    }
    if (pressedShoot) s.charge = 0;
    if (s.charge >= 0 && input.shoot) s.charge += dt;
    if (s.charge >= 0 && (releasedShoot || s.charge > 1.4)) {
      const power = clamp(0.3 + (s.charge / 0.75) * 0.7, 0.3, 1);
      const over = Math.max(0, s.charge - 0.95);
      const y = Math.abs(input.y) > 0.3 ? MID_Y + Math.sign(input.y) * 2.9 : smartAim(s, h, 2.2);
      startPlay(s);
      shoot(s, h, { y, height: 0.35 + power * 1.3 + over * 6, power });
      s.charge = -1;
    }
    return;
  }

  if (pressedPass) s.calling = 2;
  const theirBall = s.ball.owner >= 0 && s.agents[s.ball.owner].side !== h.side;
  if (theirBall) {
    // The other team has it: shoot means a slide tackle.
    s.charge = -1;
    if (pressedShoot && h.tackleCd <= 0 && h.stun <= 0 && h.slide <= 0) {
      h.slide = SLIDE_TIME;
      h.tackleCd = 1;
      h.vx = h.fx * SLIDE_SPEED;
      h.vy = h.fy * SLIDE_SPEED;
    }
    return;
  }
  // Otherwise holding shoot gets ready to strike the ball first time when it arrives (see
  // `firstTime`); let go and it's controlled as usual.
  // Held counts, not just pressed: a kid holds it through the corner being taken.
  if (!input.shoot) s.charge = -1;
  else if (s.charge < 0) s.charge = 0;
  else s.charge = Math.min(FIRST_TIME_MAX_CHARGE, s.charge + dt);
  s.aimY = input.y;
}

/**
 * The kid strikes the ball first time, without controlling it: a volley, a shot on the half
 * volley, or a header at head height. Power from how long shoot was held, aimed like any shot.
 */
function firstTime(s: MatchState, h: Agent): void {
  const ball = s.ball;
  const from = ball.pass?.from ?? ball.last;
  h.receivedFrom = from >= 0 && from !== h.id && s.agents[from].side === h.side ? from : -1;
  s.stats[h.id].touches += 1;
  s.sinceTouch = 0;
  const headed = ball.z > 0.9;
  const power = clamp(0.3 + (Math.max(0, s.charge) / 0.75) * 0.7, 0.3, 1);
  const y = Math.abs(s.aimY) > 0.3 ? MID_Y + Math.sign(s.aimY) * 2.9 : smartAim(s, h, 2.2);
  // A header is placed rather than blasted.
  shoot(s, h, { y, height: headed ? 0.6 : 0.35 + power * 1.1, power: headed ? Math.min(power, 0.35) : power }, headed ? HEADER_ERROR : FIRST_TIME_ERROR);
  s.charge = -1;
}

/** A kick-off taken by the kid starts play the moment they touch the ball. */
function startPlay(s: MatchState): void {
  if (s.phase === 'kickoff') {
    s.phase = 'play';
    s.restart = null;
    s.grace = 0.8;
  }
}

// ─── Moving about ───────────────────────────────────────────────────────────

function moveAgent(s: MatchState, a: Agent, dt: number): void {
  a.kickCd = Math.max(0, a.kickCd - dt);
  a.tackleCd = Math.max(0, a.tackleCd - dt);

  if (a.slide > 0) {
    a.slide -= dt;
    a.vx *= 1 - 1.5 * dt;
    a.vy *= 1 - 1.5 * dt;
    if (a.slide <= 0) {
      a.stun = Math.max(a.stun, SLIDE_RECOVER);
      a.vx *= 0.3;
      a.vy *= 0.3;
    }
  } else if (a.stun > 0) {
    a.stun -= dt;
    const slow = Math.max(0, 1 - 6 * dt);
    a.vx *= slow;
    a.vy *= slow;
  } else {
    const dx = a.tx - a.x;
    const dy = a.ty - a.y;
    const d = Math.hypot(dx, dy);
    let wantVx = 0;
    let wantVy = 0;
    if (d > 0.05) {
      let speed: number;
      if (a.urgency < 0) {
        // A diving keeper.
        const factor = a.side === 1 ? DIFFICULTY[s.setup.difficulty].keeperFactor : 1;
        speed = keeperAbility(a.skills.keeping, factor).diveSpeed;
      } else {
        speed = Math.min(a.maxSpeed * a.urgency, d * (a.human ? 6 : 2.5));
      }
      wantVx = (dx / d) * speed;
      wantVy = (dy / d) * speed;
    }
    // Keepers throw themselves at a shot; everyone else speeds up and turns like a runner.
    const accel = (a.urgency < 0 ? 45 : a.human ? HUMAN_ACCEL : ACCEL) * dt;
    const ax = wantVx - a.vx;
    const ay = wantVy - a.vy;
    const change = Math.hypot(ax, ay);
    if (change <= accel) {
      a.vx = wantVx;
      a.vy = wantVy;
    } else {
      a.vx += (ax / change) * accel;
      a.vy += (ay / change) * accel;
    }
  }

  a.x = clamp(a.x + a.vx * dt, -3, LENGTH + 3);
  a.y = clamp(a.y + a.vy * dt, -3, WIDTH + 3);

  const speed = Math.hypot(a.vx, a.vy);
  if (s.ball.owner === a.id && !a.human && speed > 0.2) {
    a.fx = a.vx / speed;
    a.fy = a.vy / speed;
  } else if (!a.human && speed > 0.6) {
    a.fx = a.vx / speed;
    a.fy = a.vy / speed;
  } else if (!a.human && s.ball.owner !== a.id) {
    // Standing still: watch the ball.
    const bx = s.ball.x - a.x;
    const by = s.ball.y - a.y;
    const bl = Math.hypot(bx, by);
    if (bl > 0.5) {
      a.fx = bx / bl;
      a.fy = by / bl;
    }
  }
  a.stride += speed * dt;
}

/** Players nudge apart instead of standing inside each other. */
function separate(s: MatchState): void {
  const agents = s.agents;
  for (let i = 0; i < agents.length; i++) {
    const a = agents[i];
    for (let j = i + 1; j < agents.length; j++) {
      const b = agents[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > 0.81 || d2 < 1e-6) continue;
      const d = Math.sqrt(d2);
      const push = (0.9 - d) * 0.25;
      a.x -= (dx / d) * push;
      a.y -= (dy / d) * push;
      b.x += (dx / d) * push;
      b.y += (dy / d) * push;
    }
  }
}

function moveBall(s: MatchState, dt: number): void {
  const ball = s.ball;
  if (ball.owner >= 0) {
    const o = s.agents[ball.owner];
    if (o.keeper && inOwnBox(o.side, o.x, o.y)) {
      // In the keeper's hands, held out in front of them.
      ball.x = o.x + attackSign(o.side) * 0.3;
      ball.y = o.y;
      ball.z = 1;
    } else {
      ball.x = o.x + o.fx * DRIBBLE_OFFSET;
      ball.y = o.y + o.fy * DRIBBLE_OFFSET;
      ball.z = 0;
    }
    ball.vx = o.vx;
    ball.vy = o.vy;
    ball.vz = 0;
    ball.spin += Math.hypot(o.vx, o.vy) * dt * 3;
    return;
  }
  if (ball.z > 0.001 || ball.vz > 0) {
    ball.vz -= GRAVITY * dt;
    ball.z += ball.vz * dt;
    if (ball.z <= 0) {
      ball.z = 0;
      if (ball.vz < -2) {
        ball.vz = -ball.vz * BOUNCE;
        ball.vx *= 0.82;
        ball.vy *= 0.82;
      } else {
        ball.vz = 0;
      }
    }
    const drag = 1 - AIR_DRAG * dt;
    ball.vx *= drag;
    ball.vy *= drag;
  } else {
    const speed = Math.hypot(ball.vx, ball.vy);
    if (speed > 0) {
      const slower = Math.max(0, speed - ROLL_DECEL * dt);
      ball.vx *= slower / speed;
      ball.vy *= slower / speed;
    }
  }
  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;
  ball.spin += Math.hypot(ball.vx, ball.vy) * dt * 3;
}

/** A ball in the net drops and stops, instead of flying out of the back. */
function settleInNet(s: MatchState, dt: number): void {
  const ball = s.ball;
  const back = ball.x > MID_X ? LENGTH + GOAL_DEPTH - 0.3 : -GOAL_DEPTH + 0.3;
  ball.vx *= 1 - 4 * dt;
  ball.vy *= 1 - 4 * dt;
  ball.x += ball.vx * dt;
  ball.y = clamp(ball.y + ball.vy * dt, MID_Y - GOAL_HALF + 0.3, MID_Y + GOAL_HALF - 0.3);
  ball.x = ball.x > MID_X ? Math.min(ball.x, back) : Math.max(ball.x, back);
  ball.vz -= GRAVITY * dt;
  ball.z = Math.max(0, ball.z + ball.vz * dt);
  if (ball.z === 0) ball.vz = 0;
}

// ─── Who gets the ball ──────────────────────────────────────────────────────

function keeperSaves(s: MatchState, prevX: number, prevY: number, prevZ: number): void {
  const ball = s.ball;
  if (ball.owner >= 0 || ball.inNet) return;
  for (const k of s.agents) {
    if (!k.keeper || k.kickCd > 0 || k.stun > 0) continue;
    if (!inOwnBox(k.side, ball.x, ball.y)) continue;
    const towards = ball.vx * attackSign(k.side) < -2;
    const factor = k.side === 1 ? DIFFICULTY[s.setup.difficulty].keeperFactor : 1;
    const reach = keeperAbility(k.skills.keeping, factor).reach + (k.diving ? 0.3 : 0);

    let saved = false;
    const crossed = (prevX - k.x) * (ball.x - k.x) <= 0 && prevX !== ball.x;
    if (crossed && towards) {
      const t = (k.x - prevX) / (ball.x - prevX);
      const y = prevY + (ball.y - prevY) * t;
      const z = prevZ + (ball.z - prevZ) * t;
      saved = Math.abs(y - k.y) < reach && z < 2.5;
    }
    if (!saved && dist(k.x, k.y, ball.x, ball.y) < KEEPER_RADIUS && ball.z < 2.5) saved = true;
    if (!saved) continue;

    const speed = ballSpeed(ball);
    const shot = ball.shot;
    if (!shot && speed < 13) {
      giveBall(s, k);
      return;
    }
    s.stats[k.id].saves += 1;
    if (shot) {
      s.stats[shot.by].onTarget += 1;
      record(s, 'save', k.side, k.id, shot.by);
    }
    const holdOn = clamp(0.3 + 0.5 * k.skills.keeping - (speed - 16) * 0.03, 0.12, 0.9);
    if (s.rng.chance(holdOn)) {
      giveBall(s, k);
    } else {
      const out = attackSign(k.side);
      const away = ball.y >= k.y ? 1 : -1;
      if (s.rng.chance(0.45)) {
        // Tipped round the post: out for a corner.
        ball.vx *= 0.25;
        ball.vy = away * s.rng.float(4, 7);
      } else {
        // Pushed away: off to the side and back out.
        ball.vx = -ball.vx * 0.3 + out * s.rng.float(1, 3);
        ball.vy = ball.vy * 0.4 + away * s.rng.float(1, 5);
      }
      ball.vz = s.rng.float(1.5, 3.5);
      ball.z = Math.max(ball.z, 0.3);
      ball.last = k.id;
      // If the parry still goes in, it's the shooter's goal.
      ball.deflected = shot ? { by: shot.by, counted: true } : null;
      ball.shot = null;
      ball.pass = null;
      k.kickCd = 0.45;
    }
    return;
  }
}

function headers(s: MatchState): void {
  const ball = s.ball;
  if (ball.owner >= 0 || ball.inNet || ball.z < HEAD_MIN || ball.z > HEAD_MAX) return;
  let best: Agent | null = null;
  let bestD = HEADER_RADIUS;
  for (const a of s.agents) {
    if (a.keeper || a.kickCd > 0 || a.stun > 0 || a.slide > 0) continue;
    const d = dist(a.x, a.y, ball.x, ball.y);
    if (d < bestD) {
      bestD = d;
      best = a;
    }
  }
  // Whoever the cross was meant for gets it ahead of their own teammates (they leave it), but a
  // defender who gets there first still wins it.
  const meant = ball.pass ? s.agents[ball.pass.to] : null;
  if (meant && !meant.keeper && meant.kickCd <= 0 && meant.stun <= 0 && meant.slide <= 0 && (!best || best.side === meant.side)) {
    if (dist(meant.x, meant.y, ball.x, ball.y) < HEADER_RECEIVE_RADIUS) best = meant;
  }
  if (!best) return;
  if (best.human && s.charge >= 0 && s.phase === 'play') firstTime(s, best);
  else header(s, best);
}

function pickups(s: MatchState): void {
  const ball = s.ball;
  if (ball.owner >= 0 || ball.inNet) return;
  const humanBonus = DIFFICULTY[s.setup.difficulty].humanControlBonus;
  let best: Agent | null = null;
  let bestD = Infinity;
  for (const a of s.agents) {
    if (a.kickCd > 0 || a.stun > 0 || a.slide > 0) continue;
    const inBox = a.keeper && inOwnBox(a.side, ball.x, ball.y);
    if (ball.z > (inBox ? 2.5 : 0.9)) continue;
    const radius = inBox ? KEEPER_RADIUS : ball.pass?.to === a.id ? RECEIVE_RADIUS : CONTROL_RADIUS + (a.human ? humanBonus : 0);
    const d = dist(a.x, a.y, ball.x, ball.y);
    if (d < radius && d < bestD) {
      bestD = d;
      best = a;
    }
  }
  if (!best) return;

  // The kid, ready for it: strike it first time.
  if (best.human && s.charge >= 0 && s.phase === 'play') {
    firstTime(s, best);
    return;
  }

  // A hard shot or pass hitting someone who wasn't expecting it may just bounce off them.
  const speed = ballSpeed(ball);
  if (speed > 15 && ball.pass?.to !== best.id && !best.keeper) {
    const control = 0.2 + 0.45 * best.skills.dribbling + (best.human ? 0.15 : 0);
    if (!s.rng.chance(control)) {
      if (ball.shot && s.agents[ball.shot.by].side !== best.side) record(s, 'blocked', best.side, best.id, ball.shot.by);
      ball.vx = -ball.vx * 0.25 + s.rng.float(-3, 3);
      ball.vy = ball.vy * 0.3 + s.rng.float(-4, 4);
      ball.vz = s.rng.float(0.5, 2.5);
      ball.last = best.id;
      // A shot that goes in off somebody is still the shooter's goal.
      ball.deflected = ball.shot ? { by: ball.shot.by, counted: false } : ball.deflected;
      ball.shot = null;
      ball.pass = null;
      best.kickCd = 0.3;
      return;
    }
  }
  giveBall(s, best);
}

function tackles(s: MatchState, dt: number): void {
  const ball = s.ball;
  if (ball.owner < 0) return;
  const owner = s.agents[ball.owner];
  if (owner.keeper && inOwnBox(owner.side, owner.x, owner.y)) return;
  const tuning = DIFFICULTY[s.setup.difficulty];
  for (const d of s.agents) {
    if (d.side === owner.side || d.tackleCd > 0 || d.stun > 0 || d.slide > 0) continue;
    if (s.grace > 0 && !d.human) continue;
    const gap = dist(d.x, d.y, owner.x, owner.y);
    if (gap > (d.human ? HUMAN_TACKLE_RANGE : TACKLE_RANGE)) continue;
    if (!d.human) {
      const rate = owner.human ? tuning.tackleRateOnHuman : TACKLE_RATE;
      if (!s.rng.chance(1 - Math.exp(-rate * dt))) continue;
    }
    const sprinting = Math.hypot(owner.vx, owner.vy) > owner.maxSpeed * 1.05;
    let win = clamp(0.28 + 0.45 * d.skills.tackling - 0.32 * owner.skills.dribbling + (sprinting ? 0.08 : 0), 0.08, 0.85);
    if (owner.human) win *= tuning.humanProtection;
    if (d.human) win = Math.min(0.92, win + tuning.humanTackleBonus);
    s.stats[d.id].tackles += 1;
    if (s.rng.chance(win)) {
      s.stats[d.id].tacklesWon += 1;
      s.stats[owner.id].dispossessed += 1;
      record(s, 'tackle', d.side, d.id, owner.id);
      owner.stun = 0.35;
      owner.kickCd = 0.45;
      d.tackleCd = 0.9;
      if (owner.human) s.charge = -1;
      if (s.rng.chance(0.65)) {
        giveBall(s, d);
      } else {
        ball.owner = -1;
        ball.last = d.id;
        ball.vx = d.fx * 3 + s.rng.float(-2, 2);
        ball.vy = d.fy * 3 + s.rng.float(-2, 2);
        d.kickCd = 0.12;
      }
    } else {
      d.stun = 0.4;
      d.tackleCd = 1.2;
    }
    return;
  }
}

/** The kid's slide tackle: win the ball if it's in reach, or end up on the grass. */
function slideContact(s: MatchState): void {
  const h = s.agents[s.humanId];
  const ball = s.ball;
  if (h.slide <= 0 || dist(h.x, h.y, ball.x, ball.y) > SLIDE_REACH || ball.z > 0.8) return;
  const owner = ball.owner >= 0 ? s.agents[ball.owner] : null;
  if (owner && (owner.side === h.side || (owner.keeper && inOwnBox(owner.side, owner.x, owner.y)))) return;
  h.slide = 0;
  if (owner) {
    s.stats[h.id].tackles += 1;
    const win = clamp(0.55 + 0.35 * h.skills.tackling + DIFFICULTY[s.setup.difficulty].humanTackleBonus - 0.2 * owner.skills.dribbling, 0.2, 0.95);
    if (!s.rng.chance(win)) {
      h.stun = 0.6;
      return;
    }
    s.stats[h.id].tacklesWon += 1;
    s.stats[owner.id].dispossessed += 1;
    record(s, 'tackle', h.side, h.id, owner.id);
    owner.stun = 0.45;
    owner.kickCd = 0.5;
  }
  // Poke it on, and bounce straight back up to chase it.
  ball.owner = -1;
  ball.last = h.id;
  ball.pass = null;
  ball.shot = null;
  ball.deflected = null;
  ball.vx = h.fx * 3.5;
  ball.vy = h.fy * 3.5;
  h.stun = 0.15;
  h.vx *= 0.3;
  h.vy *= 0.3;
}

// ─── The lines: goals, corners, goal kicks and throw-ins ────────────────────

function checkLines(s: MatchState, prevX: number, prevY: number, prevZ: number): void {
  const ball = s.ball;
  if (ball.inNet) return;

  if (ball.x < 0 || ball.x > LENGTH) {
    const lineX = ball.x < 0 ? 0 : LENGTH;
    const t = prevX === ball.x ? 1 : clamp((lineX - prevX) / (ball.x - prevX), 0, 1);
    const y = prevY + (ball.y - prevY) * t;
    const z = prevZ + (ball.z - prevZ) * t;
    const defending: Side = lineX === 0 ? 0 : 1;
    const scoring: Side = defending === 0 ? 1 : 0;
    const off = Math.abs(y - MID_Y);

    if (off < GOAL_HALF - 0.11 && z < GOAL_HEIGHT - 0.11) {
      goal(s, scoring);
      return;
    }
    if (off < GOAL_HALF + 0.15 && z < GOAL_HEIGHT + 0.15) {
      // Off the post or the bar and back into play.
      if (ball.shot) record(s, 'woodwork', s.agents[ball.shot.by].side, ball.shot.by);
      ball.x = lineX === 0 ? 0.3 : LENGTH - 0.3;
      ball.vx = -ball.vx * 0.5;
      ball.vy += s.rng.float(-3, 3);
      if (z > GOAL_HEIGHT - 0.3) ball.vz = -Math.abs(ball.vz) * 0.5;
      ball.owner = -1;
      ball.shot = null;
      return;
    }
    if (ball.shot) record(s, 'miss', s.agents[ball.shot.by].side, ball.shot.by);
    const lastSide = ball.last >= 0 ? s.agents[ball.last].side : scoring;
    if (lastSide === defending) {
      const cornerY = y < MID_Y ? 0.6 : WIDTH - 0.6;
      setRestart(s, 'corner', scoring, lineX === 0 ? 0.6 : LENGTH - 0.6, cornerY);
    } else {
      const kickX = lineX === 0 ? SIX_DEPTH : LENGTH - SIX_DEPTH;
      setRestart(s, 'goal-kick', defending, kickX, MID_Y + (y < MID_Y ? -4 : 4));
    }
    return;
  }

  if (ball.y < 0 || ball.y > WIDTH) {
    const lastSide = ball.last >= 0 ? s.agents[ball.last].side : 0;
    const side: Side = lastSide === 0 ? 1 : 0;
    setRestart(s, 'throw-in', side, clamp(ball.x, 1, LENGTH - 1), ball.y < 0 ? 0 : WIDTH);
  }
}

function goal(s: MatchState, side: Side): void {
  const ball = s.ball;
  s.score[side] += 1;
  // A shot that went in off the keeper or a defender is the shooter's.
  const deflected = ball.deflected && s.agents[ball.deflected.by].side === side ? ball.deflected : null;
  const scorerId = ball.shot?.by ?? deflected?.by ?? ball.last;
  const scorer = scorerId >= 0 ? s.agents[scorerId] : null;
  if (scorer && scorer.side === side) {
    s.stats[scorer.id].goals += 1;
    if (ball.shot || (deflected && !deflected.counted)) s.stats[scorer.id].onTarget += 1;
    const assist = scorer.receivedFrom >= 0 && s.agents[scorer.receivedFrom].side === side ? scorer.receivedFrom : -1;
    if (assist >= 0) s.stats[assist].assists += 1;
    record(s, 'goal', side, scorer.id, assist);
  } else {
    record(s, 'own-goal', side, scorer ? scorer.id : -1);
  }
  ball.inNet = true;
  ball.owner = -1;
  ball.shot = null;
  ball.deflected = null;
  ball.pass = null;
  ball.vx *= 0.35;
  ball.vy *= 0.35;
  s.phase = 'goal';
  s.phaseTime = GOAL_PAUSE;
  s.charge = -1;
}

// ─── Restarts ───────────────────────────────────────────────────────────────

function setupKickoff(s: MatchState, side: Side): void {
  for (const a of s.agents) {
    const slot = FORMATION[a.slot];
    const kx = a.keeper ? 0.02 : Math.min(slot.x * 0.9, 0.44);
    let spot = slotToWorld(a.side, kx, slot.y);
    const sign = attackSign(a.side);
    if (a.side === side && a.slot === 9) spot = { x: MID_X - sign * 0.6, y: MID_Y + 0.2 };
    if (a.side === side && a.slot === 10) spot = { x: MID_X - sign * 1.6, y: MID_Y - 6 };
    if (a.side !== side) {
      const d = dist(spot.x, spot.y, MID_X, MID_Y);
      if (d < CENTRE_RADIUS + 0.8) {
        spot.x = MID_X + ((spot.x - MID_X) / (d || 1)) * (CENTRE_RADIUS + 0.8);
        spot.y = MID_Y + ((spot.y - MID_Y) / (d || 1)) * (CENTRE_RADIUS + 0.8);
      }
    }
    a.x = spot.x;
    a.y = spot.y;
    a.vx = 0;
    a.vy = 0;
    a.fx = sign;
    a.fy = 0;
    a.stun = 0;
    a.slide = 0;
    a.kickCd = 0;
    a.receivedFrom = -1;
    a.tx = spot.x;
    a.ty = spot.y;
  }
  s.ball.inNet = false;
  setRestart(s, 'kickoff', side, MID_X, MID_Y);
  record(s, 'kickoff', side);
}

function setRestart(s: MatchState, kind: RestartKind, side: Side, x: number, y: number): void {
  const ball = s.ball;
  let taker: Agent;
  if (kind === 'goal-kick') {
    taker = s.agents.find((a) => a.side === side && a.keeper)!;
  } else if (kind === 'kickoff') {
    taker = s.agents.find((a) => a.side === side && a.slot === 9)!;
  } else {
    // Throw-ins and corners are taken by a teammate, leaving the kid free to get on the end of them.
    let best: Agent | null = null;
    let bestD = Infinity;
    for (const a of s.agents) {
      if (a.side !== side || a.keeper || a.human) continue;
      const d = dist(a.x, a.y, x, y);
      if (d < bestD) {
        bestD = d;
        best = a;
      }
    }
    taker = best!;
  }

  // Into the pitch: towards the middle for throws, towards goal for corners.
  const aimX = kind === 'corner' ? attackGoalX(side) - attackSign(side) * 11 : kind === 'kickoff' ? MID_X - attackSign(side) * 10 : MID_X;
  const aimY = MID_Y;
  const len = dist(x, y, aimX, aimY) || 1;
  const inX = (aimX - x) / len;
  const inY = (aimY - y) / len;
  taker.x = x - inX * DRIBBLE_OFFSET;
  taker.y = y - inY * DRIBBLE_OFFSET;
  taker.vx = 0;
  taker.vy = 0;
  taker.fx = inX;
  taker.fy = inY;
  taker.stun = 0;
  taker.slide = 0;
  taker.tx = taker.x;
  taker.ty = taker.y;
  taker.urgency = 0;
  taker.hold = 0;

  ball.x = x;
  ball.y = y;
  ball.z = 0;
  ball.vx = 0;
  ball.vy = 0;
  ball.vz = 0;
  ball.owner = taker.id;
  ball.last = taker.id;
  ball.pass = null;
  ball.shot = null;
  ball.deflected = null;

  // The other team stands back.
  const room = kind === 'kickoff' ? CENTRE_RADIUS : kind === 'corner' ? 6 : 4;
  for (const o of s.agents) {
    if (o.side === side) continue;
    const d = dist(o.x, o.y, x, y);
    if (d < room) {
      const ux = d > 0.01 ? (o.x - x) / d : -inX;
      const uy = d > 0.01 ? (o.y - y) / d : -inY;
      o.x = clamp(x + ux * room, 0.5, LENGTH - 0.5);
      o.y = clamp(y + uy * room, 0.5, WIDTH - 0.5);
    }
  }

  s.restart = { kind, side, x, y, taker: taker.id };
  // Nobody charges in until the ball is in play.
  s.grace = 99;
  s.phase = kind === 'kickoff' ? 'kickoff' : 'restart';
  s.phaseTime = kind === 'kickoff' ? 1 : kind === 'corner' ? 1.5 : 0.9;
  s.charge = -1;
  if (kind === 'corner') record(s, 'corner', side, taker.id);
}

function stepRestart(s: MatchState, dt: number): void {
  const restart = s.restart;
  if (!restart) {
    s.phase = 'play';
    return;
  }
  const taker = s.agents[restart.taker];
  s.ball.owner = taker.id;
  if (!taker.human) {
    taker.tx = taker.x;
    taker.ty = taker.y;
    taker.urgency = 0;
  }
  s.phaseTime -= dt;
  if (s.phaseTime > 0) return;
  if (taker.human) {
    // The kid's kick-off: after a moment it's live whether or not they've moved.
    startPlay(s);
    return;
  }

  s.phase = 'play';
  s.restart = null;
  // The other team hangs back a moment after a restart; not at a corner, where they're marking.
  s.grace = restart.kind === 'corner' ? 0 : 0.9;
  switch (restart.kind) {
    case 'kickoff': {
      const mates = s.agents.filter((a) => a.side === taker.side && (a.slot === 6 || a.slot === 7));
      const mate = mates.sort((a, b) => dist(a.x, a.y, taker.x, taker.y) - dist(b.x, b.y, taker.x, taker.y))[0];
      if (mate) passTo(s, taker, mate);
      break;
    }
    case 'throw-in': {
      let best: Agent | null = null;
      let bestValue = -Infinity;
      for (const t of s.agents) {
        if (t.side !== taker.side || t.id === taker.id || t.keeper) continue;
        const d = dist(t.x, t.y, taker.x, taker.y);
        if (d > 22) continue;
        const value = passValue(s, taker, t);
        if (value > bestValue) {
          bestValue = value;
          best = t;
        }
      }
      if (best) passTo(s, taker, best);
      else crossTo(s, taker, clamp(taker.x + attackSign(taker.side) * 12, 2, LENGTH - 2), clamp(taker.y, 10, WIDTH - 10));
      break;
    }
    case 'corner': {
      const gx = attackGoalX(taker.side);
      const sign = attackSign(taker.side);
      const kid = s.agents[s.humanId];
      let tx = gx - sign * s.rng.float(6, 11);
      let ty = MID_Y + s.rng.float(-6, 6);
      const forKid = taker.side === 0 && Math.abs(kid.x - gx) < 18 && Math.abs(kid.y - MID_Y) < 14 && s.rng.chance(0.7);
      if (forKid) {
        tx = kid.x;
        ty = kid.y;
      }
      crossTo(s, taker, tx, ty);
      // Aimed at the kid, it's the kid's ball: teammates leave it, and the kid reaches further.
      if (forKid) s.ball.pass = { from: taker.id, to: kid.id };
      break;
    }
    case 'goal-kick':
      keeperDistribute(s, taker);
      break;
  }
}

// ─── The clock ──────────────────────────────────────────────────────────────

function checkClock(s: MatchState): void {
  if (s.phase === 'goal' || s.phase === 'halftime' || s.phase === 'fulltime') return;
  if (s.clock < s.setup.halfSeconds) return;
  const ball = s.ball;
  // Let an attack that's under way finish, for a few seconds at most.
  const nearGoal = ball.x < 30 || ball.x > LENGTH - 30;
  if (s.phase === 'play' && nearGoal && s.clock < s.setup.halfSeconds + ADDED_TIME) return;
  if (s.half === 1) {
    s.phase = 'halftime';
    s.phaseTime = HALF_TIME_PAUSE;
    record(s, 'half-time', 0);
  } else {
    s.phase = 'fulltime';
    record(s, 'full-time', 0);
  }
  s.ball.owner = -1;
  s.ball.vx = 0;
  s.ball.vy = 0;
  s.charge = -1;
}

// ─── Reading the match ──────────────────────────────────────────────────────

export { minuteOf };

/** Is the kid in the middle of charging a shot, and how full is the meter (0–1)? */
export function shotCharge(s: MatchState): number | null {
  return s.charge >= 0 ? Math.min(1, s.charge / 0.95) : null;
}

/** Where the goals are, for the renderer. */
export const GOALS = { left: ownGoalX(0), right: ownGoalX(1) };
