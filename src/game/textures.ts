import { Texture } from 'pixi.js';

/** Textures procédurales (générées une fois via Canvas 2D) : ombres, lueurs, vignette. */
function canvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): Texture {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d')!);
  return Texture.from(c);
}

export function makeFxTextures() {
  const radial = (size: number, stops: Array<[number, string]>) =>
    canvasTexture(size, size, (ctx) => {
      const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      for (const [o, c] of stops) g.addColorStop(o, c);
      ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
    });
  return {
    /** Ombre douce elliptique sous les personnages. */
    shadow: radial(128, [[0, 'rgba(0,0,0,0.55)'], [0.55, 'rgba(0,0,0,0.3)'], [1, 'rgba(0,0,0,0)']]),
    /** Lueur blanche (teintée par sprite.tint) pour projectiles et particules. */
    glow: radial(64, [[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(255,255,255,0.8)'], [1, 'rgba(255,255,255,0)']]),
    /** Halo de lumière large (éclairage autour du héros). */
    light: radial(512, [[0, 'rgba(255,214,150,0.22)'], [0.5, 'rgba(255,180,110,0.08)'], [1, 'rgba(0,0,0,0)']]),
    /** Vignette plein écran (bords sombres, ambiance « peinte »). */
    vignette: canvasTexture(512, 512, (ctx) => {
      const g = ctx.createRadialGradient(256, 256, 120, 256, 256, 362);
      g.addColorStop(0, 'rgba(4,8,16,0)');
      g.addColorStop(0.7, 'rgba(4,8,16,0.35)');
      g.addColorStop(1, 'rgba(2,4,10,0.85)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, 512, 512);
    }),
  };
}
/**
 * Rend une texture « raccordable » (tileable) : on superpose une copie décalée d'une
 * demi-tuile (bords continus) et l'original au centre via un masque radial doux.
 * Supprime le quadrillage visible quand un sol peint est répété.
 */
export function makeSeamless(tex: Texture): Texture {
  const src = tex.source.resource as CanvasImageSource;
  const w = tex.source.pixelWidth, h = tex.source.pixelHeight;
  return canvasTexture(w, h, (ctx) => {
    // 1) Copie décalée de w/2, h/2 (ses bords proviennent du centre de l'original).
    for (const [dx, dy] of [[-w / 2, -h / 2], [w / 2, -h / 2], [-w / 2, h / 2], [w / 2, h / 2]]) ctx.drawImage(src, dx, dy, w, h);
    // 2) Original, visible seulement au centre.
    const m = document.createElement('canvas');
    m.width = w; m.height = h;
    const mc = m.getContext('2d')!;
    mc.drawImage(src, 0, 0, w, h);
    mc.globalCompositeOperation = 'destination-in';
    const g = mc.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.18, w / 2, h / 2, Math.min(w, h) * 0.5);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    mc.fillStyle = g; mc.fillRect(0, 0, w, h);
    ctx.drawImage(m, 0, 0);
  });
}

export type FxTextures = ReturnType<typeof makeFxTextures>;
