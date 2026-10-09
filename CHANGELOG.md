# Journal des livraisons

## V1 — 9 octobre 2026

Les trois lots ont été livrés dans la même session. Chaque lot est utilisable seul ; les tests cités ont été exécutés
réellement (sortie dans le rapport final et dans la CI GitHub Actions).

### Lot 1 — Analyser un bien saisi à la main

- Authentification Supabase par lien magique et code à 6 chiffres ; compte du propriétaire seul (inscriptions fermées au
  déploiement).
- Sept tables, index et politiques RLS (`supabase/migrations/20261009000000_init.sql`).
- Trois profils préremplis (Locatif résidentiel, Murs commerciaux, Reprise de fonds de commerce), toutes valeurs en
  « hypothèse », modifiables dans Réglages.
- Ajout rapide en 5 champs (+ champs optionnels repliés), URL normalisée unique, proposition d'observation de prix si
  l'URL existe, « doublon possible » (même adresse, surface à 5 %) sans fusion automatique.
- Moteur financier complet en fonctions pures (`lib/finance`) : coût du projet, revenus, charges, RNE, rendements, crédit
  et tableau d'amortissement, trois cash-flows, fiscalité simplifiée (4 régimes, paramètres datés et sourcés),
  endettement HCSF, prix d'offre maximal par dichotomie, scénarios prudent / central / favorable, seuils de bascule,
  enrichissement à 10 ans, murs commerciaux, fonds de commerce.
- Fiche bien : en-tête de verdict, onglets Analyse / Marché / Vérifications / Suivi, statut de chaque chiffre,
  « Comment c'est calculé », recalcul instantané à la saisie.
- Statuts de suivi, motif de rejet obligatoire, notes, historique des prix avec baisse signalée, instantané figé au
  passage « Offre faite ».
- Tests : T1–T10, T16, T17 ✅.

### Lot 2 — Enrichir automatiquement

- Géocodage IGN (score conservé, confirmation sur carte sous 0,6), comparables DVF (500 m → 1 km → commune, ±30 %,
  24 mois, P1–P99), loyer de marché ANIL 2025 (conversion CC → HC), DPE ADEME (candidats à confirmer), Géorisques
  (liste factuelle), encadrement (Paris, Plaine Commune, Est Ensemble, ou saisie du loyer de référence majoré).
- Routes serveur avec délai de 8 s, limite de débit, cache `market_cache` / `dvf_sales` ; une source en panne
  s'affiche « indisponible ».
- Verdict, points bloquants et alertes (DPE G / F / E, reclassement électrique 2026, plafond d'encadrement, risques
  notables, HCSF), niveau de confiance A / B / C, checklist par type d'actif avec passage au statut « vérifié ».
- État des sources dans Réglages, avec test à la demande.
- Tests : T12–T14 ✅ ; intégration contre les sources réelles (13 vérifications) ✅.

### Lot 3 — Chercher et comparer

- Carte Leaflet + Plan IGN, zones nommées dessinées (Geoman), renommées, supprimées ; communes intersectées
  (30 au plus) ; couche Marché colorée par rendement brut théorique, communes à moins de 10 ventes grisées ;
  liste triable et filtres (zone, type, statut, verdict, budget).
- Comparateur de 2 à 4 biens, meilleur et moins bon chiffre mis en évidence.
- Import CSV (aperçu, association des colonnes, erreurs ligne par ligne, rien d'écrit avant confirmation),
  enrichissement groupé des biens importés, export CSV avec statut et source de chaque valeur.
- Sauvegarde JSON complète et restauration idempotente.
- Fiche dédiée fonds de commerce (besoin de financement, EBE retraité, ratios descriptifs, couverture, trésorerie,
  point mort, scénarios CA −10 % / −20 %).
- Vue imprimable d'une page. Données de démonstration (10 biens « DÉMO »).
- Tests : T11, T15 ✅ ; parcours Playwright complet (bureau et mobile) ✅.

### Déploiement

- Workflow `Déploiement` : provisionnement Supabase + Vercel automatisé, vérification de l'URL en ligne.
- Il attend les trois secrets du dépôt (`SUPABASE_ACCESS_TOKEN`, `VERCEL_TOKEN`, `APP_OWNER_EMAIL`) : sans eux il
  s'arrête en l'expliquant. Voir le README, section 1.

### Corrections apportées grâce aux tests réels

- En-tête `User-Agent` contenant une apostrophe typographique : tous les appels sortants échouaient (test des sources).
- Recherche de commune hors Paris incomplète (filtre de type combiné de geo.api.gouv.fr).
- Réponses vides de Géorisques traitées comme une erreur.
- Prix maximal d'un fonds qui ignorait la couverture minimale de la dette.
- Plafond d'encadrement issu de données de 2023 qui bloquait à tort (désormais une alerte).
- Carte qui ne recalculait pas sa taille ; liens de navigation sans nom accessible sur téléphone.
