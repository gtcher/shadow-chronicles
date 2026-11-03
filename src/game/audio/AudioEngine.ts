import { makeImpulse } from './synth';

/**
 * Graphe audio et volumes séparés.
 *
 *   music ─ duck ─ muffle ┐
 *   sfx ──────────────────┤
 *   ambience ─────────────┼─ master ─ compresseur ─ sortie
 *   ui ───────────────────┘
 *   reverb (envoi partagé) ─┘ (vers master)
 *
 * Le contexte WebAudio n'est créé qu'au premier geste du joueur (règle des navigateurs).
 */
export type BusId = 'master' | 'music' | 'sfx' | 'ambience' | 'ui';

export interface AudioSettings {
  master: number; music: number; sfx: number; ambience: number; ui: number;
  muted: boolean;
}

export const DEFAULT_SETTINGS: AudioSettings = { master: 0.8, music: 0.6, sfx: 0.8, ambience: 0.5, ui: 0.7, muted: false };
export const SETTINGS_KEY = 'shadow-chronicles.audio';

const clamp01 = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : d);

/** Normalise des réglages venant d'une sauvegarde (valeurs manquantes ou hors bornes). */
export function sanitizeSettings(raw: unknown): AudioSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof AudioSettings, unknown>>;
  return {
    master: clamp01(r.master, DEFAULT_SETTINGS.master),
    music: clamp01(r.music, DEFAULT_SETTINGS.music),
    sfx: clamp01(r.sfx, DEFAULT_SETTINGS.sfx),
    ambience: clamp01(r.ambience, DEFAULT_SETTINGS.ambience),
    ui: clamp01(r.ui, DEFAULT_SETTINGS.ui),
    muted: r.muted === true,
  };
}

/** Courbe perceptive : un curseur à 50 % ≈ -12 dB plutôt que -6 dB. */
export const sliderToGain = (v: number): number => v * v;

export function loadSettings(storage: Pick<Storage, 'getItem'> | null = safeStorage()): AudioSettings {
  try { return sanitizeSettings(JSON.parse(storage?.getItem(SETTINGS_KEY) ?? 'null')); } catch { return { ...DEFAULT_SETTINGS }; }
}

function safeStorage(): Storage | null {
  try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; }
}

export class AudioEngine {
  ctx: BaseAudioContext | null = null;
  settings: AudioSettings;
  /** Appelé à chaque changement de réglage (l'agent Sauvegarde peut s'y brancher). */
  onSettingsChange?: (s: AudioSettings) => void;
  /** Persistance locale automatique (désactivable si la sauvegarde gère les réglages). */
  persist = true;

  buses!: Record<BusId, GainNode>;
  reverb!: ConvolverNode;
  reverbIn!: GainNode;
  private duckGain!: GainNode;
  private muffle!: BiquadFilterNode;
  private readyCbs: (() => void)[] = [];

  constructor(settings: AudioSettings = loadSettings()) {
    this.settings = sanitizeSettings(settings);
  }

  get ready(): boolean { return this.ctx !== null; }
  get now(): number { return this.ctx?.currentTime ?? 0; }

  /** Exécute `fn` dès que le contexte existe (immédiatement s'il existe déjà). */
  whenReady(fn: () => void): void { if (this.ctx) fn(); else this.readyCbs.push(fn); }

  /**
   * Crée (ou reprend) le contexte. À appeler depuis un geste utilisateur ;
   * `autoUnlock()` s'en charge sur le premier clic / touche / toucher.
   * Un `OfflineAudioContext` peut être fourni (rendu hors ligne, tests).
   */
  init(ctx?: BaseAudioContext): BaseAudioContext {
    if (this.ctx) {
      if (this.ctx instanceof AudioContext && this.ctx.state === 'suspended') void this.ctx.resume();
      return this.ctx;
    }
    const c = ctx ?? new AudioContext({ latencyHint: 'interactive' });
    this.ctx = c;

    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.22;
    const limiter = c.createDynamicsCompressor();
    limiter.threshold.value = -2; limiter.knee.value = 0; limiter.ratio.value = 20; limiter.attack.value = 0.001; limiter.release.value = 0.1;
    comp.connect(limiter).connect(c.destination);

    const mk = (): GainNode => c.createGain();
    this.buses = { master: mk(), music: mk(), sfx: mk(), ambience: mk(), ui: mk() };
    this.buses.master.connect(comp);

    this.duckGain = mk();
    this.muffle = c.createBiquadFilter();
    this.muffle.type = 'lowpass'; this.muffle.frequency.value = 20000; this.muffle.Q.value = 0.5;
    this.buses.music.connect(this.duckGain).connect(this.muffle).connect(this.buses.master);
    this.buses.sfx.connect(this.buses.master);
    this.buses.ambience.connect(this.buses.master);
    this.buses.ui.connect(this.buses.master);

    this.reverb = c.createConvolver();
    this.reverb.buffer = makeImpulse(c);
    this.reverbIn = mk();
    this.reverbIn.gain.value = 0.55;
    const revHp = c.createBiquadFilter(); revHp.type = 'highpass'; revHp.frequency.value = 180;
    this.reverbIn.connect(revHp).connect(this.reverb).connect(this.buses.master);

    this.applySettings(true);
    const cbs = this.readyCbs; this.readyCbs = [];
    cbs.forEach((f) => f());
    return c;
  }

  /** Débloque l'audio au premier geste du joueur. */
  autoUnlock(target: EventTarget = window): void {
    const evs = ['pointerdown', 'keydown', 'touchstart', 'gamepadconnected'];
    const go = (): void => {
      this.init();
      if (this.ctx instanceof AudioContext && this.ctx.state === 'running') evs.forEach((e) => target.removeEventListener(e, go, true));
    };
    evs.forEach((e) => target.addEventListener(e, go, true));
  }

  set(bus: BusId, value: number): void {
    this.settings[bus] = clamp01(value, this.settings[bus]);
    this.applySettings();
  }

  setMuted(m: boolean): void { this.settings.muted = m; this.applySettings(); }

  update(partial: Partial<AudioSettings>): void {
    this.settings = sanitizeSettings({ ...this.settings, ...partial });
    this.applySettings();
  }

  private applySettings(silent = false): void {
    if (this.ctx) {
      const t = this.ctx.currentTime, s = this.settings;
      this.buses.master.gain.setTargetAtTime(s.muted ? 0 : sliderToGain(s.master), t, 0.03);
      for (const b of ['music', 'sfx', 'ambience', 'ui'] as const) this.buses[b].gain.setTargetAtTime(sliderToGain(s[b]), t, 0.03);
    }
    if (silent) return;
    if (this.persist) { try { safeStorage()?.setItem(SETTINGS_KEY, JSON.stringify(this.settings)); } catch { /* stockage indisponible */ } }
    this.onSettingsChange?.({ ...this.settings });
  }

  /** Baisse la musique un instant (butin légendaire, intro de boss…). */
  duck(depth = 0.35, hold = 1.2, release = 1.2): void {
    if (!this.ctx) return;
    const g = this.duckGain.gain, t = this.ctx.currentTime;
    g.cancelScheduledValues(t);
    g.setTargetAtTime(depth, t, 0.04);
    g.setTargetAtTime(1, t + hold, release / 3);
  }

  /** Assourdit la musique (pause, menus). */
  setMuffled(on: boolean): void {
    if (!this.ctx) return;
    this.muffle.frequency.setTargetAtTime(on ? 650 : 20000, this.ctx.currentTime, 0.12);
  }

  /** Coupe ou remet les bruitages de jeu (pause). */
  setSfxSuspended(on: boolean): void {
    if (!this.ctx) return;
    this.buses.sfx.gain.setTargetAtTime(on ? 0 : sliderToGain(this.settings.sfx), this.ctx.currentTime, 0.05);
  }
}
