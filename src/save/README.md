# Sauvegarde (`src/save/`)

Module indépendant du moteur et du gameplay. Le jeu l'ouvre une fois au démarrage :

```ts
import { SaveManager, applyBindings, buyUpgrade, recordRunEnd } from '../save';

const save = await SaveManager.open();           // avant la première scène
game.input.bindings = applyBindings(save.settings.bindings);
if (save.importedFromPrototype) ui.toast(`Progression du prototype reprise : ${save.importedFromPrototype.eclats} ✦`);
if (save.run) offerResume(save.run);              // « Reprendre l'expédition (vague 6) ? »
```

## Trois documents versionnés

| Document | Contenu | Écrit quand |
|---|---|---|
| `profile` | monnaies, Sanctuaire, bâtiments, stats cumulées et records, succès, maîtrise, pitié du butin, Pactes, défi quotidien, cosmétiques, Coffre-Souvenir | `save.update(fn)` → écriture groupée ~1 s plus tard |
| `settings` | audio, qualité, accessibilité, équipement auto, touches modifiées, dernier héros | `save.updateSettings(fn)` |
| `run` | expédition en cours : graine, état des flux `Rng`, héros, mode, vague + `state` libre du gameplay | `await save.saveRun({...})` (fin de vague, pause, onglet caché) ; `clearRun()` à la mort |

Le gameplay définit le contenu de `run.state` et le versionne lui-même avec `stateVersion`.
Reprise exacte du hasard : `rng: { waves: rngWaves.seed, loot: rngLoot.seed }` puis `new Rng(run.rng.waves)`.

## Méta-progression (`progress.ts`)

Fonctions pures, chiffres lus dans `game/data/*.json` :

- `buyUpgrade(p, 'veillee', 'endurance')`, `unlockBuilding(p, 'forge')`, `nextUpgradeCost`, `isBuildingOpen`, `meetsRequirement('bestWave>=6')`
- `recordRunEnd(p, summary)` → prime de fin (1 ✦/vague, +5 si record), records, cumul des compteurs, XP de maîtrise ; renvoie les gains pour l'écran de fin
- `recordDaily(p, 'AAAA-MM-JJ', résultat)` → premier essai seulement, série, bougie de veille, paliers 3/7/14/30
- `unlockAchievement(p, id)` → une seule fois, récompense du palier + titre/cosmétique
- `addStat`, `recordBest`, `statValue` : le service de statistiques des succès (`stats.lifetime` = cumul, `stats.best` = meilleur dans une run)

Toujours via le gestionnaire : `const r = save.update(p => buyUpgrade(p, 'autel', 'reroll'))`.

## Sécurité des données

- **IndexedDB** (base `shadow-chronicles`, magasin `kv`), repli localStorage puis mémoire. Profil + réglages + run écrits dans une seule transaction.
- **Migrations** : `MIGRATIONS[doc][n]` passe de n à n+1 (voir `migrations.ts`). Une sauvegarde d'une version plus récente ouvre le jeu en **lecture seule** sans l'écraser.
- **Nettoyage** : toute donnée lue ou importée passe par `sanitize.ts` (types, bornes, rangs ≤ `maxRank`).
- **Copies de secours** : une par jour (5 gardées) + une avant chaque import, restauration ou remise à zéro. `listBackups()`, `restoreBackup(key)`.
- **Écriture forcée** sur `pagehide` / onglet caché ; **onglets multiples** synchronisés par `BroadcastChannel`.
- `navigator.storage.persist()` demandé au démarrage.

## Prototype H1.5.x

- **Automatique** au premier lancement si le jeu est servi sur la même origine que l'ancien `index.html` : clés `shadow-chronicles-akar-progression-v21`, `sc-v3-badges`, record, réglages. Les clés du prototype ne sont jamais modifiées.
- **Par fichier** : le bouton « Importer » accepte aussi l'export du prototype (`shadow-chronicles-v36-backup`).
- Correspondance : `sanctuary.json > migration`. L'expédition du prototype n'est pas reprenable (moteur différent) : elle est gardée dans `profile.legacy.run` et sa vague compte comme record.

## Export / import (pour l'écran Options)

```ts
await save.download();                                   // fichier shadow-chronicles-sauvegarde-AAAA-MM-JJ.json
const preview = await save.previewImport(file);          // lève ImportError avec un message prêt à afficher
confirm(`Importer : ${preview.summary.eclats} ✦, vague ${preview.summary.bestWave} ?`, preview.warnings);
await save.applyImport(preview);
```

Tests : `tests/save.test.ts` (migrations, import prototype, run, lecture seule, copies, fichier, Sanctuaire, quotidien).
