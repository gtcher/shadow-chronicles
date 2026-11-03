# Architecture du moteur

```
game/
├── index.html               page hôte (écran de chargement)
├── public/assets/           assets extraits du prototype (46 fichiers) + manifest.json
│   ├── heroes/  enemies/  portraits/  skills/  items/  environment/  ui/  audio/
│   └── manifest.json        { "hero-taro": "assets/heroes/hero-taro.png", … }
├── tools/extract_assets.py  extraction base64 → fichiers (rejouable)
├── src/
│   ├── main.ts              démarrage : Game → assets → scène
│   ├── engine/              MOTEUR — générique, sans règle de jeu
│   │   ├── index.ts         façade : `import { … } from '@engine'`
│   │   ├── core/Game.ts     regroupe tout ; pause, hit-stop, stats
│   │   ├── core/FixedLoop.ts  boucle à pas fixe 60 Hz + interpolation
│   │   ├── core/EventBus.ts   bus d'événements typé
│   │   ├── ecs/World.ts       entités / composants / systèmes
│   │   ├── ecs/components.ts  Transform, Velocity, Collider, Layers, Lifetime, CameraTarget
│   │   ├── physics/           SpatialHash, shapes (cercle/rect), MovementSystem, PhysicsSystem
│   │   ├── camera/Camera.ts   suivi amorti, anticipation, zone morte, zoom, secousse, limites
│   │   ├── input/             Input (clavier, souris, tactile, manette) + bindings (actions)
│   │   ├── assets/AssetStore.ts  manifest → textures Pixi / URL audio
│   │   ├── render/Renderer.ts    application Pixi + couches
│   │   ├── render/View.ts        lien entité ↔ objet Pixi (interpolation, tri y, culling)
│   │   ├── math/              Vec2, lerp/damp/clamp, Rng (aléatoire à graine)
│   │   └── scene/Scene.ts     scènes + pile (pause, menus par-dessus)
│   └── game/                JEU — démo actuelle, à remplacer/étendre par l'agent gameplay
│       ├── components.ts    Player, Enemy, Health, Projectile, HEROES
│       ├── events.ts        GameEvents : contrat avec audio / UI / sauvegarde
│       ├── prefabs.ts       spawnHero, spawnEnemy, spawnBolt, ENEMY_TYPES
│       ├── textures.ts      textures procédurales + makeSeamless (sol raccordable)
│       ├── Particles.ts     particules visuelles avec réserve d'objets
│       ├── arena/ChapterArena.ts  décor de l'arène par chapitre (tuiles, décors, braseros, ambiance)
│       └── scenes/DemoScene.ts
└── tests/engine.test.ts     13 tests (boucle, ECS, collisions, caméra, rng, bus)
```

Règle : `src/engine` ne dépend jamais de `src/game`.

## Cycle d'une frame

```
requestAnimationFrame
└─ FixedLoop.advance(now)
   ├─ 0..5 × tick(1/60 s)          ← simulation déterministe
   │   ├─ input.poll()             fronts « pressed/released » valables 1 pas
   │   ├─ scenes.update(dt)        → world.update(dt) → systèmes par priorité
   │   └─ camera.update(dt)
   └─ frame(alpha)                 ← une fois par image affichée
       ├─ scenes.render(alpha)     syncViews (interpolation), animations, particules
       └─ renderer.draw(camera)    applique la caméra puis app.render()
```

- **Ne jamais** modifier l'état du jeu dans `render()` : seulement des visuels.
- `game.loop.timeScale` ralentit la simulation ; `game.hitStop(0.06)` gèle un instant (impact).

## ECS en 30 secondes

```ts
import { defineComponent, SystemPriority, Transform } from '@engine';
export const Burning = defineComponent<{ dps: number; t: number }>('Burning');

world.add(e, Burning, { dps: 4, t: 3 });
world.addSystem({
  name: 'burning', priority: SystemPriority.Gameplay,
  update(w, dt) {
    for (const e of w.query(Burning, Health)) { /* … */ if ((w.get(e, Burning)!.t -= dt) <= 0) w.remove(e, Burning); }
  },
});
```

Priorités : Input 0 · AI 100 · Gameplay 200 · Movement 300 · Physics 400 · PostPhysics 500 · Cleanup 1000.
`world.destroy(e)` est différé à la fin du pas (sûr pendant une boucle).

## Collisions

- Cercles uniquement pour les entités (`Collider.radius`, placé aux **pieds** ; le visuel est dessiné au-dessus).
- `layer` / `mask` en bits (`Layers.Player`, `Enemy`, `PlayerShot`, `EnemyShot`, `Pickup`, `Wall`).
- `solid: true` → poussée réciproque pondérée par `mass` (`Infinity` = immobile). `solid: false` → déclencheur.
- Obstacles statiques : `physics.walls.push({ x, y, w, h })` ; limites : `physics.bounds`.
- Contacts : `physics.onContact = (c, world) => …` ou lire `physics.contacts` (pas courant).
- Requêtes de zone : `physics.overlapCircle(world, x, y, r, Layers.Enemy)` (explosions, aimant à butin).

## Caméra

`camera.follow(transform, velocity)`, `camera.shake(0.1 … 0.6)`, `camera.targetZoom`, `camera.bounds`,
`camera.screenToWorld(x, y)`, `camera.visibleRect(marge)` (apparition hors écran, culling).

## Entrées

Actions (`input/bindings.ts`) : up, down, left, right, attack, dash, skill1–4, interact, pause, map, inventory, debug.
`input.move` (vecteur ≤ 1), `input.aim` (après `input.updateAim(...)`), `held / pressed / released(action)`,
`input.lastDevice` pour afficher les bonnes icônes. Les touches sont des codes physiques : ZQSD AZERTY fonctionne.
Mobile : `input.setVirtualMove(x, y)` pour un joystick virtuel et `input.trigger('dash')` pour un bouton.
Reconfiguration : modifier `input.bindings` (à sauvegarder par l'agent sauvegarde).

## Rendu

Couches monde (suivent la caméra) : `background, ground, decals, shadows, entities (triée par y), fx, overlay`.
Couches écran : `screenFx, hud, debug`. Ajouter un visuel à une entité : `attachView(world, renderer, e, node, 'entities')`.

## Événements (`src/game/events.ts`)

`enemy:hit`, `enemy:killed`, `player:hurt`, `player:dash`, `player:shoot`, plus `game:pause`, `game:resize`.
Exemple audio : `game.events.on('enemy:killed', e => sfx.play('kill', e.x, e.y))`.

## Assets

`game.assets.texture('enemy-wolf')`, `game.assets.keys('skill-mei-')`, `game.assets.url('music-lyre-akar')`.
Note : les clés « item-*.webp » du prototype étaient en fait des PNG ; l'extension suit le vrai format.
`environment/shrine-ruins` et `ui/ui-modal-bg` sont des illustrations opaques (fonds d'écran), pas des sprites.

## Pour chaque agent

| Agent | Point d'entrée |
|---|---|
| Rendu / VFX | **fait** : `src/game/vfx/` (voir section « Rendu / VFX » ci-dessous) |
| Direction artistique | `public/assets/`, `manifest.json` (ajouter les clés, garder le format) |
| Gameplay / progression | remplacer `DemoScene` par `RunScene`, composants et systèmes dans `src/game/` |
| UI / mobile | DOM par-dessus le canvas ou couche `hud` ; `input.setVirtualMove`, `input.trigger` ; `game.pauseOnAction = false` si l'UI gère la pause |
| Audio | s'abonner à `game.events`, URL via `game.assets.url()` |
| Sauvegarde | **fait** : `src/save/` (lire `src/save/README.md`) : `SaveManager.open()` au démarrage, `save.update(p => buyUpgrade(p, …))`, `save.saveRun(...)`, `recordRunEnd`, export/import |

## Rendu / VFX (`src/game/vfx/`)

Un seul objet à créer par scène ; il s'abonne seul aux événements `enemy:hit` (avec `crit?`),
`enemy:killed`, `player:hurt`, `player:dash`, `player:shoot`. **Le gameplay n'a qu'à émettre ces événements.**

```ts
import { Vfx } from '@game/vfx';
enter():  this.vfx = new Vfx(game, { bodyY: 46, heavyKinds: ['brute', 'shadeElite'] });
          this.vfx.follow(playerTransform, playerViewNode, heroColor);   // lumière + traînée de dash
render(): this.vfx.lighting.push(x, y, 130, color);  // lumière d'une frame (projectiles, butin)
          this.vfx.update(frameDt);
exit():   this.vfx.destroy();
```

| Brique | Rôle | API |
|---|---|---|
| `Lighting` | carte de lumière (multiply + glow additif) posée en tête de la couche `fx` : décor et persos assombris, particules/projectiles restent vifs | `lighting.add({x,y,radius,color,intensity,flicker})`, `flash(...)`, `push(...)`, `ambient` |
| `Bloom` | monde rendu à 20–25 %, seuil + flou, ajouté à l'écran | `bloom.strength`, `setThreshold()` |
| `Fog` | 1–2 nappes de brume dérivantes (sol + haute) | `fog.color`, `fog.density` |
| `FxParticles` | formes `glow`, `spark` (étirée), `smoke`, `ring` ; plafond selon qualité | `particles.emit(x, y, {...})` |
| `DamageNumbers` | chiffres bitmap élastiques, fusion des coups rapprochés | `numbers.show(x, y, v, 'normal'|'crit'|'heal'|'hurt', id)` |
| Effets prêts | | `vfx.explosion()`, `shockwave()`, `pickup()`, `heal()`, `flash()`, `setHealth(ratio)` (pulsation rouge < 30 %) |
| Qualité | `low/medium/high/auto` (auto = détection appareil + baisse si < 48 i/s) ; `?quality=low` dans l'URL | `vfx.setQuality(q)`, `vfx.onQualityChange` |
| Accessibilité | à exposer dans les options (UI) et sauvegarder | `vfx.settings.shake` (0–1), `.flashes`, `.damageNumbers` puis `vfx.applySettings()` |

Moteur (ajouts) : `renderer.onBeforeRender(fn)` (passes hors écran), `renderer.setResolution(r)`,
`camera.kick(dx, dy, force)` (à-coup directionnel en ressort), `camera.shakeScale`,
`game.hitStop()` cumulable (plus de conflit entre deux gels rapprochés).
`src/game/Particles.ts` (ancien) reste disponible mais n'est plus utilisé par la démo.

## Combat (agent Gameplay) — `src/game/combat/` + `scenes/RunScene.ts` + `flow.ts`

| Fichier | Rôle |
|---|---|
| `combat/data.ts` | 4 héros (16 techniques), 13 ennemis (5 types + 8 variantes régionales), 4 boss à 3 phases, régions, thèmes de vague |
| `combat/rules.ts` | règles pures testées : dégâts, plan des vagues, phases (68 % / 34 %), géométrie des zones |
| `combat/hero.ts` | contrôle du héros, techniques, esquive (2 charges, invulnérable 0,34 s), potion (touche 4 / F) |
| `combat/foes.ts` · `boss.ts` | IA : déplacement → télégraphe au sol → attaque → récupération ; motifs des boss par phase |
| `combat/hazards.ts` | zones télégraphiées (cercle, anneau, ligne, cône, croix) côté ennemi ou héros |
| `combat/waves.ts` | directeur de vagues : 1 → 20 (boss en 5/10/15/20) puis infini |
| `scenes/RunScene.ts` | la run : implémente `CombatCtx`, dégâts, contacts, Vfx, `snapshot()` pour l'UI |
| `combat/status.ts` | statuts ennemis de blessings.json : Givre (3 → Gel), Gel, Saignement, Poison, Choc, Marque |
| `combat/blessings.ts` | `BlessingEngine` : offres de fin de vague, emplacements, raretés, résonances 2/4/6, duos, légendaires, interprète du DSL d'effets |
| `combat/loot.ts` | `LootSystem` : tirages loot.json (normal, élite, coffre de boss), pitié, objets (ilvl, affixes), 17 pouvoirs légendaires, ramassage, équipement auto, démantèlement |
| `combat/stats.ts` | `RunStats` : compteurs de run versés à `recordRunEnd` (succès) |
| `modes.ts` | `RunMods` : Pactes de la Brume (11 contraintes, points, paliers), défi quotidien (graine cyrb53 + mulberry32 par flux, modificateurs, score, texte de partage), mode Cauchemar |
| `screens.ts` | écrans Défi du jour (présentation, résultat) et Pactes de la Brume, au style de src/ui |
| `achievements.ts` | évaluation des conditions d'achievements.json (run / vague / cumul) et « Presque… » de l'écran de fin |
| `flow.ts` | titre → run (HUD DOM, offre de bénédictions, toasts butin et succès) → écran de fin → Sanctuaire, avec la sauvegarde |

- **Esquive parfaite** : être touché pendant les 0,24 premières secondes d'une esquive → ralenti, charge rendue, +20 mana, recharges −0,6 s (`player:perfect-dodge`).
- **Puissance du héros** = base × Veillée du Sanctuaire + équipement + bénédictions (`RunScene.recomputeHero()`). Plus de bonus automatique par vague.
- **Dégâts** : `damageFoe` applique `bless.outgoing` (bonus, buffs), `consumeOnHit` (Marque, bris de Gel, Choc), le statut, puis les déclencheurs « au toucher » (bénédictions, pouvoirs légendaires) pour les coups directs seulement. Options : `dot`, `lightning`, `noProc` évitent les boucles.
- **Fin de vague** (`flow.ts`) : `holdIntermission`, 1,4 s plus tard `ui.offerBlessings` (relances de l'Autel), `bless.pick`, toasts duo / légendaire, succès, `nextWave()`. Le butin restant vole vers le héros.
- **Méta → run** : `runOptionsFromProfile(profile)` lit Veillée (PV, ATQ, DEF, critique, mana, potions), Autel (patrons, relances, chance) et Forge (chance de butin, ancestral).
- **Succès** : vérifiés en fin de vague et après `recordRunEnd`. `fastestBossKill` passe par `recordBest(…, lower)`. Le codex vient de `profile.unlocks.seen*`. Non suivis : contrats et routes (systèmes absents).
- **Or** : pièces au sol (aimant), relances payantes 40 / 80 / 160 × Marchand Avare, Pillard (affixe) et Fortune (Veillée). L'or reste dans la run.
- **Pactes** : débloqués par le boss de la vague 10 (`profile.pacts.unlocked`), choix gardé dans `localStorage['shadow-chronicles.pacts']`, +6 % d'éclats et +3 % de chance de butin par point, paliers donnés quand le boss de la vague 10 tombe avec ce total. Approximations : « Jugement Sévère » = PV des boss +30 %/rang ; « Feux Éteints » = soin de fin de vague 5 % ; « Marchand Avare » = relances plus chères.
- **Défi quotidien** : héros, mode, 10 vagues, 1 bonus + 2 malus, bénédiction de départ rare, Sanctuaire ignoré, flux `waves`, `blessings`, `loot` séparés. Premier essai noté via `recordDaily` (série, récompenses), les suivants = entraînement. `m_neg_marchand` sans effet (pas de routes).
- **Console / robot** : `window.sc` = { save, ui, title(), pacts(), daily() } ; `RunScene.seed = 123` fixe l'aléatoire d'une run normale.
- **Événements ajoutés** : `loot:drop`, `loot:pickup`, `blessing:offer`, `blessing:pick {rarity: common|rare|epic|heroic}`, `achievement:unlock`.
- URL de test : `?hero=sena&wave=10` (run directe, boss), `?demo` (ancienne démo). Console : `game.scenes.current.debugHitBoss(0.1)`, `debugHitAll(1)`.

## Tests et équilibrage (agent 10) — `src/game/bot/`, `tests/e2e/`, `tools/bot-*.mjs`

Détail et résultats : [docs/tests-equilibrage.md](docs/tests-equilibrage.md).

- **Robot joueur** `src/game/bot/Bot.ts` : joue par les entrées tactiles (joystick virtuel + boutons, visée assistée), sans triche. `skill` 0 → 1 règle le temps de réaction aux télégraphes, l'inattention, la fiabilité des esquives et la tendance à rester planté. Il choisit les bénédictions (clic sur `.sc-card`) et note une télémétrie par vague (durée, PV perdus, bouclier absorbé, coups, potions).
- URL : `?bot` (robot expert) ou `?bot=0.5`, `?seed=123` (aléatoire fixe). Exemple à regarder : `?hero=ren&seed=4&bot=0.6`.
- Console : `bot.runFast({ untilWave: 20 })` simule sans rendu (≈ 20 min de jeu en 20 s).
- `npm run bot -- --skill 0.3,0.6,0.9 --seeds 1,2,3,4,5 --out reports/x.json` puis `npm run bot:summary reports/x.json` (serveur `npm run preview` lancé avant).
- `npm run e2e` : build + Playwright (titre, run, pause, mort → fin → nouvelle run, 4 héros, 4 boss à 3 phases, ennemis « zombies », mobile, budget de perf → `reports/perf.json`).
- Leviers d'équilibrage : `combat/rules.ts` (`enemyScaling`, `enemyTempo`, `shieldCap`, `planWave`), `combat/data.ts` (héros, ennemis, boss), `data/*.json`.

## Combattants v2 (`src/game/rig/`)

Héros dessinés en piste A (« peint encré »), ennemis et boss en piste B (« ombres à contre-jour »), validés sur la planche `docs/planche-persos-v2/index.html`.

- `rig/draw.ts` : squelette animé en Canvas 2D, le même code que la planche (non typé, `@ts-nocheck`). Fiches dans `CAST`.
- `rig/atlas.ts` : cuisson d'un combattant en 50 images (idle 12, course 12, attaque 10, touché 4, mort 12), chaque image rognée au plus juste et rangée en étagères (`trim`/`orig` Pixi). Les boucles (idle, course) sont cuites avec `RIG.loop` : cape, lueurs et lames en orbite rebouclent sans saut.
- `rig/index.ts` : `rigBaker` (cache partagé entre les runs) cuit dans 1 ou 2 workers (`bake.worker.ts`, OffscreenCanvas) ; repli en petites tranches sur le fil principal. `rigBaker.request` = en arrière-plan, `rigBaker.now` = tout de suite (cas imprévu, compté dans `rigBaker.stats.sync`). Résolution selon l'écran (`bakeResolution`). Les variantes régionales recolorent le contre-jour avec leur `tint`.
- `rig/roster.ts` : qui cuire et quand. Les 4 héros dès le démarrage (`main.ts`), puis à l'entrée d'une run et à chaque vague les ennemis de la vague suivante et le prochain boss (`waveOrders`). **Ne jamais cuire à l'apparition** : 0,2 à 0,5 s de gel par type d'ennemi. Test : `tests/e2e/rig.spec.ts`.
- Flash blanc : 1re image de « touché » seulement, au plus une fois toutes les 0,3 s par ennemi ; la mort démarre après le flash (l'éclat vient des effets).
- `RunScene` choisit l'image : course ou idle selon la vitesse, attaque à chaque technique du héros ou calée sur la fenêtre `windup` des ennemis, touché sur dégâts, mort jouée par une dépouille (`spawnCorpse`).
- `?persos=v1` dans l'URL revient aux anciens sprites (comparaison).
