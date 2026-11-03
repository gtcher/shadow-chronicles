import type { SettingsStore, Settings } from '../ui/settings';
import type { GameAudio } from './audio';
import type { Vfx } from './vfx/Vfx';
import { aimAssist } from './combat/hero';

/**
 * Applique les réglages joueur (src/ui/settings) aux systèmes du jeu.
 * Sans ce lien, les curseurs de l'écran Réglages ne changeaient que l'affichage.
 */

/** Son : volume général, musique, effets (bruitages + interface), ambiance, coupure. */
export function applyAudioSettings(audio: GameAudio, s: Readonly<Settings>): void {
  audio.engine.update({
    master: s.masterVolume, music: s.musicVolume, sfx: s.sfxVolume, ui: s.sfxVolume, ambience: s.ambienceVolume, muted: s.muted,
  });
}

export function linkAudioSettings(store: SettingsStore, audio: GameAudio): () => void {
  // Les réglages de l'UI font foi : l'audio ne garde plus sa propre copie dans localStorage.
  audio.engine.persist = false;
  let lastPreview = 0;
  return store.onChange((s, key) => {
    applyAudioSettings(audio, s);
    // Un petit son quand on règle les effets, pour entendre le niveau choisi.
    if ((key === 'sfxVolume' || key === 'masterVolume') && audio.engine.ready && performance.now() - lastPreview > 150) {
      lastPreview = performance.now();
      audio.sfx.play('ui_click');
    }
  });
}

/** Gameplay : visée assistée (tactile / manette). */
export function applyGameplaySettings(s: Readonly<Settings>): void { aimAssist.on = s.autoAim; }

/** Effets visuels : flashs plein écran et chiffres de dégâts (la secousse passe déjà par la caméra). */
export function applyVfxSettings(vfx: Vfx, s: Readonly<Settings>): void {
  vfx.settings.flashes = s.flashes;
  vfx.settings.damageNumbers = s.damageNumbers;
  // La secousse est déjà multipliée par le réglage dans UiRoot (camera.shake) : vfx.settings.shake reste à 1.
  vfx.applySettings();
}
