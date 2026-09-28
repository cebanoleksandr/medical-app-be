/**
 * Small seeded PRNG (sfc32, seeded through splitmix32). Seeding is a few
 * integer ops, so a fresh generator per record is cheap: Faker's Mersenne
 * Twister made per-record seeding the main cost of generating 100k records.
 */
export class Rng {
  private a: number;
  private b: number;
  private c: number;
  private d: number;

  constructor(...seed: number[]) {
    let h = 0x9e3779b9;
    for (const s of seed) h = splitmix32(h ^ (s >>> 0));
    this.a = splitmix32(h);
    this.b = splitmix32(this.a);
    this.c = splitmix32(this.b);
    this.d = splitmix32(this.c);
    for (let i = 0; i < 12; i++) this.next();
  }

  /** Uniform float in [0, 1). */
  next(): number {
    const t = (((this.a + this.b) | 0) + this.d) | 0;
    this.d = (this.d + 1) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.c = (this.c + t) | 0;
    return (t >>> 0) / 4294967296;
  }

  /** Integer in [min, max], both inclusive. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  float(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  chance(probability: number): boolean {
    return this.next() < probability;
  }

  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)];
  }

  weighted<T>(items: readonly { weight: number; value: T }[]): T {
    const total = items.reduce((sum, i) => sum + i.weight, 0);
    let roll = this.next() * total;
    for (const item of items) {
      roll -= item.weight;
      if (roll < 0) return item.value;
    }
    return items[items.length - 1].value;
  }
}

function splitmix32(x: number): number {
  x = (x + 0x9e3779b9) | 0;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  return (x ^ (x >>> 16)) >>> 0;
}

/**
 * Faker `randomizer` backed by Rng, so reseeding Faker per value costs a few
 * integer ops instead of a Mersenne Twister initialisation.
 */
export class RngRandomizer {
  private rng = new Rng(0);

  next(): number {
    return this.rng.next();
  }

  seed(seed: number | number[]): void {
    this.rng = new Rng(...(Array.isArray(seed) ? seed : [seed]));
  }
}
