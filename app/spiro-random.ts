export type SeedInput = number | string | null | undefined;

export type SeededRandom = () => number;

const UINT32_MAX_PLUS_ONE = 4294967296;

export function hashSeed(seed: SeedInput): number {
  if (typeof seed === 'number' && Number.isFinite(seed)) {
    return seed >>> 0;
  }

  const text = seed == null ? 'spiro-ribbons' : String(seed);
  let hash = 2166136261;

  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

export function mulberry32(seed: number): SeededRandom {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);

    return ((value ^ (value >>> 14)) >>> 0) / UINT32_MAX_PLUS_ONE;
  };
}

export function createSeededRandom(seed: SeedInput): SeededRandom {
  return mulberry32(hashSeed(seed));
}

export function randomBetween(random: SeededRandom, min: number, max: number): number {
  return min + (max - min) * random();
}

export function randomInt(random: SeededRandom, min: number, max: number): number {
  const low = Math.ceil(min);
  const high = Math.floor(max);

  return Math.floor(randomBetween(random, low, high + 1));
}

export function randomSigned(random: SeededRandom, amount = 1): number {
  return (random() * 2 - 1) * amount;
}

export function pickRandom<T>(random: SeededRandom, values: readonly T[]): T | undefined {
  if (values.length === 0) {
    return undefined;
  }

  return values[Math.floor(random() * values.length)];
}
