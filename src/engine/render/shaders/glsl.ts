/**
 * Morceaux de GLSL ES 3.0 partagés par les filtres du jeu (éclairage, étalonnage, effets).
 * À coller en tête d'un fragment : `${GLSL.luma}${GLSL.hash}…`.
 *
 * Conventions :
 *  - Pixi travaille en alpha prémultiplié : `unpremul()` avant de toucher aux couleurs,
 *    `premul()` avant d'écrire `finalColor`.
 *  - `vScreen` (fourni par le vertex commun) = position écran 0..1, (0,0) en haut à gauche,
 *    valable quand le filtre couvre tout l'écran (cas des étages de `renderer.post`).
 */
export const GLSL = {
  /** Luminance perçue (Rec. 709). */
  luma: /* glsl */ `
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
`,
  /** Passage alpha prémultiplié ↔ droit. */
  premul: /* glsl */ `
vec4 unpremul(vec4 c) { return c.a > 0.0 ? vec4(c.rgb / c.a, c.a) : vec4(0.0); }
vec4 premul(vec4 c) { return vec4(c.rgb * c.a, c.a); }
`,
  /** Hachage et bruit de valeur 2D, sans texture. */
  hash: /* glsl */ `
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y);
}
`,
  /** Compression douce des hautes lumières (évite le blanc brûlé quand les lumières s'additionnent). */
  tonemap: /* glsl */ `
vec3 tonemapSoft(vec3 c) { vec3 x = max(c, 0.0); return x / (1.0 + max(x - 0.8, 0.0) * 0.9); }
`,
} as const;

/**
 * Vertex commun des filtres : identique à celui de Pixi, plus `vScreen`.
 * Quand le filtre couvre tout l'écran (étages `renderer.post`, `filterArea` géant rogné à l'écran),
 * le quad du filtre EST l'écran : aPosition (0..1) est directement la coordonnée écran.
 */
export const FILTER_VERTEX = /* glsl */ `in vec2 aPosition;
out vec2 vTextureCoord;
out vec2 vScreen;

uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;

void main(void) {
  vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
  position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
  position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
  gl_Position = vec4(position, 0.0, 1.0);
  vTextureCoord = aPosition * (uOutputFrame.zw * uInputSize.zw);
  vScreen = aPosition;
}
`;
