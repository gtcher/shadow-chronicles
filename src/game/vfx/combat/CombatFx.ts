import { Container, Geometry, Mesh, RendererType, Shader, UniformGroup, type Sprite, type Texture } from 'pixi.js';
import { createFilter, type Renderer } from '@engine';
import type { FxParticles } from '../FxParticles';
import type { QualityLevel } from '../quality';
import { FrameQuad } from './FrameQuad';
import { SHOCKWAVE_FRAG, BEAM_FRAG, DISSOLVE_FRAG, FLASH_FRAG, SLASH_FRAG, TRAIL_FRAG, TRAIL_VERT } from './shaders';

/**
 * Effets de combat dessinés par shaders maison (WebGL) :
 * - dissolution des corps à la mort (bord en braise + cendres qui s'élèvent) ;
 * - flash d'impact sur la silhouette touchée (remplissage chaud + liseré) ;
 * - croissant de lame, rayons de ruée/tir perçant, rubans derrière les projectiles.
 *
 * Toutes les lueurs sont « douces » (1 − e^−I) : la mêlée ne vire plus à la tache blanche.
 * Si le moteur n'est pas en WebGL (WebGPU, test sans GPU), `on` vaut false et la scène
 * garde les anciens effets (Graphics / fondu).
 */

const rgb = (c: number): Float32Array => new Float32Array([((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255]);
const f32 = (value: number) => ({ value, type: 'f32' as const });
const v3 = (c: number) => ({ value: rgb(c), type: 'vec3<f32>' as const });
const setRgb = (u: Record<string, unknown>, key: string, c: number) => {
  const a = u[key] as Float32Array;
  a[0] = ((c >> 16) & 255) / 255; a[1] = ((c >> 8) & 255) / 255; a[2] = (c & 255) / 255;
};
const smooth = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

interface Wave { x: number; y: number; age: number; life: number; radius: number; strength: number }
interface Swoosh { q: FrameQuad; age: number; life: number; kind: 'slash' | 'beam' }
interface Trail { node: Container; pts: number[]; r: number; g: number; b: number; width: number; yOff: number; fade: number }

const TRAIL_PTS = 10;
const TRAIL_CAP: Record<QualityLevel, number> = { low: 12, medium: 32, high: 48 };

export class CombatFx {
  /** Shaders disponibles (WebGL). */
  readonly on: boolean;
  /** Atténuation des flashs (réglage photosensibilité / confort). */
  soft = false;
  private readonly root = new Container({ label: 'combat-fx' });
  private swooshes: Swoosh[] = [];
  private pool: Record<'slash' | 'beam', FrameQuad[]> = { slash: [], beam: [] };
  private flashes = new Map<Container, FrameQuad>();
  private trails: Trail[] = [];
  private trailCap = TRAIL_CAP.high;
  private trailMesh: Mesh<Geometry, Shader> | null = null;
  private tPos!: Float32Array;
  private tUv!: Float32Array;
  private tCol!: Float32Array;
  private emberAcc = new WeakMap<FrameQuad, number>();
  private waves: Wave[] = [];
  private waveFilter: ReturnType<typeof createFilter> | null = null;
  private removeWave: (() => void) | null = null;
  private distortOn = true;

  constructor(private readonly renderer: Renderer, private readonly particles: FxParticles) {
    this.on = renderer.app.renderer.type === RendererType.WEBGL && !new URLSearchParams(location.search).has('noshaders');
    renderer.layers.fx.addChild(this.root);
    if (this.on) this.buildTrailMesh();
  }

  setLevel(level: QualityLevel): void {
    this.trailCap = TRAIL_CAP[level];
    // Passe plein écran : réservée aux appareils qui tiennent (la qualité auto baisse d'elle-même sinon).
    this.distortOn = level !== 'low';
    if (!this.distortOn) { this.waves = []; this.detachWave(); }
  }

  // ---------------------------------------------------------------- Onde de choc (distorsion)

  /**
   * Onde de choc qui déforme l'image autour d'un point du monde.
   * `radius` : rayon final en pixels monde ; `strength` : poussée (0.01 = discret, 0.03 = boss).
   */
  distort(x: number, y: number, radius = 260, strength = 0.018, life = 0.5): void {
    if (!this.on || !this.distortOn) return;
    if (this.waves.length >= 4) this.waves.shift();
    this.waves.push({ x, y, age: 0, life, radius, strength: strength * (this.soft ? 0.5 : 1) });
    if (!this.waveFilter) {
      this.waveFilter = createFilter({
        name: 'shockwave', fragment: SHOCKWAVE_FRAG,
        uniforms: { uWaves: { value: new Float32Array(16), type: 'vec4<f32>', size: 4 }, uAspect: { value: 1, type: 'f32' }, uChroma: { value: 1, type: 'f32' } },
      });
    }
    if (!this.removeWave) this.removeWave = this.renderer.post.add('world', this.waveFilter, 50);
  }

  private detachWave(): void { this.removeWave?.(); this.removeWave = null; }

  private updateWaves(dt: number): void {
    if (!this.waveFilter || !this.removeWave) return;
    const u = this.waveFilter.resources.u.uniforms;
    const arr = u.uWaves as Float32Array;
    arr.fill(0);
    const r = this.renderer, wt = r.world.worldTransform, zoom = Math.hypot(wt.a, wt.b);
    let i = 0;
    for (let k = this.waves.length - 1; k >= 0; k--) {
      const w = this.waves[k];
      w.age += dt;
      const p = w.age / w.life;
      if (p >= 1) { this.waves.splice(k, 1); continue; }
      const e = 1 - (1 - p) * (1 - p);
      arr[i * 4] = (wt.a * w.x + wt.c * w.y + wt.tx) / r.width;
      arr[i * 4 + 1] = (wt.b * w.x + wt.d * w.y + wt.ty) / r.height;
      arr[i * 4 + 2] = (w.radius * zoom * e) / r.height;
      arr[i * 4 + 3] = w.strength * (1 - p) * (1 - p);
      i++;
    }
    u.uAspect = r.width / Math.max(1, r.height);
    u.uChroma = this.soft ? 0 : 1;
    if (!this.waves.length) this.detachWave();
  }


  // ---------------------------------------------------------------- Mort : dissolution

  /** Corps d'un ennemi mort, à afficher à la place du Sprite (null : pas de shader, garder le Sprite). */
  corpse(tex: Texture, anchorX: number, anchorY: number, edge: number): FrameQuad | null {
    if (!this.on) return null;
    const q = new FrameQuad(DISSOLVE_FRAG, {
      uProgress: f32(0), uEdge: v3(edge), uSeed: f32(Math.random() * 50), uCell: f32(16),
    }, 'sc-dissolve');
    q.setFrame(tex, anchorX, anchorY);
    return q;
  }

  /**
   * Avance la dissolution (0 = intact, 1 = disparu) et fait monter quelques braises depuis le bord.
   * `x`, `y` : position monde du corps ; `sx`, `sy` : échelle appliquée au quad.
   */
  dissolve(q: FrameQuad, k: number, dt: number, x: number, y: number, sx: number, sy: number, color: number): void {
    q.u.uProgress = k;
    if (k <= 0 || k >= 1) return;
    let acc = (this.emberAcc.get(q) ?? 0) + dt * 22 * this.particles.density;
    const b = q.box;
    while (acc >= 1) {
      acc -= 1;
      // Le bord avance du haut vers le bas : on vise la bande en cours de disparition.
      const v = Math.min(1, Math.max(0, 1 - k + (Math.random() - 0.5) * 0.5));
      const px = x + (b.x0 + Math.random() * (b.x1 - b.x0)) * Math.abs(sx);
      const py = y + (b.y0 + v * (b.y1 - b.y0)) * sy;
      this.particles.emit(px, py, {
        color: Math.random() < 0.6 ? 0xffc070 : color, endColor: 0x401008, count: 1, speed: 30 + Math.random() * 40,
        angle: -Math.PI / 2, spread: 1.4, size: 0.12 + Math.random() * 0.12, life: 0.7 + Math.random() * 0.5,
        gravity: -70, drag: 1.5, alpha: 0.95,
      });
    }
    this.emberAcc.set(q, acc);
  }

  // ---------------------------------------------------------------- Impact : flash de silhouette

  /** Met à jour le flash d'impact d'un personnage (amount 0..1, 0 = éteint). Appelé à chaque image. */
  hitFlash(node: Container, body: Sprite, amount: number): void {
    if (!this.on) return;
    let q = this.flashes.get(node);
    if (amount <= 0.01) { if (q) q.visible = false; return; }
    if (!q || q.destroyed) {
      q = new FrameQuad(FLASH_FRAG, {
        uAmount: f32(0), uTexel: { value: new Float32Array(2), type: 'vec2<f32>' as const }, uTint: v3(0xfff0dc),
      }, 'sc-hitflash');
      q.label = 'hitflash';
      node.addChild(q);
      this.flashes.set(node, q);
      node.once('destroyed', () => this.flashes.delete(node));
    }
    q.visible = true;
    q.setFrame(body.texture, body.anchor.x, body.anchor.y);
    q.position.copyFrom(body.position);
    q.scale.copyFrom(body.scale);
    q.rotation = body.rotation;
    q.u.uAmount = Math.min(1, amount) * (this.soft ? 0.4 : 0.75) * body.alpha;
  }

  // ---------------------------------------------------------------- Armes : croissant, rayon, rubans

  /** Croissant de lame. Renvoie false si les shaders sont indisponibles. */
  slash(x: number, y: number, angle: number, range: number, arc: number, color: number): boolean {
    if (!this.on) return false;
    const R = range * 0.95;
    const q = this.take('slash');
    q.setRect(-1.25 * R, -1.25 * R, 1.25 * R, 1.25 * R);
    q.position.set(x, y); q.rotation = angle;
    Object.assign(q.u, { uArc: Math.min(arc, Math.PI * 1.9), uR: R, uSweep: 0, uLife: 1, uSeed: Math.random() * 40 });
    setRgb(q.u, 'uCol', color);
    this.swooshes.push({ q, age: 0, life: 0.22, kind: 'slash' });
    return true;
  }

  /** Rayon / traînée droite (ruée, tir perçant). */
  beam(x0: number, y0: number, x1: number, y1: number, color: number, width = 26): boolean {
    if (!this.on) return false;
    const L = Math.hypot(x1 - x0, y1 - y0);
    if (L < 2) return true;
    const W = width * 0.9;
    const q = this.take('beam');
    q.setRect(-W, -W * 1.6, L + W * 0.5, W * 1.6);
    q.position.set(x0, y0); q.rotation = Math.atan2(y1 - y0, x1 - x0);
    Object.assign(q.u, { uLen: L, uWidth: W, uLife: 1, uSeed: Math.random() * 40 });
    setRgb(q.u, 'uCol', color);
    this.swooshes.push({ q, age: 0, life: 0.28, kind: 'beam' });
    return true;
  }

  /** Ruban lumineux derrière un projectile ; il s'éteint seul quand le nœud est détruit. */
  trail(node: Container, color: number, width: number, yOff: number, x = node.x, y = node.y): void {
    if (!this.on || this.trails.length >= this.trailCap) return;
    // Point de départ = position réelle du tir (le nœud est encore en 0,0 tant que la vue n'est pas synchronisée :
    // partir de là traçait une bande jusqu'à l'origine de l'arène, qui restait à l'écran).
    this.trails.push({ node, pts: [x, y - yOff], r: ((color >> 16) & 255) / 255, g: ((color >> 8) & 255) / 255, b: (color & 255) / 255, width, yOff, fade: 1 });
  }

  private take(kind: 'slash' | 'beam'): FrameQuad {
    let q = this.pool[kind].pop();
    if (!q) {
      q = kind === 'slash'
        ? new FrameQuad(SLASH_FRAG, { uArc: f32(1), uSweep: f32(0), uLife: f32(1), uR: f32(100), uSeed: f32(0), uCol: v3(0xffffff) }, 'sc-slash')
        : new FrameQuad(BEAM_FRAG, { uLen: f32(100), uWidth: f32(20), uLife: f32(1), uSeed: f32(0), uCol: v3(0xffffff) }, 'sc-beam');
      q.blendMode = 'add';
    }
    q.visible = true;
    this.root.addChild(q);
    return q;
  }

  // ---------------------------------------------------------------- Image

  update(dt: number): void {
    if (!this.on) return;
    for (let i = this.swooshes.length - 1; i >= 0; i--) {
      const s = this.swooshes[i];
      s.age += dt;
      const p = s.age / s.life;
      if (p >= 1) { s.q.removeFromParent(); this.pool[s.kind].push(s.q); this.swooshes.splice(i, 1); continue; }
      if (s.kind === 'slash') {
        const k = Math.min(1, s.age / 0.085);
        s.q.u.uSweep = 1 - (1 - k) * (1 - k) * (1 - k);
        s.q.u.uLife = 1 - smooth(0.35, 1, p);
      } else {
        s.q.u.uLife = 1 - smooth(0.15, 1, p);
      }
    }
    // Swooshes empilés (mêlée rapide) : on baisse un peu chacun.
    const crowd = 1 / (1 + Math.max(0, this.swooshes.length - 3) * 0.15);
    for (const s of this.swooshes) s.q.alpha = crowd;
    this.updateTrails(dt);
    this.updateWaves(dt);
  }

  private buildTrailMesh(): void {
    const max = TRAIL_CAP.high, verts = max * TRAIL_PTS * 2;
    this.tPos = new Float32Array(verts * 2);
    this.tUv = new Float32Array(verts * 2);
    this.tCol = new Float32Array(verts * 4);
    const idx = new Uint32Array(max * (TRAIL_PTS - 1) * 6);
    let n = 0;
    for (let t = 0; t < max; t++) for (let i = 0; i < TRAIL_PTS - 1; i++) {
      const a = (t * TRAIL_PTS + i) * 2;
      idx.set([a, a + 1, a + 2, a + 1, a + 3, a + 2], n); n += 6;
    }
    const geometry = new Geometry({
      attributes: {
        aPosition: { buffer: this.tPos, format: 'float32x2' },
        aUV: { buffer: this.tUv, format: 'float32x2' },
        aColor: { buffer: this.tCol, format: 'float32x4' },
      },
      indexBuffer: idx,
    });
    const shader = Shader.from({ gl: { vertex: TRAIL_VERT, fragment: TRAIL_FRAG, name: 'sc-trail' }, resources: { fx: new UniformGroup({ uUnused: f32(0) }) } });
    this.trailMesh = new Mesh({ geometry, shader });
    this.trailMesh.blendMode = 'add';
    this.trailMesh.label = 'trails';
    this.root.addChildAt(this.trailMesh, 0);
  }

  private updateTrails(dt: number): void {
    const mesh = this.trailMesh;
    if (!mesh) return;
    const P = this.tPos, U = this.tUv, C = this.tCol;
    P.fill(0); C.fill(0);
    let slot = 0;
    for (let i = this.trails.length - 1; i >= 0; i--) {
      const tr = this.trails[i];
      const alive = !tr.node.destroyed && tr.node.parent !== null;
      if (alive) {
        if (!tr.node.visible) { tr.pts.length = 2; tr.pts[0] = tr.node.x; tr.pts[1] = tr.node.y - tr.yOff; }
        const hx = tr.node.x, hy = tr.node.y - tr.yOff;
        const jump = Math.hypot(hx - tr.pts[0], hy - tr.pts[1]);
        // Saut anormal (téléportation, nœud pas encore placé) : on repart de la tête plutôt que de tirer un trait.
        if (jump > tr.width * 9) { tr.pts.length = 2; tr.pts[0] = hx; tr.pts[1] = hy; }
        else if (jump > 5) tr.pts.unshift(hx, hy);
        else { tr.pts[0] = hx; tr.pts[1] = hy; }
      } else {
        // Le projectile a disparu : la queue se résorbe vers la tête.
        tr.fade -= dt * 6;
        if (tr.pts.length > 2) tr.pts.length -= 2;
      }
      // Longueur max ~ 9 × largeur.
      const maxLen = tr.width * 9;
      let len = 0;
      for (let j = 2; j < tr.pts.length; j += 2) {
        if (j / 2 >= TRAIL_PTS) { tr.pts.length = j; break; }
        const seg = Math.hypot(tr.pts[j] - tr.pts[j - 2], tr.pts[j + 1] - tr.pts[j - 1]);
        if (len + seg > maxLen) {
          // Le dernier segment est raccourci à la longueur restante (avant : gardé entier, même très long).
          const k = seg > 0 ? (maxLen - len) / seg : 0;
          tr.pts[j] = tr.pts[j - 2] + (tr.pts[j] - tr.pts[j - 2]) * k;
          tr.pts[j + 1] = tr.pts[j - 1] + (tr.pts[j + 1] - tr.pts[j - 1]) * k;
          tr.pts.length = j + 2;
          break;
        }
        len += seg;
      }
      if (!alive && (tr.fade <= 0 || tr.pts.length <= 2)) { this.trails.splice(i, 1); continue; }
      const n = tr.pts.length / 2;
      if (n < 2 || slot >= TRAIL_CAP.high) continue;
      const base = slot * TRAIL_PTS * 2;
      for (let j = 0; j < n; j++) {
        const x = tr.pts[j * 2], y = tr.pts[j * 2 + 1];
        const a = Math.max(0, j - 1), b = Math.min(n - 1, j + 1);
        let dx = tr.pts[b * 2] - tr.pts[a * 2], dy = tr.pts[b * 2 + 1] - tr.pts[a * 2 + 1];
        const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
        const u = j / (n - 1), hw = tr.width * (1 - 0.7 * u);
        const v = base + j * 2;
        P[v * 2] = x - dy * hw; P[v * 2 + 1] = y + dx * hw;
        P[v * 2 + 2] = x + dy * hw; P[v * 2 + 3] = y - dx * hw;
        U[v * 2] = u; U[v * 2 + 1] = -1; U[v * 2 + 2] = u; U[v * 2 + 3] = 1;
        for (const w of [v, v + 1]) { C[w * 4] = tr.r; C[w * 4 + 1] = tr.g; C[w * 4 + 2] = tr.b; C[w * 4 + 3] = Math.max(0, tr.fade); }
      }
      // Sommets restants du ruban : repliés sur la queue (surface nulle).
      for (let j = n; j < TRAIL_PTS; j++) {
        const v = base + j * 2, last = base + (n - 1) * 2;
        P[v * 2] = P[v * 2 + 2] = P[last * 2]; P[v * 2 + 1] = P[v * 2 + 3] = P[last * 2 + 1];
      }
      slot++;
    }
    mesh.visible = slot > 0;
    const g = mesh.geometry;
    g.getBuffer('aPosition').update(); g.getBuffer('aUV').update(); g.getBuffer('aColor').update();
  }

  destroy(): void {
    this.detachWave();
    this.waveFilter?.destroy();
    for (const k of ['slash', 'beam'] as const) for (const q of this.pool[k]) q.destroy();
    this.root.destroy({ children: true });
    this.swooshes = []; this.trails = []; this.flashes.clear();
  }
}
