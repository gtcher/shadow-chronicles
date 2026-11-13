import { test, expect } from '@playwright/test';
import { open, waitRun, sim, frame, type W } from './helpers';

/** Éclairage avec relief, tampon de normales et ombres portées (src/game/vfx/lighting). */
test('relief : filtre sur la scène, normales peintes, ombres, repli à plat en qualité basse', async ({ page }) => {
  const errors = await open(page, '?hero=ren&wave=2&seed=5&quality=high&grade=0');
  await waitRun(page);
  await sim(page, 3);
  await frame(page);
  const high = await page.evaluate(() => {
    const w = window as unknown as W; const L = w.vfx.lighting;
    return { relief: L.reliefOn, filters: w.game.renderer.post.list('scene').length, flat: L.overlay.visible, shadows: L.shadows.pool.filter((s: any) => s.visible).length };
  });
  expect(high.relief).toBe(true);
  expect(high.filters).toBe(1);
  expect(high.flat).toBe(false);
  expect(high.shadows).toBeGreaterThan(3);

  // Une pièce de normale (sphère) au centre de l'écran remplit le tampon de normales.
  const n = await page.evaluate(async () => {
    const w = window as unknown as W;
    const L = w.vfx.lighting, g = w.game;
    const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d')!;
    const img = x.createImageData(64, 64);
    for (let j = 0; j < 64; j++) for (let i = 0; i < 64; i++) {
      const u = (i - 31.5) / 32, v = (31.5 - j) / 32, r2 = u * u + v * v, k = (j * 64 + i) * 4;
      if (r2 >= 1) continue;
      const z = Math.sqrt(1 - r2);
      img.data[k] = (u * 0.5 + 0.5) * 255; img.data[k + 1] = (v * 0.5 + 0.5) * 255; img.data[k + 2] = (z * 0.5 + 0.5) * 255; img.data[k + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    const tex = (w as any).scVfx.textureFrom(c);
    const piece = new (w as any).scVfx.NormalPiece(tex);
    piece.scale.set(3);
    const cam = g.camera.renderPos(1); piece.position.set(cam.x, cam.y);
    L.normals.addChild(piece);
    g.frame(1, 1 / 60);
    const rt = L.rtNormals;
    const px = rt ? g.renderer.app.renderer.extract.pixels(rt) : null;
    const at = (fx: number, fy: number) => { if (!px) return [0, 0, 0, 0]; const X = Math.floor(px.width * fx), Y = Math.floor(px.height * fy), k = (Y * px.width + X) * 4; return Array.from(px.pixels.slice(k, k + 4)); };
    const out = { center: at(0.5, 0.5), corner: at(0.02, 0.02) };
    piece.destroy();
    return out;
  });
  // Centre de la sphère : normale vers la caméra (B fort), couverture pleine ; coin : vide.
  expect(n.center[3]).toBeGreaterThan(200);
  expect(n.center[2]).toBeGreaterThan(200);
  expect(n.corner[3]).toBe(0);

  // Rotation : une normale « vers la droite » sur une pièce tournée d'un quart de tour (sens horaire
  // à l'écran) doit pointer vers le bas de l'écran, soit G ≈ 0 dans le tampon (convention G = haut).
  const rot = await page.evaluate(() => {
    const w = window as unknown as W, L = w.vfx.lighting, g = w.game;
    const c = document.createElement('canvas'); c.width = c.height = 32;
    const x = c.getContext('2d')!; x.fillStyle = 'rgb(255,128,128)'; x.fillRect(0, 0, 32, 32);
    const piece = new (w as any).scVfx.NormalPiece((w as any).scVfx.textureFrom(c));
    piece.scale.set(4); piece.rotation = Math.PI / 2;
    const cam = g.camera.renderPos(1); piece.position.set(cam.x, cam.y);
    L.normals.addChild(piece); g.frame(1, 1 / 60);
    const px = g.renderer.app.renderer.extract.pixels(L.rtNormals);
    const k = ((px.height >> 1) * px.width + (px.width >> 1)) * 4;
    piece.destroy();
    return Array.from(px.pixels.slice(k, k + 4));
  });
  expect(Math.abs(rot[0] - 128)).toBeLessThan(10);
  expect(rot[1]).toBeLessThan(10);

  // Qualité basse : retour à la multiplication à plat, sans filtre ni ombres.
  const low = await page.evaluate(() => {
    const w = window as unknown as W; w.vfx.setQuality('low'); w.game.frame(1, 1 / 60);
    const L = w.vfx.lighting;
    return { relief: L.reliefOn, filters: w.game.renderer.post.list('scene').length, flat: L.overlay.visible, shadows: L.shadows.root.visible };
  });
  expect(low).toEqual({ relief: false, filters: 0, flat: true, shadows: false });
  expect(errors).toEqual([]);
});

/** Retour de Gabriel : les ombres du décor sautaient d'un coup quand la lumière dominante changeait. */
test('ombres portées : la direction tourne en douceur quand une lumière passe devant un décor', async ({ page }) => {
  const errors = await open(page, '?hero=taro&wave=1&seed=2&quality=high&grade=0');
  await waitRun(page);
  const res = await page.evaluate(async () => {
    const w = window as unknown as W, g = w.game, L = w.vfx.lighting;
    g.stop();
    const c = document.createElement('canvas'); c.width = 40; c.height = 120;
    const x = c.getContext('2d')!; x.fillStyle = '#888'; x.fillRect(0, 0, 40, 120);
    const prop = new (w as any).scVfx.Sprite((w as any).scVfx.textureFrom(c));
    prop.anchor.set(0.5, 0.95);
    const cam = g.camera.renderPos(1);
    prop.position.set(cam.x + 2000, cam.y + 2000);
    g.renderer.layers.entities.addChild(prop);
    // Une torche traverse de gauche à droite juste au-dessus du décor, puis s'éloigne hors de portée.
    // Le lissage suit le temps réel : on laisse passer ~16 ms entre deux images.
    const torch = L.add({ x: prop.x - 400, y: prop.y - 40, radius: 430, color: 0xffd7a0, intensity: 1 });
    const rots: number[] = [];
    for (let i = 0; i < 240; i++) {
      torch.x = prop.x - 400 + i * 6;
      await new Promise((r) => setTimeout(r, 16));
      L.update(1 / 60); L.render();
      const s = L.shadows.pool.find((p: any) => p.visible && p.texture === prop.texture);
      rots.push(s ? s.rotation : NaN);
    }
    L.remove(torch); prop.destroy();
    let maxStep = 0;
    for (let i = 1; i < rots.length; i++) {
      let d = Math.abs(rots[i] - rots[i - 1]); if (d > Math.PI) d = 2 * Math.PI - d;
      maxStep = Math.max(maxStep, d);
    }
    // L'ombre a bien tourné pendant le passage (vers la droite puis vers la gauche) : le test ne passe pas « à vide ».
    const un = [rots[0]];
    for (let i = 1; i < rots.length; i++) { let d = rots[i] - rots[i - 1]; if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; un.push(un[i - 1] + d); }
    const turned = Math.max(...un) - Math.min(...un);
    return { maxStep, turned, missing: rots.filter((r) => Number.isNaN(r)).length };
  });
  expect(res.missing).toBe(0);
  expect(res.maxStep).toBeLessThan(0.12);
  expect(res.turned).toBeGreaterThan(0.8);
  expect(errors).toEqual([]);
});
