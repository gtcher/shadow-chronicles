# Interface (`src/ui/`) · agent 6 UI / mobile

DOM léger (aucun framework) posé par-dessus le canvas Pixi. Style : panneaux sombres, filets dorés,
Cinzel pour les titres, Alegreya Sans pour le texte (repris de `demo/`).

```ts
import { mountUI, connectSave } from '../ui';
const ui = mountUI(game);                 // met game.pauseOnAction = false : l'UI gère la pause
connectSave(ui, save);                    // réglages ↔ save.settings, export/import, toast « prototype repris »
ui.hud.setHero('mei', (k) => game.assets.url(k));
ui.inRun = true;                          // autorise la pause (Échap / P / Start / bouton ❚❚)
```

## HUD (le gameplay pousse l'état, l'UI ne lit jamais l'ECS)

| Appel | Quand |
|---|---|
| `hud.setVitals({ hp, max, shield, mana, manaMax })` | chaque frame ou à chaque changement |
| `hud.setCooldown(i, restant, total)` | i = 0 frappe, 1–3 techniques, 4 esquive |
| `hud.setWave(n, progression01, html?)` | chaque frame (texte du contrat en option) |
| `hud.addKill()` `hud.setGold(n)` `hud.setShards(n)` `hud.setLevel(n)` | événements |
| `hud.setBlessings(list)` | après un choix |
| `hud.banner(titre, sous-titre, couleur?)` `hud.toast(titre, texte, couleur?)` | vague, Duo, légendaire, succès |

Entrées : bouton 0 = `attack` maintenu (`input.setVirtualHeld`), 1–3 = `input.trigger('skill1..3')`, 4 = `dash`.
Touches affichées : Clic / 1 / 2 / 3 / Esp au clavier, RT / X / Y / RB / LT à la manette.

## Écrans

- `ui.showTitle({...})` : choix du héros, Sanctuaire, défi du jour, **reprise d'expédition** (`resume`).
- `await ui.offerBlessings({ wave, choices, owned, rerolls, onReroll })` → la carte choisie. Met en pause.
  Chaque carte affiche patron, rareté (couleur + ◆ pour le daltonisme), emplacement, tags, Duo débloqué, remplacement, résonance.
- `ui.showSanctuary({ profile: metaFromProfile(save.profile), ...sanctuaryActions(save, refresh) })`.
- `ui.showRunEnd({...})` : gains d'abord, maîtrise, prochaine amélioration, 3 succès presque atteints.
- `ui.openCodex(tab?)` : **Codex des Brumes** (onglets Serments, Duos, Reliques, Savoir), empilé par-dessus le titre,
  le Sanctuaire ou la pause ; Échap le ferme. Données : `ui.codexInfo = () => ({ ...codexFromProfile(save.profile), assetUrl })`.
  Les entrées non découvertes restent en silhouette ; l'amélioration « Codex des Brumes » des Archives dévoile leur effet.
  Pastille « nouveau » du menu : `codexFresh()` (ids déjà consultés dans localStorage `sc-codex-vu`).
- Sanctuaire : bandeau « Objectif » (`sanctuaryGoals`), conditions avec barres (`MetaProfile.reqs`, calculé par
  `requirementProgress` de src/save), guide de 6 étapes à la première visite (`settings.sanctuaryGuideDone`, bouton « ? »).
- Fonds peints : `codex` (salle des Archives) et `sanctuary`, générés par `node tools/art/render.mjs codex sanctuary`.
- Sceaux des patrons en SVG : `src/ui/sigils.ts`.
- `ui.togglePause()` (contenu via `ui.pauseInfo = () => ({ hero, owned, wave })`), `ui.openSettings()`.

## Mobile

Joystick flottant (moitié gauche, ou droite en mode gaucher) → `input.setVirtualMove`.
Les techniques se rangent en arc sous le pouce droit, frappe à maintenir au centre. Les commandes tactiles
n'apparaissent qu'au premier toucher (ou sur écran tactile). Zones sûres (`env(safe-area-inset-*)`) gérées.

## Première minute guidée

`ui.tutorial.start(device)` puis `notify('move', dt)`, `notify('attack', dt)`, `notify('dash')`, `notify('kill')`,
`notify('skill')`, `tutorial.waveCleared()`. 6 étapes non bloquantes, textes adaptés au périphérique,
anneau sur le bon bouton en tactile, bouton « Passer ». `settings.tutorialDone` est sauvegardé.

## Accessibilité (`settings.ts`)

Taille du texte 90–140 %, contraste élevé, 3 modes daltoniens, animations réduites (suit `prefers-reduced-motion`),
secousses de caméra 0–100 % (appliqué à `camera.shake` sans toucher au moteur), flashs, chiffres de dégâts,
vibrations, taille des boutons tactiles, mode gaucher, visée auto, volumes. Navigation complète clavier/manette
(flèches, Tab, Entrée, Échap), focus visible, rôles ARIA, annonces `aria-live` des vagues.
Les autres agents lisent `ui.settings.get()` (`shake`, `flashes`, `damageNumbers`, `autoAim`, `musicVolume`, `sfxVolume`).

## Maquette

`npm run ui:preview` (dev) ou `npm run ui:build` → `dist-ui/`. `ui-preview.html?screen=title|offer|sanctuary|end|settings|pause|tuto&hero=mei`.
`src/ui/preview/` simule vagues, mana et techniques : ce n'est pas le gameplay.
