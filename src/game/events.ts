import type { EngineEvents } from '@engine';

/**
 * Événements de jeu : point de branchement des autres agents
 * (audio : sons ; UI : barres de vie, compteurs ; sauvegarde : stats ; succès…).
 * Les champs marqués `?` sont remplis par le combat (RunScene) ; DemoScene ne les remplit pas.
 * Compatibles avec `AudioEvents` (src/game/audio/index.ts) : mêmes noms, mêmes types de champs.
 *
 * Convention : dans les événements `boss:*`, `id` est l'identifiant du boss (« captain »…),
 * `entity` le numéro d'entité ECS.
 */
export interface GameEvents extends EngineEvents {
  'enemy:hit': { id: number; x: number; y: number; damage: number; crit?: boolean; kind?: string; guarded?: boolean; skill?: number };
  'enemy:killed': { id: number; kind: string; x: number; y: number; elite?: boolean; boss?: boolean; wave?: number };
  'elite:killed': { x: number; y: number; kind?: string };
  /** Un ennemi déclenche son attaque (après le télégraphe). */
  'enemy:attack': { id: number; kind: string; attack: string; x: number; y: number };
  'enemy:summon': { kind: string; x: number; y: number };
  'enemy:spawn': { id: number; kind: string; x: number; y: number; elite: boolean };
  'player:hurt': { hp: number; max: number; damage: number; status?: string; shieldAbsorbed?: number };
  'player:heal': { hp?: number; max?: number; amount?: number; potions?: number };
  'player:shield': Record<string, never>;
  'player:crit': { x: number; y: number };
  'player:dash': { x: number; y: number };
  /** Esquive parfaite : une attaque évitée pendant les 0,24 premières secondes de l'esquive. */
  'player:perfect-dodge': { x: number; y: number; streak: number };
  'player:shoot': { x: number; y: number; dirX: number; dirY: number; hero?: string };
  /** `slot` 0 = attaque de base … 3 = ultime. */
  'player:skill': { slot: number; hero?: string; name?: string; kind?: string; x?: number; y?: number };
  'player:status': { status: string; time: number };
  'player:died': { hero: string; wave: number; kills: number; time: number; bossesKilled: number };
  'combo': { count: number; best: number };
  'run:start': { hero?: string; wave?: number };
  'run:victory': Record<string, never>;
  'run:defeat': Record<string, never>;
  'wave:start': { wave: number; boss?: boolean; bossId?: string | null; region?: number; regionName?: string; theme?: string; enemies?: number };
  /** Fin de vague. Mettre `RunScene.holdIntermission = true` pour afficher un choix (bénédictions) puis appeler `RunScene.nextWave()`. */
  'wave:clear': { wave: number; time?: number; kills?: number; damageTaken?: number };
  'boss:spawn': { wave: number; id?: string; name?: string; entity?: number; subtitle?: string; maxHp?: number };
  'boss:phase': { phase: number; id?: string; entity?: number; name?: string };
  'boss:attack': { id: string; entity: number; phase: number; step: number };
  'boss:killed': { wave: number; id?: string; entity?: number; x?: number; y?: number; time?: number };
  /** Objet au sol. `rarity` = clé de loot.json (common … ancestral). */
  'loot:drop': { rarity: string; x: number; y: number; slot?: string; name?: string };
  /** Objet ramassé : équipé ou démantelé (poussière d'étoile). */
  'loot:pickup': { rarity: string; slot?: string; name?: string; equipped?: boolean; dust?: number };
  'currency:pickup': { currency?: string; amount?: number };
  'blessing:offer': { wave?: number; count?: number };
  /** `rarity` au format audio : common | rare | epic | heroic. */
  'blessing:pick': { rarity: string; id?: string; patron?: string; duo?: boolean; legendary?: boolean };
  'achievement:unlock': { id: string; name: string; tier: string };
}
