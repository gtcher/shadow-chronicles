import type { Entity } from '../ecs/World';

/**
 * Grille de hachage spatial : retrouve en O(1) les voisins d'un point.
 * Reconstruite à chaque pas (simple et rapide pour quelques milliers d'entités).
 */
export class SpatialHash {
  private cells = new Map<number, Entity[]>();
  private pool: Entity[][] = [];

  constructor(readonly cellSize = 96) {}

  private key(cx: number, cy: number): number {
    // Combine deux entiers signés 16 bits en une clé numérique.
    return ((cx & 0xffff) << 16) | (cy & 0xffff);
  }

  clear(): void {
    for (const arr of this.cells.values()) { arr.length = 0; this.pool.push(arr); }
    this.cells.clear();
  }

  /** Insère une entité dans toutes les cellules couvertes par son cercle. */
  insert(e: Entity, x: number, y: number, r: number): void {
    const cs = this.cellSize;
    const x0 = Math.floor((x - r) / cs), x1 = Math.floor((x + r) / cs);
    const y0 = Math.floor((y - r) / cs), y1 = Math.floor((y + r) / cs);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const k = this.key(cx, cy);
        let arr = this.cells.get(k);
        if (!arr) this.cells.set(k, (arr = this.pool.pop() ?? []));
        arr.push(e);
      }
    }
  }

  /** Appelle `fn` pour chaque entité candidate dans le rectangle (doublons possibles, filtrés ici). */
  queryRect(minX: number, minY: number, maxX: number, maxY: number, out: Set<Entity>): Set<Entity> {
    const cs = this.cellSize;
    for (let cx = Math.floor(minX / cs); cx <= Math.floor(maxX / cs); cx++) {
      for (let cy = Math.floor(minY / cs); cy <= Math.floor(maxY / cs); cy++) {
        const arr = this.cells.get(this.key(cx, cy));
        if (arr) for (const e of arr) out.add(e);
      }
    }
    return out;
  }

  queryCircle(x: number, y: number, r: number, out: Set<Entity> = new Set()): Set<Entity> {
    return this.queryRect(x - r, y - r, x + r, y + r, out);
  }

  /** Parcourt chaque cellule (utilisé pour générer les paires de collision). */
  forEachCell(fn: (entities: readonly Entity[]) => void): void {
    for (const arr of this.cells.values()) fn(arr);
  }
}
