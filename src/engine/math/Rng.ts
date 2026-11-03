/**
 * Générateur pseudo-aléatoire déterministe (mulberry32).
 * Indispensable pour un roguelike : même graine = même run (seeds partageables, replays, tests).
 */
export class Rng {
  private s: number;
  constructor(seed: number = Date.now()) { this.s = seed >>> 0; }

  get seed(): number { return this.s; }

  /** Flottant dans [0, 1[. */
  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(min: number, max: number): number { return min + (max - min) * this.next(); }
  int(min: number, maxInclusive: number): number { return Math.floor(this.range(min, maxInclusive + 1)); }
  chance(p: number): boolean { return this.next() < p; }
  pick<T>(arr: readonly T[]): T { return arr[Math.floor(this.next() * arr.length)]; }
  /** Tirage pondéré : `weights[i]` est le poids de `items[i]`. */
  weighted<T>(items: readonly T[], weights: readonly number[]): T {
    let total = 0;
    for (const w of weights) total += w;
    let r = this.next() * total;
    for (let i = 0; i < items.length; i++) { r -= weights[i]; if (r < 0) return items[i]; }
    return items[items.length - 1];
  }
}
