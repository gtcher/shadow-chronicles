import { Rectangle, Texture } from 'pixi.js';
import { ANIM_LEN, CAST, FRAMES, RIG, mix, renderSprite } from './draw';

/**
 * Combattants v2 : feuilles de sprites cuites à la volée depuis le squelette animé (./draw.ts).
 * Héros en piste A (peint encré), ennemis et boss en piste B (ombres à contre-jour).
 */
export type RigAnim = 'idle' | 'course' | 'attaque' | 'touche' | 'mort';
export const RIG_ANIMS: RigAnim[] = ['idle', 'course', 'attaque', 'touche', 'mort'];
/** Durée de référence de chaque animation (s), identique à la planche. */
export const RIG_LEN = ANIM_LEN as Record<RigAnim, number>;

export interface RigSheet {
  frames: Record<RigAnim, Texture[]>;
  /** Échelle à appliquer au sprite (la feuille est cuite à une résolution supérieure à l'affichage). */
  scale: number;
  anchorX: number;
  anchorY: number;
}

/** Hauteur nominale d'un combattant du squelette, en unités, avant son `scale`. */
const NOMINAL = { h: 96, w: 48 } as const;
/** Largeur maximale d'une image cuite (px) : borne la mémoire des boss. */
const MAX_FRAME_W = 480;
const COLS = 6;

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
 * Cuit les 36 images (idle 8, course 8, attaque 7, touché 3, mort 10) dans un atlas Canvas.
 * `heightPx` = hauteur d'affichage voulue ; `res` = suréchantillonnage (netteté sous zoom).
 */
export function bakeRig(def: Record<string, unknown>, heightPx: number, style: 'A' | 'B', res = 1.25): RigSheet {
  const scale = (def.scale as number) ?? 1;
  const nominal = def.kind === 'w' ? NOMINAL.w : NOMINAL.h;
  const ppu = heightPx / (nominal * scale);
  let s = ppu * res;
  if (240 * s * scale > MAX_FRAME_W) s = MAX_FRAME_W / (240 * scale);
  const frames = {} as Record<RigAnim, Texture[]>;
  const total = RIG_ANIMS.reduce((n, a) => n + (FRAMES as Record<RigAnim, number>)[a], 0);
  const rows = Math.ceil(total / COLS);
  let atlas: HTMLCanvasElement | null = null, g: CanvasRenderingContext2D | null = null;
  let fw = 0, fh = 0, ox = 0, oy = 0, i = 0;
  const cells: { anim: RigAnim; x: number; y: number }[] = [];
  for (const anim of RIG_ANIMS) {
    const n = (FRAMES as Record<RigAnim, number>)[anim];
    for (let k = 0; k < n; k++) {
      // La mort s'arrête juste avant la disparition complète pour garder une dernière braise.
      const p = anim === 'mort' ? (k / (n - 1)) * 0.86 : k / n;
      RIG.now = (p * RIG_LEN[anim] + 0.37) * 1000;
      const spr = renderSprite('rig', def, anim, p, style, s, 1);
      if (!atlas) {
        fw = spr.W; fh = spr.H; ox = spr.ox; oy = spr.oy;
        atlas = document.createElement('canvas');
        atlas.width = fw * COLS; atlas.height = fh * rows;
        g = atlas.getContext('2d')!;
      }
      const x = (i % COLS) * fw, y = Math.floor(i / COLS) * fh;
      g!.drawImage(spr.cv, 0, 0, fw, fh, x, y, fw, fh);
      cells.push({ anim, x, y });
      i++;
    }
  }
  const source = Texture.from(atlas!).source;
  for (const a of RIG_ANIMS) frames[a] = [];
  for (const c of cells) frames[c.anim].push(new Texture({ source, frame: new Rectangle(c.x, c.y, fw, fh) }));
  return { frames, scale: ppu / s, anchorX: ox / fw, anchorY: oy / fh };
}

/** Image d'une animation en boucle (idle, course) ou jouée une fois (attaque, touché, mort) à la phase p ∈ [0, 1]. */
export function rigFrame(sheet: RigSheet, anim: RigAnim, p: number): Texture {
  const list = sheet.frames[anim];
  const k = anim === 'idle' || anim === 'course' ? Math.floor((((p % 1) + 1) % 1) * list.length) : Math.min(list.length - 1, Math.floor(Math.max(0, p) * list.length));
  return list[k];
}
