/**
 * Instruments de synthèse WebAudio (aucun fichier à charger).
 * Chaque instrument crée ses nœuds pour une note, les branche sur `out`, puis ils
 * se libèrent seuls quand la note se termine. Couleur : dark fantasy (cordes graves,
 * chœur, lyre, cloches, tambours de guerre).
 */

export type InstrumentId =
  | 'lyre' | 'harp' | 'strings' | 'choir' | 'drone' | 'bass' | 'organ' | 'horn' | 'bell'
  | 'taiko' | 'frame' | 'tom' | 'rim' | 'anvil' | 'swell';

export interface NoteSpec { t: number; f: number; d: number; v: number }

export const midiToFreq = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);

type Ctx = BaseAudioContext;

/** Bruit blanc partagé (2 s), créé une fois par contexte. */
const noiseCache = new WeakMap<Ctx, AudioBuffer>();
export function noiseBuffer(ctx: Ctx): AudioBuffer {
  let b = noiseCache.get(ctx);
  if (!b) {
    b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = b.getChannelData(0);
    let seed = 1234567;
    for (let i = 0; i < d.length; i++) { seed = (seed * 16807) % 2147483647; d[i] = (seed / 2147483647) * 2 - 1; }
    noiseCache.set(ctx, b);
  }
  return b;
}

/** Réponse impulsionnelle de « grande salle en pierre » générée (stéréo, ~3,5 s). */
export function makeImpulse(ctx: Ctx, seconds = 3.6, decay = 3.2): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const b = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c);
    let seed = 99991 + c * 7919;
    for (let i = 0; i < len; i++) {
      seed = (seed * 48271) % 2147483647;
      const n = (seed / 2147483647) * 2 - 1;
      const k = i / len;
      // pré-délai court + première réflexion douce, puis queue exponentielle
      const env = i < ctx.sampleRate * 0.012 ? 0 : Math.pow(1 - k, decay);
      d[i] = n * env * (1 - 0.55 * k); // les aigus s'éteignent plus vite (approximation)
    }
  }
  return b;
}

/** Enveloppe ADSR simple sur un AudioParam. */
function env(p: AudioParam, t: number, peak: number, a: number, d: number, s: number, rel: number, end: number): void {
  p.cancelScheduledValues(t);
  p.setValueAtTime(0.0001, t);
  p.linearRampToValueAtTime(peak, t + a);
  p.setTargetAtTime(peak * s, t + a, Math.max(0.005, d / 3));
  p.setTargetAtTime(0.0001, Math.max(t + a, end), Math.max(0.005, rel / 4));
}

export function osc(ctx: Ctx, type: OscillatorType, f: number, detune = 0): OscillatorNode {
  const o = ctx.createOscillator();
  o.type = type; o.frequency.value = f; o.detune.value = detune;
  return o;
}

export function gain(ctx: Ctx, v = 1): GainNode { const g = ctx.createGain(); g.gain.value = v; return g; }

export function filter(ctx: Ctx, type: BiquadFilterType, f: number, q = 0.7): BiquadFilterNode {
  const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q;
  // k-rate : coefficients recalculés par bloc de 128 échantillons, pas à chaque échantillon (gros gain CPU)
  try { b.frequency.automationRate = 'k-rate'; b.Q.automationRate = 'k-rate'; } catch { /* navigateur ancien */ }
  return b;
}

export function noise(ctx: Ctx, t: number, dur: number): AudioBufferSourceNode {
  const s = ctx.createBufferSource();
  s.buffer = noiseBuffer(ctx);
  s.loop = true;
  s.start(t, Math.random() * 1.5);
  s.stop(t + dur + 0.05);
  return s;
}

function startStop(nodes: (OscillatorNode | AudioBufferSourceNode)[], t: number, end: number): void {
  for (const n of nodes) { if (n instanceof OscillatorNode) n.start(t); n.stop(end); }
}

/** Joue une note de l'instrument `id` sur `out`. Retourne l'heure de fin. */
export function playNote(ctx: Ctx, out: AudioNode, id: InstrumentId, n: NoteSpec): number {
  const { t, f, d, v } = n;
  switch (id) {
    case 'lyre':
    case 'harp': {
      // corde pincée : triangle + sinus à l'octave, filtre qui se referme, petit clic de doigt
      const decay = id === 'lyre' ? 1.6 : 2.4;
      const end = t + Math.max(d, decay);
      const g = gain(ctx, 0);
      const lp = filter(ctx, 'lowpass', 4200, 1.2);
      lp.frequency.setValueAtTime(id === 'lyre' ? 5200 : 3800, t);
      lp.frequency.exponentialRampToValueAtTime(700, t + decay * 0.8);
      const a = osc(ctx, 'triangle', f), b = osc(ctx, 'sine', f * 2, 4), c = osc(ctx, 'sawtooth', f, -6);
      const gb = gain(ctx, 0.35), gc = gain(ctx, id === 'lyre' ? 0.18 : 0.08);
      a.connect(lp); b.connect(gb).connect(lp); c.connect(gc).connect(lp);
      lp.connect(g).connect(out);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(v * 0.5, t + 0.004);
      g.gain.setTargetAtTime(0.0001, t + 0.01, decay / 4.5);
      const ck = noise(ctx, t, 0.03), ckg = gain(ctx, 0), ckf = filter(ctx, 'bandpass', f * 3, 2);
      ck.connect(ckf).connect(ckg).connect(out);
      ckg.gain.setValueAtTime(v * 0.12, t); ckg.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
      startStop([a, b, c], t, end + 0.1);
      return end;
    }
    case 'strings': {
      // cordes graves : 3 dents de scie désaccordées, attaque lente, léger vibrato
      const end = t + d;
      const g = gain(ctx, 0);
      const lp = filter(ctx, 'lowpass', Math.min(2200, f * 5), 0.9);
      const long = d > 0.6;
      const rel = long ? 0.9 : 0.25;
      const os = [-8, 7].map((dt) => { const o = osc(ctx, 'sawtooth', f, dt); o.connect(lp); return o; });
      const srcs: OscillatorNode[] = [...os];
      if (long) { const vib = osc(ctx, 'sine', 4.6), vg = gain(ctx, 5); vib.connect(vg); os.forEach((o) => vg.connect(o.detune)); srcs.push(vib); }
      lp.connect(g).connect(out);
      env(g.gain, t, v * 0.19, Math.min(0.5, d * 0.3), 0.4, 0.85, rel, end);
      startStop(srcs, t, end + rel * 1.1);
      return end + rel;
    }
    case 'choir': {
      // chœur « ah » : dents de scie dans deux formants, vibrato lent
      const end = t + d;
      const g = gain(ctx, 0);
      const f1 = filter(ctx, 'bandpass', 720, 6), f2 = filter(ctx, 'bandpass', 1150, 7);
      const g2 = gain(ctx, 0.6);
      const vib = osc(ctx, 'sine', 5.1), vg = gain(ctx, 9);
      vib.connect(vg);
      const os = [-11, 0, 12].map((dt) => { const o = osc(ctx, 'sawtooth', f, dt); vg.connect(o.detune); o.connect(f1); o.connect(f2); return o; });
      f1.connect(g); f2.connect(g2).connect(g);
      g.connect(out);
      env(g.gain, t, v * 0.55, Math.min(0.7, d * 0.4), 0.5, 0.9, 1.2, end);
      startStop([...os, vib], t, end + 1.25);
      return end + 1.2;
    }
    case 'drone': {
      const end = t + d;
      const g = gain(ctx, 0);
      const lp = filter(ctx, 'lowpass', 380, 2);
      const lfo = osc(ctx, 'sine', 0.13), lg = gain(ctx, 140);
      lfo.connect(lg).connect(lp.frequency);
      const a = osc(ctx, 'sawtooth', f, -5), b = osc(ctx, 'sawtooth', f * 1.5, 4), c = osc(ctx, 'sine', f / 2);
      const gb = gain(ctx, 0.35);
      a.connect(lp); b.connect(gb).connect(lp); c.connect(lp);
      lp.connect(g).connect(out);
      env(g.gain, t, v * 0.22, Math.min(1.5, d * 0.4), 0.5, 1, 1.5, end);
      startStop([a, b, c, lfo], t, end + 2);
      return end + 1.5;
    }
    case 'bass': {
      const end = t + d;
      const g = gain(ctx, 0);
      const lp = filter(ctx, 'lowpass', 900, 3);
      lp.frequency.setValueAtTime(1100, t); lp.frequency.exponentialRampToValueAtTime(220, t + Math.min(0.35, d));
      const a = osc(ctx, 'sawtooth', f), b = osc(ctx, 'square', f / 2, 3), gb = gain(ctx, 0.4);
      a.connect(lp); b.connect(gb).connect(lp);
      lp.connect(g).connect(out);
      env(g.gain, t, v * 0.32, 0.006, 0.15, 0.7, 0.12, end);
      startStop([a, b], t, end + 0.14);
      return end + 0.12;
    }
    case 'organ': {
      // orgue de crypte : carrés et sinus en registres 8'/16'/4'
      const end = t + d;
      const g = gain(ctx, 0);
      const lp = filter(ctx, 'lowpass', 1800, 0.6);
      const parts: [OscillatorType, number, number][] = [['square', 1, 0.25], ['sine', 0.5, 0.6], ['sine', 2, 0.25], ['triangle', 3, 0.1]];
      const os = parts.map(([ty, m, lv]) => { const o = osc(ctx, ty, f * m); o.connect(gain(ctx, lv)).connect(lp); return o; });
      lp.connect(g).connect(out);
      env(g.gain, t, v * 0.16, 0.08, 0.2, 0.9, 0.6, end);
      startStop(os, t, end + 0.8);
      return end + 0.6;
    }
    case 'horn': {
      // cor de guerre : dents de scie, filtre qui s'ouvre (« blare »), légère montée de hauteur
      const end = t + d;
      const g = gain(ctx, 0);
      const lp = filter(ctx, 'lowpass', 400, 1.5);
      lp.frequency.setValueAtTime(350, t);
      lp.frequency.linearRampToValueAtTime(Math.min(3200, f * 6), t + 0.18);
      lp.frequency.setTargetAtTime(f * 3.5, t + 0.2, 0.3);
      const os = [-7, 6].map((dt) => {
        const o = osc(ctx, 'sawtooth', f * 0.985, dt);
        o.frequency.linearRampToValueAtTime(f, t + 0.07);
        o.connect(lp); return o;
      });
      lp.connect(g).connect(out);
      env(g.gain, t, v * 0.24, 0.06, 0.3, 0.8, 0.35, end);
      startStop(os, t, end + 0.4);
      return end + 0.35;
    }
    case 'bell': {
      // cloche FM inharmonique, longue résonance
      const dec = Math.max(d, 3.2);
      const end = t + dec;
      const g = gain(ctx, 0);
      const car = osc(ctx, 'sine', f), mod = osc(ctx, 'sine', f * 3.51), mg = gain(ctx, f * 2.2);
      mod.connect(mg).connect(car.frequency);
      mg.gain.setValueAtTime(f * 2.6, t); mg.gain.exponentialRampToValueAtTime(f * 0.05, t + dec);
      const hum = osc(ctx, 'sine', f * 0.5), hg = gain(ctx, 0.3);
      car.connect(g); hum.connect(hg).connect(g);
      g.connect(out);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(v * 0.22, t + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0001, end);
      startStop([car, mod, hum], t, end + 0.05);
      return end;
    }
    case 'taiko':
    case 'tom': {
      // tambour de guerre : sinus en chute de hauteur + bruit filtré (peau)
      const big = id === 'taiko';
      const dec = big ? 0.9 : 0.45;
      const f0 = big ? 105 : f || 160;
      const end = t + dec;
      const g = gain(ctx, 0);
      const o = osc(ctx, 'sine', f0 * 1.6);
      o.frequency.setValueAtTime(f0 * 1.6, t);
      o.frequency.exponentialRampToValueAtTime(f0 * 0.5, t + dec * 0.6);
      o.connect(g);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(v * (big ? 0.95 : 0.6), t + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0001, end);
      const nz = noise(ctx, t, 0.2), nf = filter(ctx, 'lowpass', big ? 900 : 1600, 1), ng = gain(ctx, 0);
      nz.connect(nf).connect(ng);
      ng.gain.setValueAtTime(v * (big ? 0.5 : 0.3), t); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      g.connect(out); ng.connect(out);
      startStop([o], t, end + 0.05);
      return end;
    }
    case 'frame': {
      // tambour sur cadre : grave doux + frottement
      const end = t + 0.5;
      const o = osc(ctx, 'sine', 78);
      o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(62, t + 0.3);
      const g = gain(ctx, 0);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v * 0.55, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, end);
      o.connect(g).connect(out);
      const nz = noise(ctx, t, 0.12), nf = filter(ctx, 'bandpass', 2400, 0.8), ng = gain(ctx, 0);
      ng.gain.setValueAtTime(v * 0.18, t); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
      nz.connect(nf).connect(ng).connect(out);
      startStop([o], t, end + 0.05);
      return end;
    }
    case 'rim': {
      const end = t + 0.08;
      const nz = noise(ctx, t, 0.08), hp = filter(ctx, 'bandpass', 3800, 3), g = gain(ctx, 0);
      g.gain.setValueAtTime(v * 0.4, t); g.gain.exponentialRampToValueAtTime(0.0001, end);
      nz.connect(hp).connect(g).connect(out);
      return end;
    }
    case 'anvil': {
      // enclume / chaîne : partiels inharmoniques
      const end = t + 0.9;
      const g = gain(ctx, 0);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v * 0.18, t + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, end);
      const base = f || 820;
      const os = [1, 2.76, 5.4].map((m, i) => { const o = osc(ctx, i ? 'sine' : 'square', base * m); o.connect(gain(ctx, 1 / (i + 1.5))).connect(g); return o; });
      g.connect(filter(ctx, 'highpass', 500)).connect(out);
      startStop(os, t, end + 0.05);
      return end;
    }
    case 'swell': {
      // montée de cymbale / souffle (transition)
      const end = t + d;
      const nz = noise(ctx, t, d), bp = filter(ctx, 'bandpass', 1500, 0.6), g = gain(ctx, 0);
      bp.frequency.setValueAtTime(500, t); bp.frequency.exponentialRampToValueAtTime(6500, end);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v * 0.25, end - 0.02); g.gain.linearRampToValueAtTime(0.0001, end + 0.05);
      nz.connect(bp).connect(g).connect(out);
      return end;
    }
  }
}
