import { Assets, Texture } from 'pixi.js';

/**
 * Chargement des assets à partir de public/assets/manifest.json
 * (généré par tools/extract_assets.py ; clé = nom sans extension, ex. "hero-taro").
 *
 * - Images : chargées comme textures Pixi → `assets.texture('hero-taro')`.
 * - Audio : seules les URL sont exposées → `assets.url('music-lyre-akar')` (l'agent audio
 *   choisit sa techno : WebAudio, Howler…).
 */
const AUDIO = /\.(ogg|mp3|wav|m4a)$/i;

export class AssetStore {
  private manifest: Record<string, string> = {};
  private base: string;

  constructor(base: string = import.meta.env.BASE_URL) { this.base = base.endsWith('/') ? base : base + '/'; }

  async loadManifest(path = 'assets/manifest.json'): Promise<void> {
    const res = await fetch(this.base + path);
    if (!res.ok) throw new Error(`Manifest introuvable : ${path}`);
    this.manifest = await res.json();
  }

  /** Clés connues, filtrables par préfixe (« enemy- », « skill-taro- »…). */
  keys(prefix = ''): string[] { return Object.keys(this.manifest).filter((k) => k.startsWith(prefix)); }

  url(key: string): string {
    const p = this.manifest[key];
    if (!p) throw new Error(`Asset inconnu : ${key}`);
    return this.base + p;
  }

  /** Charge toutes les images (ou celles des clés données). `onProgress` reçoit 0..1. */
  async loadImages(keys = this.keys(), onProgress?: (p: number) => void): Promise<void> {
    const imgs = keys.filter((k) => !AUDIO.test(this.manifest[k]));
    for (const k of imgs) if (!Assets.cache.has(k)) Assets.add({ alias: k, src: this.url(k) });
    await Assets.load(imgs, onProgress);
  }

  texture(key: string): Texture {
    const t = Assets.get<Texture>(key);
    if (!t) throw new Error(`Texture non chargée : ${key}`);
    return t;
  }
}
