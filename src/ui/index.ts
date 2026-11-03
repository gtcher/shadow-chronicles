/** Interface (agent 6 · UI / mobile). Voir src/ui/README.md. */
export { mountUI, UiRoot } from './UiRoot';
export { Hud, type Vitals } from './Hud';
export { TouchControls } from './TouchControls';
export { Tutorial, type TutoEvent } from './Tutorial';
export { SettingsStore, DEFAULT_SETTINGS, STORAGE_KEY, type Settings } from './settings';
export type { OfferChoice, OfferOptions } from './screens/BlessingOffer';
export type { MetaProfile, SanctuaryOptions } from './screens/Sanctuary';
export type { RunEndOptions } from './screens/RunEnd';
export type { TitleOptions } from './screens/Title';
export * from './data';
export { connectSave, metaFromProfile, sanctuaryActions, type SaveTools } from './saveBridge';
