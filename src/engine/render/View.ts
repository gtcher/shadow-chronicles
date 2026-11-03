import type { Container } from 'pixi.js';
import { defineComponent, type World } from '../ecs/World';
import { Transform } from '../ecs/components';
import type { Camera } from '../camera/Camera';
import type { Renderer, WorldLayer } from './Renderer';

/**
 * Composant visuel : lie une entité à un objet Pixi.
 * Le moteur place l'objet à la position interpolée de l'entité, le trie par y
 * (couche « entities ») et le masque hors écran (culling).
 * `zOffset` permet d'ajuster l'ordre d'affichage (ex. +1000 pour un objet volant).
 */
export interface ViewC { node: Container; layer: WorldLayer; zOffset: number; cull: boolean }
export const View = defineComponent<ViewC>('View');

export function attachView(world: World, renderer: Renderer, e: number, node: Container, layer: WorldLayer = 'entities', zOffset = 0): ViewC {
  renderer.layers[layer].addChild(node);
  return world.add(e, View, { node, layer, zOffset, cull: true });
}

/** À enregistrer une fois : détruit l'objet Pixi quand l'entité disparaît. */
export function installViewCleanup(world: World): void {
  world.onDestroy((e, w) => {
    const v = w.get(e, View);
    if (v) v.node.destroy({ children: true });
  });
}

/** Synchronise les vues avec les Transform (appelé dans la phase de rendu, pas en simulation). */
export function syncViews(world: World, camera: Camera, alpha: number, cullMargin = 160): void {
  const r = camera.visibleRect(cullMargin);
  for (const e of world.query(View, Transform)) {
    const v = world.get(e, View)!, t = world.get(e, Transform)!;
    const x = t.prevX + (t.x - t.prevX) * alpha;
    const y = t.prevY + (t.y - t.prevY) * alpha;
    if (v.cull) {
      v.node.visible = x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h;
      if (!v.node.visible) continue;
    }
    v.node.position.set(x, y);
    if (v.layer === 'entities') v.node.zIndex = y + v.zOffset;
  }
}
