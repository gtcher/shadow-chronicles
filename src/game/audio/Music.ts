import type { AudioEngine } from './AudioEngine';
import { midiToFreq, playNote } from './synth';
import { THEMES, barEvents, barSeconds, chordNotes, chordTone, scaleNote, type BarEvent, type Theme, type Track } from './themes';

/** Fondu d'entrée de couche selon l'intensité (0..1). */
export function layerLevel(intensity: number, min = 0): number {
  if (min <= 0) return 1;
  const k = (intensity - (min - 0.08)) / 0.16;
  const c = Math.min(1, Math.max(0, k));
  return c * c * (3 - 2 * c);
}

interface TrackRt { track: Track; out: GainNode; send?: GainNode; bars: BarEvent[][]; level: number }

/** Un thème en cours de lecture (synthèse ou fichier en boucle). */
class Playing {
  readonly group: GainNode;
  tracks: TrackRt[] = [];
  bar = 0;
  nextBar = 0;
  stopAt = Infinity;
  source?: AudioBufferSourceNode;

  constructor(readonly music: Music, readonly theme: Theme, startAt: number) {
    const ctx = music.engine.ctx!;
    this.group = ctx.createGain();
    this.group.gain.value = 0.0001;
    this.group.connect(music.engine.buses.music);
    this.nextBar = startAt;
    const tg = theme.gain ?? 1;
    this.group.gain.setValueAtTime(0.0001, startAt);
    this.group.gain.exponentialRampToValueAtTime(tg, startAt + (theme.kind === 'file' ? 2.5 : 0.6));
    for (const track of theme.tracks) {
      const out = ctx.createGain();
      const level = layerLevel(music.intensity, track.min);
      out.gain.value = level * (track.gain ?? 1);
      out.connect(this.group);
      let send: GainNode | undefined;
      if (track.reverb) { send = ctx.createGain(); send.gain.value = track.reverb; out.connect(send).connect(music.engine.reverbIn); }
      this.tracks.push({ track, out, send, bars: track.bars.map(barEvents), level });
    }
  }

  /** Notes en attente (préparées mesure par mesure, créées en nœuds au dernier moment). */
  private queue: { t: number; run: () => void }[] = [];
  private head = 0;

  /**
   * Programme les notes qui commencent avant `horizon`. Les nœuds WebAudio ne sont créés
   * que ~0,3 s à l'avance : peu de nœuds vivants à la fois (important sur mobile).
   */
  schedule(horizon: number): void {
    if (this.theme.kind === 'file') return;
    const ctx = this.music.engine.ctx!;
    const th = this.theme;
    const bs = barSeconds(th.bpm);
    while (this.nextBar < horizon && this.nextBar < this.stopAt) {
      const t0 = this.nextBar;
      const deg = th.progression[this.bar % th.progression.length];
      const chord = chordNotes(th.root, th.scale, deg);
      const jobs: { t: number; run: () => void }[] = [];
      for (const rt of this.tracks) {
        const evs = rt.bars[this.bar % rt.bars.length];
        const tr = rt.track;
        const oct = 12 * (tr.octave ?? 0);
        for (const ev of evs) {
          const t = t0 + ev.pos * bs + (tr.inst === 'lyre' || tr.inst === 'harp' ? Math.random() * 0.012 : 0);
          const d = ev.len * bs;
          const v = (ev.accent ? 1 : ev.hit ? 0.72 : 0.85) * (0.9 + Math.random() * 0.2);
          let run: () => void;
          if (ev.hit) run = () => { playNote(ctx, rt.out, tr.inst, { t, f: 0, d, v }); };
          else if (tr.chord) {
            const notes = chordNotes(th.root, th.scale, deg + ev.value);
            run = () => { for (const m of notes) playNote(ctx, rt.out, tr.inst, { t, f: midiToFreq(m + oct), d, v: v * 0.6 }); };
          } else {
            const m = tr.rel === 'chord' ? chordTone(chord, ev.value) : scaleNote(th.root, th.scale, ev.value);
            run = () => { playNote(ctx, rt.out, tr.inst, { t, f: midiToFreq(m + oct), d, v }); };
          }
          // couche muette au moment de jouer : on n'instancie rien
          jobs.push({ t, run: () => { if (rt.level >= 0.01) run(); } });
        }
      }
      jobs.sort((a, b) => a.t - b.t);
      if (this.head > 256) { this.queue = this.queue.slice(this.head); this.head = 0; }
      this.queue.push(...jobs);
      this.bar++;
      this.nextBar += bs;
    }
    while (this.head < this.queue.length && this.queue[this.head].t < horizon) {
      const j = this.queue[this.head++];
      if (j.t < this.stopAt) j.run();
    }
  }

  updateLayers(intensity: number, t: number): void {
    for (const rt of this.tracks) {
      const lv = layerLevel(intensity, rt.track.min);
      if (Math.abs(lv - rt.level) < 0.01) continue;
      rt.level = lv;
      rt.out.gain.setTargetAtTime(lv * (rt.track.gain ?? 1), t, 0.6);
    }
  }

  fadeOut(at: number, dur: number): void {
    this.stopAt = at;
    const g = this.group.gain;
    g.cancelScheduledValues(at);
    g.setTargetAtTime(0.0001, at, dur / 4);
    this.source?.stop(at + dur + 0.5);
    setTimeout(() => this.group.disconnect(), (at - this.music.engine.now + dur + 4) * 1000);
  }

  /** Prochaine frontière de mesure après `t` (pour enchaîner en rythme). */
  nextBoundary(t: number): number {
    if (this.theme.kind === 'file') return t + 0.05;
    const bs = barSeconds(this.theme.bpm);
    let b = this.nextBar - bs; // début de la dernière mesure programmée
    while (b < t + 0.02) b += bs;
    return b;
  }
}

/**
 * Musique adaptative : un thème par biome et par boss, enchaînements calés sur la mesure,
 * couches qui entrent avec l'intensité du combat.
 *
 *   music.play('citadel'); music.setIntensity(0.7); music.play('bossJudge', { immediate: true });
 */
export class Music {
  intensity = 0;
  private targetIntensity = 0;
  private current: Playing | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private buffers = new Map<string, Promise<AudioBuffer>>();
  /** Résout une clé d'asset en URL (fourni par le jeu : `game.assets.url`). */
  resolveUrl: (key: string) => string = (k) => k;
  readonly lookAhead = 0.3;

  constructor(readonly engine: AudioEngine, readonly themes: Record<string, Theme> = THEMES) {}

  get currentId(): string | null { return this.current?.theme.id ?? null; }

  setIntensity(v: number): void { this.targetIntensity = Math.min(1, Math.max(0, v)); }

  /**
   * Lance un thème. Par défaut, l'enchaînement attend la fin de la mesure en cours
   * (transition musicale) ; `immediate` coupe vite (apparition d'un boss).
   */
  play(id: string, opts: { immediate?: boolean; fade?: number } = {}): void {
    const theme = this.themes[id];
    if (!theme) throw new Error(`Thème inconnu : ${id}`);
    if (this.current?.theme.id === id) return;
    this.engine.whenReady(() => this.start(theme, opts));
  }

  stop(fade = 2): void {
    if (!this.current || !this.engine.ctx) return;
    this.current.fadeOut(this.engine.now, fade);
    this.current = null;
  }

  private start(theme: Theme, opts: { immediate?: boolean; fade?: number }): void {
    if (this.current?.theme.id === theme.id) return;
    const now = this.engine.now;
    const prev = this.current;
    const at = !prev || opts.immediate ? now + 0.08 : prev.nextBoundary(now);
    prev?.fadeOut(at, opts.fade ?? (opts.immediate ? 0.5 : 2.2));
    const p = new Playing(this, theme, at);
    this.current = p;
    if (theme.kind === 'file' && theme.asset) void this.startFile(p, theme.asset, at);
    this.ensureTimer();
    this.pump();
  }

  private async startFile(p: Playing, key: string, at: number): Promise<void> {
    const ctx = this.engine.ctx!;
    let pr = this.buffers.get(key);
    if (!pr) {
      pr = fetch(this.resolveUrl(key)).then((r) => r.arrayBuffer()).then((b) => ctx.decodeAudioData(b));
      this.buffers.set(key, pr);
    }
    try {
      const buf = await pr;
      if (this.current !== p) return;
      const src = ctx.createBufferSource();
      src.buffer = buf; src.loop = true;
      src.connect(p.group);
      src.start(Math.max(at, ctx.currentTime + 0.02));
      p.source = src;
    } catch (e) { console.warn('[audio] musique introuvable', key, e); }
  }

  private ensureTimer(): void {
    if (this.timer || typeof setInterval === 'undefined') return;
    this.timer = setInterval(() => this.pump(), 25);
  }

  /** Avance l'ordonnanceur (appelé toutes les 25 ms, ou à la main en rendu hors ligne). */
  pump(horizon = this.engine.now + this.lookAhead): void {
    if (!this.current) return;
    this.intensity += (this.targetIntensity - this.intensity) * 0.04;
    this.current.updateLayers(this.intensity, this.engine.now);
    this.current.schedule(horizon);
  }

  /** Rendu hors ligne : force l'intensité sans lissage. */
  snapIntensity(v: number): void { this.intensity = this.targetIntensity = v; }

  dispose(): void { if (this.timer) clearInterval(this.timer); this.timer = null; this.stop(0.3); }
}
