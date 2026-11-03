# Shadow Chronicles · Guide de direction artistique (v1)

## 1. Intention

**2D peinte, dark fantasy « anime gacha ».** On garde l'ADN des illustrations du prototype : personnages au trait anime, armures détaillées, éclairage dramatique, fonds nocturnes bleutés. Le jeu doit se lire comme une scène de nuit éclairée par quelques sources fortes : la lune, les braises, les sorts.

Trois règles de lecture, par ordre d'importance :

1. **Le héros se lit toujours en premier.** Le sol est sombre et peu contrasté. Les personnages portent un liseré lumineux (rim light) dans leur couleur signature.
2. **Une couleur, une information.** Rouge-orangé = danger ennemi (zones, projectiles). Couleur signature du héros = ses propres attaques. Or = butin et progression. Cyan pâle = soin et bouclier.
3. **La lumière vient du haut-gauche.** Les tuiles, les décors et les volumes suivent tous cette convention. Les contre-jours (liserés) sont à droite et en haut.

## 2. Socle de couleurs (UI et ambiance)

| Jeton | Hex | Usage |
|---|---|---|
| nuit | `#07101c` | fond, vignettage |
| nuit2 | `#0f1d2e` | panneaux |
| ardoise | `#22344a` | boutons, cadres |
| brume | `#4d6380` | bordures, texte secondaire |
| or | `#d5b77e` | titres, raretés, butin |
| or sombre | `#937444` | filets de cadre |
| crème | `#f1e5ca` | texte principal |

Typographie conseillée : titres en Cinzel (capitales gravées), texte en Alegreya Sans. Les deux sont sur Google Fonts.

## 3. Héros : couleurs signature

| Héros | Rôle | Signature | Liseré / lumière |
|---|---|---|---|
| Taro | Lame écarlate, mêlée | `#e0303c` | `#ff7a5c` |
| Mei | Danseuse d'ombre, assassin | `#ff3fb4` | `#ff9be0` |
| Sena | Prêtresse lunaire, magie | `#4f8dff` | `#cfe4ff` |
| Ren | Archer d'or, distance | `#e8b64a` | `#7fe0ff` |

Les effets de compétence (traînées, impacts, particules) reprennent la signature, avec un cœur presque blanc.

## 4. Chapitres

Le prototype a 4 régions (`regionOf` : vagues 1-3, 4-7, 8-10, 11+). Chaque région a sa famille de tuiles, ses décors et sa lumière.

| Chapitre | Vagues | Sol (sombre → clair) | Lueur | Ambiance |
|---|---|---|---|---|
| ch1 · La Cour des Veilleurs | 1-3 | `#1b2430 #2b3644 #3d4a58 #56626e` | `#ffb35c` torches | ruines d'Akar, brume, mousse, lune voilée |
| ch2 · Les Remparts écarlates | 4-7 | `#1d1013 #33191b #4a2723 #6a3a2c` | `#ff7a2a` braises | remparts en feu, sang séché, bannières du Culte |
| ch3 · La Nécropole lunaire | 8-10 | `#0e1626 #1a2940 #2c4260 #4f6c8e` | `#bfe6ff` givre | marbre, givre, cristaux, eau noire |
| ch4 · La Porte de l'Éclipse | 11-20+ | `#0d0a17 #1b1430 #2c2148 #45346a` | `#b46bff` Néant | obsidienne, failles violettes, éclipse |

Règle de valeur : le sol reste entre 8 % et 40 % de luminosité. Rien de plus clair que 40 % au sol, sauf les calques lumineux (failles, braises, runes).

## 5. Fichiers livrés (`game/public/assets/`)

Index complet : `da-manifest.json`.

### Tuiles : `tiles/<ch>/`
512×512 px, raccordables sur les 4 bords (bruit périodique, Voronoï périodique).
- `dalles_a`, `dalles_b` : dallage (petites et grandes pierres)
- `dalles_usees` : dallage envahi de terre, pour casser la répétition
- `terre` : sol de terre et gravier
- `calque` : RGBA à superposer (mousse ch1, sang et braises ch2, givre ch3, failles du Néant ch4). En mode `add` pour ch4, `normal` sinon.

Usage moteur conseillé : `TilingSprite` avec `dalles_a`, puis taches de `dalles_usees` et `terre` via un masque de bruit, puis `calque` à 60-100 % d'opacité.

### Décors : `decor/<ch>/`
`pilier`, `stele` (rune lumineuse), `arche`, `gravats`, `cristal`, `brasero` (8 images en bande horizontale, 12 i/s). Ancre en bas au centre (`[0.5, 0.95]`), tri en Y avec les personnages. `decor.json` donne tailles, ancres et couleur de lumière du brasero (à réutiliser pour une lumière additive au sol).

### Sprites animés : `sprites/heros|ennemis|boss/`
Format **PixiJS Spritesheet** (`.json` + `.webp`), avec un bloc `animations` :

| Animation | Images | i/s conseillé |
|---|---|---|
| `idle` | 8 | 8 |
| `course` | 8 | 12 |
| `attaque` | 6 (impact sur l'image 3) | 16 |
| `touche` | 3 | 14 |
| `mort` | 8 (dissolution) | 10 |

Cadres : héros 256 px, ennemis 224 px, boss 384 px. Ancre `{x:0.5, y:0.95}` (pieds). Tous regardent **vers la droite** : `scale.x = -1` pour la gauche.

```ts
const sheet = await Assets.load('assets/sprites/heros/sena.json');
const s = new AnimatedSprite(sheet.animations['idle']);
s.anchor.set(0.5, 0.95); s.animationSpeed = 8 / 60; s.play();
```

Boss livrés : Juge Pourpre, Capitaine Cendrefer (braise), Matriarche lunaire (givre), Arbitre de l'Éclipse (violet), Souverain des Ruines (or). Ce sont des recolorations dérivées des illustrations d'ennemis existantes, avec liseré et aura à leur couleur.

## 6. Limites de cette v1, et la suite

- **Les sprites sont des illustrations animées, pas des personnages en pied.** Les images sources sont des bustes en trois-quarts. L'animation est faite par déformation (respiration, appui, fente, ondulation de cape, dissolution). C'est lisible et cohérent en jeu, mais une vraie marche avec jambes demandera de nouvelles illustrations en pied, idéalement découpées en parties (tête, torse, bras, cape) pour un rig squelettique (Spine ou DragonBones).
- **Les boss Cendrefer, Matriarche, Arbitre et Souverain** réutilisent des silhouettes d'ennemis. Il faudra des illustrations dédiées pour qu'ils se distinguent vraiment à l'écran.
- **Tuiles et décors** sont générés par code (`tools/da/`), donc rejouables : changer une couleur dans `palettes.py` et relancer régénère tout le chapitre.

Brief pour les futures illustrations : pose en pied, trois-quarts tournée vers la droite, fond transparent, 1024 px de haut, lumière haut-gauche, liseré dans la couleur signature, pas de texte incrusté.

## 7. Fonds peints et décors par chapitre (v2)

- **Menu principal** : `public/assets/art/menu-ch1..ch4.webp` (1920×1080), un panorama par chapitre
  (citadelle d'Akar en contre-jour, lune voilée / incendie / nécropole et eau noire / éclipse).
  Le menu affiche le chapitre de la meilleure vague atteinte ; `?menu=1..4` force un fond.
  Lente dérive (CSS) et poussières à la couleur du chapitre, coupées par « Réduire les animations ».
- **Cartes de sélection** : `public/assets/art/select-<héros>.webp` (640×900). Le héros v2 (piste A)
  en pied devant une scène à sa couleur signature : Taro / Remparts, Mei / Éclipse magenta,
  Sena / Nécropole, Ren / Cour dorée.
- Les deux sont **peints par code** (`tools/art/paint.ts`) et rejouables :
  `node tools/art/render.mjs` (ou `node tools/art/render.mjs menu-ch2 select-ren`).
  Aperçu dans le navigateur : `npx vite` puis `/tools/art/art.html`.
- **Runs** : `src/game/arena/ChapterArena.ts` habille l'arène avec les tuiles et décors du chapitre
  de la vague (1-3, 4-7, 8-10, 11+) : sol cuit en 1024 px (dallages, zones usées, terre), calque,
  piliers, stèles, cristaux, gravats, colonnade au nord, braseros animés qui éclairent, lumière
  ambiante, brume et poussières (braises qui montent, neige, éclats du Néant). Changement de
  chapitre en fondu enchaîné au début de la vague ; les collisions des décors restent les mêmes.
