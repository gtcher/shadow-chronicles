import { RIG, pose as rigPose } from '../rig/draw';
import type { Def, Pose } from './bones';

export type PuppetAnim = 'idle' | 'course' | 'attaque' | 'touche' | 'mort';

/**
 * Pose d'un combattant à la phase p ∈ [0, 1] : la même que celle du squelette dessiné (rig/draw.ts),
 * donc les mêmes animations validées (et les corrections d'armes : arc qui vise, bâton devant).
 * `aim` : angle de visée relatif au regard (radians, négatif = haut), pour les armes de tir.
 */
export function poseOf(c: Def, anim: PuppetAnim, p: number, aim = 0, now = 0): Pose {
  const prevAim = RIG.aim, prevNow = RIG.now, prevLoop = RIG.loop;
  RIG.aim = aim; RIG.now = now * 1000; RIG.loop = 0;
  try {
    return (rigPose as (c: unknown, a: string, p: number, k: number) => Pose)(c, anim, p, 1);
  } finally {
    RIG.aim = prevAim; RIG.now = prevNow; RIG.loop = prevLoop;
  }
}
