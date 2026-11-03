import type { Game } from '@engine';
import type { GameEvents } from './events';
import type { HeroId } from './components';
import { RunScene, type RunResult, type RunOptions } from './scenes/RunScene';
import { HERO_DEFS } from './combat/data';
import { BLESSING_DATA, DEFAULT_RUN_CONFIG, type OfferChoice, type RunConfig } from './combat/blessings';
import { LOOT, type Item } from './combat/loot';
import { checkAchievements, nearAchievements, tierColor, type RunView } from './achievements';
import { BASE_MODS, PACTS, applyDailyMods, applyPacts, buildDaily, dailyScore, pactPoints, seedStream, shareText, type DailyConfig, type PactRanks } from './modes';
import { dailyIntroScreen, dailyResultScreen, pactsScreen } from './screens';
import { mountUI, connectSave, metaFromProfile, sanctuaryActions, type UiRoot } from '../ui';
import { SaveManager, recordRunEnd, recordBest, recordDaily, masteryLevel, unlockAchievement, upgradeRank, addCurrency, grant, type Profile } from '../save';
import sanctuaryJson from '../../data/sanctuary.json';

type Upgrade = { id: string; stat?: string; perRank?: number; unlocksPatron?: string };
const SANCTUARY = sanctuaryJson as unknown as { buildings: Array<{ id: string; startingPatrons?: string[]; upgrades: Upgrade[] }> };

/** Méta-progression → réglages de run (Veillée, Autel, Forge du Sanctuaire). */
export function runOptionsFromProfile(p: Profile | null, hero: HeroId): RunOptions {
  if (!p) return { run: DEFAULT_RUN_CONFIG, loot: { hero } };
  const stat = (b: string, s: string) => {
    const u = SANCTUARY.buildings.find((x) => x.id === b)?.upgrades.find((x) => x.stat === s);
    return u ? upgradeRank(p, b, u.id) * (u.perRank ?? 0) : 0;
  };
  const autel = SANCTUARY.buildings.find((b) => b.id === 'autel')!;
  const patrons = [...(autel.startingPatrons ?? DEFAULT_RUN_CONFIG.patrons)];
  for (const u of autel.upgrades) if (u.unlocksPatron && upgradeRank(p, 'autel', u.id) > 0) patrons.push(u.unlocksPatron);
  const run: RunConfig = {
    patrons, rerolls: stat('autel', 'blessingRerolls'), rarityLuckPct: stat('autel', 'blessingRarityLuckPct'),
    maxHpPct: stat('veillee', 'maxHpPct'), atkPct: stat('veillee', 'atkPct'), defPct: stat('veillee', 'defPct'), crit: stat('veillee', 'crit'),
    maxManaPct: stat('veillee', 'maxManaPct'), potions: stat('veillee', 'potionCharges'), lootLuckPct: stat('forge', 'lootRarityLuckPct'),
    firstBossLegendary: (p.stats.lifetime.legendaryFound ?? 0) === 0 && (p.stats.lifetime.bossKilled ?? 0) === 0,
  };
  return {
    run,
    loot: { hero, luckPct: run.lootLuckPct, firstBossLegendary: run.firstBossLegendary, legendaryPity: p.pity.legendary,
      ancestralUnlocked: upgradeRank(p, 'forge', 'ancestral') > 0, ilvlBonus: 0 },
  };
}

const PACT_KEY = 'shadow-chronicles.pacts';
const loadPacts = (): PactRanks => { try { return JSON.parse(localStorage.getItem(PACT_KEY) ?? '{}') as PactRanks; } catch { return {}; } };
const savePacts = (r: PactRanks) => { try { localStorage.setItem(PACT_KEY, JSON.stringify(r)); } catch { /* navigation privée */ } };

/** Une run : normale (avec pactes) ou défi quotidien. */
interface RunKind { daily?: DailyConfig; practice?: boolean }

const HERO_NAME: Record<string, string> = Object.fromEntries(Object.values(HERO_DEFS).map((d) => [d.id, d.name]));
const AUDIO_RARITY: Record<string, string> = { commun: 'common', rare: 'rare', epique: 'epic', heroique: 'heroic' };

/**
 * Parcours du joueur : écran titre → run (HUD DOM, bénédictions, butin, succès) → écran de fin → titre / Sanctuaire.
 * Relie RunScene (combat), l'UI (src/ui) et la sauvegarde (src/save) sans qu'ils se connaissent.
 */
export async function startApp(game: Game<GameEvents>, opts: { hero: HeroId; wave?: number; skipTitle?: boolean }): Promise<UiRoot> {
  const save = await SaveManager.open().catch((e) => { console.warn('Sauvegarde indisponible', e); return null; });
  const ui = mountUI(game as unknown as Game);
  if (save) connectSave(ui, save);
  // Outils de test (robot, console) : accès à la sauvegarde et aux écrans.
  (window as unknown as { sc: unknown }).sc = { save, ui, title: () => title(), pacts: () => pacts(), daily: () => dailyIntro() };
  const url = (k: string) => game.assets.url(k);
  let hero = opts.hero;
  const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;
  let offRun: Array<() => void> = [];

  const mastery = () => {
    if (!save) return undefined;
    const out: Partial<Record<HeroId, { level: number; progress: number }>> = {};
    for (const id of ['taro', 'mei', 'sena', 'ren'] as HeroId[]) {
      const m = (save.profile.mastery as Record<string, { xp: number }>)[id];
      if (m) out[id] = { level: masteryLevel(m.xp), progress: 0 };
    }
    return out;
  };

  const title = () => {
    const d = buildDaily();
    const pactsOpen = !!save?.profile.pacts.unlocked;
    ui.showTitle({
      assetUrl: url, hero, mastery: mastery(),
      daily: { label: `${HERO_NAME[d.hero] ?? d.hero} · ${d.modifiers.map((m) => m.name).join(', ')}`, streak: save?.profile.daily.streak ?? 0 },
      onDaily: () => dailyIntro(),
      pacts: pactsOpen ? { points: pactPoints(loadPacts()) } : undefined,
      onPacts: pactsOpen ? () => pacts() : undefined,
      onPlay: (h) => void startRun(h, 1),
      onSanctuary: () => sanctuary(),
      onSettings: () => ui.openSettings(),
    });
  };

  const dailyIntro = () => {
    const d = buildDaily();
    const hist = save?.profile.daily.history ?? {};
    const played = hist[d.day] ? { score: hist[d.day].score, wave: hist[d.day].wave } : null;
    ui.show(dailyIntroScreen({
      daily: d, streak: save?.profile.daily.streak ?? 0, played,
      history: Object.entries(hist).sort().map(([day, x]) => ({ day, score: x.score, wave: x.wave })),
      onStart: () => void startRun(d.hero, 1, { daily: d, practice: !!played }),
      onBack: () => title(),
    }));
  };

  const pacts = () => {
    if (!save) { title(); return; }
    ui.show(pactsScreen({
      ranks: loadPacts(), bestPoints: save.profile.pacts.bestPoints, claimed: save.profile.pacts.milestonesClaimed,
      onChange: savePacts, onStart: () => void startRun(hero, 1), onBack: () => title(),
    }));
  };

  const sanctuary = () => {
    if (!save) { title(); return; }
    const refresh = () => sanctuary();
    ui.showSanctuary({ profile: metaFromProfile(save.profile), assetUrl: url, ...sanctuaryActions(save, refresh), onLeave: () => title(), onPlay: () => void startRun(hero, 1) });
  };

  const view = (scene: RunScene, r: RunResult, pending: boolean): RunView => ({
    hero: r.hero, mode: scene.mode, wave: r.wave, wavesCleared: r.wavesCleared, bossWaves: r.bossWaves,
    counters: r.counters, waveCounters: scene.stats.wave, fastestBossKill: r.fastestBossKill, pending,
  });

  /** Codex : bénédictions, duos et pouvoirs légendaires découverts. */
  const discover = (kind: 'seenBlessings' | 'seenDuos' | 'seenLegendaryPowers', id: string) => {
    if (!save || save.profile.unlocks[kind].includes(id)) return;
    save.update((p) => { if (!p.unlocks[kind].includes(id)) p.unlocks[kind].push(id); });
    if (kind !== 'seenBlessings') ui.hud.toast('📜 Codex', kind === 'seenDuos' ? 'Nouveau Duo découvert' : 'Nouveau pouvoir légendaire', '#d9ab74');
  };

  /** Débloque les succès remplis (toast + événement). */
  const unlock = (scene: RunScene, pending: boolean) => {
    if (!save) return;
    const met = checkAchievements(save.profile, view(scene, scene.result(), pending));
    if (!met.length) return;
    save.update((p) => { for (const a of met) unlockAchievement(p, a.id); });
    met.forEach((a, i) => setTimeout(() => {
      ui.hud.toast(`${a.icon} Succès : ${a.name}`, a.desc, tierColor(a.tier));
      game.events.emit('achievement:unlock', { id: a.id, name: a.name, tier: a.tier });
    }, i * 700));
  };

  const end = (scene: RunScene, r: RunResult, kind: RunKind, pts: number) => {
    for (const off of offRun) off();
    offRun = [];
    if (kind.daily) { endDaily(scene, r, kind); return; }
    let gains = { eclats: r.wave * 2 }, from = 0, to = 0, level = 1;
    let best = r.wave;
    let near: ReturnType<typeof nearAchievements> = [];
    if (save) {
      const rew = save.update((p) => {
        const out = recordRunEnd(p, {
          hero: r.hero, mode: scene.mode, wave: r.wave, wavesCleared: r.wavesCleared, bossWaves: r.bossWaves, won: r.won, daily: false, pactPoints: pts,
          playTimeSec: r.timeSec, earned: { poussiere: r.dust }, counters: r.counters,
        });
        // Pactes de la Brume : bonus d'éclats et paliers (boss de la vague 10 vaincu avec ce total).
        if (pts > 0) {
          const bonus = Math.round(out.currencies.eclats * pts * PACTS.rewardPerPoint.eclatsPct / 100);
          addCurrency(p, 'eclats', bonus); out.currencies.eclats += bonus;
          if (r.bossWaves.includes(10)) for (const m of PACTS.milestones) {
            if (pts >= m.points && !p.pacts.milestonesClaimed.includes(m.points)) {
              p.pacts.milestonesClaimed.push(m.points);
              grant(p, m.reward as Parameters<typeof grant>[1]);
              setTimeout(() => ui.hud.toast(`☁ Palier de Pacte ${m.points}`, 'Récompense obtenue', '#b9a4ff'), 400);
            }
          }
        }
        if (Number.isFinite(r.fastestBossKill)) recordBest(p, 'fastestBossKill', Math.round(r.fastestBossKill), true);
        p.pity.legendary = r.legendaryPity;
        return out;
      });
      unlock(scene, false);
      near = nearAchievements(save.profile, view(scene, r, false));
      gains = { eclats: rew.currencies.eclats };
      from = rew.mastery.from; to = rew.mastery.to; level = to;
      best = Math.max(r.wave, ...Object.values(save.profile.stats.bestWaveByMode as Record<string, number>));
    }
    ui.hud.el.hidden = true;
    ui.showRunEnd({
      victory: r.won, wave: r.wave, bestWave: best, kills: r.kills, timeSec: r.timeSec, gains,
      mastery: { hero: r.hero, level, from: from === to ? 0.4 : 0, to: from === to ? 0.6 : 1 },
      near,
      onRetry: () => void startRun(r.hero, 1),
      onSanctuary: () => sanctuary(),
    });
  };

  /** Fin du défi quotidien : score, série et récompenses (premier essai seulement). */
  const endDaily = (scene: RunScene, r: RunResult, kind: RunKind) => {
    const d = kind.daily!;
    const sc = dailyScore({ wavesCleared: r.wavesCleared, kills: r.kills, elites: r.counters.elitesKilled ?? 0, bosses: r.bossWaves.length,
      timeSec: r.timeSec, contracts: 0, won: r.won, damageTaken: r.counters.damageTaken ?? 0 });
    let counted = false, streak = save?.profile.daily.streak ?? 0;
    const rewards: string[] = [];
    if (save) {
      save.update((p) => {
        recordRunEnd(p, { hero: r.hero, mode: d.mode, wave: r.wave, wavesCleared: r.wavesCleared, bossWaves: r.bossWaves, won: r.won, daily: true, pactPoints: 0,
          playTimeSec: r.timeSec, earned: kind.practice ? {} : { poussiere: r.dust }, counters: r.counters });
        if (kind.practice) return;
        const res = recordDaily(p, d.day, { score: sc.total, wave: r.wave, hero: r.hero, won: r.won });
        counted = res.counted; streak = res.streak;
        for (const rw of res.rewards as Array<Record<string, unknown>>) {
          if (rw.eclats) rewards.push(`+${rw.eclats} ✦`);
          if (rw.poussiere) rewards.push(`+${rw.poussiere} ✧`);
          if (rw.sceaux) rewards.push(`+${rw.sceaux} ♛`);
        }
        if (res.usedGrace) rewards.push('bougie de veille utilisée');
      });
      unlock(scene, false);
    }
    ui.hud.el.hidden = true;
    ui.show(dailyResultScreen({
      won: r.won, wave: r.wave, waves: d.waves, score: sc.total, parts: sc.parts, counted, streak, rewards,
      share: shareText(d, HERO_NAME[r.hero] ?? r.hero, r.wave, sc.total, streak),
      onRetry: () => void startRun(d.hero, 1, { daily: d, practice: true }),
      onBack: () => title(),
    }));
  };

  /** Fin de vague : 3 bénédictions (relances de l'Autel), puis vague suivante. */
  const offer = (scene: RunScene, wave: number) => {
    const b = scene.bless;
    const choices = b.makeOffer(wave, scene.result().hero);
    if (!choices.length) { scene.nextWave(); return; }
    game.events.emit('blessing:offer', { wave, count: choices.length });
    type UiOffer = Parameters<UiRoot['offerBlessings']>[0];
    const cost = b.rerollGoldCost(), gold = scene.loot.gold;
    // Relances gratuites d'abord (Autel), puis payées en or (40 / 80 / 160…).
    const onReroll = b.rerolls > 0 ? () => { b.rerolls--; offer(scene, wave); }
      : gold >= cost ? () => { scene.loot.gold -= cost; b.paidRerolls++; offer(scene, wave); } : undefined;
    void ui.offerBlessings({
      wave, choices: choices as unknown as UiOffer['choices'], owned: b.owned as unknown as UiOffer['owned'], rerolls: b.rerolls,
      rerollGoldCost: b.rerolls > 0 ? undefined : cost, gold, onReroll,
    }).then((picked) => {
      const c = picked as unknown as OfferChoice;
      const res = b.pick(c);
      discover('seenBlessings', c.blessing.id);
      for (const d of res.duos) discover('seenDuos', d.id);
      game.events.emit('blessing:pick', { rarity: AUDIO_RARITY[c.rarity] ?? 'common', id: c.blessing.id, patron: c.blessing.patron });
      ui.hud.setBlessings(b.owned.map((o) => o.blessing));
      const pc = (p: string) => BLESSING_DATA.patrons[p]?.color;
      if (res.replaced) ui.hud.toast(`${c.blessing.name}`, `remplace ${res.replaced.blessing.name}`, pc(c.blessing.patron));
      for (const d of res.duos) {
        scene.stats.add('duosTaken');
        ui.hud.toast(`⚭ Duo : ${d.name}`, d.desc, '#ffd65c');
        game.events.emit('blessing:pick', { rarity: 'epic', id: d.id, duo: true });
      }
      for (const l of res.legendaries) {
        scene.stats.add('legendaryBlessingsTaken');
        ui.hud.toast(`✪ Légendaire : ${l.name}`, l.desc, pc(l.patron));
        game.events.emit('blessing:pick', { rarity: 'heroic', id: l.id, legendary: true });
      }
      scene.recomputeHero();
      unlock(scene, true);
      scene.nextWave();
    });
  };

  const startRun = async (h: HeroId, wave: number, kind: RunKind = {}) => {
    if (!kind.daily) hero = h;
    for (const off of offRun) off();
    offRun = [];
    ui.closeAll();
    let o: RunOptions, pts = 0;
    if (kind.daily) {
      // Défi : Sanctuaire désactivé, graine du jour, modificateurs, patron unique éventuel tiré du flux « setup ».
      const d = kind.daily;
      const mono = seedStream(d.seedString, 'patron').int(0, DEFAULT_RUN_CONFIG.patrons.length - 1);
      const mods = applyDailyMods(BASE_MODS, d, DEFAULT_RUN_CONFIG.patrons[mono]);
      o = { run: { ...DEFAULT_RUN_CONFIG }, loot: { hero: h }, mods, seed: d.seedString, mode: d.mode };
    } else {
      o = runOptionsFromProfile(save?.profile ?? null, h);
      const ranks = save?.profile.pacts.unlocked ? loadPacts() : {};
      pts = pactPoints(ranks);
      if (pts > 0) {
        o.mods = applyPacts(BASE_MODS, ranks);
        o.pactPoints = pts;
        o.loot = { ...o.loot, luckPct: (o.loot?.luckPct ?? 0) + pts * PACTS.rewardPerPoint.lootRarityLuckPct };
      }
    }
    const scene = new RunScene(h, wave, o);
    scene.showBuiltinHud = false;
    scene.onAnnounce = (t, s, c) => ui.hud.banner(t, s, c !== undefined ? hex(c) : undefined);
    scene.onEnd = (r) => end(scene, r, kind, pts);
    let lastKills = 0;
    scene.onFrame = (sc) => {
      const s = sc.snapshot();
      ui.hud.setVitals({ hp: Math.ceil(s.hp), max: s.maxHp, shield: Math.ceil(s.shield), mana: Math.floor(s.mana), manaMax: s.maxMana });
      s.skills.forEach((k, i) => ui.hud.setCooldown(i, k.cd, k.maxCd));
      ui.hud.setCooldown(4, s.dashCharges > 0 ? 0 : s.dashCd, 1.1);
      const total = Math.max(1, sc.director.total);
      const info = (s.boss ? `${s.boss.name} · phase ${s.boss.phase}/3 · ${Math.ceil((100 * s.boss.hp) / s.boss.maxHp)} %` : `${s.theme} · ${s.region} · potions ×${s.potions}`) + ` · ◉ ${s.gold}`;
      ui.hud.setWave(s.wave, s.phase === 'active' ? 1 - s.enemiesLeft / total : 1, info);
      while (lastKills < s.kills) { lastKills++; ui.hud.addKill(); }
    };
    offRun.push(game.events.on('wave:clear', (p) => {
      if (game.scenes.current !== scene || !ui.inRun) return;
      unlock(scene, true);
      if (scene.isFinalWave(p.wave)) return; // fin du défi : pas d'offre
      scene.holdIntermission = true;
      // L'offre s'ouvre 1,4 s après la fin de vague : le butin a le temps d'arriver.
      scene.later(1.4, () => { if (ui.inRun && !scene.snapshot().over) offer(scene, p.wave); else scene.nextWave(); });
    }));
    await game.scenes.switch(scene);
    // Le butin existe une fois la scène entrée.
    scene.loot.onItem = (it: Item, equipped: boolean, dust: number) => {
      const R = LOOT.rarities[it.rarity];
      if (it.power) discover('seenLegendaryPowers', it.power.id);
      if (!equipped && it.rarity === 'common') return;
      const power = it.power ? ` — ${it.power.short}` : '';
      ui.hud.toast(`${LOOT.slots[it.slot].icon} ${it.name}`, equipped ? `${R.name} · équipé${power}` : `${R.name} · démantelé (+${dust} ✧)`, R.color);
    };
    ui.hud.el.hidden = false;
    ui.hud.setHero(h, url);
    ui.hud.setBlessings([]);
    if (kind.daily) {
      // Bénédiction de départ rare, la même pour tous (flux « blessings » du jour).
      const st = seedStream(kind.daily.seedString, 'start');
      const pool = BLESSING_DATA.blessings.filter((b) => DEFAULT_RUN_CONFIG.patrons.includes(b.patron) && (!scene.mods.monoPatron || b.patron === scene.mods.monoPatron));
      const first = pool[st.int(0, pool.length - 1)];
      scene.bless.pick({ blessing: first, rarity: 'rare' });
      scene.recomputeHero();
      ui.hud.setBlessings(scene.bless.owned.map((x) => x.blessing));
      ui.hud.banner('☀ Défi du jour', scene.mods.labels.join(' · '), '#ffd27a');
    } else if (pts > 0) ui.hud.banner(`☁ Pacte de la Brume · ${pts}`, scene.mods.labels.join(' · '), '#b9a4ff');
    ui.inRun = true;
    ui.onQuitRun = () => { ui.inRun = false; title(); };
    type Pause = ReturnType<UiRoot['pauseInfo']>;
    ui.pauseInfo = () => ({ hero: h, owned: scene.bless.owned as unknown as Pause['owned'], wave: scene.wave });
    if (!ui.settings.get().tutorialDone) ui.tutorial.start(game.input.lastDevice);
  };

  if (opts.skipTitle) await startRun(hero, opts.wave ?? 1);
  else {
    // Un fond animé derrière le titre : une run sans HUD en attente.
    await startRun(hero, 1);
    ui.inRun = false;
    title();
  }
  return ui;
}
