# Audio (agent 7)

Tout est synthétisé en WebAudio (aucun fichier à charger), sauf la lyre du Sanctuaire
(`music-lyre-akar`, extraite du prototype). Écoute : `tools/audio-lab/build.sh` puis
ouvrir `tools/audio-lab/dist/salle-ecoute.html`.

| Fichier | Rôle |
|---|---|
| `AudioEngine.ts` | contexte, bus `master / music / sfx / ambience / ui`, volumes, réverb, ducking, pause assourdie |
| `Music.ts` | ordonnanceur (nœuds créés ~0,3 s à l'avance), enchaînement à la mesure, couches selon l'intensité |
| `themes.ts` | partitions : 4 biomes, 3 boss, Sanctuaire ; `biomeForWave`, `bossThemeForWave` |
| `Sfx.ts` | ~50 bruitages (limite de voix, variation de hauteur, stéréo) ; `lootSound(rareté)` |
| `Ambience.ts` | fonds sonores par biome (vent, brume, crypte, faille, sanctuaire) |
| `index.ts` | `GameAudio.attach(game, { hero })` : branche tout sur `game.events` |

## Musique

| Vagues | Thème | Boss |
|---|---|---|
| 1–3 | Citadelle en ruine | vague 5 : Le Juge Pourpre |
| 4–7 | Forêt des Brumes | vague 10 : Gardien du Sceau lunaire |
| 8–10 | Crypte des Offrandes | 15 / 20 : L'Éclipse |
| 11+ | Faille de la Lune brisée | |

L'intensité (0..1) monte avec les coups, morts et PV bas, redescend au calme, reste ≥ 0,75 en boss.
Les percussions puis cors/chœurs entrent par couches.

## Événements écoutés

Déjà émis par la démo : `player:shoot` (champ `hero` facultatif), `player:dash`, `enemy:hit`,
`enemy:killed` (`kind` contenant « elite » → son d'élite), `player:hurt`, `game:pause`.

**À émettre par le gameplay / l'UI** (types dans `AudioEvents`, tous facultatifs) :
`run:start {hero, wave}`, `wave:start {wave, boss?}`, `wave:clear`, `boss:spawn {wave, id?}`,
`boss:phase`, `boss:killed {wave}`, `loot:drop {rarity, x, y}` (raretés de `loot.json`),
`loot:pickup`, `currency:pickup`, `blessing:offer`, `blessing:pick {rarity: common|rare|epic|heroic}`,
`player:levelup`, `player:heal`, `player:shield`, `player:skill {slot 0–3}`, `player:crit {x,y}`,
`run:victory`, `run:defeat`, `sanctuary:enter`, `menu:enter`, `ui:sound {id}` (ex. `ui_click`, `ui_hover`, `ui_open`, `buy`).

## Volumes (UI / sauvegarde)

`audio.setVolume('music', 0.4)`, `audio.setMuted(true)`, `audio.settings`.
Persistance locale `localStorage['shadow-chronicles.audio']` ; si la sauvegarde gère les réglages :
`audio.engine.persist = false` et `audio.engine.onSettingsChange = (s) => …`, puis `audio.engine.update(s)` au chargement.
