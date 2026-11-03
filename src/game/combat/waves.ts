import type { Rng } from '@engine';
import { CAMPAIGN_WAVES, planWave, type WavePlan } from './rules';

/**
 * Directeur de vagues : enchaîne intermission → vague → (boss) → intermission.
 * Il ne crée rien lui-même : la scène lui fournit `spawnPack` et `spawnBoss`.
 */
export type WavePhase = 'intermission' | 'active' | 'done';

export class WaveDirector {
  wave = 0;
  phase: WavePhase = 'intermission';
  plan: WavePlan | null = null;
  /** Délai avant la prochaine vague. */
  timer = 2.5;
  /** Si vrai, l'intermission attend `next()` (écran de bénédictions de l'UI). */
  hold = false;
  private packIdx = 0;
  private packT = 0;
  private bossSpawned = false;
  spawnedCount = 0;
  /** Ajuste chaque plan (pactes, défi : ennemis et élites en plus). */
  adjust: ((plan: WavePlan) => WavePlan) | null = null;

  constructor(private readonly rng: Rng, startWave = 1) { this.wave = startWave - 1; }

  get total(): number { return this.plan ? this.plan.packs.reduce((s, p) => s + p.length, 0) + (this.plan.boss ? 1 : 0) : 0; }
  get remainingToSpawn(): number { return this.plan ? this.plan.packs.slice(this.packIdx).reduce((s, p) => s + p.length, 0) : 0; }
  get campaignDone(): boolean { return this.wave >= CAMPAIGN_WAVES; }

  /** Passe tout de suite à la vague suivante (fin de l'intermission). */
  next(): void { this.hold = false; this.timer = 0; }

  update(dt: number, alive: number, bossAlive: boolean, cb: {
    start: (plan: WavePlan) => void;
    spawnPack: (ids: WavePlan['packs'][number]) => void;
    spawnBoss: (plan: WavePlan) => void;
    cleared: (plan: WavePlan) => void;
  }): void {
    if (this.phase === 'done') return;
    if (this.phase === 'intermission') {
      if (this.hold) return;
      this.timer -= dt;
      if (this.timer > 0) return;
      this.wave++;
      this.plan = planWave(this.wave, this.rng);
      if (this.adjust) this.plan = this.adjust(this.plan);
      this.packIdx = 0; this.packT = this.plan.boss ? 2.6 : 0.6; this.bossSpawned = false; this.spawnedCount = 0;
      this.phase = 'active';
      cb.start(this.plan);
      return;
    }
    const plan = this.plan!;
    if (plan.boss && !this.bossSpawned) {
      this.packT -= dt;
      if (this.packT <= 0) { this.bossSpawned = true; this.spawnedCount++; cb.spawnBoss(plan); this.packT = 6; }
      return;
    }
    if (this.packIdx < plan.packs.length) {
      this.packT -= dt;
      // Accélère si le joueur nettoie vite : l'action ne retombe jamais.
      if (this.packT <= 0 || alive <= 2) {
        if (alive < plan.maxAlive) {
          const pack = plan.packs[this.packIdx++];
          this.spawnedCount += pack.length;
          cb.spawnPack(pack);
          this.packT = plan.interval * (plan.boss ? 3 : 1);
        }
      }
      return;
    }
    if (alive === 0 && !bossAlive) {
      cb.cleared(plan);
      this.phase = 'intermission';
      this.timer = 4;
    }
  }
}
