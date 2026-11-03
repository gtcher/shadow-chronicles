import type { AudioEngine } from './AudioEngine';
import type { AmbienceId } from './themes';
import { filter, gain, midiToFreq, noiseBuffer, osc, playNote } from './synth';

/**
 * Ambiances de fond par biome (bus « ambiance ») : vent dans les ruines, brume,
 * gouttes et chaînes dans la crypte, grondement de la faille. Un fond continu
 * (bruit filtré modulé) + des détails ponctuels aléatoires.
 */
interface Bed { out: GainNode; nodes: AudioScheduledSourceNode[]; timer?: ReturnType<typeof setInterval> }

interface Layer { type: BiquadFilterType; f: number; q: number; lfoHz: number; lfoDepth: number; vol: number }

const BEDS: Record<AmbienceId, { layers: Layer[]; detail?: { every: number; play: (c: BaseAudioContext, out: AudioNode, t: number) => void } }> = {
  wind: {
    layers: [
      { type: 'bandpass', f: 420, q: 0.8, lfoHz: 0.07, lfoDepth: 260, vol: 0.5 },
      { type: 'bandpass', f: 1600, q: 3, lfoHz: 0.11, lfoDepth: 700, vol: 0.12 }, // sifflement
    ],
    detail: { every: 7, play: (c, out, t) => playNote(c, out, 'anvil', { t, f: 380 + Math.random() * 200, d: 0.4, v: 0.08 }) }, // métal qui grince au loin
  },
  mist: {
    layers: [
      { type: 'lowpass', f: 500, q: 0.5, lfoHz: 0.05, lfoDepth: 200, vol: 0.45 },
      { type: 'bandpass', f: 3200, q: 1, lfoHz: 0.09, lfoDepth: 1200, vol: 0.05 }, // feuillage
    ],
    detail: { every: 6, play: (c, out, t) => { // cri d'oiseau nocturne
      const o = osc(c, 'sine', 900), g = gain(c, 0);
      o.frequency.setValueAtTime(1100, t); o.frequency.exponentialRampToValueAtTime(700, t + 0.35);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.03, t + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
      o.connect(g).connect(out); o.start(t); o.stop(t + 0.5);
    } },
  },
  crypt: {
    layers: [
      { type: 'lowpass', f: 160, q: 1, lfoHz: 0.04, lfoDepth: 60, vol: 0.7 },
      { type: 'bandpass', f: 800, q: 0.7, lfoHz: 0.06, lfoDepth: 300, vol: 0.08 },
    ],
    detail: { every: 3, play: (c, out, t) => { // goutte d'eau
      const f = 1400 + Math.random() * 900;
      const o = osc(c, 'sine', f), g = gain(c, 0);
      o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 1.8, t + 0.06);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.05, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      o.connect(g).connect(out); o.start(t); o.stop(t + 0.15);
    } },
  },
  rift: {
    layers: [
      { type: 'lowpass', f: 120, q: 2, lfoHz: 0.09, lfoDepth: 50, vol: 0.8 },
      { type: 'bandpass', f: 2200, q: 6, lfoHz: 0.2, lfoDepth: 900, vol: 0.06 }, // crépitement
    ],
    detail: { every: 5, play: (c, out, t) => playNote(c, out, 'bell', { t, f: midiToFreq(30 + Math.floor(Math.random() * 3) * 6), d: 3, v: 0.12 }) },
  },
  shrine: {
    layers: [{ type: 'bandpass', f: 600, q: 0.6, lfoHz: 0.05, lfoDepth: 200, vol: 0.18 }],
    detail: { every: 9, play: (c, out, t) => playNote(c, out, 'bell', { t, f: midiToFreq(81 + [0, 3, 7][Math.floor(Math.random() * 3)]), d: 3, v: 0.05 }) },
  },
};

export class Ambience {
  private bed: Bed | null = null;
  current: AmbienceId | null = null;

  constructor(readonly engine: AudioEngine) {}

  play(id: AmbienceId | null, fade = 3): void {
    if (id === this.current) return;
    this.current = id;
    this.engine.whenReady(() => this.swap(id, fade));
  }

  private swap(id: AmbienceId | null, fade: number): void {
    const ctx = this.engine.ctx!, t = ctx.currentTime;
    if (this.bed) {
      const b = this.bed;
      b.out.gain.setTargetAtTime(0.0001, t, fade / 4);
      if (b.timer) clearInterval(b.timer);
      b.nodes.forEach((n) => n.stop(t + fade + 0.5));
      this.bed = null;
    }
    if (!id || id !== this.current) return;
    const def = BEDS[id];
    const out = gain(ctx, 0.0001);
    out.connect(this.engine.buses.ambience);
    out.gain.setTargetAtTime(1, t, fade / 4);
    const nodes: AudioScheduledSourceNode[] = [];
    for (const L of def.layers) {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer(ctx); src.loop = true;
      const f = filter(ctx, L.type, L.f, L.q);
      const lfo = osc(ctx, 'sine', L.lfoHz), lg = gain(ctx, L.lfoDepth);
      lfo.connect(lg).connect(f.frequency);
      const amp = osc(ctx, 'sine', L.lfoHz * 0.7), ag = gain(ctx, L.vol * 0.35), g = gain(ctx, L.vol);
      amp.connect(ag).connect(g.gain);
      src.connect(f).connect(g).connect(out);
      src.start(t, Math.random()); lfo.start(t); amp.start(t);
      nodes.push(src, lfo, amp);
    }
    const bed: Bed = { out, nodes };
    if (def.detail && typeof setInterval !== 'undefined') {
      const d = def.detail;
      bed.timer = setInterval(() => {
        if (Math.random() < 1 / d.every) {
          const pan = ctx.createStereoPanner(); pan.pan.value = Math.random() * 1.6 - 0.8;
          pan.connect(out);
          d.play(ctx, pan, ctx.currentTime + 0.05);
        }
      }, 1000);
    }
    this.bed = bed;
  }
}
