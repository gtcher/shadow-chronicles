import { Game } from '@engine';
import { DemoScene } from '@game/scenes/DemoScene';
import { startApp } from '@game/flow';
import type { HeroId } from '@game/components';
import type { GameEvents } from '@game/events';
import { GameAudio } from '@game/audio';
import { initPwa } from './pwa';
import { Bot } from '@game/bot/Bot';
import { RunScene } from '@game/scenes/RunScene';

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
  await game.assets.loadImages(undefined, (p) => (bar.style.width = `${Math.round(p * 100)}%`));
  document.getElementById('loading')!.remove();

  const param = new URLSearchParams(location.search).get('hero');
  const hero: HeroId = (['taro', 'mei', 'sena', 'ren'] as const).find((h) => h === param) ?? 'taro';
  const params = new URLSearchParams(location.search);
  const wave = Math.max(1, Math.min(99, Number(params.get('wave')) || 1));
  // ?demo : scène du moteur ; ?hero= / ?wave= : directement en run ; sinon écran titre.
  // Tests / équilibrage : ?seed=123 fixe l'aléatoire de la run, ?bot (ou ?bot=0.5) laisse jouer le robot.
  if (params.has('seed')) RunScene.seed = Number(params.get('seed')) || 1;
  if (params.has('demo')) await game.scenes.switch(new DemoScene(hero));
  else await startApp(game, { hero, wave, skipTitle: params.has('hero') || params.has('wave') });
  if (params.has('bot')) {
    const skill = Math.max(0, Math.min(1, Number(params.get('bot')) || 0.85));
    (window as unknown as { bot: Bot }).bot = Bot.attach(game, skill, RunScene.seed ?? 1);
  }
  game.start();
  // Audio : se débloque au premier clic / touche (règle des navigateurs). Console : window.audio
  (window as unknown as { audio: unknown }).audio = GameAudio.attach(game, { hero });

  // Accès console pour le débogage : window.game
  (window as unknown as { game: unknown }).game = game;
}

initPwa(); // service worker, installation, mises à jour (production seulement)
boot().catch((err) => {
  console.error(err);
  document.getElementById('loading')!.textContent = `Erreur de démarrage : ${err.message}`;
});
