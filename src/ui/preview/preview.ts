/**
 * Maquette jouable de l'interface (agent 6) : moteur + scène de démo + UI complète.
 * Ce fichier n'est PAS le jeu : il simule vagues, mana, techniques et méta pour montrer l'UI.
 * Paramètres : ?screen=title|offer|sanctuary|end|settings|pause  ?hero=mei  ?touch=1
 */
import { Game } from '@engine';
import { DemoScene } from '@game/scenes/DemoScene';
import type { GameEvents } from '@game/events';
import { mountUI } from '../UiRoot';
import { BLESSINGS, HERO_INFO, SANCTUARY, ACHIEVEMENTS, duoUnlockedBy, type Blessing, type HeroId, type Rarity } from '../data';
import type { MetaProfile } from '../screens/Sanctuary';
import { rollOffer } from './offers';
import { SaveManager, recordRunEnd, nextUpgradeCost, meetsRequirement, isBuildingOpen } from '../../save';
import { connectSave, metaFromProfile, sanctuaryActions } from '../saveBridge';
import { GameAudio } from '@game/audio';

async function boot(): Promise<void> {
  const host = document.getElementById('app')!;
  const bar = document.getElementById('loading-bar')!;
  const save = await SaveManager.open();
  const game = await Game.create<GameEvents>(host);
  await game.assets.loadManifest();
  await game.assets.loadImages(undefined, (p) => (bar.style.width = `${Math.round(p * 100)}%`));
  document.getElementById('loading')!.remove();
  game.renderer.layers.hud.visible = false; // l'ancien texte de la démo est remplacé par l'UI DOM

  const url = (k: string) => game.assets.url(k);
  const ui = mountUI(game as unknown as Game);
  (window as unknown as { ui: unknown; game: unknown }).ui = ui;
  (window as unknown as { game: unknown }).game = game;
  const params = new URLSearchParams(location.search);
  connectSave(ui, save);
  const audio = GameAudio.attach(game, { hero: 'mei' });
  ui.settings.onChange((s) => { audio.setVolume('music', s.musicVolume); audio.setVolume('sfx', s.sfxVolume); });
  (window as unknown as { audio: unknown }).audio = audio;

  // ── État simulé ─────────────────────────────────────────────
  // Maquette : un profil neuf reçoit 46 éclats pour pouvoir essayer le Sanctuaire.
  if (save.profile.stats.lifetime.runs === undefined && save.profile.currencies.eclats === 0) save.update((p) => { p.currencies.eclats = 46; p.currencies.poussiere = 30; });
  let profile: MetaProfile = metaFromProfile(save.profile);
  let hero: HeroId = (['taro', 'mei', 'sena', 'ren'] as const).find((x) => x === params.get('hero')) ?? save.settings.lastHero ?? 'mei';
  const run = { wave: 1, waveT: 0, waveLen: 35, kills: 0, gold: 0, shards: 0, mana: 60, manaMax: 100, hp: 100, max: 100, time: 0,
    cds: [0, 0, 0, 0, 0], owned: [] as Array<{ blessing: Blessing; rarity: Rarity }>, rerolls: 1, ending: false };
  const patrons = () => ['veilleurs', 'lune', 'sang', ...(profile.ranks['autel.patron_orage'] ? ['orage'] : [])];

  const saveRun = () => void save.saveRun({ seed: String(Date.now()), rng: {}, hero, mode: 'survie', daily: false, wave: run.wave, pactPoints: 0,
    elapsedSec: run.time, stateVersion: 1, state: { owned: run.owned.map((o) => [o.blessing.id, o.rarity]), kills: run.kills, gold: run.gold, shards: run.shards, hp: run.hp } });

  const resumeRun = async () => {
    const snap = save.run;
    if (!snap) return;
    const st = snap.state as { owned: [string, Rarity][]; kills: number; gold: number; shards: number };
    await startRun(snap.hero as HeroId, true);
    run.wave = snap.wave; run.time = snap.elapsedSec; run.kills = st.kills; run.gold = st.gold; run.shards = st.shards;
    run.owned = st.owned.map(([id, r]) => ({ blessing: BLESSINGS.blessings.find((b) => b.id === id)!, rarity: r })).filter((o) => o.blessing);
    ui.hud.setGold(run.gold); ui.hud.setShards(run.shards); ui.hud.setBlessings(run.owned.map((o) => o.blessing));
    ui.hud.banner(`Vague ${run.wave}`, 'Expédition reprise');
  };

  const startRun = async (h: HeroId, resumed = false) => {
    hero = h;
    audio.hero = h;
    save.updateSettings((x) => { x.lastHero = h; });
    if (!resumed) void save.clearRun();
    Object.assign(run, { wave: 1, waveT: 0, kills: 0, gold: 0, shards: 0, mana: 60, hp: 100, max: 100, time: 0, cds: [0, 0, 0, 0, 0], owned: [], rerolls: 1, ending: false });
    ui.closeAll();
    await game.scenes.switch(new DemoScene(h));
    game.renderer.layers.hud.visible = false;
    ui.inRun = true;
    ui.hud.setHero(h, url, 3);
    ui.hud.resetKills(); ui.hud.setGold(0); ui.hud.setShards(0); ui.hud.setBlessings([]);
    ui.hud.setVitals({ hp: run.hp, max: run.max, mana: run.mana, manaMax: run.manaMax });
    if (resumed) return;
    ui.hud.banner('Vague 1', 'Les ombres se lèvent');
    if (!ui.settings.get().tutorialDone || params.has('tuto')) ui.tutorial.start(ui.currentDevice);
  };

  const showTitle = () => ui.showTitle({ assetUrl: url, hero, onPlay: startRun, onSanctuary: showSanctuary, onSettings: () => ui.openSettings(),
    mastery: { taro: { level: 3, progress: 0.4 }, mei: { level: 5, progress: 0.75 }, sena: { level: 1, progress: 0.1 }, ren: { level: 2, progress: 0.55 } },
    daily: { label: 'Taro · Cauchemar · Verre Lunaire', streak: save.profile.daily.streak }, onDaily: () => startRun('taro'),
    resume: save.run ? { label: `${HERO_INFO[save.run.hero as HeroId]?.name ?? save.run.hero} · vague ${save.run.wave} · ${Math.floor(save.run.elapsedSec / 60)} min`,
      onResume: () => void resumeRun(), onDiscard: async () => { await save.clearRun(); showTitle(); } } : undefined });

  const showSanctuary = () => {
    profile = metaFromProfile(save.profile);
    ui.showSanctuary({ profile, assetUrl: url, onLeave: showTitle, onPlay: () => startRun(hero),
      ...sanctuaryActions(save, (m) => { Object.assign(profile, m); }) });
  };

  const endRun = () => {
    if (run.ending) return;
    run.ending = true;
    const bestBefore = profile.stats.bestWave;
    const rewards = save.update((p) => recordRunEnd(p, { hero, mode: 'survie', wave: run.wave, wavesCleared: run.wave - 1, bossWaves: [], won: false, daily: false,
      pactPoints: 0, playTimeSec: run.time, earned: { eclats: run.shards }, counters: { kills: run.kills, runs: 1 } }));
    void save.clearRun();
    profile = metaFromProfile(save.profile);
    // Prochaine amélioration abordable (ou la moins chère).
    const p = save.profile;
    const next = SANCTUARY.buildings.filter((b) => isBuildingOpen(p, b.id)).flatMap((b) => b.upgrades.map((u) => ({ b, u, cost: nextUpgradeCost(p, b.id, u.id) })))
      .filter((x) => x.cost && meetsRequirement(p, x.u.requires) && x.cost.eclats !== undefined)
      .sort((a, b) => a.cost!.eclats! - b.cost!.eclats!)[0];
    const near = ACHIEVEMENTS.filter((a) => !a.secret && ['kills', 'waveReached'].includes(a.cond.stat)).map((a) => {
      const v = a.cond.stat === 'kills' ? (p.stats.lifetime.kills ?? run.kills) : run.wave;
      return { icon: a.icon, name: a.name, progress: v / a.cond.value, label: `${v} / ${a.cond.value}` };
    }).filter((a) => a.progress < 1).sort((a, b) => b.progress - a.progress).slice(0, 3);
    const lvl = (xp: number) => { const L = SANCTUARY.heroMastery.levels; let i = 0; while (i + 1 < L.length && xp >= L[i + 1].xp) i++; const a = L[i].xp, b = L[i + 1]?.xp ?? a + 1; return { level: L[i].level, k: Math.min(1, (xp - a) / (b - a)) }; };
    const xpNow = p.mastery[hero].xp, m0 = lvl(Math.max(0, xpNow - (run.wave - 1) * SANCTUARY.heroMastery.xpPerWave)), m1 = lvl(xpNow);
    ui.showRunEnd({ victory: false, wave: run.wave, bestWave: bestBefore, kills: run.kills, timeSec: run.time,
      gains: { eclats: rewards.currencies.eclats }, mastery: { hero: HERO_INFO[hero].name, level: m1.level, from: m1.level > m0.level ? 0 : m0.k, to: m1.k },
      next: next && { icon: next.u.icon ?? next.b.icon, name: next.u.name, cost: next.cost!.eclats!, currencyIcon: '✦', affordable: p.currencies.eclats >= next.cost!.eclats! },
      near, onRetry: () => startRun(hero), onSanctuary: showSanctuary });
  };

  const offer = async () => {
    const choices = rollOffer(hero, run.wave, run.owned, patrons());
    const c = await ui.offerBlessings({ wave: run.wave, choices, owned: run.owned, rerolls: run.rerolls, rerollGoldCost: 40, gold: run.gold,
      onReroll: () => { if (run.rerolls > 0) run.rerolls--; else run.gold -= 40; ui.hud.setGold(run.gold); void offerThen(); } });
    apply(c);
  };
  const offerThen = async () => { await offer(); };
  const apply = (c: { blessing: Blessing; rarity: Rarity; upgradeFrom?: Rarity }) => {
    const duo = c.upgradeFrom ? undefined : duoUnlockedBy(run.owned.map((o) => o.blessing), c.blessing);
    if (c.upgradeFrom) run.owned = run.owned.map((o) => (o.blessing.id === c.blessing.id ? { ...o, rarity: c.rarity } : o));
    else run.owned = [...run.owned.filter((o) => o.blessing.slot === 'passif' || o.blessing.slot !== c.blessing.slot), { blessing: c.blessing, rarity: c.rarity }];
    ui.hud.setBlessings(run.owned.map((o) => o.blessing));
    const p = BLESSINGS.patrons[c.blessing.patron];
    ui.hud.toast(c.blessing.name, `${p.icon} ${BLESSINGS.rarities[c.rarity].name}`, p.color);
    if (duo) setTimeout(() => ui.hud.toast('⚭ Duo débloqué', duo.name, '#f6dca4'), 600);
    run.wave++; run.waveT = 0; run.waveLen = Math.min(60, 35 + run.wave * 3);
    saveRun();
    ui.hud.banner(`Vague ${run.wave}`, run.wave % 5 === 0 ? 'Le Juge Pourpre approche' : 'Ils sont plus nombreux', run.wave % 5 === 0 ? '#ff6f7d' : undefined);
  };
  ui.pauseInfo = () => ({ hero, owned: run.owned, wave: run.wave });
  ui.onQuitRun = () => endRun();

  // ── Événements de la scène → HUD ────────────────────────────
  game.events.on('enemy:killed', () => {
    if (!ui.inRun) return;
    run.kills++; run.gold += 3 + Math.floor(ui.hud.comboValue / 10); ui.hud.addKill(); ui.hud.setGold(run.gold);
    if (run.kills % 12 === 0) { run.shards++; ui.hud.setShards(run.shards); }
    run.mana = Math.min(run.manaMax, run.mana + 2);
    ui.tutorial.notify('kill');
  });
  game.events.on('player:hurt', (e) => {
    if (!ui.inRun) return;
    run.hp = e.hp; run.max = e.max;
    ui.settings.vibrate(30);
    if (e.hp <= 0) endRun();
  });
  game.events.on('player:dash', () => { run.cds[4] = 0.7; ui.tutorial.notify('dash'); });

  // ── Simulation par pas fixe (enveloppe scenes.update) ───────
  const update = game.scenes.update.bind(game.scenes);
  game.scenes.update = (dt: number) => {
    update(dt);
    if (!ui.inRun || run.ending) return;
    const inp = game.input;
    run.time += dt;
    if (Math.hypot(inp.move.x, inp.move.y) > 0.3) ui.tutorial.notify('move', dt);
    if (inp.held('attack')) { ui.tutorial.notify('attack', dt); if (run.cds[0] <= 0) run.cds[0] = HERO_INFO[hero].skills[0].cd; }
    for (let i = 1; i <= 3; i++) {
      if (!inp.pressed(`skill${i}` as 'skill1')) continue;
      const s = HERO_INFO[hero].skills[i];
      if (run.cds[i] > 0 || run.mana < s.cost) { ui.hud.toast(run.cds[i] > 0 ? 'En recharge' : 'Mana insuffisant', s.name, '#8fd8ff'); continue; }
      run.cds[i] = s.cd; run.mana -= s.cost; game.camera.shake(i === 3 ? 0.5 : 0.2);
      ui.tutorial.notify('skill');
    }
    run.mana = Math.min(run.manaMax, run.mana + dt * 6);
    run.cds = run.cds.map((c) => Math.max(0, c - dt));
    run.waveT += dt;
    if (run.waveT >= run.waveLen) { run.waveT = 0; ui.tutorial.waveCleared(); void offer(); }
  };
  // Affichage par frame.
  const frame = () => {
    if (ui.inRun) {
      ui.hud.setVitals({ hp: run.hp, max: run.max, mana: run.mana, manaMax: run.manaMax, shield: run.owned.some((o) => o.blessing.patron === 'veilleurs') ? 12 : 0 });
      run.cds.forEach((c, i) => ui.hud.setCooldown(i, c, i === 4 ? 0.7 : HERO_INFO[hero].skills[i].cd));
      const left = Math.ceil(run.waveLen - run.waveT);
      ui.hud.setWave(run.wave, run.waveT / run.waveLen, `Contrat : <em>${Math.min(run.kills, 30)}/30</em> éliminations · ${left} s`);
    }
    requestAnimationFrame(frame);
  };
  frame();

  // ── Démarrage (écran demandé par l'URL pour les captures) ──
  await game.scenes.switch(new DemoScene(hero));
  game.renderer.layers.hud.visible = false;
  game.start();
  const screen = params.get('screen') ?? 'title';
  if (screen === 'title') showTitle();
  else if (screen === 'sanctuary') showSanctuary();
  else {
    await startRun(hero);
    ui.tutorial.stop();
    if (screen === 'offer') {
      run.owned = [{ blessing: BLESSINGS.blessings.find((b) => b.patron === 'lune')!, rarity: 'rare' }, { blessing: BLESSINGS.blessings.find((b) => b.patron === 'sang')!, rarity: 'commun' }];
      ui.hud.setBlessings(run.owned.map((o) => o.blessing));
      run.wave = 3; void offer();
    } else if (screen === 'end') { run.wave = 6; run.kills = 87; run.time = 412; endRun(); }
    else if (screen === 'settings') ui.openSettings();
    else if (screen === 'pause') ui.togglePause();
    else if (screen === 'tuto') ui.tutorial.start(ui.currentDevice);
  }
}

boot().catch((err) => {
  console.error(err);
  const l = document.getElementById('loading');
  if (l) l.textContent = `Erreur de démarrage : ${err.message}`;
});
