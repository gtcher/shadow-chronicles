# Mise en ligne et installation (PWA)

Le jeu est une **PWA** : installable sur ordinateur, Android et iPhone, jouable **hors ligne** après la première visite.

## Ce qui est en place

| Élément | Fichier |
|---|---|
| Manifest (nom, couleurs, plein écran, icônes) | `public/manifest.webmanifest` |
| Icônes (any + maskable, Apple, favicon) | `public/icons/`, regénérées par `python3 tools/make_icons.py` |
| Service worker | modèle `src/pwa/sw-template.js` → `dist/sw.js` écrit au build par `tools/pwa.ts` |
| Côté page (enregistrement, mise à jour, installation) | `src/pwa/index.ts`, appelé dans `src/main.ts` |
| Déploiement GitHub Pages | `.github/workflows/deploy.yml` |

### Hors ligne et mises à jour
- Au build, **tous** les fichiers de `dist/` (≈ 143 fichiers, 17 Mo) reçoivent une empreinte. Le service worker les met en cache dès la première visite ; ensuite le jeu démarre sans réseau.
- Une nouvelle version ne retélécharge **que les fichiers modifiés**. Un bandeau « Une nouvelle version du jeu est prête · Recharger » apparaît ; sans clic, elle s'applique au lancement suivant (jamais en pleine run).
- Les polices Google sont mises en cache au premier passage.
- `navigator.storage.persist()` est demandé pour protéger la sauvegarde (IndexedDB).
- Rien n'est actif en `npm run dev` : tester avec `npm run build && npm run preview`.

### Installation
- Chrome / Edge / Android : un bandeau « Installer » apparaît 4 s après le lancement (une fois ; « × » le masque pour toujours).
- L'UI peut afficher son propre bouton : `pwa.ownInstallButton = true`, puis `pwa.canInstall`, `await pwa.install()`, `pwa.onChange(fn)` (`import { pwa } from './pwa'`).
- iPhone / iPad : Safari → Partager → « Sur l'écran d'accueil » (`pwa.isIos` pour afficher l'aide).

## Mettre en ligne sur GitHub Pages
1. Créer un dépôt GitHub (ex. `shadow-chronicles`) et y pousser le contenu de ce dossier `game/` à la racine.
   Si `game/` est un sous-dossier du dépôt, mettre `GAME_DIR: game` dans le workflow **et** déplacer `.github/` à la racine du dépôt.
2. Dans le dépôt : **Settings → Pages → Source : GitHub Actions**.
3. Chaque push sur `main` lance tests + build et publie sur `https://<compte>.github.io/<dépôt>/`.

`base: './'` dans `vite.config.ts` : le jeu fonctionne dans n'importe quel sous-dossier, sans réglage.

## Autres hébergeurs
`npm run build` puis servir `dist/` en HTTPS (Netlify, Cloudflare Pages, itch.io en « HTML5 » : zipper le contenu de `dist/`).
Conseil d'en-têtes : `sw.js` et `index.html` sans cache long (`Cache-Control: no-cache`), `js/*` immuables.
