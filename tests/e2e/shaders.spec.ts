import { test, expect } from '@playwright/test';
import { open, waitRun, frame, type W } from './helpers';

/**
 * Infrastructure de shaders partagée (src/engine/render/shaders) : chaque étage de `renderer.post`
 * couvre tout l'écran et `vScreen` va bien de (0,0) en haut à gauche à (1,1) en bas à droite.
 */
test('étages post : vScreen couvre l’écran', async ({ page }) => {
  const errors = await open(page, '?hero=taro&wave=1&seed=3');
  await waitRun(page);
  for (const stage of ['scene', 'world', 'screen'] as const) {
    const res = await page.evaluate((stage) => {
      const g = (window as unknown as W).game;
      const sh = (window as any).scShaders;
      const f = sh.createFilter({ name: 'test-uv', fragment: `in vec2 vScreen; out vec4 finalColor; void main(){ finalColor = vec4(vScreen, 0.0, 1.0); }` });
      const off = g.renderer.post.add(stage, f, 999);
      // Pour lire l'étage « scene » seul, on masque ce qui se dessine par-dessus (lumière, effets, vignette).
      const L = g.renderer.layers, hide = stage === 'scene' ? [L.fx, L.overlay, L.screenFx] : [];
      for (const c of hide) c.visible = false;
      g.stop(); g.frame(1, 1 / 60);
      const r = g.renderer.app.renderer;
      const canvas = r.extract.canvas({ target: g.renderer.app.stage, frame: g.renderer.app.screen }) as HTMLCanvasElement;
      const ctx = canvas.getContext('2d')!;
      const w = canvas.width, h = canvas.height;
      const at = (x: number, y: number) => Array.from(ctx.getImageData(x, y, 1, 1).data.slice(0, 3));
      const out = { tl: at(2, 2), br: at(w - 3, h - 3), mid: at(w >> 1, h >> 1) };
      off();
      for (const c of hide) c.visible = true;
      return out;
    }, stage);
    expect(res.tl[0], `${stage} haut-gauche R`).toBeLessThan(20);
    expect(res.tl[1], `${stage} haut-gauche G`).toBeLessThan(20);
    expect(res.br[0], `${stage} bas-droite R`).toBeGreaterThan(235);
    expect(res.br[1], `${stage} bas-droite G`).toBeGreaterThan(235);
    expect(Math.abs(res.mid[0] - 128), `${stage} milieu`).toBeLessThan(12);
  }
  expect(errors).toEqual([]);
});
