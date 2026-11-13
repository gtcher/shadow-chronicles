import { Rectangle, Texture, type TextureSource } from 'pixi.js';
import { CAST, mix } from './draw';
import { BAKE_FRAMES, RIG_ANIMS, RIG_LEN, bakeAtlas, bakeAtlasSteps, type AtlasMeta, type BakeInput, type RigAnim } from './atlas';
import { bakePuppet, type PuppetMeta } from '../puppet/bake';
import { makePuppetSheet, type PuppetSheet } from '../puppet/Puppet';
import type { Def } from '../puppet/bones';

/**
 * Combattants v2 : feuilles de sprites cuites depuis le squelette animé (./draw.ts).
 * Héros en piste A (peint encré), ennemis et boss en piste B (ombres à contre-jour).
 *
 * La cuisson coûte 0,2 à 0,5 s par combattant. Elle se fait dans un worker (./bake.worker.ts)
 * et à l'avance (`rigBaker.request`) : la run demande ses combattants dès son entrée et à chaque
 * vague ; l'apparition d'un ennemi ne fait plus geler l'image. Les feuilles restent en cache
 * d'une run à l'autre. Repli sans worker : cuisson découpée en petites tranches sur le fil principal.
 */
export { RIG_ANIMS, RIG_LEN, BAKE_FRAMES, type RigAnim };

export interface RigSheet {
  frames: Record<RigAnim, Texture[]>;
  /** Échelle à appliquer au sprite (la feuille est cuite à une résolution supérieure à l'affichage). */
  scale: number;
  anchorX: number;
  anchorY: number;
  /** Mémoire de l'atlas (octets, RGBA). */
  bytes: number;
  /** Armes de tir : images par angle de visée (idle, course, attaque), triées comme `aims.angles`. */
  aims?: { angles: number[]; frames: Array<Partial<Record<RigAnim, Texture[]>>> };
  /** Pantin peint (pièces animées par os) : remplace les images cuites quand il est présent. */
  puppet?: PuppetSheet;
}

/** Feuille d'un pantin peint ; `frames` ne contient qu'une image de repli (le buste). */
function puppetSheetFrom(input: BakeInput, meta: PuppetMeta, color: HTMLCanvasElement | OffscreenCanvas | ImageBitmap, normal: HTMLCanvasElement | OffscreenCanvas | ImageBitmap | null | undefined): RigSheet {
  const cs = Texture.from(color as HTMLCanvasElement).source;
  const ns = normal ? Texture.from(normal as HTMLCanvasElement).source : null;
  const ps = makePuppetSheet(input.puppet!.key, input.def as unknown as Def, meta, cs, ns, input.heightPx);
  const frames = {} as Record<RigAnim, Texture[]>;
  const fallback = ps.tex.torso ?? Object.values(ps.tex)[0];
  for (const a of RIG_ANIMS) frames[a] = [fallback];
  return { frames, scale: ps.scale, anchorX: 0.5, anchorY: 1, bytes: ps.bytes, puppet: ps };
}

function bakeSync(input: BakeInput): RigSheet {
  if (input.puppet) {
    const r = bakePuppet({ key: input.puppet.key, def: input.def as unknown as Def, style: input.style, ppu: input.puppet.ppu, normals: input.puppet.normals });
    if (r) return puppetSheetFrom(input, r.meta, r.color, r.normal);
  }
  return bakeRig(input.def, input.heightPx, input.style, input.res);
}

const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');

/**
 * Fiche du squelette pour une clé (`taro`, `wolf`, `cendrefer`…).
 * `tint` recolore le contre-jour et les lueurs (variantes régionales des ennemis).
 */
export function rigDef(key: string, tint?: number): Record<string, unknown> | null {
  const base = (CAST as Record<string, Record<string, unknown>>)[key];
  if (!base) return null;
  if (tint === undefined || tint === 0xffffff) return base;
  const sig = hex(tint);
  return { ...base, sig, rim: mix(sig, '#ffffff', 0.35) };
}

/** Clé du squelette pour une famille d'ennemis ou un boss du jeu. */
export const RIG_KEY_BY_FAMILY: Record<string, string> = { wolf: 'wolf', raider: 'raider', shade: 'shade', brute: 'brute', elite: 'shadeElite' };
export const RIG_KEY_BY_BOSS: Record<string, string> = { captain: 'cendrefer', oracle: 'matriarche', arbiter: 'arbitre', sovereign: 'souverain' };

/**
 * Suréchantillonnage selon l'écran : net sur les écrans haute densité, sans gaspiller la mémoire
 * ailleurs. Les héros (toujours au centre de l'image) ont droit à un peu plus.
 */
export function bakeResolution(hero: boolean): number {
  const dpr = typeof window !== 'undefined' ? Math.min(2, window.devicePixelRatio || 1) : 1;
  return hero ? Math.max(1.15, Math.min(1.8, dpr)) : Math.max(1, Math.min(1.5, dpr * 0.8));
}

function sheetFrom(src: HTMLCanvasElement | OffscreenCanvas | ImageBitmap, meta: AtlasMeta): RigSheet {
  const source = Texture.from(src as HTMLCanvasElement).source;
  const frames = {} as Record<RigAnim, Texture[]>;
  for (const a of RIG_ANIMS) frames[a] = [];
  const orig = new Rectangle(0, 0, meta.fw, meta.fh);
  const angles = meta.aims ?? [];
  const aimFrames = angles.map(() => ({} as Partial<Record<RigAnim, Texture[]>>));
  for (const c of meta.cells) {
    const tex = new Texture({ source, frame: new Rectangle(c.x, c.y, c.w, c.h), orig, trim: new Rectangle(c.tx, c.ty, c.w, c.h) });
    if (c.aim >= 0 && aimFrames[c.aim]) (aimFrames[c.aim][c.anim] ??= []).push(tex);
    else frames[c.anim].push(tex);
  }
  const sheet: RigSheet = { frames, scale: meta.scale, anchorX: meta.anchorX, anchorY: meta.anchorY, bytes: meta.width * meta.height * 4 };
  if (angles.length) sheet.aims = { angles, frames: aimFrames };
  return sheet;
}

/** Cuisson immédiate sur le fil principal (tests, repli). */
export function bakeRig(def: Record<string, unknown>, heightPx: number, style: 'A' | 'B', res = 1.25): RigSheet {
  const { canvas, meta } = bakeAtlas({ def, heightPx, style, res });
  return sheetFrom(canvas, meta);
}

/** Images de l'angle cuit le plus proche de `aim` (radians, négatif = haut), ou null pour l'horizontale. */
function aimList(sheet: RigSheet, anim: RigAnim, aim: number): Texture[] | null {
  const a = sheet.aims;
  if (!a || !aim) return null;
  let best = -1, gap = Math.abs(aim); // l'horizontale (0) est la référence
  a.angles.forEach((x, i) => { const d = Math.abs(aim - x); if (d < gap) { gap = d; best = i; } });
  return best < 0 ? null : a.frames[best][anim] ?? null;
}

/** Image d'une animation en boucle (idle, course) ou jouée une fois (attaque, touché, mort) à la phase p ∈ [0, 1]. */
export function rigFrame(sheet: RigSheet, anim: RigAnim, p: number, aim = 0): Texture {
  const list = aimList(sheet, anim, aim) ?? sheet.frames[anim];
  const k = anim === 'idle' || anim === 'course' ? Math.floor((((p % 1) + 1) % 1) * list.length) : Math.min(list.length - 1, Math.floor(Math.max(0, p) * list.length));
  return list[k];
}

interface WorkerReply { id: number; meta?: AtlasMeta; pmeta?: PuppetMeta; bmp?: ImageBitmap; nbmp?: ImageBitmap; error?: string }

interface Job {
  key: string;
  input: BakeInput;
  /** Cuisson pas à pas en cours sur le fil principal (repli). */
  steps?: Generator<void, { canvas: HTMLCanvasElement | OffscreenCanvas; meta: AtlasMeta }>;
  /** Numéro de la requête envoyée au worker, et ce worker. */
  wid?: number;
  w?: number;
}

/** Cache et file de cuisson des combattants, partagés par toutes les runs. */
export class RigBaker {
  private readonly cache = new Map<string, RigSheet>();
  private readonly jobs = new Map<string, Job>();
  private readonly byWid = new Map<number, Job>();
  private readonly mainQueue: Job[] = [];
  private workers: Worker[] | null | undefined;
  private readonly load: number[] = [];
  private wseq = 0;
  private pumping = false;
  /** Envoi au GPU dès qu'une feuille est prête (sinon : au premier affichage, en pleine action). */
  upload: ((source: TextureSource) => void) | null = null;
  /** Statistiques (tests, overlay de debug). */
  readonly stats = { worker: 0, main: 0, sync: 0, syncKeys: [] as string[] };
  /** Cuissons demandées et pas encore finies. */
  get busy(): number { return this.jobs.size; }

  get(key: string): RigSheet | undefined { return this.cache.get(key); }
  has(key: string): boolean { return this.cache.has(key); }
  pending(key: string): boolean { return this.jobs.has(key); }
  get size(): number { return this.cache.size; }
  get bytes(): number { let n = 0; for (const s of this.cache.values()) n += s.bytes; return n; }

  /** Demande la cuisson en arrière-plan (sans effet si déjà en cache ou en cours). */
  request(key: string, input: BakeInput): void {
    if (this.cache.has(key) || this.jobs.has(key)) return;
    const job: Job = { key, input };
    this.jobs.set(key, job);
    const ws = this.getWorkers();
    if (ws) {
      // Le worker le moins chargé.
      let wi = 0;
      for (let k = 1; k < ws.length; k++) if (this.load[k] < this.load[wi]) wi = k;
      job.wid = ++this.wseq; job.w = wi; this.load[wi]++;
      this.byWid.set(job.wid, job);
      ws[wi].postMessage({ id: job.wid, ...input });
    } else {
      this.mainQueue.push(job);
      this.schedulePump();
    }
  }

  /**
   * La feuille tout de suite : en cache, sinon cuite maintenant sur le fil principal
   * (cas rare : type d'ennemi que la run n'avait pas prévu).
   */
  now(key: string, input: BakeInput): RigSheet {
    const hit = this.cache.get(key);
    if (hit) return hit;
    const job = this.jobs.get(key);
    let sheet: RigSheet;
    if (job?.steps) {
      let r = job.steps.next();
      while (!r.done) r = job.steps.next();
      sheet = sheetFrom(r.value.canvas, r.value.meta);
    } else {
      sheet = bakeSync(input);
    }
    if (job) this.drop(job);
    this.stats.sync++; this.stats.syncKeys.push(key);
    this.store(key, sheet);
    return sheet;
  }

  /** Libère les feuilles hors de `keep` (début de run : on ne garde que ce qui servira). */
  retain(keep: Set<string>): void {
    for (const [k, s] of this.cache) {
      if (keep.has(k)) continue;
      s.frames.idle[0].source.destroy();
      s.puppet?.normal?.destroy();
      this.cache.delete(k);
    }
  }

  clear(): void { this.retain(new Set()); }

  private store(key: string, sheet: RigSheet): void {
    this.cache.set(key, sheet);
    try {
      this.upload?.(sheet.frames.idle[0].source);
      if (sheet.puppet?.normal) this.upload?.(sheet.puppet.normal);
    } catch { /* envoi au premier affichage */ }
  }

  private drop(job: Job): void {
    this.jobs.delete(job.key);
    if (job.wid !== undefined && this.byWid.delete(job.wid) && job.w !== undefined) this.load[job.w] = Math.max(0, this.load[job.w] - 1);
    const i = this.mainQueue.indexOf(job);
    if (i >= 0) this.mainQueue.splice(i, 1);
  }

  /** Un ou deux workers selon le nombre de cœurs (deux cuissons en parallèle au lancement d'une run). */
  private getWorkers(): Worker[] | null {
    if (this.workers !== undefined) return this.workers;
    this.workers = null;
    try {
      if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined') return null;
      if (!new OffscreenCanvas(1, 1).getContext('2d')) return null;
      const n = (navigator.hardwareConcurrency ?? 2) >= 4 ? 2 : 1;
      const ws: Worker[] = [];
      for (let k = 0; k < n; k++) {
        const w = new Worker(new URL('./bake.worker.ts', import.meta.url), { type: 'module' });
        w.onmessage = (e: MessageEvent<WorkerReply>) => this.onWorker(e.data);
        w.onerror = () => this.abandonWorker();
        ws.push(w); this.load.push(0);
      }
      this.workers = ws;
    } catch {
      this.workers = null;
    }
    return this.workers;
  }

  private onWorker(d: WorkerReply): void {
    const job = this.byWid.get(d.id);
    if (!job) { d.bmp?.close(); d.nbmp?.close(); return; } // déjà cuite autrement entre-temps
    if (d.bmp && d.pmeta) {
      this.drop(job);
      this.stats.worker++;
      this.store(job.key, puppetSheetFrom(job.input, d.pmeta, d.bmp, d.nbmp));
      return;
    }
    if (!d.bmp || !d.meta) {
      // Échec dans le worker (ex. OffscreenCanvas incomplet) : on repasse par le fil principal.
      this.abandonWorker();
      return;
    }
    this.drop(job);
    this.stats.worker++;
    this.store(job.key, sheetFrom(d.bmp, d.meta));
  }

  /** Le worker ne marche pas ici : toutes ses tâches repassent sur le fil principal. */
  private abandonWorker(): void {
    for (const w of this.workers ?? []) w.terminate();
    this.workers = null;
    for (const job of this.byWid.values()) { job.wid = undefined; job.w = undefined; this.mainQueue.push(job); }
    this.byWid.clear();
    this.schedulePump();
  }

  private schedulePump(): void {
    if (this.pumping || !this.mainQueue.length) return;
    this.pumping = true;
    setTimeout(() => this.pump(), 30);
  }

  /** Tranche de cuisson sur le fil principal : quelques millisecondes par appel, entre deux images. */
  private pump(): void {
    this.pumping = false;
    const t0 = performance.now();
    while (this.mainQueue.length && performance.now() - t0 < 5) {
      const job = this.mainQueue[0];
      if (job.input.puppet) { // pantin : peint d'une traite (quelques dizaines de ms)
        this.drop(job);
        this.stats.main++;
        this.store(job.key, bakeSync(job.input));
        continue;
      }
      job.steps ??= bakeAtlasSteps(job.input);
      const r = job.steps.next();
      if (r.done) {
        this.drop(job);
        this.stats.main++;
        this.store(job.key, sheetFrom(r.value.canvas, r.value.meta));
      }
    }
    this.schedulePump();
  }
}

/** Instance partagée (le cache survit aux runs). */
export const rigBaker = new RigBaker();
