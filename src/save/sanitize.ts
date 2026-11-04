/**
 * Nettoyage défensif : tout ce qui sort du stockage ou d'un fichier importé passe ici.
 * Un champ absent, du mauvais type ou hors limites reprend sa valeur par défaut :
 * une sauvegarde abîmée ou bricolée ne fait jamais planter le jeu.
 */
import sanctuaryData from '../../data/sanctuary.json';
import { defaultProfile, defaultSettings } from './defaults';
import { CURRENT_VERSION, HERO_IDS, type GameMode, type HeroId, type Profile, type RunSnapshot, type Settings } from './types';

const MAX = 1e12;
type Obj = Record<string, unknown>;

export const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
export function num(v: unknown, def = 0, min = 0, max = MAX): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
}
export const int = (v: unknown, def = 0, min = 0, max = MAX) => Math.floor(num(v, def, min, max));
const bool = (v: unknown, def: boolean) => (typeof v === 'boolean' ? v : def);
const str = (v: unknown, def: string, maxLen = 200) => (typeof v === 'string' ? v.slice(0, maxLen) : def);
const strList = (v: unknown, maxLen = 2000) =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string').map((x) => x.slice(0, 120)))].slice(0, maxLen) : [];
const intList = (v: unknown) => (Array.isArray(v) ? [...new Set(v.map((x) => int(x, -1)).filter((x) => x >= 0))] : []);
function numMap(v: unknown, min = 0, max = MAX, maxKeys = 500): Record<string, number> {
  const out: Record<string, number> = {};
  if (!isObj(v)) return out;
  for (const [k, x] of Object.entries(v).slice(0, maxKeys)) {
    const n = num(x, NaN, min, max);
    if (!Number.isNaN(n)) out[k.slice(0, 80)] = n;
  }
  return out;
}
const isHero = (v: unknown): v is HeroId => typeof v === 'string' && (HERO_IDS as readonly string[]).includes(v);
const isMode = (v: unknown): v is GameMode => v === 'survie' || v === 'cauchemar';
const isDay = (k: string) => /^\d{4}-\d{2}-\d{2}$/.test(k);
const isoOr = (v: unknown, def: string) => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? v : def);

/** Rang maximum de chaque amélioration du Sanctuaire, lu dans sanctuary.json. */
export const SANCTUARY_MAX: Record<string, Record<string, number>> = Object.fromEntries(
  (sanctuaryData as { buildings: { id: string; upgrades: { id: string; maxRank: number }[] }[] }).buildings.map((b) => [
    b.id,
    Object.fromEntries(b.upgrades.map((u) => [u.id, u.maxRank])),
  ]),
);

export function sanitizeProfile(raw: unknown): Profile {
  const d = defaultProfile();
  const o = isObj(raw) ? raw : {};
  const p: Profile = { ...d };
  p.version = CURRENT_VERSION.profile;
  p.id = str(o.id, d.id, 64) || d.id;
  p.createdAt = isoOr(o.createdAt, d.createdAt);
  p.updatedAt = isoOr(o.updatedAt, d.updatedAt);
  p.rev = int(o.rev);

  const cur = isObj(o.currencies) ? o.currencies : {};
  p.currencies = { eclats: int(cur.eclats, 0, 0, 9_999_999), poussiere: int(cur.poussiere, 0, 0, 9_999_999), sceaux: int(cur.sceaux, 0, 0, 99_999) };

  // Seuls les bâtiments et améliorations connus sont gardés, rang borné par maxRank.
  const sanc = isObj(o.sanctuary) ? o.sanctuary : {};
  p.sanctuary = {};
  for (const [b, ups] of Object.entries(SANCTUARY_MAX)) {
    const src = isObj(sanc[b]) ? (sanc[b] as Obj) : {};
    p.sanctuary[b] = {};
    for (const [u, max] of Object.entries(ups)) {
      const r = int(src[u], 0, 0, max);
      if (r > 0) p.sanctuary[b][u] = r;
    }
  }

  p.buildingsUnlocked = strList(o.buildingsUnlocked, 20).filter((b) => b in SANCTUARY_MAX);

  const st = isObj(o.stats) ? o.stats : {};
  const bw = isObj(st.bestWaveByMode) ? st.bestWaveByMode : {};
  p.stats = {
    lifetime: numMap(st.lifetime),
    best: numMap(st.best, -MAX),
    bestWaveByMode: { survie: int(bw.survie, 0, 0, 9999), cauchemar: int(bw.cauchemar, 0, 0, 9999) },
    playTimeSec: num(st.playTimeSec),
  };

  p.achievements = numMap(o.achievements);

  const m = isObj(o.mastery) ? o.mastery : {};
  p.mastery = { ...d.mastery };
  for (const h of HERO_IDS) {
    const x = isObj(m[h]) ? (m[h] as Obj) : {};
    p.mastery[h] = { xp: int(x.xp), runs: int(x.runs), wins: int(x.wins) };
  }

  const pity = isObj(o.pity) ? o.pity : {};
  p.pity = { legendary: int(pity.legendary, 0, 0, 1e6), ancestral: int(pity.ancestral, 0, 0, 1e6) };

  const pa = isObj(o.pacts) ? o.pacts : {};
  p.pacts = { unlocked: bool(pa.unlocked, false), bestPoints: int(pa.bestPoints, 0, 0, 999), milestonesClaimed: intList(pa.milestonesClaimed) };

  const dy = isObj(o.daily) ? o.daily : {};
  const history: Profile['daily']['history'] = {};
  if (isObj(dy.history)) {
    const days = Object.keys(dy.history).filter(isDay).sort().slice(-30);
    for (const day of days) {
      const e = (dy.history as Obj)[day];
      if (!isObj(e)) continue;
      history[day] = { score: int(e.score), wave: int(e.wave, 0, 0, 9999), hero: isHero(e.hero) ? e.hero : 'taro', won: bool(e.won, false), at: int(e.at) };
    }
  }
  p.daily = {
    lastDay: typeof dy.lastDay === 'string' && isDay(dy.lastDay) ? dy.lastDay : null,
    streak: int(dy.streak, 0, 0, 99_999),
    streakMax: int(dy.streakMax, 0, 0, 99_999),
    graceTokens: int(dy.graceTokens, 0, 0, 1),
    streakMilestonesClaimed: intList(dy.streakMilestonesClaimed),
    history,
    weeklyDone: strList(dy.weeklyDone, 104).filter((w) => /^\d{4}-W\d{2}$/.test(w)),
    completed: int(dy.completed),
  };
  p.daily.streakMax = Math.max(p.daily.streakMax, p.daily.streak);

  const un = isObj(o.unlocks) ? o.unlocks : {};
  const equipped: Profile['unlocks']['equipped'] = {};
  if (isObj(un.equipped)) {
    for (const h of HERO_IDS) {
      const e = (un.equipped as Obj)[h];
      if (!isObj(e)) continue;
      const slot: { title?: string; skin?: string; trail?: string } = {};
      for (const k of ['title', 'skin', 'trail'] as const) if (typeof e[k] === 'string') slot[k] = (e[k] as string).slice(0, 80);
      equipped[h] = slot;
    }
  }
  p.unlocks = {
    titles: strList(un.titles), cosmetics: strList(un.cosmetics), equipped,
    seenBlessings: strList(un.seenBlessings), seenDuos: strList(un.seenDuos), seenLegendaryPowers: strList(un.seenLegendaryPowers),
  };

  if (isObj(o.missions) && typeof o.missions.day === 'string' && isDay(o.missions.day)) {
    const m = o.missions, progress: Record<string, number> = {};
    if (isObj(m.progress)) for (const [k, v] of Object.entries(m.progress).slice(0, 12)) progress[k.slice(0, 40)] = int(v, 0, 0, 1e9);
    p.missions = { day: m.day as string, progress, done: strList(m.done, 12), chest: bool(m.chest, false), chestsOpened: int(m.chestsOpened, 0, 0, 1e6) };
  }

  // Objets : format défini par le butin ; on garde seulement des objets JSON simples, 4 au plus.
  p.heirlooms = Array.isArray(o.heirlooms) ? o.heirlooms.filter(isObj).slice(0, 4).map((x) => structuredClone(x)) : [];

  if (isObj(o.legacy)) {
    const l = o.legacy;
    p.legacy = {
      importedAt: isoOr(l.importedAt, d.createdAt),
      source: l.source === 'file' ? 'file' : 'localStorage',
      sourceKeys: strList(l.sourceKeys, 20),
      ...(l.run !== undefined && isObj(l.run) ? { run: structuredClone(l.run) } : {}),
    };
  }
  return p;
}

export function sanitizeSettings(raw: unknown): Settings {
  const d = defaultSettings();
  const o = isObj(raw) ? raw : {};
  const a = isObj(o.audio) ? o.audio : {};
  const v = isObj(o.video) ? o.video : {};
  const ac = isObj(o.accessibility) ? o.accessibility : {};
  const eq = isObj(o.equipment) ? o.equipment : {};
  const quality = v.quality === 'low' || v.quality === 'high' ? v.quality : 'normal';
  const sellMax = eq.sellMax === 'common' || eq.sellMax === 'rare' ? eq.sellMax : 'magic';
  const bindings: Settings['bindings'] = {};
  if (isObj(o.bindings)) {
    for (const [action, b] of Object.entries(o.bindings).slice(0, 40)) {
      if (!isObj(b)) continue;
      const keys = strList(b.keys, 6);
      const mouse = intList(b.mouse).slice(0, 4);
      const pad = intList(b.pad).slice(0, 4);
      (bindings as Record<string, unknown>)[action] = { keys, ...(mouse.length ? { mouse } : {}), pad };
    }
  }
  return {
    version: CURRENT_VERSION.settings,
    audio: { master: num(a.master, d.audio.master, 0, 1), music: num(a.music, d.audio.music, 0, 1), sfx: num(a.sfx, d.audio.sfx, 0, 1), muted: bool(a.muted, false) },
    video: { quality, screenShake: bool(v.screenShake, true), weather: bool(v.weather, true), damageNumbers: bool(v.damageNumbers, true) },
    accessibility: {
      largeText: bool(ac.largeText, false), textScale: num(ac.textScale, 1, 0.8, 1.6), highContrast: bool(ac.highContrast, false),
      reducedMotion: bool(ac.reducedMotion, false), bigTap: bool(ac.bigTap, false), reminders: bool(ac.reminders, true),
    },
    equipment: { autoEquip: bool(eq.autoEquip, false), autoSell: bool(eq.autoSell, false), sellMax },
    bindings,
    theme: typeof o.theme === 'string' ? o.theme.slice(0, 40) : null,
    locale: str(o.locale, 'fr', 10),
    lastHero: isHero(o.lastHero) ? o.lastHero : 'taro',
    tutorialDone: bool(o.tutorialDone, false),
  };
}

/** Une run abîmée est rejetée (null) plutôt que réparée : mieux vaut perdre une run qu'en charger une fausse. */
export function sanitizeRun(raw: unknown): RunSnapshot | null {
  if (!isObj(raw) || !isHero(raw.hero) || typeof raw.seed !== 'string' || !('state' in raw)) return null;
  return {
    version: CURRENT_VERSION.run,
    savedAt: isoOr(raw.savedAt, new Date().toISOString()),
    seed: raw.seed.slice(0, 80),
    rng: Object.fromEntries(Object.entries(numMap(raw.rng, 0, 0xffffffff, 32)).map(([k, x]) => [k, x >>> 0])),
    hero: raw.hero,
    mode: isMode(raw.mode) ? raw.mode : 'survie',
    daily: bool(raw.daily, false),
    wave: int(raw.wave, 0, 0, 9999),
    pactPoints: int(raw.pactPoints, 0, 0, 999),
    elapsedSec: num(raw.elapsedSec),
    stateVersion: int(raw.stateVersion, 1),
    state: structuredClone(raw.state),
  };
}
