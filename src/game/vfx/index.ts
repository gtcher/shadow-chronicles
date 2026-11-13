/** Rendu / VFX : point d'entrée unique. Voir `Vfx.ts` pour l'intégration dans une scène. */
export { Vfx, type VfxOptions, type VfxSettings } from './Vfx';
export { Lighting, type Light } from './Lighting';
export { Bloom } from './Bloom';
export { Fog } from './Fog';
export { FxParticles, type EmitOptions, type ParticleShape } from './FxParticles';
export { DamageNumbers, type DamageStyle } from './DamageNumbers';
export { QUALITY_PRESETS, detectQuality, type QualityLevel, type QualitySetting, type QualityPreset } from './quality';
export { makeVfxTextures, type VfxTextures } from './textures';
export { NormalPiece } from './lighting/NormalPiece';
export { CastShadows } from './lighting/CastShadows';
export { DEFAULT_RELIEF, type ReliefParams } from './lighting/ReliefFilter';
