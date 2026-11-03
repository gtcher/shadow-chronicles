import { Texture } from 'pixi.js';

/**
 * Textures procédurales des effets (générées une fois en Canvas 2D, ~1 Mo de VRAM au total).
 * Toutes sont blanches/grises : la couleur vient de `sprite.tint`.
 */
function canvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): Texture {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d')!);
  return Texture.from(c);
}

function radial(size: number, stops: Array<[number, string]>): Texture {
  return canvasTexture(size, size, (ctx) => {
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    for (const [o, c] of stops) g.addColorStop(o, c);
    ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
  });
}

/** Bruit de valeur raccordable (fbm) : base du brouillard et des fumées. */
function tileableNoise(size: number, octaves: number, seed: number): Float32Array {
  const out = new Float32Array(size * size);
  let s = seed >>> 0;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  let amp = 1, total = 0;
  for (let o = 0; o < octaves; o++) {
    const cells = 4 << o;
    const grid = new Float32Array(cells * cells);
    for (let i = 0; i < grid.length; i++) grid[i] = rnd();
    const step = size / cells;
    for (let y = 0; y < size; y++) {
      const gy = y / step, y0 = Math.floor(gy), fy = gy - y0, sy = fy * fy * (3 - 2 * fy);
      const r0 = (y0 % cells) * cells, r1 = ((y0 + 1) % cells) * cells;
      for (let x = 0; x < size; x++) {
        const gx = x / step, x0 = Math.floor(gx), fx = gx - x0, sx = fx * fx * (3 - 2 * fx);
        const c0 = x0 % cells, c1 = (x0 + 1) % cells;
        const a = grid[r0 + c0] + (grid[r0 + c1] - grid[r0 + c0]) * sx;
        const b = grid[r1 + c0] + (grid[r1 + c1] - grid[r1 + c0]) * sx;
        out[y * size + x] += (a + (b - a) * sy) * amp;
      }
    }
    total += amp; amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

export function makeVfxTextures() {
  return {
    /** Lueur douce (particules additives, projectiles). */
    glow: radial(64, [[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(255,255,255,0.8)'], [1, 'rgba(255,255,255,0)']]),
    /** Lumière pour la carte d'éclairage : décroissance quasi quadratique, centre plein. */
    light: radial(256, [[0, 'rgba(255,255,255,1)'], [0.2, 'rgba(255,255,255,0.75)'], [0.5, 'rgba(255,255,255,0.28)'], [0.8, 'rgba(255,255,255,0.06)'], [1, 'rgba(255,255,255,0)']]),
    /** Étincelle allongée (étirée dans le sens de la vitesse). */
    spark: canvasTexture(64, 16, (ctx) => {
      const g = ctx.createLinearGradient(0, 0, 64, 0);
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.7, 'rgba(255,255,255,0.9)'); g.addColorStop(1, 'rgba(255,255,255,1)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(32, 8, 32, 4, 0, 0, Math.PI * 2); ctx.fill();
    }),
    /** Bouffée de fumée irrégulière (mélange normal, teinte sombre). */
    smoke: (() => {
      const n = tileableNoise(64, 3, 91);
      return canvasTexture(64, 64, (ctx) => {
        const img = ctx.createImageData(64, 64);
        for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
          const d = Math.hypot(x - 31.5, y - 31.5) / 32;
          const a = Math.max(0, 1 - d * d) * (0.35 + n[y * 64 + x] * 0.9);
          const i = (y * 64 + x) * 4;
          img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
          img.data[i + 3] = Math.min(255, a * 200);
        }
        ctx.putImageData(img, 0, 0);
      });
    })(),
    /** Anneau d'onde de choc. */
    ring: canvasTexture(128, 128, (ctx) => {
      const g = ctx.createRadialGradient(64, 64, 40, 64, 64, 64);
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.7, 'rgba(255,255,255,0.9)'); g.addColorStop(0.85, 'rgba(255,255,255,0.5)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
    }),
    /** Tache au sol (cendres / sang séché) aux bords déchiquetés. */
    scorch: (() => {
      const n = tileableNoise(96, 3, 7);
      return canvasTexture(96, 96, (ctx) => {
        const img = ctx.createImageData(96, 96);
        for (let y = 0; y < 96; y++) for (let x = 0; x < 96; x++) {
          const d = Math.hypot(x - 47.5, y - 47.5) / 48;
          const v = n[y * 96 + x];
          const a = d < 0.35 + v * 0.6 ? Math.min(1, (0.35 + v * 0.6 - d) * 4) * (0.5 + v * 0.5) : 0;
          const i = (y * 96 + x) * 4;
          img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
          img.data[i + 3] = a * 255;
        }
        ctx.putImageData(img, 0, 0);
      });
    })(),
    /** Brouillard raccordable (nappes douces). */
    fog: (() => {
      const S = 256, n = tileableNoise(S, 4, 1234);
      return canvasTexture(S, S, (ctx) => {
        const img = ctx.createImageData(S, S);
        for (let i = 0; i < S * S; i++) {
          const v = Math.max(0, Math.min(1, (n[i] - 0.38) * 2.4));
          img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = 255;
          img.data[i * 4 + 3] = v * v * 255;
        }
        ctx.putImageData(img, 0, 0);
      });
    })(),
    /** Vignette plein écran. */
    vignette: canvasTexture(512, 512, (ctx) => {
      const g = ctx.createRadialGradient(256, 256, 140, 256, 256, 362);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.65, 'rgba(0,0,0,0.3)'); g.addColorStop(1, 'rgba(0,0,0,0.9)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, 512, 512);
    }),
    /** Pixel blanc (flash plein écran). */
    white: Texture.WHITE,
  };
}

export type VfxTextures = ReturnType<typeof makeVfxTextures>;
