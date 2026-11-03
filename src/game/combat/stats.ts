/**
 * Compteurs d'une run : alimentent les succès (data/achievements.json) et le résumé de fin de run.
 * `counters` est versé tel quel à recordRunEnd (cumuls « lifetime » + records « run »).
 * `wave` est remis à zéro au début de chaque vague (succès de portée « wave »).
 */
export class RunStats {
  /** Compteurs et records de la run (clés = `cond.stat` de achievements.json). */
  readonly counters: Record<string, number> = {};
  /** Compteurs de la vague en cours. */
  wave: Record<string, number> = {};
  /** Statuts appliqués (diagnostic, équilibrage) : hors sauvegarde. */
  readonly statuses: Record<string, number> = {};
  /** Temps du boss le plus vite vaincu (s), à verser avec recordBest(…, lower). */
  fastestBossKill = Infinity;
  private killTimes: number[] = [];

  add(k: string, n = 1): void { this.counters[k] = (this.counters[k] ?? 0) + n; }
  max(k: string, v: number): void { if (v > (this.counters[k] ?? -Infinity)) this.counters[k] = v; }
  addWave(k: string, n = 1): void { this.wave[k] = (this.wave[k] ?? 0) + n; }
  maxWave(k: string, v: number): void { if (v > (this.wave[k] ?? -Infinity)) this.wave[k] = v; }
  get(k: string): number { return this.counters[k] ?? 0; }

  kill(time: number): void {
    this.add('kills');
    this.killTimes.push(time);
    while (this.killTimes.length && this.killTimes[0] < time - 1) this.killTimes.shift();
    this.max('killsWithin1s', this.killTimes.length);
  }
  hit(dmg: number): void { this.max('maxHit', Math.round(dmg)); }
  statusApplied(id: string): void { this.statuses[id] = (this.statuses[id] ?? 0) + 1; }
  newWave(): void { this.wave = {}; }
}
