import { Filter, GlProgram, type FilterOptions, type UniformGroup, type TextureSource } from 'pixi.js';
import { FILTER_VERTEX } from './glsl';

type UniformDef = { value: unknown; type: string; size?: number };

export interface CreateFilterOptions {
  /** Nom lisible (débogage, cache de programme). */
  name: string;
  /**
   * Fragment GLSL ES 3.0 sans ligne `#version` (Pixi l'ajoute). Entrées : `vTextureCoord`,
   * `vScreen`, `uTexture` ; sortie : `out vec4 finalColor;` à déclarer.
   */
  fragment: string;
  /** Uniforms du filtre, regroupés dans `filter.resources.u.uniforms`. */
  uniforms?: Record<string, UniformDef>;
  /** Textures ou groupes supplémentaires (ex. `{ uLightMap: texture.source }`). */
  resources?: Record<string, TextureSource | UniformGroup | unknown>;
  /** Vertex maison (rare) ; par défaut le vertex commun qui fournit `vScreen`. */
  vertex?: string;
  options?: Partial<FilterOptions>;
}

/**
 * Crée un filtre Pixi à partir de GLSL. Le jeu tourne en WebGL (voir `preference` dans Renderer) :
 * pas de version WGSL à maintenir.
 *
 *   const f = createFilter({ name: 'teinte', fragment, uniforms: { uMix: { value: 0.5, type: 'f32' } } });
 *   f.resources.u.uniforms.uMix = 0.8;
 */
export function createFilter(o: CreateFilterOptions): Filter & { resources: { u: { uniforms: Record<string, any> } } } {
  const glProgram = GlProgram.from({ vertex: o.vertex ?? FILTER_VERTEX, fragment: o.fragment, name: `sc-${o.name}` });
  const resources: Record<string, unknown> = { ...(o.resources ?? {}) };
  resources.u = o.uniforms ?? { uUnused: { value: 0, type: 'f32' } };
  return new Filter({ glProgram, resources, ...o.options }) as any;
}
