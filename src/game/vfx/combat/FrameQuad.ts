import { Mesh, MeshGeometry, Shader, Texture, UniformGroup, type DestroyOptions, type UniformData } from 'pixi.js';
import { MESH_VERT } from './glsl';

type Uniforms = Record<string, UniformData>;

/**
 * Quadrilatère qui reproduit un Sprite (cadre d'atlas rogné, ancre) mais se dessine avec un shader maison.
 * `vLocal` donne la position en pixels du sprite d'origine : le bruit reste collé au personnage
 * même quand le cadre rogné change d'une image d'animation à l'autre.
 */
export class FrameQuad extends Mesh<MeshGeometry, Shader> {
  /** Boîte locale du cadre courant (pixels, avant échelle) : utile pour émettre des braises dessus. */
  readonly box = { x0: 0, y0: 0, x1: 0, y1: 0 };
  readonly u: Record<string, unknown>;
  private tex: Texture | null = null;
  private ax = 0.5;
  private ay = 1;

  constructor(fragment: string, uniforms: Uniforms, name: string) {
    const geometry = new MeshGeometry({
      positions: new Float32Array(8),
      uvs: new Float32Array(8),
      indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
    });
    const group = new UniformGroup(uniforms);
    const shader = Shader.from({
      gl: { vertex: MESH_VERT, fragment, name },
      resources: { fx: group, uTexture: Texture.WHITE.source },
    });
    super({ geometry, shader });
    this.u = group.uniforms;
  }

  /** Change l'image affichée (à appeler quand l'animation avance). */
  setFrame(tex: Texture, anchorX = this.ax, anchorY = this.ay): void {
    if (tex === this.tex && anchorX === this.ax && anchorY === this.ay) return;
    this.tex = tex; this.ax = anchorX; this.ay = anchorY;
    if (this.shader!.resources.uTexture !== tex.source) this.shader!.resources.uTexture = tex.source;
    const o = tex.orig, tr = tex.trim;
    const x0 = (tr ? tr.x : 0) - anchorX * o.width, x1 = x0 + (tr ? tr.width : o.width);
    const y0 = (tr ? tr.y : 0) - anchorY * o.height, y1 = y0 + (tr ? tr.height : o.height);
    Object.assign(this.box, { x0, y0, x1, y1 });
    const p = this.geometry.positions;
    p[0] = x0; p[1] = y0; p[2] = x1; p[3] = y0; p[4] = x1; p[5] = y1; p[6] = x0; p[7] = y1;
    const uv = this.geometry.uvs, t = tex.uvs;
    uv[0] = t.x0; uv[1] = t.y0; uv[2] = t.x1; uv[3] = t.y1; uv[4] = t.x2; uv[5] = t.y2; uv[6] = t.x3; uv[7] = t.y3;
    this.geometry.getBuffer('aPosition').update();
    this.geometry.getBuffer('aUV').update();
    const tx = this.u.uTexel as Float32Array | undefined;
    if (tx) { tx[0] = 1 / tex.source.width; tx[1] = 1 / tex.source.height; }
  }

  /** Quad libre (effets procéduraux sans texture) : rectangle local en pixels. */
  setRect(x0: number, y0: number, x1: number, y1: number): void {
    this.tex = null;
    Object.assign(this.box, { x0, y0, x1, y1 });
    const p = this.geometry.positions;
    p[0] = x0; p[1] = y0; p[2] = x1; p[3] = y0; p[4] = x1; p[5] = y1; p[6] = x0; p[7] = y1;
    const uv = this.geometry.uvs;
    uv[0] = 0; uv[1] = 0; uv[2] = 1; uv[3] = 0; uv[4] = 1; uv[5] = 1; uv[6] = 0; uv[7] = 1;
    this.geometry.getBuffer('aPosition').update();
    this.geometry.getBuffer('aUV').update();
  }

  override destroy(options?: DestroyOptions): void {
    const g = this.geometry, sh = this.shader;
    super.destroy(options);
    g.destroy();
    sh?.destroy(false); // le programme GL est partagé entre toutes les instances
  }
}
