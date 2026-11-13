import * as shaders from '@engine/render/shaders';
import { Game } from '@engine';
import { startApp } from '@game/flow';
// Pixi enregistre ses « pipes » de rendu (TilingSprite, Text, BitmapText, Graphics…) à l'import du
// module. La run étant chargée à la demande, on les importe ici pour que le moteur de rendu les
// connaisse dès sa création (sinon : « reading 'validateRenderable' » au premier affichage).
import 'pixi.js/sprite-tiling';
import 'pixi.js/text';
import 'pixi.js/text-bitmap';
import 'pixi.js/graphics';
import 'pixi.js/mesh';
import 'pixi.js/filters';
import type { HeroId } from '@game/components';
import type { GameEvents } from '@game/events';
import { GameAudio } from '@game/audio';
import { initPwa } from './pwa';
import { blockPageZoom } from './ui/noZoom';
import { linkAudioSettings } from '@game/settingsLink';
import type { UiRoot } from './ui';

/**
 * Démarrage : moteur → assets → scène.
 * `?hero=mei|sena|ren|taro` choisit le héros, `?wave=10` commence à une vague (ex. un boss),
 * `?demo` lance l'ancienne scène de démonstration du moteur. Sans paramètre : écran titre (UI).
 */
async function boot(): Promise<void> {
  const host = document.getElementById('app')!;
  const bar = document.getElementById('loading-bar')!;
  const game = await Game.create<GameEvents>(host);
  await game.assets.loadManifest();
  // Direction artistique : tuiles et décors des 4 chapitres (arène), fonds peints des menus (DOM).
  await game.assets.loadManifest('assets/da-manifest.json', { preload: false });
  await game.assets.loadManifest('assets/art/art-manifest.json', { preload: false });
  const arena = [...game.assets.keys('tiles-'), ...game.assets.keys('decor-ch')];
  const keys = game.assets.keys().filter((k) => !/^(tiles-|decor-|sprites-|menu-|select-)/.test(k)).concat(arena);
  await game.assets.loadImages(keys, (p) => (bar.style.width = `${Math.round(p * 100)}%`));

  const param = new URLSearchParams(location.search).get('hero');
  const hero: HeroId = (['taro', 'mei', 'sena', 'ren'] as const).find((h) => h === param) ?? 'taro';
  const params = new URLSearchParams(location.search);
  const wave = Math.max(1, Math.min(99, Number(params.get('wave')) || 1));
  // ?demo : scène du moteur ; ?hero= / ?wave= : directement en run ; sinon écran titre.
  // Tests / équilibrage : ?seed=123 fixe l'aléatoire de la run, ?bot (ou ?bot=0.5) laisse jouer le robot.
  if (params.has('seed')) (await import('@game/scenes/RunScene')).RunScene.seed = Number(params.get('seed')) || 1;
  let ui: UiRoot | null = null;
  // Combattants : cuisson en arrière-plan (worker) dès maintenant, envoi au GPU dès qu'ils sont prêts.
  // (module chargé à part, comme toute la run : l'écran titre n'attend pas ce code).
  const rig = import('@game/rig/roster').then(({ prewarmHeroes, rigBaker }) => {
    rigBaker.upload = (src) => (game.renderer.app.renderer as unknown as { texture?: { initSource?: (s: unknown) => void } }).texture?.initSource?.(src);
    prewarmHeroes(hero ?? undefined);
    (window as unknown as { rigBaker: typeof rigBaker }).rigBaker = rigBaker;
  });
  if (params.has('hero') || params.has('wave')) await rig;
  if (params.has('demo')) await game.scenes.switch(new (await import('@game/scenes/DemoScene')).DemoScene(hero));
  else ui = await startApp(game, { hero, wave, skipTitle: params.has('hero') || params.has('wave') });
  // L'écran de chargement reste par-dessus jusqu'à ce que le menu soit prêt (fond peint décodé,
  // fondu d'entrée joué) : on ne voit plus la run de fond démarrer avant le menu.
  await revealWhenReady();
  if (params.has('bot')) {
    const skill = Math.max(0, Math.min(1, Number(params.get('bot')) || 0.85));
    const [{ Bot }, { RunScene }] = await Promise.all([import('@game/bot/Bot'), import('@game/scenes/RunScene')]);
    (window as unknown as { bot: unknown }).bot = Bot.attach(game, skill, RunScene.seed ?? 1);
  }
  game.start();
  // Fonds peints des sous-menus : chargés et décodés pendant que le joueur est sur l'écran titre,
  // pour qu'ils soient déjà là au premier fondu (sinon l'écran apparaissait un instant sans fond).
  const warm = () => { for (const k of ['sanctuary', 'codex']) { try { const im = new Image(); im.src = game.assets.url(k); void im.decode().catch(() => {}); } catch { /* manifest ancien */ } } };
  if ('requestIdleCallback' in window) requestIdleCallback(warm, { timeout: 3000 }); else setTimeout(warm, 1500);
  // Audio : se débloque au premier clic / touche (règle des navigateurs). Console : window.audio
  const audio = GameAudio.attach(game, { hero });
  (window as unknown as { audio: unknown }).audio = audio;
  // Curseurs Son de l'écran Réglages → volumes réels.
  if (ui) linkAudioSettings(ui.settings, audio);

  // Le code de la run se télécharge pendant que le joueur est sur l'écran titre.
  setTimeout(() => { void import('@game/scenes/RunScene'); }, 800);

  // Accès console pour le débogage : window.game
  (window as unknown as { game: unknown }).game = game;
  // Infrastructure de shaders (tests e2e, essais en console).
  (window as unknown as { scShaders: unknown }).scShaders = shaders;
}

/** Retire l'écran de chargement une fois le premier écran (menu ou run) prêt à être vu. */
async function revealWhenReady(): Promise<void> {
  const loading = document.getElementById('loading');
  if (!loading) return;
  const art = document.querySelector<HTMLElement>('#sc-ui .sc-screen .sc-bgart, #sc-ui .sc-screen.sc-bg');
  const url = art ? /url\(["']?([^"')]+)/.exec(getComputedStyle(art).backgroundImage)?.[1] ?? art.querySelector('img')?.src : undefined;
  const decoded = url ? (() => { const im = new Image(); im.src = url; return im.decode().catch(() => {}); })() : Promise.resolve();
  await Promise.race([decoded, new Promise((r) => setTimeout(r, 1500))]);
  // Fondu d'entrée du menu (~0,25 s) joué sous le voile, puis le voile s'efface.
  await new Promise((r) => setTimeout(r, 300));
  loading.style.opacity = '0';
  loading.style.pointerEvents = 'none';
  setTimeout(() => loading.remove(), 350);
}

blockPageZoom(); // pas de zoom de la page sur mobile (pincement, double appui)
initPwa(); // service worker, installation, mises à jour (production seulement)
boot().catch((err) => {
  console.error(err);
  document.getElementById('loading')!.textContent = `Erreur de démarrage : ${err.message}`;
});
