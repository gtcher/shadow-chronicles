import type { AudioEngine, BusId } from './AudioEngine';
import { filter, gain, midiToFreq, noise, osc, playNote } from './synth';

/**
 * Bruitages synthétisés. Chaque son a une recette, une limite de voix et un délai
 * minimal entre deux déclenchements (évite la bouillie quand 40 ennemis meurent d'un coup).
 *
 *   sfx.play('hit', { pan: 0.4 });  sfx.play('loot_legendary');
 */
type Ctx = BaseAudioContext;
interface P { t: number; v: number; pitch: number; out: AudioNode; rev: AudioNode }
type Recipe = (ctx: Ctx, p: P) => number; // retourne la durée

export interface SfxDef { bus: BusId; recipe: Recipe; max?: number; gap?: number; vary?: number; vol?: number; reverb?: number; label: string; group: string }

/* ── briques ── */

function tone(ctx: Ctx, out: AudioNode, t: number, type: OscillatorType, f0: number, f1: number, dur: number, vol: number, attack = 0.004): void {
  const o = osc(ctx, type, f0), g = gain(ctx, 0);
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(out);
  o.start(t); o.stop(t + dur + 0.05);
}

function hiss(ctx: Ctx, out: AudioNode, t: number, type: BiquadFilterType, f0: number, f1: number, q: number, dur: number, vol: number, attack = 0.003): void {
  const n = noise(ctx, t, dur), f = filter(ctx, type, f0, q), g = gain(ctx, 0);
  f.frequency.setValueAtTime(f0, t);
  f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  n.connect(f).connect(g).connect(out);
}

/** Saturation douce pour les impacts. */
const curves = new WeakMap<Ctx, Float32Array<ArrayBuffer>>();
function drive(ctx: Ctx, out: AudioNode, amount = 2.5): AudioNode {
  let c = curves.get(ctx);
  if (!c) {
    c = new Float32Array(1024);
    for (let i = 0; i < c.length; i++) { const x = (i / (c.length - 1)) * 2 - 1; c[i] = Math.tanh(x * amount); }
    curves.set(ctx, c);
  }
  const ws = ctx.createWaveShaper(); ws.curve = c; ws.oversample = '2x';
  ws.connect(out);
  return ws;
}

/** Arpège de cloches (butin, bénédictions). */
function bells(ctx: Ctx, out: AudioNode, t: number, notes: number[], step: number, vol: number, inst: 'bell' | 'harp' | 'lyre' = 'bell'): void {
  notes.forEach((m, i) => playNote(ctx, out, inst, { t: t + i * step, f: midiToFreq(m), d: 0.6, v: vol }));
}

function boom(ctx: Ctx, out: AudioNode, t: number, vol: number, f = 70, dur = 1.1): void {
  tone(ctx, out, t, 'sine', f * 1.8, f * 0.45, dur, vol);
  hiss(ctx, out, t, 'lowpass', 900, 80, 0.7, dur * 0.6, vol * 0.5);
}

/* ── recettes ── */

const D: Record<string, SfxDef> = {
  /* Attaques des héros */
  shoot_taro: { label: 'Taro : coup de lame', group: 'Combat', bus: 'sfx', max: 4, gap: 0.05, vary: 0.08, recipe: (c, p) => {
    hiss(c, p.out, p.t, 'bandpass', 3200 * p.pitch, 700, 1.4, 0.16, p.v * 0.5);
    tone(c, p.out, p.t + 0.02, 'triangle', 1800 * p.pitch, 1500, 0.22, p.v * 0.06);
    return 0.25; } },
  shoot_mei: { label: 'Mei : trait arcanique', group: 'Combat', bus: 'sfx', max: 4, gap: 0.05, vary: 0.06, reverb: 0.25, recipe: (c, p) => {
    tone(c, p.out, p.t, 'sine', 900 * p.pitch, 1900 * p.pitch, 0.12, p.v * 0.18);
    tone(c, p.out, p.t, 'triangle', 450 * p.pitch, 1200 * p.pitch, 0.1, p.v * 0.1);
    hiss(c, p.out, p.t, 'highpass', 5000, 9000, 0.7, 0.09, p.v * 0.12);
    return 0.15; } },
  shoot_sena: { label: 'Sena : flèche', group: 'Combat', bus: 'sfx', max: 4, gap: 0.05, vary: 0.07, recipe: (c, p) => {
    playNote(c, p.out, 'harp', { t: p.t, f: 196 * p.pitch, d: 0.1, v: p.v * 0.55 });
    hiss(c, p.out, p.t + 0.01, 'bandpass', 2400, 5200, 2, 0.14, p.v * 0.3);
    return 0.4; } },
  shoot_ren: { label: 'Ren : dague', group: 'Combat', bus: 'sfx', max: 4, gap: 0.04, vary: 0.1, recipe: (c, p) => {
    hiss(c, p.out, p.t, 'bandpass', 5200 * p.pitch, 1600, 2.2, 0.09, p.v * 0.4);
    tone(c, p.out, p.t, 'square', 2600 * p.pitch, 2200, 0.05, p.v * 0.03);
    return 0.1; } },
  dash: { label: 'Esquive', group: 'Combat', bus: 'sfx', max: 2, gap: 0.08, vary: 0.05, recipe: (c, p) => {
    hiss(c, p.out, p.t, 'bandpass', 600 * p.pitch, 2600, 1.1, 0.28, p.v * 0.45, 0.05);
    tone(c, p.out, p.t, 'sine', 140, 90, 0.2, p.v * 0.2);
    return 0.3; } },
  skill: { label: 'Compétence', group: 'Combat', bus: 'sfx', max: 2, gap: 0.1, reverb: 0.4, recipe: (c, p) => {
    hiss(c, p.out, p.t, 'bandpass', 300, 4000, 3, 0.35, p.v * 0.35, 0.2);
    tone(c, p.out, p.t + 0.2, 'sawtooth', 110 * p.pitch, 55, 0.5, p.v * 0.12);
    bells(c, p.rev, p.t + 0.22, [74, 81].map((m) => m + 12 * Math.log2(p.pitch)), 0.05, p.v * 0.4);
    return 0.8; } },
  ultimate: { label: 'Ultime', group: 'Combat', bus: 'sfx', max: 1, gap: 0.4, reverb: 0.6, recipe: (c, p) => {
    hiss(c, p.out, p.t, 'bandpass', 200, 6000, 1.5, 0.6, p.v * 0.4, 0.5);
    boom(c, drive(c, p.out), p.t + 0.55, p.v * 0.9, 60, 1.4);
    [50, 57, 62].forEach((m) => playNote(c, p.rev, 'choir', { t: p.t + 0.55, f: midiToFreq(m), d: 1.2, v: p.v * 0.6 }));
    return 2.2; } },

  /* Impacts et morts */
  hit: { label: 'Impact', group: 'Combat', bus: 'sfx', max: 5, gap: 0.03, vary: 0.12, recipe: (c, p) => {
    const o = drive(c, p.out, 3);
    tone(c, o, p.t, 'sine', 180 * p.pitch, 60, 0.12, p.v * 0.45);
    hiss(c, o, p.t, 'lowpass', 2600, 400, 0.8, 0.07, p.v * 0.4);
    return 0.13; } },
  hit_crit: { label: 'Coup critique', group: 'Combat', bus: 'sfx', max: 3, gap: 0.05, vary: 0.06, recipe: (c, p) => {
    const o = drive(c, p.out, 4);
    tone(c, o, p.t, 'sine', 220 * p.pitch, 50, 0.2, p.v * 0.6);
    hiss(c, o, p.t, 'lowpass', 5000, 300, 0.8, 0.12, p.v * 0.5);
    playNote(c, p.out, 'anvil', { t: p.t, f: 1250 * p.pitch, d: 0.4, v: p.v * 0.7 });
    return 0.5; } },
  kill_beast: { label: 'Mort : bête / guerrier', group: 'Combat', bus: 'sfx', max: 4, gap: 0.04, vary: 0.12, recipe: (c, p) => {
    const o = drive(c, p.out, 3);
    tone(c, o, p.t, 'sine', 140 * p.pitch, 40, 0.3, p.v * 0.6);
    hiss(c, o, p.t, 'lowpass', 1800, 200, 0.9, 0.22, p.v * 0.55);
    tone(c, p.out, p.t + 0.02, 'sawtooth', 220 * p.pitch, 90, 0.18, p.v * 0.06);
    return 0.35; } },
  kill_shade: { label: 'Mort : ombre', group: 'Combat', bus: 'sfx', max: 4, gap: 0.04, vary: 0.1, reverb: 0.4, recipe: (c, p) => {
    hiss(c, p.out, p.t, 'bandpass', 2400 * p.pitch, 300, 2.5, 0.45, p.v * 0.45, 0.01);
    tone(c, p.out, p.t, 'sine', 620 * p.pitch, 160, 0.4, p.v * 0.12);
    tone(c, p.out, p.t, 'sine', 655 * p.pitch, 170, 0.4, p.v * 0.1);
    return 0.5; } },
  kill_elite: { label: 'Mort : élite', group: 'Combat', bus: 'sfx', max: 2, gap: 0.1, reverb: 0.5, recipe: (c, p) => {
    boom(c, drive(c, p.out, 2), p.t, p.v * 0.8, 75, 0.9);
    hiss(c, p.out, p.t, 'bandpass', 3000, 200, 1.5, 0.7, p.v * 0.35);
    playNote(c, p.rev, 'bell', { t: p.t + 0.05, f: midiToFreq(62), d: 1, v: p.v * 0.4 });
    return 1.2; } },
  hurt: { label: 'Héros blessé', group: 'Combat', bus: 'sfx', max: 2, gap: 0.12, vary: 0.05, recipe: (c, p) => {
    const o = drive(c, p.out, 5);
    tone(c, o, p.t, 'sawtooth', 160 * p.pitch, 70, 0.22, p.v * 0.22);
    tone(c, o, p.t, 'sine', 90, 45, 0.3, p.v * 0.6);
    hiss(c, p.out, p.t, 'lowpass', 3000, 300, 1, 0.12, p.v * 0.3);
    return 0.35; } },
  heartbeat: { label: 'Battement (PV bas)', group: 'Combat', bus: 'sfx', max: 1, gap: 0.6, recipe: (c, p) => {
    tone(c, p.out, p.t, 'sine', 62, 40, 0.16, p.v * 0.7, 0.01);
    tone(c, p.out, p.t + 0.22, 'sine', 56, 38, 0.2, p.v * 0.5, 0.01);
    return 0.5; } },
  shield: { label: 'Bouclier', group: 'Combat', bus: 'sfx', max: 1, gap: 0.2, reverb: 0.4, recipe: (c, p) => {
    playNote(c, p.out, 'anvil', { t: p.t, f: 620, d: 0.5, v: p.v * 0.6 });
    tone(c, p.out, p.t, 'triangle', 300, 600, 0.4, p.v * 0.12, 0.05);
    return 0.8; } },
  heal: { label: 'Soin', group: 'Combat', bus: 'sfx', max: 1, gap: 0.2, reverb: 0.6, recipe: (c, p) => {
    bells(c, p.rev, p.t, [69, 74, 78, 81], 0.07, p.v * 0.4, 'harp');
    hiss(c, p.out, p.t, 'highpass', 4000, 9000, 0.6, 0.5, p.v * 0.08, 0.2);
    return 1; } },

  /* Butin : un son par rareté, de plus en plus marquant (voir loot.json > rarities.fx) */
  loot_common: { label: 'Butin commun', group: 'Butin', bus: 'sfx', max: 3, gap: 0.05, vary: 0.04, recipe: (c, p) => {
    playNote(c, p.out, 'anvil', { t: p.t, f: 1500 * p.pitch, d: 0.3, v: p.v * 0.3 });
    tone(c, p.out, p.t, 'sine', 90, 60, 0.1, p.v * 0.3);
    return 0.4; } },
  loot_magic: { label: 'Butin magique', group: 'Butin', bus: 'sfx', max: 2, gap: 0.08, reverb: 0.3, recipe: (c, p) => {
    bells(c, p.out, p.t, [76, 83], 0.07, p.v * 0.35);
    return 0.8; } },
  loot_rare: { label: 'Butin rare', group: 'Butin', bus: 'sfx', max: 2, gap: 0.1, reverb: 0.45, recipe: (c, p) => {
    bells(c, p.out, p.t, [74, 78, 81, 86], 0.06, p.v * 0.38);
    hiss(c, p.out, p.t, 'highpass', 6000, 10000, 0.6, 0.4, p.v * 0.06, 0.15);
    return 1.2; } },
  loot_epic: { label: 'Butin épique', group: 'Butin', bus: 'sfx', max: 1, gap: 0.15, reverb: 0.6, recipe: (c, p) => {
    boom(c, p.out, p.t, p.v * 0.45, 80, 0.7);
    bells(c, p.out, p.t + 0.05, [71, 74, 78, 83, 86], 0.055, p.v * 0.36);
    [59, 66].forEach((m) => playNote(c, p.rev, 'strings', { t: p.t, f: midiToFreq(m), d: 0.9, v: p.v * 0.7 }));
    return 1.6; } },
  loot_legendary: { label: 'Butin légendaire', group: 'Butin', bus: 'sfx', max: 1, gap: 0.3, reverb: 0.7, recipe: (c, p) => {
    hiss(c, p.out, p.t, 'bandpass', 400, 7000, 1.2, 0.5, p.v * 0.3, 0.45);
    boom(c, drive(c, p.out, 1.8), p.t + 0.5, p.v * 0.75, 62, 1.5);
    [62, 69, 74, 78].forEach((m) => playNote(c, p.rev, 'choir', { t: p.t + 0.5, f: midiToFreq(m), d: 1.6, v: p.v * 0.75 }));
    bells(c, p.out, p.t + 0.52, [74, 78, 81, 86, 90], 0.07, p.v * 0.42);
    playNote(c, p.out, 'anvil', { t: p.t + 0.5, f: 880, d: 0.6, v: p.v * 0.5 });
    return 2.8; } },
  loot_ancestral: { label: 'Butin ancestral', group: 'Butin', bus: 'sfx', max: 1, gap: 0.4, reverb: 0.75, recipe: (c, p) => {
    hiss(c, p.out, p.t, 'bandpass', 200, 5000, 0.9, 0.75, p.v * 0.35, 0.7);
    tone(c, p.out, p.t, 'sawtooth', 55, 110, 0.75, p.v * 0.15, 0.7);
    const o = drive(c, p.out, 2.2);
    boom(c, o, p.t + 0.75, p.v * 0.9, 50, 2);
    hiss(c, o, p.t + 0.75, 'lowpass', 1200, 300, 0.5, 1.6, p.v * 0.25, 0.05); // brasier
    [50, 57, 62, 66, 69].forEach((m) => playNote(c, p.rev, 'choir', { t: p.t + 0.75, f: midiToFreq(m), d: 2.2, v: p.v * 0.8 }));
    [50, 57].forEach((m) => playNote(c, p.out, 'horn', { t: p.t + 0.75, f: midiToFreq(m), d: 1.6, v: p.v * 0.6 }));
    bells(c, p.out, p.t + 0.8, [74, 78, 81, 86, 90, 93], 0.06, p.v * 0.4);
    return 3.6; } },
  pickup: { label: 'Ramassage', group: 'Butin', bus: 'sfx', max: 3, gap: 0.04, vary: 0.08, recipe: (c, p) => {
    tone(c, p.out, p.t, 'sine', 1320 * p.pitch, 1320 * p.pitch, 0.08, p.v * 0.15);
    tone(c, p.out, p.t + 0.05, 'sine', 1760 * p.pitch, 1760 * p.pitch, 0.12, p.v * 0.13);
    return 0.2; } },
  shards: { label: 'Éclats d’Akar', group: 'Butin', bus: 'sfx', max: 3, gap: 0.04, vary: 0.1, reverb: 0.3, recipe: (c, p) => {
    tone(c, p.out, p.t, 'triangle', 2200 * p.pitch, 2600 * p.pitch, 0.15, p.v * 0.1);
    hiss(c, p.out, p.t, 'highpass', 7000, 9000, 1, 0.1, p.v * 0.08);
    return 0.2; } },

  /* Progression */
  level_up: { label: 'Niveau supérieur', group: 'Progression', bus: 'sfx', max: 1, gap: 0.3, reverb: 0.6, recipe: (c, p) => {
    bells(c, p.out, p.t, [62, 66, 69, 74], 0.09, p.v * 0.4, 'harp');
    [62, 69].forEach((m) => playNote(c, p.rev, 'horn', { t: p.t + 0.36, f: midiToFreq(m), d: 0.7, v: p.v * 0.55 }));
    return 1.4; } },
  blessing_offer: { label: 'Offre de bénédictions', group: 'Progression', bus: 'ui', max: 1, gap: 0.3, reverb: 0.7, recipe: (c, p) => {
    hiss(c, p.out, p.t, 'bandpass', 300, 3000, 2, 0.8, p.v * 0.25, 0.5);
    [57, 64, 69].forEach((m) => playNote(c, p.rev, 'choir', { t: p.t + 0.1, f: midiToFreq(m), d: 1, v: p.v * 0.5 }));
    return 1.6; } },
  blessing_common: { label: 'Bénédiction commune', group: 'Progression', bus: 'ui', max: 1, gap: 0.1, reverb: 0.4, recipe: (c, p) => { bells(c, p.out, p.t, [69, 76], 0.08, p.v * 0.35, 'harp'); return 1; } },
  blessing_rare: { label: 'Bénédiction rare', group: 'Progression', bus: 'ui', max: 1, gap: 0.1, reverb: 0.5, recipe: (c, p) => { bells(c, p.out, p.t, [69, 73, 76, 81], 0.07, p.v * 0.38, 'harp'); return 1.2; } },
  blessing_epic: { label: 'Bénédiction épique', group: 'Progression', bus: 'ui', max: 1, gap: 0.1, reverb: 0.6, recipe: (c, p) => {
    bells(c, p.out, p.t, [69, 73, 76, 81, 85], 0.06, p.v * 0.4);
    playNote(c, p.rev, 'strings', { t: p.t, f: midiToFreq(57), d: 1, v: p.v * 0.6 });
    return 1.5; } },
  blessing_heroic: { label: 'Bénédiction héroïque', group: 'Progression', bus: 'ui', max: 1, gap: 0.1, reverb: 0.7, recipe: (c, p) => {
    boom(c, p.out, p.t, p.v * 0.4, 70, 0.8);
    [57, 64, 69, 73].forEach((m) => playNote(c, p.rev, 'choir', { t: p.t, f: midiToFreq(m), d: 1.2, v: p.v * 0.6 }));
    bells(c, p.out, p.t + 0.05, [81, 85, 88, 93], 0.06, p.v * 0.35);
    return 2; } },

  /* Déroulé de la partie */
  wave_start: { label: 'Début de vague (cor)', group: 'Partie', bus: 'sfx', max: 1, gap: 1, reverb: 0.7, recipe: (c, p) => {
    playNote(c, p.out, 'horn', { t: p.t, f: midiToFreq(45), d: 0.5, v: p.v * 0.8 });
    playNote(c, p.out, 'horn', { t: p.t + 0.55, f: midiToFreq(52), d: 1.1, v: p.v * 0.85 });
    playNote(c, p.out, 'taiko', { t: p.t + 0.55, f: 0, d: 0.5, v: p.v * 0.7 });
    return 2; } },
  wave_clear: { label: 'Vague terminée', group: 'Partie', bus: 'sfx', max: 1, gap: 1, reverb: 0.7, recipe: (c, p) => {
    playNote(c, p.out, 'bell', { t: p.t, f: midiToFreq(62), d: 2, v: p.v * 0.45 });
    playNote(c, p.out, 'bell', { t: p.t + 0.25, f: midiToFreq(69), d: 2, v: p.v * 0.35 });
    [50, 57, 62].forEach((m) => playNote(c, p.rev, 'strings', { t: p.t, f: midiToFreq(m), d: 1.5, v: p.v * 0.55 }));
    return 2.5; } },
  boss_intro: { label: 'Arrivée du boss', group: 'Partie', bus: 'sfx', max: 1, gap: 2, reverb: 0.7, recipe: (c, p) => {
    tone(c, p.out, p.t, 'sawtooth', 36, 33, 2.2, p.v * 0.2, 0.6);
    hiss(c, p.out, p.t, 'lowpass', 200, 900, 0.7, 2, p.v * 0.35, 1.2);
    [0, 0.45, 0.9].forEach((dt, i) => playNote(c, p.out, 'taiko', { t: p.t + 0.6 + dt, f: 0, d: 0.5, v: p.v * (0.7 + i * 0.12) }));
    [38, 45, 50].forEach((m) => playNote(c, p.rev, 'horn', { t: p.t + 1.5, f: midiToFreq(m), d: 1.4, v: p.v * 0.6 }));
    return 3.2; } },
  boss_phase: { label: 'Changement de phase', group: 'Partie', bus: 'sfx', max: 1, gap: 1, reverb: 0.6, recipe: (c, p) => {
    playNote(c, p.out, 'anvil', { t: p.t, f: 700, d: 0.6, v: p.v * 0.8 });
    boom(c, drive(c, p.out), p.t, p.v * 0.7, 55, 1.2);
    [50, 53, 57].forEach((m) => playNote(c, p.rev, 'choir', { t: p.t, f: midiToFreq(m), d: 0.9, v: p.v * 0.6 }));
    return 1.5; } },
  boss_kill: { label: 'Boss vaincu', group: 'Partie', bus: 'sfx', max: 1, gap: 2, reverb: 0.8, recipe: (c, p) => {
    boom(c, drive(c, p.out, 2), p.t, p.v, 45, 2.2);
    hiss(c, p.out, p.t, 'bandpass', 4000, 150, 1, 1.8, p.v * 0.4);
    [50, 57, 62, 66].forEach((m) => playNote(c, p.rev, 'choir', { t: p.t + 0.4, f: midiToFreq(m), d: 2.4, v: p.v * 0.7 }));
    bells(c, p.out, p.t + 0.5, [74, 78, 81, 86], 0.12, p.v * 0.4);
    return 3.5; } },
  victory: { label: 'Victoire', group: 'Partie', bus: 'sfx', max: 1, gap: 2, reverb: 0.8, recipe: (c, p) => {
    const seq: [number, number][] = [[50, 0], [57, 0.3], [62, 0.6], [66, 0.9]];
    seq.forEach(([m, dt]) => playNote(c, p.out, 'horn', { t: p.t + dt, f: midiToFreq(m), d: 0.5 + (dt === 0.9 ? 1.4 : 0), v: p.v * 0.6 }));
    [50, 54, 57, 62].forEach((m) => playNote(c, p.rev, 'choir', { t: p.t + 0.9, f: midiToFreq(m), d: 2.2, v: p.v * 0.7 }));
    bells(c, p.out, p.t + 0.9, [74, 78, 81, 86], 0.1, p.v * 0.4);
    playNote(c, p.out, 'taiko', { t: p.t + 0.9, f: 0, d: 0.5, v: p.v * 0.8 });
    return 3.5; } },
  defeat: { label: 'Défaite', group: 'Partie', bus: 'sfx', max: 1, gap: 2, reverb: 0.8, recipe: (c, p) => {
    boom(c, p.out, p.t, p.v * 0.7, 50, 2);
    [[57, 0], [53, 0.6], [50, 1.2]].forEach(([m, dt]) => playNote(c, p.rev, 'strings', { t: p.t + dt, f: midiToFreq(m), d: 1.1, v: p.v * 0.8 }));
    playNote(c, p.rev, 'bell', { t: p.t + 1.2, f: midiToFreq(38), d: 3, v: p.v * 0.45 });
    return 4; } },

  /* Interface */
  ui_hover: { label: 'Survol', group: 'Interface', bus: 'ui', max: 2, gap: 0.04, vary: 0.03, recipe: (c, p) => { tone(c, p.out, p.t, 'sine', 1900 * p.pitch, 1900 * p.pitch, 0.04, p.v * 0.05); return 0.05; } },
  ui_click: { label: 'Clic', group: 'Interface', bus: 'ui', max: 2, gap: 0.04, recipe: (c, p) => {
    hiss(c, p.out, p.t, 'bandpass', 2500, 1800, 2, 0.04, p.v * 0.3);
    tone(c, p.out, p.t, 'triangle', 700, 500, 0.06, p.v * 0.12);
    return 0.07; } },
  ui_open: { label: 'Ouverture de menu', group: 'Interface', bus: 'ui', max: 1, gap: 0.1, reverb: 0.3, recipe: (c, p) => {
    hiss(c, p.out, p.t, 'bandpass', 500, 2400, 1.2, 0.22, p.v * 0.25, 0.08);
    playNote(c, p.out, 'harp', { t: p.t + 0.08, f: midiToFreq(74), d: 0.3, v: p.v * 0.25 });
    return 0.5; } },
  ui_close: { label: 'Fermeture de menu', group: 'Interface', bus: 'ui', max: 1, gap: 0.1, recipe: (c, p) => {
    hiss(c, p.out, p.t, 'bandpass', 2400, 500, 1.2, 0.18, p.v * 0.22, 0.02);
    return 0.2; } },
  ui_confirm: { label: 'Validation', group: 'Interface', bus: 'ui', max: 1, gap: 0.1, reverb: 0.3, recipe: (c, p) => { bells(c, p.out, p.t, [74, 81], 0.06, p.v * 0.28, 'harp'); return 0.6; } },
  ui_error: { label: 'Refus', group: 'Interface', bus: 'ui', max: 1, gap: 0.15, recipe: (c, p) => {
    tone(c, p.out, p.t, 'square', 150, 140, 0.09, p.v * 0.07);
    tone(c, p.out, p.t + 0.1, 'square', 120, 110, 0.12, p.v * 0.07);
    return 0.25; } },
  buy: { label: 'Achat', group: 'Interface', bus: 'ui', max: 2, gap: 0.08, recipe: (c, p) => {
    [0, 0.05, 0.1].forEach((dt, i) => tone(c, p.out, p.t + dt, 'sine', 1500 + i * 300, 1500 + i * 300, 0.1, p.v * 0.12));
    return 0.25; } },
};

export const SFX_DEFS: Readonly<Record<string, SfxDef>> = D;
export type SfxId = keyof typeof D;

/** Clé de son de butin pour une rareté de loot.json (« legendary » → « loot_legendary »). */
export const lootSound = (rarity: string): string => (D[`loot_${rarity}`] ? `loot_${rarity}` : 'loot_common');

export interface PlayOpts { pan?: number; volume?: number; pitch?: number; delay?: number }

export class Sfx {
  private active = new Map<string, number[]>(); // heures de fin des voix
  private last = new Map<string, number>();

  constructor(readonly engine: AudioEngine, readonly defs: Record<string, SfxDef> = D) {}

  has(id: string): boolean { return id in this.defs; }

  /** Joue un son. Retourne false s'il est ignoré (audio pas prêt, limite de voix…). */
  play(id: string, o: PlayOpts = {}): boolean {
    const def = this.defs[id];
    const ctx = this.engine.ctx;
    if (!def) { console.warn(`[audio] son inconnu : ${id}`); return false; }
    if (!ctx) return false;
    const t = ctx.currentTime + 0.005 + (o.delay ?? 0);
    if (t - (this.last.get(id) ?? -Infinity) < (def.gap ?? 0)) return false;
    const voices = (this.active.get(id) ?? []).filter((end) => end > t);
    if (voices.length >= (def.max ?? 4)) return false;

    const out = ctx.createGain();
    out.gain.value = (def.vol ?? 1) * (o.volume ?? 1);
    let head: AudioNode = out;
    if (o.pan && ctx.createStereoPanner) {
      const pn = ctx.createStereoPanner(); pn.pan.value = Math.max(-1, Math.min(1, o.pan));
      out.connect(pn); head = pn;
    }
    head.connect(this.engine.buses[def.bus]);
    // envoi réverbération : passe par le bus du son pour respecter son volume
    const rev = ctx.createGain();
    rev.gain.value = 1;
    rev.connect(this.engine.buses[def.bus]);
    const revSend = ctx.createGain(); revSend.gain.value = 0.8; rev.connect(revSend).connect(this.engine.reverbIn);
    if (def.reverb) { const s = ctx.createGain(); s.gain.value = def.reverb; out.connect(s).connect(this.engine.reverbIn); }

    const vary = def.vary ?? 0;
    const pitch = (o.pitch ?? 1) * (1 + (Math.random() * 2 - 1) * vary);
    const dur = def.recipe(ctx, { t, v: 1, pitch, out, rev });
    voices.push(t + dur);
    this.active.set(id, voices);
    this.last.set(id, t);
    if (typeof setTimeout !== 'undefined') setTimeout(() => { out.disconnect(); rev.disconnect(); }, (dur + 4.5) * 1000 + (o.delay ?? 0) * 1000);
    return true;
  }
}
