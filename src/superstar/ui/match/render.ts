import type { Kit } from '../../data/clubs';
import type { Look } from '../../engine/career';
import { mix, readableOn } from '../../data/colour';
import {
  BOX_DEPTH,
  BOX_HALF,
  CENTRE_RADIUS,
  GOAL_DEPTH,
  GOAL_HALF,
  LENGTH,
  MID_X,
  MID_Y,
  PENALTY_SPOT,
  SIX_DEPTH,
  SIX_HALF,
  WIDTH,
  clamp,
} from '../../engine/pitch';
import { shotCharge } from '../../engine/match/sim';
import type { Agent, MatchState } from '../../engine/match/types';

/**
 * Drawing a match on a canvas: a sunny stadium, a striped pitch, and little footballers in their
 * real kits. Everything is drawn from code, so there are no images to load.
 *
 * The camera looks down at a slant, like a TV camera high in the stand: the pitch is squashed a
 * little top to bottom, and players and the ball stand up out of it.
 */

/** How much the slant squashes the pitch vertically. */
const TILT = 0.78;

export type Camera = { x: number; y: number; scale: number };


export type Scene = {
  kits: [Kit, Kit];
  keeperColours: [string, string];
  /** The home team's colours fill the stands. */
  crowd: [string, string];
  kidLook: Look;
  kidLabel: string;
};

export type Particle = { x: number; y: number; z: number; vx: number; vy: number; vz: number; colour: string; life: number; spin: number };

let crowdTile: HTMLCanvasElement | null = null;
let crowdKey = '';

/** A tile of happy fans, mostly in the home colours. Made once per match. */
function crowdPattern(ctx: CanvasRenderingContext2D, colours: [string, string]): CanvasPattern | null {
  const key = colours.join();
  if (!crowdTile || crowdKey !== key) {
    crowdTile = document.createElement('canvas');
    crowdTile.width = 96;
    crowdTile.height = 96;
    const t = crowdTile.getContext('2d')!;
    t.fillStyle = mix(colours[1], '#1b1b3a', 0.55);
    t.fillRect(0, 0, 96, 96);
    const palette = [colours[0], colours[0], colours[1], '#ffffff', '#ffd23f', '#ff4f9a', '#4fc3f7', colours[0]];
    let seed = 7;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const x = col * 12 + 6 + (row % 2) * 6 + (rand() - 0.5) * 3;
        const y = row * 12 + 6 + (rand() - 0.5) * 3;
        t.fillStyle = palette[Math.floor(rand() * palette.length)];
        t.beginPath();
        t.arc(x, y + 2, 4.2, 0, Math.PI * 2);
        t.fill();
        t.fillStyle = ['#f1c9a5', '#d9a47a', '#a8744f', '#6f4a33', '#f6d8bf'][Math.floor(rand() * 5)];
        t.beginPath();
        t.arc(x, y - 3.5, 2.6, 0, Math.PI * 2);
        t.fill();
      }
    }
    crowdKey = key;
  }
  return ctx.createPattern(crowdTile, 'repeat');
}

const BOARDS = ['SUPERSTAR', 'GOAL!', 'PLAY FAIR', 'FOOTBALL CHAMP', 'YOU CAN DO IT!', 'KEEP SMILING', 'TEAMWORK', 'SHOOT!'];
const BOARD_COLOURS = ['#ff4f9a', '#ffd23f', '#4fc3f7', '#7c4dff', '#ff8a00', '#00c2a8', '#ff5252', '#8be000'];

export type View = { width: number; height: number; dpr: number };

/** World (metres) to screen (CSS pixels). */
export function toScreen(cam: Camera, view: View, x: number, y: number, z = 0): { x: number; y: number } {
  return {
    x: (x - cam.x) * cam.scale + view.width / 2,
    y: (y - cam.y) * cam.scale * TILT + view.height / 2 - z * cam.scale,
  };
}

/** Follow the kid and the ball, keeping both in shot, zooming out when they're far apart. */
export function followCamera(cam: Camera, s: MatchState, view: View, dt: number, wide = false): void {
  const kid = s.agents[s.humanId];
  const ball = s.ball;
  const cx = wide ? MID_X : kid.x * 0.4 + ball.x * 0.6;
  const cy = wide ? MID_Y : kid.y * 0.4 + ball.y * 0.6;
  // How much pitch must fit: both players with room around them, never too close or too far.
  const spanX = Math.abs(kid.x - ball.x) + 30;
  const spanY = (Math.abs(kid.y - ball.y) + 20) * TILT;
  const base = Math.min(view.width / 54, view.height / (36 * TILT));
  const fit = Math.min(view.width / spanX, view.height / spanY);
  const whole = Math.min(view.width / (LENGTH + 10), view.height / ((WIDTH + 12) * TILT));
  const scale = wide ? whole : clamp(fit, base * 0.7, base * 1.1);
  const k = 1 - Math.exp(-dt * 3.5);
  cam.scale += (scale - cam.scale) * k;
  // Don't wander so far that the view is mostly stand.
  const halfW = view.width / 2 / cam.scale;
  const halfH = view.height / 2 / (cam.scale * TILT);
  const tx = clamp(cx, -6 + halfW, LENGTH + 6 - halfW);
  const ty = clamp(cy, -5 + halfH, WIDTH + 5 - halfH);
  cam.x += ((halfW * 2 > LENGTH + 12 ? MID_X : tx) - cam.x) * k;
  cam.y += ((halfH * 2 > WIDTH + 10 ? MID_Y : ty) - cam.y) * k;
}

export function drawMatch(
  ctx: CanvasRenderingContext2D,
  s: MatchState,
  scene: Scene,
  cam: Camera,
  view: View,
  time: number,
  particles: Particle[],
): void {
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  ctx.fillStyle = '#2a2a55';
  ctx.fillRect(0, 0, view.width, view.height);

  // Everything on the ground is drawn in pitch metres through the slanted camera.
  const ox = view.width / 2 - cam.x * cam.scale;
  const oy = view.height / 2 - cam.y * cam.scale * TILT;
  ctx.setTransform(view.dpr * cam.scale, 0, 0, view.dpr * cam.scale * TILT, view.dpr * ox, view.dpr * oy);

  drawStadium(ctx, scene, time);
  drawPitch(ctx);
  drawGoalFloor(ctx);
  drawShadows(ctx, s);

  // Upright things are drawn in screen pixels, back to front.
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  drawGoalFrame(ctx, cam, view, 0, -1);
  drawGoalFrame(ctx, cam, view, LENGTH, 1);

  const order = [...s.agents].sort((a, b) => a.y - b.y);
  const kid = s.agents[s.humanId];
  if (kid.human) drawKidRing(ctx, cam, view, kid, time);
  let ballDrawn = false;
  for (const a of order) {
    if (!ballDrawn && s.ball.y < a.y) {
      drawBall(ctx, s, cam, view);
      ballDrawn = true;
    }
    drawPlayer(ctx, a, scene, cam, view, time);
  }
  if (!ballDrawn) drawBall(ctx, s, cam, view);

  drawGoalNetsFront(ctx, cam, view);
  drawParticles(ctx, particles, cam, view);
  drawLabels(ctx, s, scene, cam, view, time);
}

function drawStadium(ctx: CanvasRenderingContext2D, scene: Scene, time: number): void {
  const pattern = crowdPattern(ctx, scene.crowd);
  if (pattern) {
    // A gentle shimmer, as if the crowd is bouncing.
    const matrix = new DOMMatrix().scale(0.09, 0.09 / TILT).translate(0, Math.sin(time * 6) * 1.2);
    pattern.setTransform(matrix);
    ctx.fillStyle = pattern;
    ctx.fillRect(-40, -40, LENGTH + 80, WIDTH + 80);
  }
  // The grass runs out past the lines to the advertising boards.
  ctx.fillStyle = '#2f9e44';
  ctx.fillRect(-6, -5, LENGTH + 12, WIDTH + 10);
  // Boards all the way round.
  const boardDepth = 1.1;
  let i = 0;
  const board = (x: number, y: number, w: number, h: number, text: string) => {
    const colour = BOARD_COLOURS[i % BOARD_COLOURS.length];
    i++;
    ctx.fillStyle = colour;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = readableOn(colour);
    ctx.font = `900 ${h * 0.62}px ui-rounded, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + w / 2, y + h * 0.54, w * 0.92);
  };
  const across = (LENGTH + 12) / 6;
  for (let n = 0; n < 6; n++) {
    board(-6 + n * across, -5 - boardDepth, across - 0.25, boardDepth, BOARDS[n % BOARDS.length]);
    board(-6 + n * across, WIDTH + 5, across - 0.25, boardDepth, BOARDS[(n + 3) % BOARDS.length]);
  }
}

function drawPitch(ctx: CanvasRenderingContext2D): void {
  // Mown stripes.
  const stripes = 18;
  const w = LENGTH / stripes;
  for (let n = 0; n < stripes; n++) {
    ctx.fillStyle = n % 2 === 0 ? '#43b649' : '#4fc456';
    ctx.fillRect(n * w, 0, w + 0.02, WIDTH);
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.95)';
  ctx.lineWidth = 0.14;
  ctx.strokeRect(0, 0, LENGTH, WIDTH);
  ctx.beginPath();
  ctx.moveTo(MID_X, 0);
  ctx.lineTo(MID_X, WIDTH);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(MID_X, MID_Y, CENTRE_RADIUS, 0, Math.PI * 2);
  ctx.stroke();
  for (const [gx, dir] of [
    [0, 1],
    [LENGTH, -1],
  ] as const) {
    ctx.strokeRect(dir > 0 ? gx : gx - BOX_DEPTH, MID_Y - BOX_HALF, BOX_DEPTH, BOX_HALF * 2);
    ctx.strokeRect(dir > 0 ? gx : gx - SIX_DEPTH, MID_Y - SIX_HALF, SIX_DEPTH, SIX_HALF * 2);
    const spot = gx + dir * PENALTY_SPOT;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(spot, MID_Y, 0.22, 0, Math.PI * 2);
    ctx.fill();
    // The D at the edge of the box.
    const edge = Math.acos(clamp((BOX_DEPTH - PENALTY_SPOT) / CENTRE_RADIUS, -1, 1));
    ctx.beginPath();
    if (dir > 0) ctx.arc(spot, MID_Y, CENTRE_RADIUS, -edge, edge);
    else ctx.arc(spot, MID_Y, CENTRE_RADIUS, Math.PI - edge, Math.PI + edge);
    ctx.stroke();
  }
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(MID_X, MID_Y, 0.25, 0, Math.PI * 2);
  ctx.fill();
  // Corner flags' arcs.
  for (const [cx, cy, a0] of [
    [0, 0, 0],
    [LENGTH, 0, Math.PI / 2],
    [LENGTH, WIDTH, Math.PI],
    [0, WIDTH, (3 * Math.PI) / 2],
  ] as const) {
    ctx.beginPath();
    ctx.arc(cx, cy, 1, a0, a0 + Math.PI / 2);
    ctx.stroke();
  }
}

function drawGoalFloor(ctx: CanvasRenderingContext2D): void {
  // The patch of grass inside each goal, under the net.
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(-GOAL_DEPTH, MID_Y - GOAL_HALF, GOAL_DEPTH, GOAL_HALF * 2);
  ctx.fillRect(LENGTH, MID_Y - GOAL_HALF, GOAL_DEPTH, GOAL_HALF * 2);
}

function drawShadows(ctx: CanvasRenderingContext2D, s: MatchState): void {
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  for (const a of s.agents) {
    ctx.beginPath();
    ctx.ellipse(a.x + 0.25, a.y + 0.15, 0.55, 0.32 / TILT, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  const ball = s.ball;
  const shrink = 1 / (1 + ball.z * 0.25);
  ctx.fillStyle = `rgba(0,0,0,${0.3 * shrink})`;
  ctx.beginPath();
  ctx.ellipse(ball.x + ball.z * 0.35, ball.y + ball.z * 0.2, 0.3 * shrink, (0.2 * shrink) / TILT, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** The posts and crossbar, standing up at each end. */
function drawGoalFrame(ctx: CanvasRenderingContext2D, cam: Camera, view: View, lineX: number, back: -1 | 1): void {
  const top = toScreen(cam, view, lineX, MID_Y - GOAL_HALF, 2.44);
  const bottom = toScreen(cam, view, lineX, MID_Y + GOAL_HALF, 2.44);
  const top0 = toScreen(cam, view, lineX, MID_Y - GOAL_HALF, 0);
  const backTop = toScreen(cam, view, lineX + back * GOAL_DEPTH, MID_Y - GOAL_HALF, 1.6);
  const backBottom = toScreen(cam, view, lineX + back * GOAL_DEPTH, MID_Y + GOAL_HALF, 1.6);
  const backTop0 = toScreen(cam, view, lineX + back * GOAL_DEPTH, MID_Y - GOAL_HALF, 0);
  const backBottom0 = toScreen(cam, view, lineX + back * GOAL_DEPTH, MID_Y + GOAL_HALF, 0);
  // The net: a see-through box with a mesh.
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.beginPath();
  ctx.moveTo(top.x, top.y);
  ctx.lineTo(backTop.x, backTop.y);
  ctx.lineTo(backBottom.x, backBottom.y);
  ctx.lineTo(bottom.x, bottom.y);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 1;
  const mesh = 10;
  for (let n = 1; n < mesh; n++) {
    const t = n / mesh;
    ctx.beginPath();
    ctx.moveTo(top.x + (bottom.x - top.x) * t, top.y + (bottom.y - top.y) * t);
    ctx.lineTo(backTop.x + (backBottom.x - backTop.x) * t, backTop.y + (backBottom.y - backTop.y) * t);
    ctx.lineTo(backTop0.x + (backBottom0.x - backTop0.x) * t, backTop0.y + (backBottom0.y - backTop0.y) * t);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(backTop.x, backTop.y);
  ctx.lineTo(backTop0.x, backTop0.y);
  ctx.moveTo(backBottom.x, backBottom.y);
  ctx.lineTo(backBottom0.x, backBottom0.y);
  ctx.stroke();
  // Posts and bar (the near post is drawn after the players, below).
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = Math.max(2, cam.scale * 0.14);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(top0.x, top0.y);
  ctx.lineTo(top.x, top.y);
  ctx.lineTo(bottom.x, bottom.y);
  ctx.stroke();
}

function drawGoalNetsFront(ctx: CanvasRenderingContext2D, cam: Camera, view: View): void {
  // The near post at each end sits in front of anyone standing on the goal line.
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = Math.max(2, cam.scale * 0.14);
  ctx.lineCap = 'round';
  for (const lineX of [0, LENGTH]) {
    const a = toScreen(cam, view, lineX, MID_Y + GOAL_HALF, 0);
    const b = toScreen(cam, view, lineX, MID_Y + GOAL_HALF, 2.44);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
}

function drawKidRing(ctx: CanvasRenderingContext2D, cam: Camera, view: View, kid: Agent, time: number): void {
  const p = toScreen(cam, view, kid.x, kid.y);
  const pulse = 1 + Math.sin(time * 6) * 0.08;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.scale(1, TILT);
  ctx.strokeStyle = '#ffe600';
  ctx.lineWidth = 3;
  ctx.shadowColor = '#ffe600';
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.arc(0, 0, cam.scale * 0.95 * pulse, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawPlayer(ctx: CanvasRenderingContext2D, a: Agent, scene: Scene, cam: Camera, view: View, time: number): void {
  const p = toScreen(cam, view, a.x, a.y);
  const u = cam.scale; // pixels per metre
  const kit = scene.kits[a.side];
  const keeperShirt = scene.keeperColours[a.side];
  const shirt = a.keeper ? keeperShirt : kit.shirt;
  const trim = a.keeper ? mix(keeperShirt, '#000000', 0.35) : kit.trim;
  const shorts = a.keeper ? mix(keeperShirt, '#000000', 0.45) : kit.shorts;
  const socks = a.keeper ? keeperShirt : kit.socks;
  const look: Look = a.human ? scene.kidLook : lookFor(a);
  const facing = a.fx >= 0 ? 1 : -1;
  const speed = Math.hypot(a.vx, a.vy);
  const swing = speed > 0.4 ? Math.sin(a.stride * 2.2) : 0;

  ctx.save();
  ctx.translate(p.x, p.y);
  if (a.slide > 0 || (a.keeper && a.diving)) {
    // Sliding or diving: lying almost flat, heading the way they're going.
    const dir = a.keeper ? (a.vy >= 0 ? 1 : -1) : facing;
    ctx.rotate(dir * 1.25);
  } else if (a.stun > 0) {
    ctx.rotate(Math.sin(time * 20) * 0.12);
  }
  ctx.scale(facing, 1);

  const h = u * 1.75; // standing height in pixels
  const legTop = -h * 0.42;
  // Legs: socks and boots, swinging as they run.
  const leg = (offset: number, phase: number) => {
    const kickOut = phase * h * 0.12;
    ctx.strokeStyle = socks;
    ctx.lineWidth = Math.max(2, u * 0.16);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(offset, legTop);
    ctx.lineTo(offset + kickOut, -h * 0.06);
    ctx.stroke();
    ctx.fillStyle = a.human ? look.boots : '#1b1b1b';
    ctx.beginPath();
    ctx.ellipse(offset + kickOut + u * 0.07, -h * 0.03, u * 0.13, u * 0.07, 0, 0, Math.PI * 2);
    ctx.fill();
  };
  leg(-u * 0.08, swing);
  leg(u * 0.08, -swing);

  // Shorts.
  ctx.fillStyle = shorts;
  roundRect(ctx, -u * 0.22, -h * 0.5, u * 0.44, h * 0.13, u * 0.05);
  ctx.fill();

  // Shirt, with the club's pattern.
  const shirtTop = -h * 0.83;
  const shirtH = h * 0.36;
  const shirtW = u * 0.5;
  ctx.save();
  roundRect(ctx, -shirtW / 2, shirtTop, shirtW, shirtH, u * 0.1);
  ctx.fillStyle = shirt;
  ctx.fill();
  ctx.clip();
  if (!a.keeper) drawPattern(ctx, kit, -shirtW / 2, shirtTop, shirtW, shirtH);
  ctx.restore();
  // Arms swinging the other way to the legs.
  ctx.strokeStyle = !a.keeper && kit.pattern === 'sleeves' ? kit.trim : shirt;
  ctx.lineWidth = Math.max(2, u * 0.13);
  ctx.beginPath();
  ctx.moveTo(-shirtW * 0.45, shirtTop + u * 0.1);
  ctx.lineTo(-shirtW * 0.55 - swing * u * 0.12, shirtTop + shirtH * 0.85);
  ctx.moveTo(shirtW * 0.45, shirtTop + u * 0.1);
  ctx.lineTo(shirtW * 0.55 + swing * u * 0.12, shirtTop + shirtH * 0.85);
  ctx.stroke();
  // Number on the shirt, big enough to read up close.
  if (u > 14) {
    ctx.fillStyle = a.keeper ? readableOn(shirt) : kit.number;
    ctx.font = `900 ${u * 0.26}px ui-rounded, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.save();
    ctx.scale(facing, 1);
    ctx.fillText(String(a.number), 0, shirtTop + shirtH * 0.52);
    ctx.restore();
  }
  // Collar.
  ctx.fillStyle = trim;
  ctx.fillRect(-u * 0.09, shirtTop - u * 0.01, u * 0.18, u * 0.06);

  // Head and hair.
  const headY = -h * 0.92;
  const headR = u * 0.17;
  ctx.fillStyle = look.skin;
  ctx.beginPath();
  ctx.arc(u * 0.02, headY, headR, 0, Math.PI * 2);
  ctx.fill();
  drawHair(ctx, look, u * 0.02, headY, headR);
  ctx.restore();
}

function drawPattern(ctx: CanvasRenderingContext2D, kit: Kit, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = kit.trim;
  switch (kit.pattern) {
    case 'stripes': {
      const n = 5;
      for (let i = 1; i < n; i += 2) ctx.fillRect(x + (w / n) * i, y, w / n, h);
      break;
    }
    case 'hoops': {
      const n = 5;
      for (let i = 1; i < n; i += 2) ctx.fillRect(x, y + (h / n) * i, w, h / n);
      break;
    }
    case 'halves':
      ctx.fillRect(x + w / 2, y, w / 2, h);
      break;
    case 'sash':
      ctx.beginPath();
      ctx.moveTo(x, y + h * 0.1);
      ctx.lineTo(x + w * 0.35, y);
      ctx.lineTo(x + w, y + h * 0.75);
      ctx.lineTo(x + w * 0.7, y + h);
      ctx.closePath();
      ctx.fill();
      break;
    case 'sleeves':
      ctx.fillRect(x, y, w * 0.14, h * 0.5);
      ctx.fillRect(x + w * 0.86, y, w * 0.14, h * 0.5);
      break;
    default:
      break;
  }
}

function drawHair(ctx: CanvasRenderingContext2D, look: Look, x: number, y: number, r: number): void {
  ctx.fillStyle = look.hair;
  switch (look.hairStyle) {
    case 'buzz':
      ctx.beginPath();
      ctx.arc(x, y - r * 0.15, r * 0.95, Math.PI * 1.05, Math.PI * 1.95);
      ctx.fill();
      break;
    case 'long':
      ctx.beginPath();
      ctx.arc(x, y - r * 0.1, r * 1.08, Math.PI * 0.95, Math.PI * 2.05);
      ctx.fill();
      ctx.fillRect(x - r * 1.05, y - r * 0.2, r * 0.5, r * 1.6);
      break;
    case 'bun':
      ctx.beginPath();
      ctx.arc(x, y - r * 0.1, r * 1.02, Math.PI * 0.95, Math.PI * 2.05);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x - r * 0.4, y - r * 1.15, r * 0.5, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'curly':
      for (let i = 0; i < 6; i++) {
        const angle = Math.PI * (1 + i / 5);
        ctx.beginPath();
        ctx.arc(x + Math.cos(angle) * r * 0.85, y + Math.sin(angle) * r * 0.85, r * 0.42, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case 'spiky':
      ctx.beginPath();
      ctx.moveTo(x - r, y - r * 0.1);
      for (let i = 0; i <= 5; i++) {
        const px = x - r + (2 * r * i) / 5;
        ctx.lineTo(px, y - r * (i % 2 === 0 ? 0.9 : 1.6));
      }
      ctx.lineTo(x + r, y - r * 0.1);
      ctx.closePath();
      ctx.fill();
      break;
    default:
      ctx.beginPath();
      ctx.arc(x, y - r * 0.12, r * 1.02, Math.PI * 1.0, Math.PI * 2.0);
      ctx.fill();
      break;
  }
}

const SKINS = ['#f1c9a5', '#e0ac85', '#c68e67', '#a8744f', '#8a5a3b', '#6f4a33'];
const HAIRS = ['#2b1b0e', '#4a2c16', '#8a5a2b', '#d9a441', '#1a1a1a', '#b5462b'];
const STYLES: Look['hairStyle'][] = ['short', 'buzz', 'curly', 'short', 'spiky', 'short'];

/** Everyone else gets a look of their own, the same every match. */
function lookFor(a: Agent): Look {
  let h = 0;
  for (let i = 0; i < a.name.length; i++) h = (h * 31 + a.name.charCodeAt(i)) >>> 0;
  return {
    skin: SKINS[h % SKINS.length],
    hair: HAIRS[(h >> 4) % HAIRS.length],
    hairStyle: STYLES[(h >> 8) % STYLES.length],
    boots: '#1b1b1b',
  };
}

function drawBall(ctx: CanvasRenderingContext2D, s: MatchState, cam: Camera, view: View): void {
  const ball = s.ball;
  const p = toScreen(cam, view, ball.x, ball.y, ball.z);
  const r = Math.max(4, cam.scale * 0.3);
  ctx.save();
  ctx.translate(p.x, p.y - r * 0.9);
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#222';
  ctx.lineWidth = Math.max(1, r * 0.12);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // Patches that roll as it moves.
  ctx.rotate(ball.spin);
  ctx.fillStyle = '#222';
  for (let i = 0; i < 3; i++) {
    const angle = (i / 3) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(Math.cos(angle) * r * 0.55, Math.sin(angle) * r * 0.55, r * 0.26, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawParticles(ctx: CanvasRenderingContext2D, particles: Particle[], cam: Camera, view: View): void {
  for (const q of particles) {
    const p = toScreen(cam, view, q.x, q.y, q.z);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(q.spin);
    ctx.globalAlpha = Math.min(1, q.life * 2);
    ctx.fillStyle = q.colour;
    ctx.fillRect(-cam.scale * 0.12, -cam.scale * 0.06, cam.scale * 0.24, cam.scale * 0.12);
    ctx.restore();
  }
}

/** Names over the kid and whoever has the ball, a shout bubble and the shot meter. */
function drawLabels(ctx: CanvasRenderingContext2D, s: MatchState, scene: Scene, cam: Camera, view: View, time: number): void {
  const kid = s.agents[s.humanId];
  const u = cam.scale;
  const owner = s.ball.owner >= 0 ? s.agents[s.ball.owner] : null;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  if (owner && !owner.human) {
    const p = toScreen(cam, view, owner.x, owner.y);
    label(ctx, owner.shortName, p.x, p.y - u * 2.25, scene.kits[owner.side].shirt, Math.max(11, u * 0.5));
  }

  if (!kid.human) return;
  const p = toScreen(cam, view, kid.x, kid.y);
  const bob = Math.sin(time * 5) * u * 0.1;
  const tagY = p.y - u * 2.35 + bob;
  label(ctx, scene.kidLabel, p.x, tagY, '#ffe600', Math.max(12, u * 0.55));
  // An arrow pointing down at the kid.
  ctx.fillStyle = '#ffe600';
  ctx.strokeStyle = '#1b1b3a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(p.x - u * 0.28, tagY + u * 0.45);
  ctx.lineTo(p.x + u * 0.28, tagY + u * 0.45);
  ctx.lineTo(p.x, tagY + u * 0.8);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  if (s.calling > 0 && s.ball.owner !== kid.id) {
    bubble(ctx, 'Pass!', p.x + u * 1.1, p.y - u * 2.9, Math.max(12, u * 0.5));
  }

  const charge = shotCharge(s);
  if (charge !== null) {
    const r = u * 1.1;
    const cy = p.y - u * 1;
    ctx.lineWidth = Math.max(4, u * 0.22);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.arc(p.x, cy, r, Math.PI * 0.8, Math.PI * 2.2);
    ctx.stroke();
    ctx.strokeStyle = charge < 0.6 ? '#8be000' : charge < 0.95 ? '#ffd23f' : '#ff5252';
    ctx.beginPath();
    ctx.arc(p.x, cy, r, Math.PI * 0.8, Math.PI * (0.8 + 1.4 * charge));
    ctx.stroke();
  }
}

function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, colour: string, size: number): void {
  ctx.font = `900 ${size}px ui-rounded, system-ui, sans-serif`;
  const w = ctx.measureText(text).width + size * 0.9;
  const h = size * 1.35;
  ctx.fillStyle = colour;
  roundRect(ctx, x - w / 2, y - h / 2, w, h, h / 2);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.stroke();
  ctx.fillStyle = readableOn(colour);
  ctx.fillText(text, x, y + size * 0.04);
}

function bubble(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number): void {
  ctx.font = `900 ${size}px ui-rounded, system-ui, sans-serif`;
  const w = ctx.measureText(text).width + size;
  const h = size * 1.5;
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#1b1b3a';
  ctx.lineWidth = 2;
  roundRect(ctx, x - w / 2, y - h / 2, w, h, h / 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#1b1b3a';
  ctx.fillText(text, x, y + size * 0.05);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** The little radar in the corner: the whole pitch, everyone on it. */
export function drawMiniMap(ctx: CanvasRenderingContext2D, s: MatchState, scene: Scene, width: number, height: number, dpr: number): void {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  const sx = width / (LENGTH + 4);
  const sy = height / (WIDTH + 4);
  ctx.fillStyle = 'rgba(40,140,60,0.85)';
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.lineWidth = 1;
  ctx.strokeRect(2 * sx, 2 * sy, LENGTH * sx, WIDTH * sy);
  ctx.beginPath();
  ctx.moveTo((2 + MID_X) * sx, 2 * sy);
  ctx.lineTo((2 + MID_X) * sx, (2 + WIDTH) * sy);
  ctx.stroke();
  for (const a of s.agents) {
    ctx.fillStyle = a.keeper ? scene.keeperColours[a.side] : scene.kits[a.side].shirt;
    ctx.strokeStyle = a.human ? '#ffe600' : 'rgba(0,0,0,0.6)';
    ctx.lineWidth = a.human ? 2.5 : 1;
    ctx.beginPath();
    ctx.arc((2 + a.x) * sx, (2 + a.y) * sy, a.human ? 4.5 : 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc((2 + s.ball.x) * sx, (2 + s.ball.y) * sy, 2.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}
