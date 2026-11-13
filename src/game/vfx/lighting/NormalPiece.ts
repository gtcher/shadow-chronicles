import { GlProgram, Mesh, MeshGeometry, Shader, type Texture } from 'pixi.js';

/**
 * Pièce de normal map pour le tampon de normales de l'éclairage (`vfx.lighting.normals`).
 *
 * Convention de la texture : tangent-space OpenGL (R = +x droite, G = +y haut, B = vers la caméra),
 * alpha = couverture. La pièce peut tourner, être agrandie ou retournée (scale.x = -1) : le shader fait
 * tourner xy de la normale avec la transformation monde complète (caméra comprise), puis l'écrit dans
 * le tampon dans la même convention, en alpha prémultiplié.
 *
 * Usage (pantins peints) : un conteneur parallèle aux sprites couleur, une NormalPiece par membre
 * avec les mêmes position / rotation / échelle / ancre, ajouté à `vfx.lighting.normals`.
 * Coût : un appel de dessin par pièce (shader maison, pas de regroupement) ; à réserver au héros,
 * aux élites et aux boss.
 */
const VERTEX = /* glsl */ `
in vec2 aPosition;
in vec2 aUV;
out vec2 vUV;
out vec4 vLin;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
void main() {
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
  vUV = aUV;
  // Partie linéaire (rotation, échelle, retournement) de la transformation monde, pour le fragment.
  mat3 m = uWorldTransformMatrix * uTransformMatrix;
  vLin = vec4(m[0].xy, m[1].xy);
}
`;

const FRAGMENT = /* glsl */ `
in vec2 vUV;
in vec4 vLin;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform float uAlpha;
void main() {
  vec4 n = texture(uTexture, vUV);
  if (n.a < 0.01) discard;
  vec3 v = (n.a > 0.0 ? n.rgb / n.a : n.rgb) * 2.0 - 1.0;
  // Espace écran (y vers le bas) : on retourne G, on applique la partie linéaire de la transformation.
  vec2 s = vec2(v.x, -v.y);
  float len = length(s);
  vec2 r = mat2(vLin.xy, vLin.zw) * s;
  if (len > 0.0001) r = normalize(r) * len;
  vec3 outN = vec3(r.x, -r.y, v.z) * 0.5 + 0.5;
  float a = n.a * uAlpha;
  finalColor = vec4(outN * a, a);
}
`;

let program: GlProgram | null = null;

export class NormalPiece extends Mesh<MeshGeometry, Shader> {
  constructor(texture: Texture, anchorX = 0.5, anchorY = 0.5) {
    program ??= GlProgram.from({ vertex: VERTEX, fragment: FRAGMENT, name: 'sc-normal-piece' });
    const w = texture.frame.width, h = texture.frame.height;
    const x0 = -anchorX * w, y0 = -anchorY * h;
    const u = texture.uvs;
    const geometry = new MeshGeometry({
      positions: new Float32Array([x0, y0, x0 + w, y0, x0 + w, y0 + h, x0, y0 + h]),
      uvs: new Float32Array([u.x0, u.y0, u.x1, u.y1, u.x2, u.y2, u.x3, u.y3]),
      indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
    });
    const shader = new Shader({
      glProgram: program,
      resources: { uTexture: texture.source, pieceUniforms: { uAlpha: { value: 1, type: 'f32' } } },
    });
    super({ geometry, shader });
    this.label = 'normal-piece';
  }

  /** Opacité de la normale (fondu des membres). */
  set normalAlpha(a: number) { (this.shader!.resources.pieceUniforms as { uniforms: { uAlpha: number } }).uniforms.uAlpha = a; }
}
