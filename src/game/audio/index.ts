import type { EventBus, Game } from '@engine';
import { AudioEngine, type AudioSettings, type BusId } from './AudioEngine';
import { Music } from './Music';
import { Sfx, lootSound, type PlayOpts } from './Sfx';
import { Ambience } from './Ambience';
import { THEMES, biomeForWave, bossThemeForWave } from './themes';
import type { GameEvents } from '../events';

export { AudioEngine, Music, Sfx, Ambience, THEMES, biomeForWave, bossThemeForWave, lootSound };
export type { AudioSettings, BusId };

/**
 * Événements que l'audio écoute en plus de ceux de `events.ts`.
 * Le gameplay / l'UI peuvent les émettre tels quels (ou les ajouter à GameEvents) :
 * tous sont facultatifs, l'audio ne plante pas s'ils n'existent pas encore.
 */
export interface AudioEvents {
  'run:start': { hero?: string; wave?: number };
  'wave:start': { wave: number; boss?: boolean };
  'wave:clear': { wave: number };
  'boss:spawn': { wave: number; id?: string; name?: string };
  'boss:phase': { phase: number };
  'boss:killed': { wave: number; id?: string };
  'elite:killed': { x: number; y: number };
  'loot:drop': { rarity: string; x?: number; y?: number };
  'loot:pickup': { rarity?: string; x?: number; y?: number };
  'currency:pickup': { amount?: number };
  'blessing:offer': { count?: number };
  'blessing:pick': { rarity: string };
  'player:levelup': { level?: number };
  'player:heal': { amount?: number };
  'player:shield': Record<string, never>;
  'player:skill': { slot: number; hero?: string };
  'player:crit': { x: number; y: number };
  'run:victory': Record<string, never>;
  'run:defeat': Record<string, never>;
  'sanctuary:enter': Record<string, never>;
  'menu:enter': Record<string, never>;
  'ui:sound': { id: string };
}

const BEASTS = /wolf|brute|raider|loup|beast|guerr/i;

export interface GameAudioOptions {
  hero?: string;
  /** Position de l'écoute (caméra) pour la stéréo et l'atténuation des sons lointains. */
  listener?: () => { x: number; y: number; halfWidth: number };
  resolveUrl?: (key: string) => string;
}

/**
 * Façade audio du jeu : musique adaptative + bruitages + ambiances + volumes.
 *
 *   const audio = GameAudio.attach(game, { hero: 'mei' });
 *   audio.settings / audio.setVolume('music', 0.4) / audio.sfx.play('ui_click')
 */
export class GameAudio {
  readonly engine: AudioEngine;
  readonly music: Music;
  readonly sfx: Sfx;
  readonly ambience: Ambience;
  hero: string;
  wave = 1;
  inBoss = false;
  private heat = 0;
  private hpRatio = 1;
  private lastBeat = 0;
  private offs: (() => void)[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private opts: GameAudioOptions;

  constructor(opts: GameAudioOptions = {}, engine = new AudioEngine()) {
    this.opts = opts;
    this.engine = engine;
    this.music = new Music(engine);
    if (opts.resolveUrl) this.music.resolveUrl = opts.resolveUrl;
    this.sfx = new Sfx(engine);
    this.ambience = new Ambience(engine);
    this.hero = opts.hero ?? 'taro';
  }

  /** Crée l'audio et le branche sur les événements du jeu. */
  static attach(game: Game<GameEvents>, opts: Omit<GameAudioOptions, 'listener' | 'resolveUrl'> = {}): GameAudio {
    const a = new GameAudio({
      ...opts,
      resolveUrl: (k) => game.assets.url(k),
      listener: () => ({ x: game.camera.x, y: game.camera.y, halfWidth: game.camera.viewW / 2 / (game.camera.zoom || 1) }),
    });
    a.engine.autoUnlock();
    a.bind(game.events as unknown as EventBus<GameEvents & AudioEvents>);
    a.startBiome(1);
    return a;
  }

  get settings(): AudioSettings { return this.engine.settings; }
  setVolume(bus: BusId, v: number): void { this.engine.set(bus, v); }
  setMuted(m: boolean): void { this.engine.setMuted(m); }

  /** Joue un son positionné dans le monde (stéréo + atténuation hors écran). */
  at(id: string, x?: number, y?: number, o: PlayOpts = {}): boolean {
    const L = this.opts.listener?.();
    if (L && x !== undefined) {
      const dx = (x - L.x) / Math.max(1, L.halfWidth);
      const dy = y !== undefined ? (y - L.y) / Math.max(1, L.halfWidth) : 0;
      const dist = Math.hypot(dx, dy);
      const vol = dist <= 1.1 ? 1 : Math.max(0, 1 - (dist - 1.1) * 0.7);
      if (vol <= 0.02) return false;
      return this.sfx.play(id, { ...o, pan: Math.max(-0.85, Math.min(0.85, dx * 0.7)), volume: (o.volume ?? 1) * vol });
    }
    return this.sfx.play(id, o);
  }

  startBiome(wave: number): void {
    this.wave = wave;
    this.inBoss = false;
    const id = biomeForWave(wave);
    this.music.play(id);
    this.ambience.play(THEMES[id].ambience ?? null);
  }

  startBoss(wave: number, bossId?: string): void {
    this.inBoss = true;
    const id = bossThemeForWave(wave, bossId);
    this.sfx.play('boss_intro');
    this.engine.duck(0.2, 1.6, 1.5);
    this.music.play(id, { immediate: true, fade: 1.2 });
  }

  bind(ev: EventBus<GameEvents & AudioEvents>): void {
    const on = <K extends keyof (GameEvents & AudioEvents)>(k: K, fn: (p: (GameEvents & AudioEvents)[K]) => void): void => { this.offs.push(ev.on(k, fn)); };

    on('player:shoot', (e) => {
      const h = (e as { hero?: string }).hero ?? this.hero;
      this.at(`shoot_${h}`, e.x, e.y, { volume: 0.7 }) || this.at('shoot_taro', e.x, e.y, { volume: 0.7 });
    });
    on('player:dash', () => this.sfx.play('dash'));
    on('enemy:hit', (e) => { this.at('hit', e.x, e.y, { volume: Math.min(1, 0.5 + e.damage / 40) }); this.bump(0.012); });
    on('player:crit', (e) => this.at('hit_crit', e.x, e.y));
    on('enemy:killed', (e) => {
      const elite = /elite|élite/i.test(e.kind);
      this.at(elite ? 'kill_elite' : BEASTS.test(e.kind) ? 'kill_beast' : 'kill_shade', e.x, e.y);
      this.bump(elite ? 0.12 : 0.035);
    });
    on('elite:killed', (e) => this.at('kill_elite', e.x, e.y));
    on('player:hurt', (e) => {
      this.sfx.play('hurt', { volume: Math.min(1, 0.6 + e.damage / 30) });
      this.hpRatio = e.max > 0 ? e.hp / e.max : 1;
      this.bump(0.08);
    });
    on('player:heal', () => { this.sfx.play('heal'); this.hpRatio = Math.min(1, this.hpRatio + 0.3); });
    on('player:shield', () => this.sfx.play('shield'));
    on('player:skill', (e) => this.sfx.play(e.slot >= 3 ? 'ultimate' : 'skill', { pitch: [1, 1.12, 0.89, 1][e.slot] ?? 1 }));
    on('player:levelup', () => this.sfx.play('level_up'));

    on('run:start', (e) => { if (e.hero) this.hero = e.hero; this.hpRatio = 1; this.heat = 0; this.startBiome(e.wave ?? 1); });
    on('wave:start', (e) => {
      this.sfx.play('wave_start');
      if (!e.boss && (biomeForWave(e.wave) !== biomeForWave(this.wave) || this.inBoss || this.music.currentId === 'sanctuary')) this.startBiome(e.wave);
      this.wave = e.wave;
    });
    on('wave:clear', () => { this.sfx.play('wave_clear'); this.heat = Math.min(this.heat, 0.15); });
    on('boss:spawn', (e) => this.startBoss(e.wave, e.id ?? e.name));
    on('boss:phase', () => { this.sfx.play('boss_phase'); this.engine.duck(0.4, 0.6, 0.8); });
    on('boss:killed', (e) => { this.sfx.play('boss_kill'); this.engine.duck(0.15, 2.5, 2); this.startBiome(Math.max(this.wave, e.wave)); });

    on('loot:drop', (e) => {
      const id = lootSound(e.rarity);
      this.at(id, e.x, e.y);
      if (e.rarity === 'legendary') this.engine.duck(0.3, 1.8, 1.5);
      if (e.rarity === 'ancestral') this.engine.duck(0.15, 2.6, 2);
    });
    on('loot:pickup', () => this.sfx.play('pickup'));
    on('currency:pickup', () => this.sfx.play('shards'));
    on('blessing:offer', () => this.sfx.play('blessing_offer'));
    on('blessing:pick', (e) => this.sfx.play(this.sfx.has(`blessing_${e.rarity}`) ? `blessing_${e.rarity}` : 'blessing_common'));

    on('run:victory', () => { this.sfx.play('victory'); this.music.play('sanctuary'); this.ambience.play('shrine'); });
    on('run:defeat', () => { this.sfx.play('defeat'); this.music.stop(3); this.ambience.play(null); });
    on('sanctuary:enter', () => { this.inBoss = false; this.music.play('sanctuary'); this.ambience.play('shrine'); });
    on('menu:enter', () => { this.inBoss = false; this.music.play('sanctuary'); this.ambience.play('shrine'); });
    on('ui:sound', (e) => this.sfx.play(e.id));

    on('game:pause', (e) => { this.engine.setMuffled(e.paused); this.engine.setSfxSuspended(e.paused); });

    if (!this.timer && typeof setInterval !== 'undefined') this.timer = setInterval(() => this.tick(0.25), 250);
  }

  private bump(v: number): void { this.heat = Math.min(1, this.heat + v); }

  /** Intensité musicale : chaleur du combat + danger (PV bas) + plancher en boss. */
  tick(dt: number): void {
    this.heat = Math.max(0, this.heat - dt * 0.06);
    const danger = this.hpRatio < 0.3 ? 0.25 : 0;
    const floor = this.inBoss ? 0.75 : 0.12;
    this.music.setIntensity(Math.max(floor, Math.min(1, 0.15 + this.heat + danger)));
    // battement de cœur quand les PV sont bas
    const now = this.engine.now;
    if (this.hpRatio > 0 && this.hpRatio < 0.25 && now - this.lastBeat > 0.95) { this.lastBeat = now; this.sfx.play('heartbeat', { volume: 0.8 }); }
  }

  dispose(): void {
    this.offs.forEach((f) => f()); this.offs = [];
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.music.dispose();
    this.ambience.play(null);
  }
}
