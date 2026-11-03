/**
 * Pont UI ↔ sauvegarde (src/save, agent 8).
 *  - réglages : les champs communs (texte, contraste, animations, chiffres, volumes, tutoriel) sont
 *    recopiés dans `save.settings` ; les réglages propres à l'UI (daltonisme, gaucher, taille des
 *    boutons…) restent dans localStorage `sc-settings-v1` en attendant un champ dédié du profil.
 *  - Sanctuaire : achats via `buyUpgrade` / `unlockBuilding` (fonctions pures de progress.ts).
 *  - Export / import fichier et reprise d'expédition.
 */
import { buyUpgrade, unlockBuilding, statValue, ImportError, type SaveManager, type Profile, type ImportPreview } from '../save';
import type { UiRoot } from './UiRoot';
import type { MetaProfile } from './screens/Sanctuary';

export interface SaveTools {
  exportFile: () => Promise<void>;
  preview: (f: File) => Promise<ImportPreview>;
  apply: (p: ImportPreview) => Promise<boolean>;
  status: () => string;
}

export function metaFromProfile(p: Profile): MetaProfile {
  const ranks: Record<string, number> = {};
  for (const [b, ups] of Object.entries(p.sanctuary)) for (const [u, r] of Object.entries(ups)) ranks[`${b}.${u}`] = r;
  return { wallet: { ...p.currencies }, ranks, unlocked: [...p.buildingsUnlocked], stats: { bestWave: statValue(p, 'bestWave'), runs: statValue(p, 'runs') } };
}

export function connectSave(ui: UiRoot, save: SaveManager): void {
  const st = ui.settings;
  const s = save.settings;
  // 1. La sauvegarde fait foi pour les champs communs.
  st.set('textScale', s.accessibility.textScale);
  st.set('highContrast', s.accessibility.highContrast);
  st.set('reduceMotion', s.accessibility.reducedMotion);
  st.set('damageNumbers', s.video.damageNumbers);
  st.set('musicVolume', s.audio.music);
  st.set('sfxVolume', s.audio.sfx);
  st.set('tutorialDone', s.tutorialDone);
  if (!s.video.screenShake) st.set('shake', 0);
  // 2. Puis chaque changement de l'UI est recopié.
  st.onChange((v, k) => {
    if (k === null) return;
    save.updateSettings((x) => {
      x.accessibility.textScale = v.textScale;
      x.accessibility.largeText = v.textScale >= 1.2;
      x.accessibility.highContrast = v.highContrast;
      x.accessibility.reducedMotion = v.reduceMotion;
      x.accessibility.bigTap = v.touchScale >= 1.15;
      x.video.damageNumbers = v.damageNumbers;
      x.video.screenShake = v.shake > 0;
      x.audio.music = v.musicVolume;
      x.audio.sfx = v.sfxVolume;
      x.tutorialDone = v.tutorialDone;
    });
  });

  ui.saveTools = {
    exportFile: () => save.download(),
    preview: async (f) => {
      try { return await save.previewImport(f); } catch (e) { throw new Error(e instanceof ImportError ? e.message : 'Fichier illisible.'); }
    },
    apply: async (p) => { const ok = await save.applyImport(p); if (ok) location.reload(); return ok; },
    status: () => {
      const x = save.status;
      if (x.readOnly) return 'Lecture seule : sauvegarde plus récente que le jeu.';
      if (x.lastError) return `Erreur d'écriture : ${x.lastError}`;
      if (x.storage === 'memory') return 'Stockage indisponible : la progression ne sera pas gardée. Exporte un fichier.';
      return `Sauvegarde automatique dans ce navigateur${x.persisted ? ' (protégée)' : ''}. Exporte un fichier pour la garder ailleurs.`;
    },
  };

  if (save.importedFromPrototype) {
    const i = save.importedFromPrototype;
    setTimeout(() => ui.hud.toast('Progression du prototype reprise', `${i.eclats} ✦ · record vague ${i.bestWave}`, '#d9ab74'), 800);
  }
}

/** Callbacks d'achat du Sanctuaire branchés sur la sauvegarde. */
export function sanctuaryActions(save: SaveManager, refresh: (m: MetaProfile) => void) {
  return {
    onBuy: (b: { id: string }, u: { id: string }) => {
      const r = save.update((p) => buyUpgrade(p, b.id, u.id));
      if (r.ok) refresh(metaFromProfile(save.profile));
      return r.ok;
    },
    onUnlock: (b: { id: string }) => {
      const r = save.update((p) => unlockBuilding(p, b.id));
      if (r.ok) refresh(metaFromProfile(save.profile));
      return r.ok;
    },
  };
}
