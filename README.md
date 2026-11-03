# Shadow Chronicles — moteur (v0.1)

Refonte du prototype `../index.html` en **Vite + TypeScript + PixiJS 8** (style : 2D peinte).
Ce dossier contient le **moteur** et une **scène de démonstration** jouable. Les autres
chantiers (rendu/VFX, gameplay, UI, audio, sauvegarde…) se branchent dessus : lire
[ARCHITECTURE.md](./ARCHITECTURE.md) avant de coder.

## Démarrer

```bash
npm install
npm run dev        # serveur de dev → http://localhost:5173  (?hero=mei|sena|ren|taro)
npm test           # tests unitaires du moteur (Vitest)
npm run build      # vérif. des types + build de production dans dist/
npm run preview    # sert dist/
npm run extract-assets   # ré-extrait les images/sons du prototype vers public/assets
```

## Commandes de la démo

| Action | Clavier / souris | Manette |
|---|---|---|
| Se déplacer | ZQSD (AZERTY) = WASD (QWERTY), flèches | Stick gauche, croix |
| Tirer (maintenir) | Clic gauche ou J, visée à la souris | RT ou A, visée stick droit |
| Esquive (dash) | Espace, Maj gauche, clic droit | LT ou B |
| Pause | Échap ou P | Start |
| Debug (FPS, hitbox) | F3 ou ² | — |

## Mise en ligne / installation

PWA installable et jouable hors ligne : voir [DEPLOIEMENT.md](./DEPLOIEMENT.md) (GitHub Pages prêt dans `.github/workflows/deploy.yml`).
