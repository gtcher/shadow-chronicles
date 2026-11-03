# Shadow Chronicles — Design de la progression addictive

*Agent 5 · Progression · v1 · 2 novembre 2026*

Ce document décrit **pourquoi** et **comment** le joueur relance « encore une run ». Les chiffres vivent dans les tables JSON de ce dossier ; le moteur ne doit coder aucune valeur en dur.

| Fichier | Contenu |
|---|---|
| `blessings.json` | 5 patrons, 35 bénédictions, 8 duos, 5 légendaires, statuts, résonances, règles d'offre |
| `loot.json` | 6 raretés, tables de drop par source et par vague, pitié, affixes, 17 pouvoirs légendaires, démantèlement |
| `sanctuary.json` | 3 monnaies, 4 bâtiments, Pactes de la Brume (difficulté volontaire), maîtrise des héros, migration du profil du prototype |
| `achievements.json` | 47 succès en 7 catégories, dont 4 secrets |
| `daily.json` | Défi quotidien et hebdomadaire à graine, modificateurs, score, séries |
| `reference/daily-seed.js` | Générateur de référence (cyrb53 + mulberry32), testé |

---

## 1. Ce qu'on garde du prototype

Le prototype H1.5.2 a déjà de bonnes bases ; on les **structure** au lieu de les remplacer.

- **4 héros** (Taro tank, Mei assassin, Sena mage, Ren archer) avec 4 techniques chacun : les bénédictions s'accrochent à ces 4 techniques + l'esquive.
- **Rareté** `common → legendary` (`rarityDefs`) et les 4 slots `weapon/armor/ring/boots` : clés reprises à l'identique.
- **13 reliques légendaires** (Lame des Trois Serments, Égide, Phénix…) : reprises dans `loot.json`, chacune reliée à un patron (`patronHint`) pour créer des ponts butin ↔ bénédictions. 4 nouvelles ajoutées.
- **Routes** (Sentier, Sanctuaire, Marchand, Crypte, Archives, Col, Faille, Chasse) : elles modifient maintenant aussi les offres de bénédictions et les coffres.
- **Contrats** et **Éclats d'Akar** : deviennent la monnaie principale du Sanctuaire.
- **Sanctuaire d'Akar** (3 améliorations, rang 3 max) : étendu en hub à 4 bâtiments. Le profil existant est migré (`sanctuary.json > migration`), donc personne ne perd sa progression.
- **Talents** (2 voies par héros, K) : inchangés, ils restent la progression « par niveau » de la run.
- **5 jalons** (`sc-v3-badges`) : deviennent les 5 premiers succès.

## 2. Les boucles d'engagement

On empile quatre boucles de durées différentes. Chacune doit récompenser *avant* que la précédente ne lasse.

| Boucle | Durée | Récompense | Système |
|---|---|---|---|
| Combat | 5–30 s | chiffres de dégâts, élimination, butin qui tombe avec rayon de couleur | loot `fx`, statuts |
| Vague | 60–90 s | **choix de bénédiction** 1 parmi 3, contrat réussi | `blessings.json` |
| Run | 15–30 min | build qui « casse » le jeu, boss, légendaire | duos, résonances, légendaires |
| Méta | jours/semaines | Sanctuaire, maîtrise, succès, série quotidienne | `sanctuary.json`, `achievements.json`, `daily.json` |

**Principes appliqués**

1. **Choix significatif fréquent** : une offre après chaque vague, 3 cartes, une décision en moins de 10 s.
2. **Synergies visibles** : chaque carte affiche ses tags (Givre, Choc…) et, si un Duo devient possible, un liseré doré « ⚭ Débloque un Duo ». Le joueur *voit* son build se construire.
3. **Récompense variable** : rareté des bénédictions et du butin tirée au sort, avec un **système de pitié** pour éviter les longues séries frustrantes.
4. **Jamais de run perdue pour rien** : éclats gardés à 100 %, XP de maîtrise, succès cumulatifs. L'écran de fin montre d'abord ce qui est gagné, puis la prochaine amélioration abordable.
5. **« Presque »** : sur l'écran de fin, les 3 succès les plus proches avec leur barre, et la distance à la meilleure vague.
6. **Rendez-vous quotidien** : défi à graine + série protégée par une bougie de veille (pas de punition dure).

## 3. Bénédictions (`blessings.json`)

### Patrons

Les « Quatre Serments » du lore deviennent des patrons, plus un pacte interdit :

| Patron | Domaine | Fantasme | Affinité |
|---|---|---|---|
| ⛨ Serment des Veilleurs | Garde | bouclier, riposte, Marque | Taro |
| ☾ Serment de la Lune | Givre | ralentir, geler, briser | Sena |
| ◉ Serment du Sang | Sang | vol de vie, saignement, sacrifice | Taro, Mei |
| ϟ Serment de l'Orage | Foudre | Choc, chaînes, vitesse | Ren, Mei |
| ✦ Pacte de la Brume | Ombre | poison, esquive, puissance au prix de PV | Mei, Ren (débloqué via Sanctuaire) |

Au départ, seuls Veilleurs, Lune et Sang sont disponibles : Orage et Brume se débloquent au Sanctuaire, ce qui donne au joueur des **objectifs concrets** dès les premières runs.

### Emplacements

Chaque bénédiction occupe un emplacement : `frappe` (technique 1), `technique` (2), `art` (3), `ultime` (4), `esquive`, ou `passif` (illimité). Prendre une nouvelle bénédiction sur un emplacement occupé **remplace** l'ancienne (la carte l'indique). Cela crée des arbitrages sans saturer l'écran.

### Rareté

`commun / rare / épique / héroïque`. La rareté change seulement la valeur `{v}` de la description. Les offres d'**amélioration** (18 %) montent une bénédiction possédée d'un cran : c'est la sensation de « mon build grandit ».

### Synergies, trois niveaux

1. **Statuts partagés** (6) : Givre → Gel, Saignement, Choc, Poison, Marque. Plusieurs patrons appliquent ou exploitent les mêmes statuts.
2. **Résonance** : 2 / 4 / 6 bénédictions d'un même patron activent des bonus croissants. Ça pousse à se spécialiser.
3. **Duos** (8) : apparaissent quand le joueur possède une bénédiction avec les bons tags de chacun des deux patrons (ex. Givre + Choc → *Fracture Polaire* : éclairs ×2 sur les cibles gelées).
4. **Légendaires** (5) : 3 bénédictions d'un patron dont une précise → pouvoir de clôture (ex. *Dernier Veilleur d'Akar* annule un coup mortel par vague).

Le butin renforce ces ponts : l'affixe `statusDamagePct` boost tous les statuts, l'affixe légendaire `patronResonanceBonus` compte comme une bénédiction de plus.

### DSL des effets (contrat avec le moteur)

```jsonc
"effect": {
  "trigger": "onHit|onCrit|onKill|onDodge|onHurt|onSkill|onShatter|onHeal|onShieldGain|onLethal|onStatus|onLightning|every|passive",
  "skill": 0,              // filtre sur l'indice de technique (onHit, onSkill)
  "chance": 25,            // %
  "cooldown": 1.5,         // s, interne à l'effet
  "condition": "hasShield",// prédicat nommé, interprété par le moteur
  "action": { "type": "damage|status|shield|heal|stat|buff|zone|projectiles|strikes|reflect|detonate|echo|cooldownReduce|cooldownReset|dashModifier|…", ... },
  "extra":  { ... },       // seconde action facultative
  "cost":   { "hpPct": 5 },
  "drawback": { "stat": "maxHp", "addPct": -10 }
}
```

`"{v}"` dans une action est remplacé par la valeur de la rareté. Le moteur doit lister les `type` d'action non reconnus au démarrage (en dev) plutôt que planter.

### Règles d'offre clés

- 3 choix (4 sur la route Archives), au plus 2 du même patron.
- Pondération ×1,6 pour les patrons d'affinité du héros.
- Après 3 offres sans rare : la suivante en contient une (pitié).
- Faille → rareté minimum épique ; Sanctuaire (repos) → uniquement des améliorations.
- Relances : 1 gratuite par run + achats Sanctuaire, puis en or (40/80/160).

## 4. Butin (`loot.json`)

- **6 raretés** : les 5 du prototype + **Ancestrale** (orange, 4 affixes au jet parfait + un affixe « Serment » au choix). C'est l'objet de chasse de fin de partie, débloqué par la Forge rang 3 ou en Cauchemar.
- **Tables par source** (normal / élite / boss / coffre de route) et par tranche de vagues. Un ennemi normal lâche un objet 6 % du temps, une élite 45 %, un boss toujours deux.
- **Premier boss garanti légendaire** : le moment « wow » arrive dès la première partie réussie.
- **Pitié** : épique au plus tard après 18 drops, légendaire après 45 (avec montée progressive dès 30) — compteur sur le profil.
- **Smart loot** : 65 % des légendaires sont utilisables par le héros joué ; affixes pondérés par `HERO_WEIGHT` du prototype.
- **Retour visuel et sonore** par rareté (`fx`) : rayon, halo, secousse, ralenti 0,35 s et bannière pour la légendaire. **À transmettre à l'agent Rendu/VFX et Audio.**
- **Démantèlement** en Poussière d'étoile, la monnaie de la Forge : même un objet commun sert à quelque chose.

## 5. Sanctuaire d'Akar (`sanctuary.json`)

### Monnaies

| Monnaie | Source | Usage |
|---|---|---|
| ✦ Éclats d'Akar | contrats, vagues, boss, quotidien, succès | Veillée, Autel, Archives |
| ✧ Poussière d'étoile | démantèlement | Forge |
| ♛ Sceaux du Juge | premiers boss par niveau de Pacte, séries, succès rares | déblocages majeurs |

### Bâtiments

- **La Veillée** : stats permanentes (PV, ATQ, DEF, critique, mana, potions, or). Petits gains, nombreux paliers.
- **Autel des Serments** : débloque Orage et Brume, relances, chance de rareté, bénédiction de départ, bannissements.
- **Forge d'Akar** (vague 4) : chance de rareté du butin, **Coffre-Souvenir** (garder 1 puis 2 objets entre les runs), Ancestrale, reforge.
- **Archives du Sceau** (3 runs) : 4e contrat, primes, point de talent de départ, codex, cartographe.

Les bâtiments verrouillés sont visibles dès le début avec leur condition : le hub montre au joueur ce qui l'attend.

### Rythme économique

Tout maximiser coûte environ **2 480 éclats, 1 250 poussières et 2 sceaux**, soit **50 à 65 runs (18 à 28 h)**. La première amélioration (8 éclats) doit être achetable après la toute première run.

### Pactes de la Brume (rejouabilité long terme)

Après le boss de la vague 10, le joueur peut s'imposer jusqu'à 11 contraintes cumulables (PV ennemis, élites, chrono, 2 choix de bénédiction…). Chaque point augmente éclats (+6 %) et chance de butin (+3 %) ; des paliers 5 / 10 / 20 / 32 donnent sceaux, titres et cosmétiques. C'est le moteur des 20 h suivantes.

### Maîtrise des héros

Chaque run donne de l'XP au héros joué (10 par vague, 40 par boss, 150 en victoire), 10 niveaux de récompenses : titres, traînée, skin alternatif, portrait doré, petits bonus. Ça donne une raison de jouer *chacun* des 4 héros.

## 6. Succès (`achievements.json`)

47 succès en 7 catégories (Campagne, Combat, Serments, Butin, Héros, Défis, Secrets), en 4 tiers (bronze 5 éclats → mythe 50 éclats + 1 sceau). Certains donnent des titres ou des cosmétiques.

Condition = `{ stat, op, value, scope, where? }`. Le moteur doit publier les compteurs listés (`kills`, `waveReached`, `duosTaken`, `legendaryFound`, `dailyStreakMax`…) dans un service de statistiques unique ; les succès sont évalués à chaque fin de vague et à chaque événement marquant.

Les 4 succès **secrets** (« Dénuement », « Pèlerin pacifique »…) s'affichent en « ? » : ils créent des discussions et de la curiosité.

## 7. Défi quotidien (`daily.json`)

- **Graine** : `SC-D-AAAA-MM-JJ` (UTC). Hash **cyrb53** → **mulberry32**. Un **flux séparé par système** (`setup`, `waves`, `routes`, `blessings`, `loot`, `contracts`, `hazards`) pour qu'une relance ne décale pas la suite de la run.
- **Contenu du jour** : héros imposé (jamais le même que la veille), mode, 10 vagues, 1 modificateur positif + 2 négatifs de familles différentes, bénédiction de départ rare. Le Sanctuaire est **désactivé** pour l'équité.
- **Score** détaillé (vagues, éliminations, élites, boss, temps, contrats, victoire, dégâts subis). Seul le premier essai compte ; les suivants sont de l'entraînement.
- **Série** avec paliers 3 / 7 / 14 / 30 jours et une bougie de veille qui protège un jour manqué.
- **Hebdomadaire** : 20 vagues, 3 modificateurs négatifs, 60 éclats + 1 sceau.
- **Partage** : texte prêt à coller (« Shadow Chronicles · Défi du … · Vague 8/10 · 14 250 pts · Série 5 🔥 »). Le classement en ligne est prévu en phase 2.

Implémentation de référence : `reference/daily-seed.js`. Vecteurs vérifiés :

| Date | 1er uint32 (setup) | Héros | Mode | Modificateurs |
|---|---|---|---|---|
| 2026-11-02 | 217198325 | Taro | Cauchemar | Faveur de la Forge, Verre Lunaire, Marée Noire |
| 2026-11-03 | 3646690480 | Ren | Survie | Patrons généreux, Caravane absente, Feux Éteints |

## 8. Parcours des 10 premières runs (cible)

| Run | Ce qui se passe | Accroche pour la suivante |
|---|---|---|
| 1 | Vagues 1–4, 2–3 bénédictions, premier succès | 1re amélioration de la Veillée achetable |
| 2–3 | Premier Duo possible, Juge Pourpre approché | Forge débloquée (vague 4) |
| 3–5 | Premier boss vaincu → **légendaire garantie** | Archives, Sceaux, Pacte de la Brume à débloquer |
| 5–8 | Orage débloqué, nouveaux builds Ren/Mei | Maîtrise niveau 3–4, cosmétique |
| 8–10 | Vague 10–12, résonance 4 | Pactes de la Brume visibles, objectif vague 20 |

## 9. À faire pour les autres agents

- **Moteur / gameplay** : charger ces JSON, implémenter le DSL d'effets et les 6 statuts, exposer les compteurs de statistiques.
- **UI** : écran d'offre de bénédictions (3 cartes, tags, aperçu Duo), hub Sanctuaire, écran de fin « gains d'abord », journal des succès, écran du défi quotidien.
- **Rendu / Audio** : effets par rareté (`loot.json > rarities.fx`) et couleurs des statuts et patrons.
- **Sauvegarde** : profil v2 avec migration depuis `shadow-chronicles-akar-progression-v21` et `sc-v3-badges`.
- **Tests / équilibrage** : vérifier les vecteurs de graine, simuler l'économie (éclats/run), viser 50 à 65 runs pour tout maximiser.

## 10. Points ouverts

- ~~Verrouiller des héros au départ ?~~ **Décidé : non.** Les 4 héros restent jouables dès le départ ; la maîtrise donne la progression par héros.
- Le Pacte de la Brume et l'Ancestrale sont des contenus de fin de partie : ils n'ont de sens qu'une fois l'équilibrage des vagues 15–20 fait.
