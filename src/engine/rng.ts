/**
 * Deterministic seeded pseudo-random number generation.
 *
 * Every random decision in the simulation flows through one of these generators, and the
 * generator state is part of the save game. That means a season replays identically from the
 * same seed, which is what makes the engine testable and the soak test meaningful.
 */

export class Rng {
  private s: number;

  constructor(seed: number) {
    // Avoid the degenerate zero state.
    this.s = (seed >>> 0) || 0x9e3779b9;
  }

  /** Raw state, so the generator can be serialised into a save. */
  get state(): number {
    return this.s;
  }

  static fromState(state: number): Rng {
    const r = new Rng(1);
    r.s = state >>> 0;
    return r;
  }

  /** mulberry32 — small, fast, and good enough for a football sim. */
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Float in [min, max). */
  float(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    if (max <= min) return min;
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** True with probability p. */
  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)];
  }

  /** Weighted pick. Weights need not sum to 1. */
  weighted<T>(items: readonly T[], weightOf: (item: T, index: number) => number): T {
    let total = 0;
    const weights = items.map((it, i) => {
      const w = Math.max(0, weightOf(it, i));
      total += w;
      return w;
    });
    if (total <= 0) return this.pick(items);
    let roll = this.next() * total;
    for (let i = 0; i < items.length; i++) {
      roll -= weights[i];
      if (roll <= 0) return items[i];
    }
    return items[items.length - 1];
  }

  /** Fisher-Yates, in place. */
  shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
  }

  /**
   * Approximately normal, via the mean of 3 uniforms. Clamped to +/- 3 sigma so a single
   * freak roll can never produce an absurd player or a 14-goal thrashing.
   */
  gaussian(mean = 0, sd = 1): number {
    const u = (this.next() + this.next() + this.next()) / 3;
    const z = (u - 0.5) * 3.4641016151377544; // sqrt(12) scales variance back to 1
    return mean + clamp(z, -3, 3) * sd;
  }
}

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/** Cheap deterministic string hash, used to derive stable per-entity seeds. */
export function hashString(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Derive a child seed from a parent seed plus a label. */
export function deriveSeed(seed: number, label: string): number {
  return (hashString(label) ^ Math.imul(seed, 2654435761)) >>> 0;
}
