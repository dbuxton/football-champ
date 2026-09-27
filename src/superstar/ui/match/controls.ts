import type { Input } from '../../engine/match/types';

/**
 * The kid's buttons, from whatever they're holding: a keyboard, a game controller, or the
 * on-screen buttons on a tablet. All three feed one `Input`, read once per frame.
 *
 *   Arrow keys or WASD — run        Space or K — shoot (hold for power)
 *   X or J — pass (or shout for it)  Shift — sprint
 */

export const KEYS = {
  up: ['ArrowUp', 'w', 'W'],
  down: ['ArrowDown', 's', 'S'],
  left: ['ArrowLeft', 'a', 'A'],
  right: ['ArrowRight', 'd', 'D'],
  pass: ['x', 'X', 'j', 'J', 'z', 'Z'],
  shoot: [' ', 'k', 'K', 'c', 'C'],
  sprint: ['Shift'],
} as const;

/** Keys the game uses, whose browser default (scrolling, mostly) must be stopped. */
const GAME_KEYS = new Set<string>(Object.values(KEYS).flat());

export type Controls = {
  read(): Input;
  /** On-screen buttons write straight into these. */
  touch: { x: number; y: number; pass: boolean; shoot: boolean; sprint: boolean };
  /** Forget everything held, e.g. after a pause. */
  release(): void;
  dispose(): void;
};

export function createControls(): Controls {
  const held = new Set<string>();
  const touch = { x: 0, y: 0, pass: false, shoot: false, sprint: false };

  const down = (event: KeyboardEvent) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (GAME_KEYS.has(event.key)) event.preventDefault();
    held.add(event.key.length === 1 ? event.key.toLowerCase() : event.key);
  };
  const up = (event: KeyboardEvent) => {
    held.delete(event.key.length === 1 ? event.key.toLowerCase() : event.key);
    // Shift changes the letter a key reports ("X" vs "x"), so let go of both.
    if (event.key.length === 1) held.delete(event.key.toUpperCase());
  };
  const blur = () => held.clear();
  window.addEventListener('keydown', down);
  window.addEventListener('keyup', up);
  window.addEventListener('blur', blur);

  const any = (keys: readonly string[]) => keys.some((key) => held.has(key.length === 1 ? key.toLowerCase() : key));

  return {
    touch,
    read(): Input {
      let x = (any(KEYS.right) ? 1 : 0) - (any(KEYS.left) ? 1 : 0);
      let y = (any(KEYS.down) ? 1 : 0) - (any(KEYS.up) ? 1 : 0);
      let pass = any(KEYS.pass);
      let shoot = any(KEYS.shoot);
      let sprint = any(KEYS.sprint);

      const pad = gamepad();
      if (pad) {
        if (Math.hypot(pad.x, pad.y) > Math.hypot(x, y)) {
          x = pad.x;
          y = pad.y;
        }
        pass ||= pad.pass;
        shoot ||= pad.shoot;
        sprint ||= pad.sprint;
      }
      if (Math.hypot(touch.x, touch.y) > Math.hypot(x, y)) {
        x = touch.x;
        y = touch.y;
      }
      pass ||= touch.pass;
      shoot ||= touch.shoot;
      sprint ||= touch.sprint;
      return { x, y, pass, shoot, sprint };
    },
    release() {
      held.clear();
      touch.x = 0;
      touch.y = 0;
      touch.pass = false;
      touch.shoot = false;
      touch.sprint = false;
    },
    dispose() {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    },
  };
}

/** The first connected game controller: left stick or d-pad to run, A to pass, B to shoot, a trigger to sprint. */
function gamepad(): { x: number; y: number; pass: boolean; shoot: boolean; sprint: boolean } | null {
  if (typeof navigator === 'undefined' || !navigator.getGamepads) return null;
  for (const pad of navigator.getGamepads()) {
    if (!pad) continue;
    const pressed = (i: number) => Boolean(pad.buttons[i]?.pressed);
    let x = Math.abs(pad.axes[0] ?? 0) > 0.2 ? pad.axes[0] : 0;
    let y = Math.abs(pad.axes[1] ?? 0) > 0.2 ? pad.axes[1] : 0;
    if (pressed(14)) x = -1;
    if (pressed(15)) x = 1;
    if (pressed(12)) y = -1;
    if (pressed(13)) y = 1;
    return { x, y, pass: pressed(0), shoot: pressed(1) || pressed(2), sprint: pressed(5) || pressed(7) || pressed(4) || pressed(6) };
  }
  return null;
}

/** A phone or tablet without a mouse gets the on-screen buttons. */
export const touchScreen =
  typeof window !== 'undefined' && window.matchMedia?.('(hover: none) and (pointer: coarse)').matches === true;
