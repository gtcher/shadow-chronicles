# Tests et équilibrage — Shadow Chronicles (agent 10)

*3 novembre 2026. Mesures faites par le robot joueur sur un profil neuf (première run, sans Sanctuaire ni Pactes).*

## En bref

| | Avant | Après |
|---|---|---|
| Victoire (vague 20), débutant | 12 / 12 | **4 / 20 (20 %)** |
| Victoire, joueur moyen | 12 / 12 | **13 / 20 (65 %)** |
| Victoire, expert | 12 / 12 | **19 / 20 (95 %)** |
| PV perdus par vague, vagues 11 à 20 | 0 à 2 % | 22 à 52 % |
| Durée d'une run gagnée | 11 à 17 min | 14 à 21 min |
| Où l'on meurt | nulle part | Capitaine (v5), vagues 7-9, 13-15, Souverain (v20) |

Objectif retenu : la première run échoue souvent (on revient avec des éclats pour le Sanctuaire),
un joueur moyen gagne environ une fois sur deux, un expert presque toujours, et chaque boss est un vrai palier.

## Le robot joueur (`src/game/bot/Bot.ts`)

- Il joue avec les **mêmes entrées qu'un joueur tactile** (joystick virtuel, boutons, visée assistée). Aucune triche.
- Il lit les télégraphes au sol et les projectiles, choisit parmi 16 directions la plus sûre, tourne autour de sa cible
  à la bonne distance (mêlée ~95 px, Sena 320, Ren 360), esquive au dernier moment, boit une potion sous ~30 % PV,
  utilise ses techniques selon la situation et choisit une bénédiction au hasard.
- Le niveau `skill` (0 → 1) règle :
  - le temps de réaction aux télégraphes : 0,52 s (débutant, 0,3) · 0,34 s (moyen, 0,6) · 0,16 s (expert, 0,9) ;
  - l'inattention (menaces jamais vues) : 38 % · 22 % · 5 % ;
  - la fiabilité des esquives ;
  - la tendance à rester planté pour frapper au lieu de bouger.
- Hypothèse : ces trois niveaux représentent des joueurs réels. Elle n'est pas vérifiée sur des humains ;
  dès que quelques parties réelles existent, comparer leur vague atteinte à ces chiffres.

Commandes :

```bash
npm run preview                      # dans un terminal
npm run bot -- --skill 0.3,0.6,0.9 --seeds 1,2,3,4,5 --out reports/x.json   # 60 runs ≈ 10 min
npm run bot:summary reports/x.json
```

À regarder dans le navigateur : `?hero=ren&seed=4&bot=0.6` (le robot joue en temps réel).

## Tests de bout en bout (`npm run e2e`, Playwright)

16 tests, tous verts sur la version livrée :

- écran titre (4 héros, aucune erreur JS), partir en run depuis le titre (HUD, arène dessinée) ;
- pause à Échap et reprise ; mort du héros → écran de fin → « Encore une run » ;
- chaque héros : 90 s jouées par le robot, plus de 15 éliminations, **aucun ennemi « zombie »** ;
- chaque boss (vagues 5, 10, 15, 20) : apparition, phases 2 et 3, mort ;
- mobile (Pixel 7) : pas de débordement horizontal, commandes tactiles présentes, le joystick déplace le héros ;
- budget de performance (ci-dessous).

## Budget de performance (`tests/e2e/perf.spec.ts` → `reports/perf.json`)

| Mesure | Budget | Mesuré |
|---|---|---|
| Pas de simulation moyen, vague 14-15 (60 ennemis) | ≤ 2,5 ms | **0,4 ms** |
| Pas de simulation, 99e centile | ≤ 8 ms | 5,1 ms |
| Mémoire JS après 4 min | ≤ 160 Mo | 61 Mo |
| Croissance mémoire minute 1 → 4 (fuite) | ≤ 25 Mo | 0 Mo |
| Objets affichés au pire moment | ≤ 4 000 | 1 349 |
| JS compressé (gzip) | ≤ 300 Ko | **297 Ko** (à la limite) |

Le rendu ne peut pas être mesuré ici (GPU logiciel, 30 ms par image à titre indicatif) : la vérification
du 60 i/s doit se faire sur un vrai téléphone. Le JS est au bord du budget : la prochaine fonctionnalité
devra être chargée à la demande (écrans du Sanctuaire, codex) ou le budget relevé consciemment.

## Ce que le robot a trouvé

1. **Bug bloquant (corrigé)** : un ennemi tué par le Saignement restait en jeu à 0 PV, intuable, et la vague ne
   se terminait jamais. Corrigé par l'agent Gameplay ; un test vérifie qu'il ne revient pas.
2. **Le héros devenait intouchable après la vague 10.** Les PV perdus tombaient à 0 : les boucliers et les soins
   (vol de vie sur des frappes de zone, Festin, duo Fer et Sang, Parade sacrée, Rempart noir) se rechargeaient
   plus vite que les coups reçus.
3. **Les boss 10, 15 et 20 ne frappaient pas plus fort que celui de la vague 5** (dégâts non mis à l'échelle),
   et mouraient en 35 s.
4. **Un joueur qui bouge sans arrêt esquive presque tout** : les ennemis visaient la position du héros avec très
   peu d'anticipation, et les télégraphes gardaient la même durée de la vague 1 à 20.
5. **Le Bélier écarlate arrivait trop tôt** (vague 4) et tuait la plupart des débutants avec Mei.
6. Dégâts de contact trop forts pour la mêlée (corrigé avec l'agent Gameplay : 25 % toutes les 1,2 s).

## Réglages appliqués

Dans le dossier partagé (`combat/data.ts`, `combat/rules.ts`, `data/blessings.json`) :

- **PV des ennemis** : `1 + 0,16 w + 0,004 w²` (×5,5 en vague 20, contre ×3,3). **Dégâts** : `1 + 0,12 w + 0,009 w²`.
- **Boss** (PV / dégâts) : Capitaine 2 400 / 30 · Matriarche 5 600 / 48 · Arbitre 9 000 / 64 · Souverain 14 000 / 92.
- **Héros** : Taro PV 210, DEF 8, Rempart noir bouclier 18 toutes les 2,8 s ; Mei PV 180 ;
  Sena PV 200, DEF 7, Éclat ×1,3 perçant, Anneau givré 2,6 s et rayon 150, Prisme 4,6 s, Comète 9,5 s.
- **Bélier écarlate** : à partir de la vague 6, télégraphe 0,9 s, dégâts ×0,9.
- **Bénédictions** : Rempart Juré 6-14 % (une fois toutes les 4 s) · Parade sacrée 12-34 + DEF (toutes les 4 s) ·
  Festin 1-4 PV par élimination · Entaille Pourpre 1-4 % de vol de vie · Soif du Chasseur 6-16 % · duo Fer et Sang plafonné à 15 %.

Appliqué par l'agent Gameplay le 3 novembre à 1 h 43 (patch `docs/equilibrage-gameplay.patch`, détail dans `docs/equilibrage-demandes.md`) :
bouclier plafonné à 40 % des PV max, vol de vie limité à 0,8 % des PV max par seconde, duo à 15 % dans le code,
Égide 15 + DEF, et tempo des ennemis (télégraphes −20 % et visée anticipée en fin de campagne).

## Courbe par vague (après, 60 runs)

Voir `docs/equilibrage/resume-apres.txt` (et `resume-avant.txt`). Données brutes : `docs/equilibrage/robot-60-runs.json`.

## À surveiller

- **Sena rééquilibrée (2e passage)** : PV 200, DEF 7, vitesse 260 ; Éclat arcanique ×1,3, portée 560, perce 2 ennemis ; Anneau givré rayon 150 ; Comète lunaire 9,5 s pour 44 mana. Sur 30 runs : 16 victoires (53 %), contre 14 pour Mei sur les mêmes graines (47 %). Avant ce passage : 6 sur 15 (40 %), la plus faible des quatre.
- Le **Capitaine (vague 5)** est le premier mur : 7 morts sur 60. C'est voulu, mais si les premiers joueurs
  abandonnent là, baisser ses PV à 2 100.
- Non simulé : profil avec Sanctuaire avancé, Pactes de la Brume, défi quotidien, mode Cauchemar.
  Le Sanctuaire rend les runs plus faciles : les Pactes doivent compenser (à vérifier au prochain passage du robot).
