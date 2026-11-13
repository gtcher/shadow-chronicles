import { bakeAtlas, type BakeInput } from './atlas';
import { bakePuppet } from '../puppet/bake';

/**
 * Worker de cuisson : dessine les feuilles de sprites des combattants hors du fil principal
 * (OffscreenCanvas) et renvoie une ImageBitmap transférée sans copie. Le jeu ne gèle plus
 * à l'apparition d'un nouveau type d'ennemi.
 */
interface Req extends BakeInput { id: number }

self.onmessage = (e: MessageEvent<Req>) => {
  const { id, ...input } = e.data;
  try {
    if (input.puppet) {
      const r = bakePuppet({ key: input.puppet.key, def: input.def as never, style: input.style, ppu: input.puppet.ppu, normals: input.puppet.normals });
      if (!r) throw new Error('pantin inconnu : ' + input.puppet.key);
      const bmp = (r.color as OffscreenCanvas).transferToImageBitmap();
      const nbmp = r.normal ? (r.normal as OffscreenCanvas).transferToImageBitmap() : undefined;
      (self as unknown as Worker).postMessage({ id, pmeta: r.meta, bmp, nbmp }, nbmp ? [bmp, nbmp] : [bmp]);
      return;
    }
    const { canvas, meta } = bakeAtlas(input);
    const bmp = (canvas as OffscreenCanvas).transferToImageBitmap();
    (self as unknown as Worker).postMessage({ id, meta, bmp }, [bmp]);
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, error: String(err) });
  }
};
