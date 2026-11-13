import { Rectangle, type Container, type Filter } from 'pixi.js';

/**
 * Étages de post-traitement plein écran :
 *  - `scene`  : décor + combattants (couches background → entities), AVANT les effets lumineux.
 *               L'éclairage avec relief y vit (order 0).
 *  - `world`  : tout le monde, particules et chiffres compris (étalonnage couleur, distorsions).
 *  - `screen` : l'image finale, après vignette et flashs (couches écran comprises).
 *
 * Plusieurs systèmes peuvent poser des filtres sur le même étage sans se marcher dessus :
 * chacun choisit un `order` (petit = appliqué d'abord). Repères : éclairage 0, distorsions 50,
 * étalonnage 100.
 */
export type PostStage = 'scene' | 'world' | 'screen';

interface Entry { filter: Filter; order: number; seq: number }

/** Zone de filtre « infinie » : Pixi la rogne à l'écran, donc le quad du filtre = l'écran. */
const HUGE = new Rectangle(-1e6, -1e6, 2e6, 2e6);

export class PostStack {
  private readonly entries: Record<PostStage, Entry[]> = { scene: [], world: [], screen: [] };
  private seq = 0;

  constructor(private readonly targets: Record<PostStage, Container>) {}

  /** Ajoute un filtre à un étage ; renvoie la fonction de retrait (à appeler dans `exit`/`destroy`). */
  add(stage: PostStage, filter: Filter, order = 0): () => void {
    const e: Entry = { filter, order, seq: this.seq++ };
    this.entries[stage].push(e);
    this.apply(stage);
    return () => {
      const list = this.entries[stage];
      const i = list.indexOf(e);
      if (i >= 0) { list.splice(i, 1); this.apply(stage); }
    };
  }

  /** Filtres actifs d'un étage, dans l'ordre d'application (lecture seule, tests et débogage). */
  list(stage: PostStage): readonly Filter[] {
    return this.entries[stage].map((e) => e.filter);
  }

  private apply(stage: PostStage): void {
    const list = this.entries[stage].sort((a, b) => a.order - b.order || a.seq - b.seq);
    const target = this.targets[stage];
    if (!list.length) { target.filters = null; target.filterArea = undefined as unknown as Rectangle; return; }
    target.filterArea = HUGE;
    target.filters = list.map((e) => e.filter);
  }
}
