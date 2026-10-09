# Décisions

Ambiguïtés non bloquantes tranchées pendant la construction, avec leur raison.

## Environnement et versions

1. **Versions** : Next.js 16.3.8, React 19.2.8, TypeScript 5.9.3, Tailwind 4.3.3, Supabase JS 2.117.3, @supabase/ssr 0.12.7,
   Zod 4.6.5, Leaflet 1.9.4, Geoman 2.20.2, Vitest 5.0.3, Playwright 1.56.1. Next 16.4.0 (sorti 3 jours plus tôt) et
   TypeScript 7 (compilateur natif) n'ont pas été retenus, par prudence. Vitest 4 provoquait un plantage de npm
   (`edgesOut`) : Vitest 5.0.3 l'a remplacé.
2. **Next.js 16** : `middleware` s'appelle désormais `proxy.ts` ; `params` et `cookies()` sont asynchrones ; Cache
   Components non activé (toutes les pages utilisateur sont dynamiques, le cache des données publiques est en base).
3. **shadcn/ui** : le registre n'étant pas joignable depuis l'environnement de construction, les composants ont été
   écrits à la main dans le même esprit (Radix + Tailwind + `cva`), dans `components/ui`.
4. **Clés Supabase** : le code accepte les nouvelles clés (`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`)
   et les anciennes (`…_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`).

## Authentification

5. **Lien magique + code à 6 chiffres** : le même e-mail contient les deux. Le code évite l'échec du lien quand l'e-mail
   s'ouvre dans un autre navigateur que celui de la demande (cas fréquent sur téléphone).
6. **Outil personnel** : le déploiement crée le compte du propriétaire (`APP_OWNER_EMAIL`) puis **ferme les inscriptions**.
   `APP_OWNER_EMAILS` restreint aussi l'envoi du lien côté serveur.

## Données et modèle

7. **Tables publiques sans `user_id`** : `dvf_sales` et `market_cache` sont des caches de données publiques partagées
   (lecture par tout utilisateur connecté, écriture par la clé de service) ; elles portent une politique RLS mais pas de
   `user_id`, conformément au tableau de la section 9.
8. **Enrichissement stocké** dans `properties.enrichissement` (jsonb) avec statut, source, millésime et date de récupération
   par source : réafficher un bien ne fait aucun appel externe.
9. **Champs optionnels ajoutés** à l'analyse résidentielle : nombre de pièces, époque de construction, meublé, part non
   récupérable des charges, date et énergie du DPE, loyer de référence majoré. Nécessaires à l'encadrement, au
   reclassement DPE et à la fiscalité LMNP. Ils restent repliés et facultatifs.
10. **Statut d'un DPE choisi dans la base ADEME** : « estimé » (source publique, numéro cité). Il passe « vérifié » par la
    checklist, comme tout justificatif.
11. **Instantané à l'offre** : stocké dans `properties.instantanes` (entrées, paramètres du profil, données de marché,
    résultats complets, version du moteur).

## Calculs

12. **Valeurs par défaut du profil** (taxe foncière, copropriété, PNO, entretien au m²) : sans elles, un bien saisi en
    5 champs serait toujours « non calculable ». Elles sont toutes étiquetées « hypothèse » et font baisser la confiance.
    Un loyer inconnu reste inconnu (pas de valeur par défaut) : sans loyer déclaré ni indicateur de marché, le cash-flow
    est « non calculable » (T8).
13. **Gestion et GLI** calculées sur les loyers encaissés (après vacance).
14. **Frais de notaire par défaut** : 8 % dans l'ancien (DMTO à 5 % dans les huit départements d'Île-de-France depuis
    2025), 2,5 % dans le neuf. Paramètres du profil, étiquetés « hypothèse ».
15. **Prix d'offre maximal** : les honoraires d'agence saisis en euros restent constants quand le prix varie.
16. **Seuils de bascule et enrichissement à 10 ans** : calculés sur le scénario central.
17. **Fiscalité simplifiée** : un déficit de l'année 1 donne un impôt nul (non valorisé) ; au réel foncier, ni travaux
    déductibles ni frais d'emprunt ne sont déduits (le cahier des charges ne cite que les intérêts et l'assurance).
    Prélèvements sociaux : 17,2 % en location nue, 18,6 % en LMNP (LFSS 2026).
18. **Encadrement** : plafond = loyer de référence majoré × surface (hors complément de loyer). Valeur saisie par
    l'utilisateur prioritaire sur les données ouvertes.
19. **Ordre du verdict** : un point bloquant (DPE G, loyer au-dessus du plafond, budget dépassé) donne « Hors critères »
    même si les données sont fragiles (T14) ; viennent ensuite « Données insuffisantes », « À visiter », « À négocier ».
    Le budget compare le **prix demandé** au budget maximal.
20. **Confiance des actifs commerciaux** : le critère des 8 / 5 comparables DVF ne s'applique qu'au résidentiel (DVF est
    peu fiable pour les locaux et sans objet pour un fonds).
21. **Murs commerciaux, scénario prudent** : vacance = max(vacance du profil + 5 points, 12 mois / horizon), horizon =
    max(36 mois, mois jusqu'à la prochaine échéance + 12) ; loyer = min(loyer actuel, loyer de marché saisi) ; travaux de
    remise en état ajoutés ; refacturation « inconnue » traitée comme « non » sauf dans le scénario favorable.
22. **Fonds de commerce** : le prêt, s'il n'est pas saisi, vaut besoin − apport ; verdict sur le scénario CA −10 %
    (trésorerie ≥ cible × 12 et couverture ≥ 1,25, paramétrable) ; prix maximal par dichotomie sur ce scénario.
23. **Alertes DPE** : l'interdiction de la classe G porte sur tout nouveau bail depuis le 1er janvier 2025. Les classes F
    (2028) et E (2034) sont des alertes, comme le reclassement possible des DPE « électriques » antérieurs à 2026.

## Sources

24. **DVF** : la fenêtre de 24 mois se termine à la fin du millésime publié (31/12/2025 au moment de la livraison), pas à la
    date du jour : sinon la moitié de la fenêtre serait vide.
25. **Géorisques** : le rapport complet dépasse le délai de 8 s (15–16 s mesurés) ; remplacé par huit appels rapides.
26. **Encadrement Plaine Commune / Est Ensemble** : seules les valeurs 2023 sont en données ouvertes ; elles sont
    utilisées avec leur millésime et un avertissement.
27. **Communes d'une zone** : `geo.api.gouv.fr` (contours simplifiés par département, arrondissements pour Paris),
    départements détectés par une grille de 36 points dans l'emprise. Source ouverte supplémentaire, nécessaire au radar.
28. **Radar** : appartements par défaut (bascule maisons), loyer HC = indicateur ANIL − charges récupérables du profil.
29. **Limite de débit** : en mémoire de l'instance serveur (par hôte pour les sources, par utilisateur pour les routes),
    suffisante pour un usage personnel ; pas de table supplémentaire.

## Hors périmètre respecté

30. Aucune tâche planifiée dans l'application (y compris pas de « réveil » automatique du projet Supabase) : la mise en
    pause d'un projet gratuit inactif est documentée dans le README avec la marche à suivre, et la sauvegarde JSON couvre
    le risque.
