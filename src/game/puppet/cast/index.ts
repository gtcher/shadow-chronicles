import type { Painter } from '../parts';
import { ren } from './ren';
import { sena } from './sena';
import { taro } from './taro';
import { mei } from './mei';
import { raider, brute, shade, shadeElite } from './enemies';
import { wolf } from './wolf';
import { cendrefer, matriarche, arbitre, souverain, juge } from './bosses';

/**
 * Peintres des pantins, par clé du squelette (CAST de rig/draw.ts). Un combattant absent de cette table
 * garde son ancien rendu (squelette dessiné puis cuit image par image).
 */
const PAINTERS: Record<string, Painter> = {
  ren, sena, taro, mei,
  raider, brute, shade, shadeElite, wolf,
  cendrefer, matriarche, arbitre, souverain, juge,
};

export function painterFor(key: string): Painter | null { return PAINTERS[key] ?? null; }
export const PUPPET_KEYS = (): string[] => Object.keys(PAINTERS);
