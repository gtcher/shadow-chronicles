// Implémentation de référence du défi quotidien (Shadow Chronicles).
// Module ES sans dépendance ; à porter tel quel en TypeScript dans le moteur.

/** Hash cyrb53 (domaine public). Renvoie un entier sur 53 bits. */
export function cyrb53(str, seed = 0) {
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/** PRNG mulberry32 : renvoie une fonction next() -> uint32. */
export function mulberry32(a) {
  return function next() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (t ^ (t >>> 14)) >>> 0;
  };
}

/** Flux nommé : { uint(), float(), int(min,max), pick(arr), weighted(items, key='weight'), shuffle(arr) } */
export function stream(baseSeed, name) {
  const next = mulberry32(cyrb53(baseSeed + ':' + name) >>> 0);
  const float = () => next() / 4294967296;
  return {
    uint: next,
    float,
    int: (min, max) => min + Math.floor(float() * (max - min + 1)),
    pick: (arr) => arr[Math.floor(float() * arr.length)],
    weighted(items, key = 'weight') {
      const total = items.reduce((s, it) => s + (it[key] ?? 0), 0);
      let r = float() * total;
      for (const it of items) { r -= it[key] ?? 0; if (r < 0) return it; }
      return items[items.length - 1];
    },
    shuffle(arr) {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(float() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
      return a;
    }
  };
}

const pad = (n) => String(n).padStart(2, '0');
export function dailySeedString(date = new Date()) {
  return `SC-D-${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/** Construit la configuration du jour à partir de daily.json. */
export function buildDaily(daily, date = new Date()) {
  const seedString = dailySeedString(date);
  const s = stream(seedString, 'setup');
  const heroes = daily.setup.hero.pool;
  // Règle : pas le même héros que la veille.
  const yesterday = new Date(date.getTime() - 86400000);
  const prevHero = heroes[stream(dailySeedString(yesterday), 'setup').int(0, heroes.length - 1)];
  let heroIdx = s.int(0, heroes.length - 1);
  if (heroes[heroIdx] === prevHero) heroIdx = (heroIdx + 1) % heroes.length;
  const mode = s.weighted(daily.setup.mode.pool).id;
  const pickMods = (type, n) => {
    const out = [], families = new Set();
    for (const m of s.shuffle(daily.modifiers.filter((m) => m.type === type))) {
      if (out.length >= n) break;
      if (daily.setup.modifiers.noDuplicateFamily && families.has(m.family)) continue;
      families.add(m.family); out.push(m.id);
    }
    return out;
  };
  return {
    seedString,
    hero: heroes[heroIdx],
    mode,
    waves: daily.setup.waves,
    modifiers: [...pickMods('positive', daily.setup.modifiers.positive), ...pickMods('negative', daily.setup.modifiers.negative)],
    streams: Object.fromEntries(daily.seed.streams.list.map((n) => [n, stream(seedString, n)]))
  };
}
