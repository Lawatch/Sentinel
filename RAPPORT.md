# Rapport final — V1 (9 octobre 2026)

Factuel et vérifiable : chaque affirmation renvoie à un test exécuté, à une exécution GitHub Actions ou à un fichier.

## 1. Ce qui est implémenté

Les trois lots de la section 11 sont livrés (détail dans [`CHANGELOG.md`](CHANGELOG.md)) :

| Lot | Contenu | Tests |
|---|---|---|
| 1 — Analyser un bien saisi à la main | authentification (lien + code), 7 tables + RLS, profils, ajout rapide, moteur financier complet (résidentiel, murs, fonds), fiche bien et scénarios, prix d'offre maximal, historique des prix, statuts et notes | T1–T10, T16, T17 ✅ |
| 2 — Enrichir automatiquement | géocodage, comparables DVF, loyer de marché, DPE, Géorisques, encadrement, verdict, confiance, checklist, état des sources | T12–T14 ✅, 13 vérifications sur sources réelles ✅ |
| 3 — Chercher et comparer | carte, zones et couche Marché, comparateur, import / export CSV, sauvegarde et restauration JSON, fiche fonds de commerce, vue imprimable | T11, T15 ✅, parcours Playwright ✅ |

Non implémenté, conformément au périmètre : collecte automatique d'annonces, alertes et tâches planifiées, score
composite, TRI et revente, montage murs + fonds et titres de société (message dédié, sans calcul), dépôt de fichiers
justificatifs, multi-utilisateur, fonctions d'IA, INSEE / Sirene, BODACC automatisé.

## 2. URL de l'application

**<https://sentinel-mocha-gamma.vercel.app>**

Déployée le 9 octobre 2026 par le workflow `Déploiement` (exécution 37935167849, commit `b9f0b51`), qui a vérifié en
ligne : page de connexion servie, base joignable (table `profiles`), URL du site et redirections enregistrées dans
Supabase, inscriptions fermées (relu sur le service de connexion lui-même). Projet Supabase `sentinel` en région Paris
(`eu-west-3`), projet Vercel `sentinel` (offre Hobby).

Connexion : saisissez votre adresse, puis cliquez sur le lien reçu par e-mail. L'offre gratuite de Supabase impose son
e-mail par défaut (lien seul, en anglais) ; le lien fonctionne même ouvert dans un autre navigateur que celui de la
demande (application de messagerie du téléphone).

## 3. État des sources (dernier appel réussi)

Mesuré le 9 octobre 2026 à 11:56 UTC par `tests/live/sources.live.test.ts` (GitHub Actions, exécution 37926783747),
qui exécute le code d'intégration réel de l'application :

| Source | État | Dernier appel réussi | Mesure |
|---|---|---|---|
| DVF géolocalisées | opérationnelle | 09/10/2026 11:56 UTC | millésime jusqu'au 31/12/2025 ; Boulogne : 188 ventes à 500 m, médiane 8 229 €/m² |
| Carte des loyers ANIL 2025 | opérationnelle | 09/10/2026 11:56 UTC | Boulogne : 29,73 €/m² CC (commune, 20 474 observations) |
| DPE ADEME | opérationnelle | 09/10/2026 11:56 UTC | candidats retrouvés par identifiant BAN |
| Géocodage IGN | opérationnelle | 09/10/2026 11:56 UTC | score 0,98 sur une adresse précise |
| Géorisques | opérationnelle | 09/10/2026 11:56 UTC | 8 points d'accès rapides ; rapport complet écarté (15–16 s) |
| Encadrement Paris | opérationnelle | 09/10/2026 11:56 UTC | dernière année publiée : 2025 |
| Encadrement Plaine Commune / Est Ensemble | opérationnelle | 09/10/2026 11:56 UTC | données 2023 (anciennes, signalées) |
| Découpage communal (geo.api.gouv.fr) | opérationnelle | 09/10/2026 11:56 UTC | zone test : 14 communes |
| Fond Plan IGN | opérationnel | 09/10/2026 (CI) | 16 tuiles chargées dans la capture d'écran |

Aucune source ne demande de clé. Dans l'application, **Réglages → État des sources → Tester maintenant** refait ce
contrôle et date chaque résultat.

## 4. Sortie réelle des tests

- `npm test` (Vitest) : **40 tests réussis sur 40** — T1 à T15 et T17, règles d'encadrement et de fonds, formats réels
  des sources, sauvegarde idempotente, en-têtes HTTP.
- `npm run test:db` (Postgres 16 + migrations) : **9 sur 9** — dont T16 (B ne voit, ne modifie ni ne crée rien chez A),
  absence d'accès anonyme, unicité de l'URL, motif de rejet obligatoire.
- `npm run test:live` (sources réelles) : **13 sur 13** (exécution 37926783747).
- Lien magique de l'e-mail par défaut ouvert dans un navigateur neuf (`e2e/lien-magique.spec.ts`) : réussi, lien rejoué
  refusé avec un message clair.
- `npx playwright test` sur Supabase local, application construite : **10 sur 10** (exécution CI 37928958040 sur le commit
  `a86ed5d`, et en local) — connexion par code, ajout en 5 champs, verdict enrichi, « Comment c'est calculé », baisse
  de prix de 6,0 %, URL avec paramètres de suivi, import CSV sans écriture avant confirmation, enrichissement groupé,
  comparateur, T16 par l'API, parcours mobile sans défilement horizontal.
- Script de déploiement : exécuté deux fois contre des API Supabase / Vercel simulées (schémas OpenAPI d'octobre 2026)
  et un Supabase local réel — migrations appliquées sur une base vierge (7 tables, 23 politiques), compte propriétaire
  créé, inscriptions fermées ; second passage idempotent. Le premier passage contre les vraies API aura lieu avec vos jetons.
- Lint (ESLint) et TypeScript : sans erreur. Build de production : réussi.

Temps mesurés : verdict affiché dès l'enregistrement (avant enrichissement) ; verdict enrichi **en cache : 1,3 à 1,9 s**
(objectif < 5 s) ; premier enrichissement d'un secteur jamais consulté : 6 à 11 s (téléchargement des fichiers DVF).

## 5. Limites connues et paramètres à vérifier

Paramètres datés du 9 octobre 2026, dans [`lib/finance/fiscal-params.ts`](lib/finance/fiscal-params.ts), **à vérifier
sur les sites officiels** : prélèvements sociaux 17,2 % (location nue) et 18,6 % (LMNP, LFSS 2026) ; micro-foncier 30 %
/ 15 000 € ; micro-BIC meublé 50 % / 77 700 € ; droits de cession de fonds 0 / 3 / 5 % ; calendrier DPE (G 2025, F 2028,
E 2034) et coefficient électricité 1,9 au 1er janvier 2026 ; HCSF 35 % / 25 ans / loyers à 70 %. Frais de notaire par
défaut 8 % (ancien) et 2,5 % (neuf), hypothèses du profil.

Limites :
- Fiscalité simplifiée de l'année 1 (pas de report de déficit, pas de fiscalité de revente) — affichée comme telle.
- DVF s'arrête au 31/12/2025 ; la fenêtre de 24 mois suit le millésime publié. Absent en Alsace-Moselle et à Mayotte.
- Carte des loyers : bien type, charges comprises ; sous-estime souvent les petites surfaces (signalé).
- Encadrement : données ouvertes 2025 (Paris) et 2023 (Plaine Commune, Est Ensemble). Un dépassement fondé sur les
  données 2023 est une alerte, pas un blocage ; saisir le loyer de référence majoré en vigueur le rend décisif.
- Murs commerciaux : DVF à titre indicatif ; loyer de marché à saisir.
- E-mails de connexion : serveur intégré de Supabase, à débit limité et réservé aux membres de l'organisation Supabase
  (d'où la consigne d'utiliser la même adresse). Sur l'offre gratuite, le modèle d'e-mail n'est pas modifiable : e-mail
  par défaut en anglais, lien seul (le code à 6 chiffres n'apparaît qu'avec un SMTP personnel).
- Limite de débit en mémoire (suffisante pour un usage personnel).
- `npm audit` signale 5 vulnérabilités « high » dans une dépendance de développement (`eslint-config-next` →
  `micromatch`), absente du code déployé.

## 6. Coût de fonctionnement

**0 € attendu** : Supabase Free (2 projets actifs, 500 Mo, pause après inactivité), Vercel Hobby (usage personnel non
commercial), GitHub Actions gratuit sur dépôt public, sources publiques sans clé. Ce qui pourrait le faire changer :
dépasser 500 Mo de base (des dizaines de milliers de ventes DVF par commune restent loin en dessous), un usage
commercial (Vercel Pro), ou le besoin d'un SMTP pour d'autres adresses (offres gratuites disponibles).

## 7. Actions restant à faire par l'utilisateur

1. Ouvrir <https://sentinel-mocha-gamma.vercel.app> et se connecter (lien reçu par e-mail).
2. Recommandé : régénérer les jetons Supabase et Vercel (ils ont transité en clair dans une conversation), puis mettre
   à jour les secrets GitHub `SUPABASE_ACCESS_TOKEN` et `VERCEL_TOKEN`. L'application en ligne n'en dépend pas.
3. Recommandé : fusionner la branche dans `main` pour que chaque mise à jour se déploie automatiquement.
4. Ensuite : faire une sauvegarde JSON de temps en temps (Réglages).
