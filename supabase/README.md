# Shadow Chronicles en ligne (Supabase)

Comptes joueurs, sauvegarde cloud et classement en ligne. Le jeu reste un site statique (GitHub Pages) :
il parle directement à Supabase. Sans réseau ou sans compte, tout reste jouable comme avant.

## Ce qui est où

| Fichier | Rôle |
|---|---|
| `supabase/schema.sql` | Tables, règles d'accès (RLS) et fonctions. À coller dans le SQL Editor. Relançable sans risque. |
| `src/online/config.ts` | URL du projet et clé publique (*publishable*). Jamais la clé secrète. |
| `src/online/client.ts` | Session, pseudo, envoi des scores (file d'attente hors ligne), lecture du classement, sauvegarde cloud. Supabase est chargé à la demande. |
| `src/online/sync.ts` | Accord entre la sauvegarde de l'appareil et celle du compte (envoi groupé, reprise, choix en cas de conflit). |
| `src/online/rules.ts` | Règles pures : vraisemblance des scores (miroir du SQL), décision de synchro. Tests : `tests/online.test.ts`. |
| `src/game/screensOnline.ts` | Écran « 🌐 Classement en ligne » (compte en haut, onglets Progression / Défi du jour / Missions). |
| `tests/e2e/online.spec.ts` | Parcours complet avec un faux serveur Supabase (`page.route`). |

## Base de données

- `players` : pseudo + progression (meilleure vague, victoires, meilleur temps, coffres, série). Lecture publique.
- `runs` : chaque run classée. Lecture publique.
- `daily_scores` : premier essai du défi du jour, un par joueur et par jour. Lecture publique.
- `cloud_saves` : sauvegarde complète (profil + réglages), **privée** : chacun ne voit et n'écrit que la sienne.

Personne ne peut écrire directement dans les trois tables du classement : seules les fonctions
`set_pseudo`, `submit_run` et `submit_daily` le font, après contrôle :
- run : 8 s minimum par vague, ombres vaincues bornées (≤ 4/s et ≤ 150/vague), victoire seulement à la vague 20 ;
- une run toutes les 20 s au plus par joueur ;
- défi du jour : jour courant (± 1), score plafonné par vagues et éliminations, premier essai seulement ;
- le mode Découverte ne compte pas pour le record de progression.

Ces contrôles arrêtent les triches grossières, pas un tricheur motivé (le jeu tourne dans le navigateur).

## Installation (une fois)

1. Supabase > **SQL Editor** > *New query* : coller tout `schema.sql`, cliquer **Run**.
2. **Authentication > URL Configuration** : *Site URL* = `https://gtcher.github.io/shadow-chronicles/`,
   ajouter la même adresse dans *Redirect URLs* (plus `http://localhost:5173/` pour le développement).
3. **Authentication > Emails > Magic Link** : ajouter le code dans le modèle, par exemple
   `<p>Ton code : <strong>{{ .Token }}</strong></p>` (le joueur le recopie dans le jeu, pratique sur mobile / appli installée).
4. Facultatif : Google ou Discord dans **Authentication > Providers**, puis `VITE_SUPABASE_OAUTH=google,discord` au build.

Le service d'e-mail intégré de Supabase est limité (quelques e-mails par heure) : pour beaucoup de joueurs,
brancher un SMTP (Authentication > Emails > SMTP Settings, ex. Resend ou Brevo, gratuits au départ).
