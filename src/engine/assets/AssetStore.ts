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
  /** Clés exposées seulement en URL (fonds d'écran DOM) : jamais chargées comme textures par défaut. */
  private lazy = new Set<string>();
  private base: string;

  constructor(base: string = import.meta.env.BASE_URL) { this.base = base.endsWith('/') ? base : base + '/'; }

  /**
   * Ajoute un manifest (les clés s'ajoutent aux précédentes).
   * `preload: false` : ses clés ne sont pas chargées par `loadImages()` sans argument
   * (images utilisées seulement par l'interface DOM, ou chargées à la demande).
   */
  async loadManifest(path = 'assets/manifest.json', opts: { preload?: boolean } = {}): Promise<void> {
    const res = await fetch(this.base + path);
    if (!res.ok) throw new Error(`Manifest introuvable : ${path}`);
    const m = (await res.json()) as Record<string, string>;
    if (opts.preload === false) for (const k of Object.keys(m)) this.lazy.add(k);
    Object.assign(this.manifest, m);
  }

  /** Clés connues, filtrables par préfixe (« enemy- », « skill-taro- »…). */
  keys(prefix = ''): string[] { return Object.keys(this.manifest).filter((k) => k.startsWith(prefix)); }

  url(key: string): string {
    const p = this.manifest[key];
    if (!p) throw new Error(`Asset inconnu : ${key}`);
    return this.base + p;
  }

  /** Charge toutes les images (ou celles des clés données). `onProgress` reçoit 0..1. */
  async loadImages(keys = this.keys().filter((k) => !this.lazy.has(k)), onProgress?: (p: number) => void): Promise<void> {
    const imgs = keys.filter((k) => !AUDIO.test(this.manifest[k]) && !/\.json$/i.test(this.manifest[k]));
    for (const k of imgs) if (!Assets.cache.has(k)) Assets.add({ alias: k, src: this.url(k) });
    await Assets.load(imgs, onProgress);
  }

  texture(key: string): Texture {
    const t = Assets.get<Texture>(key);
    if (!t) throw new Error(`Texture non chargée : ${key}`);
    return t;
  }
}
