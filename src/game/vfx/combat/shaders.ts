import { NOISE } from './glsl';

/**
 * Fragments des effets de combat. Toutes les lueurs passent par `1 - exp(-I)` :
 * les superpositions montent en douceur au lieu de saturer en tache blanche (retour de Gabriel sur la mêlée).
 */

/** Dissolution d'un corps : trous de bruit qui grandissent, bord en braise, cendre sombre juste derrière. */
export const DISSOLVE_FRAG = /* glsl */ `
in vec2 vUV;
in vec2 vLocal;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform vec4 uColor;
uniform float uProgress;
uniform vec3 uEdge;
uniform float uSeed;
uniform float uCell;
${NOISE}
void main() {
  vec4 c = texture(uTexture, vUV);
  if (c.a < 0.004) discard;
  // Le haut du corps part un peu avant les pieds : la cendre « s'envole ».
  float n = clamp((fbm(vLocal / uCell + uSeed) - 0.5) * 1.7 + 0.5, 0.0, 1.0) * 0.85 + clamp(vLocal.y / (uCell * 14.0), -0.15, 0.15) + 0.07;
  float d = n - (uProgress * 1.25 - 0.12);
  if (d < 0.0) discard;
  float edge = 1.0 - smoothstep(0.0, 0.09, d);
  float ash = 1.0 - smoothstep(0.0, 0.2, d);
  vec3 rgb = c.rgb * (1.0 - 0.8 * ash);
  rgb += uEdge * c.a * edge * 1.6;
  rgb += vec3(1.0, 0.93, 0.8) * c.a * pow(edge, 5.0) * 0.7;
  finalColor = vec4(rgb, c.a) * uColor;
}
`;

/** Flash d'impact : le corps se remplit d'une lumière chaude, liseré plus vif sur la silhouette. */
export const FLASH_FRAG = /* glsl */ `
in vec2 vUV;
in vec2 vLocal;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform vec4 uColor;
uniform float uAmount;
uniform vec2 uTexel;
uniform vec3 uTint;
void main() {
  float a = texture(uTexture, vUV).a;
  if (a < 0.004) discard;
  vec2 o = uTexel * 3.0;
  float m = min(min(texture(uTexture, vUV + vec2(o.x, 0.0)).a, texture(uTexture, vUV - vec2(o.x, 0.0)).a),
                min(texture(uTexture, vUV + vec2(0.0, o.y)).a, texture(uTexture, vUV - vec2(0.0, o.y)).a));
  float rim = clamp(a - m, 0.0, 1.0);
  float f = a * (0.3 + 0.7 * rim) * uAmount;
  finalColor = vec4(uTint * f, f) * uColor.a;
}
`;

/** Croissant de lame : tête nette et chaude, traîne qui s'amincit et s'éteint, stries de vitesse. */
export const SLASH_FRAG = /* glsl */ `
in vec2 vUV;
in vec2 vLocal;
out vec4 finalColor;
uniform vec4 uColor;
uniform float uArc;
uniform float uSweep;
uniform float uLife;
uniform float uR;
uniform float uSeed;
uniform vec3 uCol;
${NOISE}
void main() {
  vec2 p = vLocal / uR;
  float r = length(p);
  float th = atan(p.y, p.x);
  float a0 = -0.5 * uArc;
  float head = a0 + uArc * uSweep;
  float behind = head - th;
  if (th < a0 - 0.08 || behind < -0.06) discard;
  float along = clamp(behind / max(0.4, uArc * 0.85), 0.0, 1.0);
  // Profil asymétrique : tranchant net à l'extérieur, dégradé vers l'intérieur, de plus en plus fin dans la traîne.
  float rc = 0.92 - 0.06 * along;
  float d = r - rc;
  float thick = mix(0.3, 0.04, along);
  float band = d > 0.0 ? 1.0 - smoothstep(0.0, 0.022, d) : pow(1.0 - smoothstep(0.0, thick, -d), 1.6);
  band *= smoothstep(-0.06, 0.02, behind);
  float streak = 0.55 + 0.45 * vnoise(vec2(r * 30.0, th * 2.0 + uSeed));
  float tail = pow(1.0 - along, 1.7);
  float body = band * tail * mix(streak, 1.0, 0.4);
  float edge = (1.0 - smoothstep(0.0, 0.03, abs(d))) * tail * tail;
  float fill = 0.07 * (1.0 - smoothstep(rc - 0.08, rc, r)) * smoothstep(0.3, 0.7, r) * tail;
  float I = (body * 2.2 + edge * 1.6 + fill) * uLife;
  float hot = clamp(edge * 1.2 * uLife, 0.0, 1.0);
  vec3 col = mix(uCol, vec3(1.0, 0.97, 0.9), hot * 0.9);
  finalColor = vec4(col * (1.0 - exp(-I * 2.2)), 0.0) * uColor.a;
}
`;

/** Rayon / traînée droite (ruée, tir perçant) : profil gaussien, tête vive, flux de bruit qui défile. */
export const BEAM_FRAG = /* glsl */ `
in vec2 vUV;
in vec2 vLocal;
out vec4 finalColor;
uniform vec4 uColor;
uniform float uLen;
uniform float uWidth;
uniform float uLife;
uniform float uSeed;
uniform vec3 uCol;
${NOISE}
void main() {
  float u = clamp(vLocal.x / uLen, 0.0, 1.0);
  float v = vLocal.y / (uWidth * mix(0.35, 1.0, u));
  float prof = exp(-v * v * 3.0);
  float flow = 0.55 + 0.45 * vnoise(vec2(vLocal.x * 0.05 - uSeed * 7.0 - (1.0 - uLife) * 18.0, v * 1.5 + uSeed));
  float ends = smoothstep(0.0, 0.25, u) * (1.0 - smoothstep(0.93, 1.0, u));
  float I = prof * flow * ends * mix(0.45, 1.0, u) * uLife * 1.7;
  float hot = pow(prof, 6.0) * uLife;
  vec3 col = mix(uCol, vec3(1.0, 0.97, 0.9), hot * 0.8);
  finalColor = vec4(col * (1.0 - exp(-I * 2.0)), 0.0) * uColor.a;
}
`;

/** Rubans de projectiles (tous dans un seul mesh, couleur par sommet). */
export const TRAIL_VERT = /* glsl */ `
in vec2 aPosition;
in vec2 aUV;
in vec4 aColor;
out vec2 vUV;
out vec4 vColor;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
void main() {
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
  vUV = aUV;
  vColor = aColor;
}
`;

export const TRAIL_FRAG = /* glsl */ `
in vec2 vUV;
in vec4 vColor;
out vec4 finalColor;
uniform vec4 uColor;
void main() {
  float prof = exp(-vUV.y * vUV.y * 3.2);
  float fade = pow(1.0 - vUV.x, 1.6);
  float I = prof * fade * vColor.a * 2.4;
  float hot = pow(prof, 8.0) * pow(1.0 - vUV.x, 3.0) * vColor.a;
  vec3 col = mix(vColor.rgb, vec3(1.0, 0.97, 0.92), hot * 0.75);
  finalColor = vec4(col * (1.0 - exp(-I * 2.0)), 0.0) * uColor.a;
}
`;

/**
 * Onde de choc plein écran (étage `world` de renderer.post) : jusqu'à 4 anneaux qui poussent l'image
 * vers l'extérieur, avec une légère séparation des couleurs sur l'anneau (coupée si les flashs le sont).
 * uWaves[i] = (centre x, centre y en 0..1 écran, rayon en hauteurs d'écran, force).
 */
export const SHOCKWAVE_FRAG = /* glsl */ `
in vec2 vTextureCoord;
in vec2 vScreen;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform vec4 uInputClamp;
uniform highp vec4 uInputSize;
uniform highp vec4 uOutputFrame;
uniform vec4 uWaves[4];
uniform float uAspect;
uniform float uChroma;
void main() {
  vec2 off = vec2(0.0);
  float ring = 0.0;
  for (int i = 0; i < 4; i++) {
    vec4 w = uWaves[i];
    if (w.w <= 0.0) continue;
    vec2 d = (vScreen - w.xy) * vec2(uAspect, 1.0);
    float dist = length(d);
    float x = (dist - w.z) / (0.035 + w.z * 0.12);
    float g = exp(-x * x);
    off += (d / max(dist, 1e-4)) * (g * x) * w.w;
    ring += g * w.w;
  }
  off.x /= uAspect;
  vec2 k = uOutputFrame.zw * uInputSize.zw;
  vec2 uv = vTextureCoord - off * k;
  vec2 ca = off * k * uChroma * 0.3;
  vec4 c = texture(uTexture, clamp(uv, uInputClamp.xy, uInputClamp.zw));
  if (uChroma > 0.0 && ring > 0.001) {
    c.r = texture(uTexture, clamp(uv + ca, uInputClamp.xy, uInputClamp.zw)).r;
    c.b = texture(uTexture, clamp(uv - ca, uInputClamp.xy, uInputClamp.zw)).b;
  }
  finalColor = c;
}
`;
