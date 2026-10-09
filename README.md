# Sentinel — analyseur d'opportunités immobilières et commerciales

**En ligne : <https://sentinel-mocha-gamma.vercel.app>**

Application web personnelle qui dit en moins de deux minutes si une annonce mérite une visite, et à quel prix
maximum faire une offre. Gratuite à faire tourner, sans clé d'IA, en français, sur ordinateur et téléphone.

Elle fait trois choses :

1. **Radar de marché** : sur une zone dessinée (30 communes au plus), classe les communes par rendement brut théorique
   (loyer de marché HC × 12 / prix médian DVF au m²) pour savoir où chercher.
2. **Analyse d'annonce** : saisie en 5 champs (ou import CSV), enrichissement automatique (géocodage, comparables DVF,
   loyer de marché, DPE, risques, encadrement), puis cash-flow, rendements, prix d'offre maximal et verdict.
3. **Suivi de décision** : statut, notes, historique des prix, checklist de vérification, comparaison de 2 à 4 biens.

Quatre écrans : **Carte et liste** (accueil), **Fiche bien**, **Comparateur**, **Réglages**. Chaque chiffre indique son
origine : déclaré, vérifié, estimé, hypothèse ou inconnu ; chaque indicateur propose « Comment c'est calculé ».

L'application ne collecte pas d'annonces : les portails n'ont pas d'API publique gratuite et interdisent la collecte
automatisée. Seule l'URL de l'annonce est conservée.

---

## 1. Mise en ligne (une fois, environ 10 minutes)

Le déploiement est automatisé par GitHub Actions : il crée la base Supabase, la configure, déploie sur Vercel et
vérifie que tout répond. Vous n'avez qu'à créer deux comptes gratuits et copier trois valeurs dans GitHub.

### 1.1 Compte Supabase (base de données et connexion)

1. Allez sur <https://supabase.com> → **Start your project** → inscrivez-vous **avec l'adresse e-mail que vous
   utiliserez pour vous connecter à l'application** (le service d'e-mail gratuit de Supabase n'envoie qu'aux membres
   de votre organisation Supabase).
2. Créez l'organisation proposée (offre **Free**). Inutile de créer un projet : le déploiement s'en charge.
3. Menu de votre avatar → **Account preferences** → **Access Tokens** → **Generate new token** → nommez-le
   `sentinel-deploy`, donnez-lui accès à **toutes les organisations et tous les projets** (accès complet ; un jeton
   « à portée limitée » ne peut pas créer le projet) → copiez le jeton (`sbp_…`).

### 1.2 Compte Vercel (hébergement)

1. Allez sur <https://vercel.com/signup> → offre **Hobby** → **Continue with GitHub**.
2. Avatar → **Account Settings** → **Tokens** → **Create Token** → nom `sentinel-deploy`, portée **Full Account**,
   expiration au choix → copiez le jeton.

### 1.3 Secrets GitHub

Dans le dépôt GitHub : **Settings → Secrets and variables → Actions → New repository secret**, créez :

| Nom | Valeur |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | le jeton Supabase (`sbp_…`) |
| `VERCEL_TOKEN` | le jeton Vercel |
| `APP_OWNER_EMAIL` | votre adresse de connexion (la même que le compte Supabase) |

Facultatif : `VERCEL_TEAM_ID` si votre jeton Vercel vise une équipe plutôt que votre compte personnel.

### 1.4 Lancer le déploiement

Dans l'onglet **Actions** du dépôt → workflow **Déploiement** :

- si le code est sur la branche `main` : bouton **Run workflow** (ou poussez simplement un commit sur `main`) ;
- sinon : ouvrez la dernière exécution du workflow → **Re-run all jobs** (elle relit les secrets que vous venez d'ajouter).

En 5 à 10 minutes, le résumé du workflow affiche **« ✅ Application en ligne : https://… »**. Ouvrez cette adresse,
saisissez votre e-mail : vous recevez un lien de connexion (e-mail par défaut de Supabase, en anglais, « Magic Link » ;
avec un SMTP personnel, l'e-mail en français contient aussi un code à 6 chiffres). Ajoutez l'URL à l'écran d'accueil de
votre téléphone pour l'ouvrir comme une application.

Ce que fait le workflow (`scripts/deploy/provision.mjs`) :

- crée (ou retrouve) le projet Supabase `sentinel` en région Paris (`eu-west-3`) et attend qu'il soit prêt ;
- applique les migrations SQL de `supabase/migrations/` qui ne l'ont pas encore été (suivi dans
  `supabase_migrations.schema_migrations`) ;
- crée (ou retrouve) le projet Vercel `sentinel`, y enregistre les variables d'environnement et déploie en production ;
- configure l'authentification : URL du site, URL de redirection, modèle d'e-mail en français (lien + code) si l'offre
  le permet, crée votre compte puis **ferme les inscriptions** (outil personnel) ;
- vérifie que la page de connexion et la base répondent.

Il se relance à chaque push sur `main` : les nouvelles migrations sont appliquées et l'application redéployée.

### 1.5 Mise en ligne manuelle (alternative sans jetons)

1. Supabase : **New project** (région *West EU (Paris)*), puis **SQL Editor** → collez et exécutez
   `supabase/migrations/20261009000000_init.sql`.
2. **Authentication → URL Configuration** : *Site URL* = l'URL Vercel, *Redirect URLs* = `https://votre-url/**`.
   **Authentication → Emails → Magic Link** : collez `supabase/templates/magic_link.html`.
3. **Project Settings → API Keys** : notez l'URL du projet, la clé *publishable* et la clé *secret*.
4. Vercel : **Add New → Project** → importez ce dépôt → ajoutez les variables du tableau ci-dessous → **Deploy**.
5. Connectez-vous une première fois, puis **Authentication → Sign In / Providers → Allow new users to sign up : off**.

## 2. Variables d'environnement

Voir `.env.example`.

| Variable | Rôle | Côté |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL du projet Supabase | public |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | clé publique (ou ancienne `NEXT_PUBLIC_SUPABASE_ANON_KEY`) | public |
| `SUPABASE_SECRET_KEY` | clé de service (ou ancienne `SUPABASE_SERVICE_ROLE_KEY`), écrit le cache des données publiques | **serveur uniquement** |
| `APP_OWNER_EMAILS` | adresses autorisées à recevoir un lien, séparées par des virgules (facultatif) | serveur |

Aucun secret n'est exposé au navigateur. Toutes les tables sont protégées par des politiques RLS.

## 3. Lancement en local

Prérequis : Node.js 22, Docker.

```bash
npm ci
npx supabase start -x studio,imgproxy,edge-runtime,logflare,vector,realtime,storage-api,postgres-meta,supavisor
npx supabase status -o env      # URL, clés, Mailpit
cp .env.example .env.local      # puis reportez API_URL, PUBLISHABLE_KEY (ou ANON_KEY), SECRET_KEY (ou SERVICE_ROLE_KEY)
npm run dev                     # http://localhost:3000
```

Les e-mails de connexion arrivent dans Mailpit : <http://127.0.0.1:54324>. Les données de démonstration se chargent
depuis **Réglages → Données de démonstration** (10 biens synthétiques marqués « DÉMO », supprimables en un clic).

## 4. Tests

| Commande | Contenu |
|---|---|
| `npm test` | moteur financier (T1–T8, T14, T17), domaine (T9–T11, T15), sources (T12, T13), sauvegarde |
| `npm run test:db` | migrations + RLS sur un Postgres nu (T16) — `TEST_DATABASE_URL` requis |
| `npm run test:live` | code d'intégration contre les sources publiques réelles (réseau requis) |
| `npm run test:e2e` | parcours principal Playwright (Supabase local + `npm run build`) |
| `npm run lint`, `npm run typecheck` | ESLint, TypeScript |

La CI (`.github/workflows/ci.yml`) exécute tout cela à chaque push, y compris le parcours complet sur un Supabase local.
`.github/workflows/sources.yml` vérifie les sources réelles.

## 5. Sauvegarde et restauration

**Réglages → Export, sauvegarde et restauration** :

- **Sauvegarde JSON complète** : toutes vos tables (profils, zones, biens, observations de prix, imports).
- **Restaurer** : rejouer le même fichier deux fois ne crée pas de doublons (écriture par identifiant ; un bien de même
  URL est rattaché à l'existant ; une observation identique n'est jamais dupliquée).
- **Export CSV des biens** : indicateurs, verdict, et statut et source de chaque valeur (séparateur `;`, s'ouvre dans un
  tableur).

Faites une sauvegarde régulièrement.

## 6. Projet Supabase en pause

Les projets Supabase gratuits sont **mis en pause après une période d'inactivité** (7 jours sans requête selon les
conditions constatées en octobre 2026 ; à vérifier dans les conditions en vigueur). L'application affiche alors une
erreur de connexion. Pour réactiver :

1. <https://supabase.com/dashboard> → votre projet `sentinel` → **Restore project** (quelques minutes).
2. Si le projet a été supprimé après une longue pause : relancez le workflow **Déploiement** (il recrée un projet),
   reconnectez-vous, puis **Réglages → Restaurer** avec votre dernière sauvegarde JSON.

## 7. Format du CSV d'import

Fichier exemple : [`docs/exemple-import.csv`](docs/exemple-import.csv) (aussi téléchargeable dans Réglages).

| Colonne | Obligatoire | Exemple |
|---|---|---|
| `type` | oui | appartement, maison, immeuble, murs commerciaux, fonds de commerce |
| `prix` | oui | `229 000` ou `229000` |
| `surface` | oui | `31` (m²) |
| `adresse` | oui | `24 rue de Bellevue, 92100 Boulogne-Billancourt` ou une commune |
| `url` | oui | URL de l'annonce |
| `loyer` | non | loyer mensuel hors charges |
| `charges` | non | charges de copropriété annuelles |
| `taxe foncière` | non | annuelle |
| `dpe` | non | lettre de A à G |
| `travaux` | non | montant estimé |
| `lots` | non | nombre de lots |
| `description` | non | texte libre |

Séparateur virgule ou point-virgule, nombres au format français ou anglais. Les noms de colonnes sont reconnus
automatiquement et l'association peut être corrigée. Rien n'est écrit avant votre confirmation ; chaque ligne rejetée
est expliquée. Une URL déjà connue ajoute une observation de prix ; notes et statuts ne sont jamais modifiés.

## 8. Coût et limites

Coût attendu : **0 €**, dans les limites des offres gratuites :

- **Supabase Free** : 2 projets actifs, 500 Mo de base, mise en pause après inactivité, e-mails d'authentification à
  débit limité (quelques e-mails par heure) et réservés aux membres de l'organisation — une session dure longtemps,
  le besoin est faible. Pour d'autres adresses : configurer un SMTP (Authentication → Emails → SMTP).
- **Vercel Hobby** : usage personnel non commercial, quotas de fonctions et de bande passante largement suffisants.
- **GitHub Actions** : gratuit pour un dépôt public (la CI y tourne).
- Sources publiques : gratuites, sans clé (voir [`docs/sources.md`](docs/sources.md)).

## 9. Organisation du code

```
app/                  pages (App Router), actions serveur, routes API
  (app)/              écrans protégés : accueil, biens/[id], comparer, reglages
  api/                enrichissement, zones, radar, export CSV, sauvegarde, état des sources
lib/finance/          moteur financier : fonctions pures, sans réseau (fiscal-params.ts daté et sourcé)
lib/market/           lecture des formats publics (DVF, ANIL, encadrement, Géorisques, géocodage)
lib/server/           appels sortants (8 s, limite de débit), cache, enrichissement, déploiement des dépendances
lib/domain/           URL, doublons, historique de prix, zones, import / export, sauvegarde, démonstration
components/           interface (Tailwind, composants Radix)
supabase/             migrations SQL + RLS, configuration locale, modèle d'e-mail
tests/                unit, db (RLS), live (sources réelles) ; e2e/ : Playwright
```

Voir aussi [`DECISIONS.md`](DECISIONS.md) (choix faits pendant la construction) et [`CHANGELOG.md`](CHANGELOG.md).

Mention : estimations de loyer « Estimations ANIL, à partir des données du Groupe SeLoger et de leboncoin ».
Outil d'aide à la décision : les estimations fiscales sont simplifiées et à valider avec un conseil.
