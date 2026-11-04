# Sessions de test « joueur » (testeurs IA)

`session.mjs` joue une session complète comme un joueur neuf : écran titre, choix du héros, run(s) jouées
par le robot (`src/game/bot`) à un niveau donné, passage au Sanctuaire, Codex. Il prend des captures aux
moments clés et écrit `session.json` (vagues, temps, coups reçus, offres de bénédictions et choix, succès,
texte des écrans de fin et du Sanctuaire).

```sh
npm run build && npx vite preview --port 4173 &
node tools/playtest/session.mjs --out reports/playtest/lucas --device pixel --hero sena --skill 0.45 --runs 2 --minutes 10
```

Appareils : `desktop`, `laptop`, `iphone`, `pixel`, `ipad`. Une run qui atteint `--minutes` est arrêtée
(le héros tombe pour afficher l'écran de fin) : ce n'est pas une vraie mort.

Limites connues : le robot déplace le héros avec le joystick virtuel (le tutoriel affiche donc les textes
tactiles même sur PC) et ne boit pas de potions.

Le 2026-11-04, 10 testeurs IA aux profils différents ont joué avec cet outil ; captures et avis dans le
dossier partagé du projet (`playtest-10/`).
