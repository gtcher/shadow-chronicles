import { Texture, type TextureSource } from 'pixi.js';
import { createFilter, GLSL } from '@engine';

/**
 * Éclairage avec relief (étage `scene` de renderer.post, order 0).
 *
 * Remplace la multiplication à plat par la carte de lumière :
 *   couleur = albedo × lumière × relief + reflets
 * - lumière : la carte de lumière existante (toutes les lumières, sans limite de nombre) ;
 * - direction de la lumière : déduite de la pente de la carte (la lumière vient d'où c'est plus clair) ;
 * - normale du pixel : tampon de normales (personnages peints) là où il est rempli, sinon devinée
 *   à partir de la luminance de l'image (pierres, décor, combattants actuels) ;
 * - relief = (N·L) rapporté à une surface plate : 1 sur un sol plat, plus clair face à la lumière,
 *   plus sombre à l'opposé ; reflets spéculaires seulement sur les arêtes tournées vers la lumière.
 */
const FRAGMENT = /* glsl */ `
in vec2 vTextureCoord;
in vec2 vScreen;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform sampler2D uLightMap;
uniform sampler2D uNormals;
uniform vec4 uInputPixel;
uniform vec4 uInputClamp;

uniform vec2 uLightTexel;
uniform float uBump;
uniform float uRelief;
uniform float uSpec;
uniform float uSlant;
uniform float uHasNormals;
${GLSL.luma}

float height(vec2 uv) {
  vec4 c = texture(uTexture, clamp(uv, uInputClamp.xy, uInputClamp.zw));
  return luma(c.rgb) * 0.8 + c.a * 0.2;
}

void main(void) {
  vec4 c = texture(uTexture, vTextureCoord);
  vec3 L = texture(uLightMap, vScreen).rgb;
  if (c.a <= 0.001) { finalColor = vec4(0.0); return; }

  // Direction de la lumière : pente de la carte de lumière (y vers le bas, comme l'écran).
  vec2 o = uLightTexel * 2.5;
  float gx = luma(texture(uLightMap, vScreen + vec2(o.x, 0.0)).rgb) - luma(texture(uLightMap, vScreen - vec2(o.x, 0.0)).rgb);
  float gy = luma(texture(uLightMap, vScreen + vec2(0.0, o.y)).rgb) - luma(texture(uLightMap, vScreen - vec2(0.0, o.y)).rgb);
  float lb = max(luma(L), 0.04);
  vec3 Ld = normalize(vec3(vec2(gx, gy) / lb * uSlant, 1.0));

  // Normale : relief deviné à partir de la luminance (pas de 1,5 pixel écran).
  vec2 px = uInputPixel.zw * 1.5;
  float dx = height(vTextureCoord + vec2(px.x, 0.0)) - height(vTextureCoord - vec2(px.x, 0.0));
  float dy = height(vTextureCoord + vec2(0.0, px.y)) - height(vTextureCoord - vec2(0.0, px.y));
  // Pentes bornées : les contours encrés des personnages ne doivent pas devenir des falaises.
  vec2 slope = clamp(vec2(dx, dy), -0.1, 0.1);
  vec3 N = normalize(vec3(-slope * uBump, 1.0));
  if (uHasNormals > 0.5) {
    vec4 n = texture(uNormals, vScreen);
    if (n.a > 0.01) {
      vec3 nn = n.rgb / n.a * 2.0 - 1.0;
      // Tampon en convention OpenGL (G = haut) ; l'écran a y vers le bas.
      N = normalize(mix(N, normalize(vec3(nn.x, -nn.y, max(nn.z, 0.05))), n.a));
    }
  }

  // Terme directionnel seul (moyenne nulle) : ne change pas la luminosité moyenne d'une surface.
  float shade = clamp(1.0 + dot(N.xy, Ld.xy) / max(N.z, 0.2) * uRelief, 0.4, 1.8);
  vec3 H = normalize(Ld + vec3(0.0, 0.0, 1.0));
  float spec = max(pow(max(dot(N, H), 0.0), 22.0) - pow(H.z, 22.0), 0.0) * uSpec;
  vec3 rgb = c.rgb * L * shade + L * spec * c.a * smoothstep(0.15, 0.6, lb);
  finalColor = vec4(rgb, c.a);
}
`;

export interface ReliefParams {
  /** Force du relief deviné (pente de luminance → normale). */
  bump: number;
  /** Amplitude de l'ombrage directionnel autour de 1. */
  relief: number;
  /** Intensité des reflets sur les arêtes. */
  spec: number;
  /** Inclinaison de la lumière déduite de la pente de la carte. */
  slant: number;
}

export const DEFAULT_RELIEF: ReliefParams = { bump: 8, relief: 1.0, spec: 0.5, slant: 5 };

export function createReliefFilter() {
  const f = createFilter({
    name: 'relief-light',
    fragment: FRAGMENT,
    uniforms: {
      uLightTexel: { value: new Float32Array([1 / 256, 1 / 256]), type: 'vec2<f32>' },
      uBump: { value: DEFAULT_RELIEF.bump, type: 'f32' },
      uRelief: { value: DEFAULT_RELIEF.relief, type: 'f32' },
      uSpec: { value: DEFAULT_RELIEF.spec, type: 'f32' },
      uSlant: { value: DEFAULT_RELIEF.slant, type: 'f32' },
      uHasNormals: { value: 0, type: 'f32' },
    },
    resources: { uLightMap: Texture.WHITE.source, uNormals: Texture.EMPTY.source },
  });
  const u = f.resources.u.uniforms;
  return {
    filter: f,
    set(p: Partial<ReliefParams>) {
      if (p.bump !== undefined) u.uBump = p.bump;
      if (p.relief !== undefined) u.uRelief = p.relief;
      if (p.spec !== undefined) u.uSpec = p.spec;
      if (p.slant !== undefined) u.uSlant = p.slant;
    },
    bind(light: TextureSource, normals: TextureSource | null) {
      (f.resources as Record<string, unknown>).uLightMap = light;
      if (normals) (f.resources as Record<string, unknown>).uNormals = normals;
      u.uHasNormals = normals ? 1 : 0;
      const t = u.uLightTexel as Float32Array;
      t[0] = 1 / light.width; t[1] = 1 / light.height;
    },
  };
}
export type ReliefLight = ReturnType<typeof createReliefFilter>;
