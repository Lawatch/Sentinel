# Sources publiques utilisées

Vérifiées le 9 octobre 2026 par des appels réels depuis GitHub Actions (sondes puis `tests/live/sources.live.test.ts`).
Aucune ne demande de clé. Tous les appels passent par des routes serveur : délai d'attente de 8 s
(20 s pour les deux fichiers CSV de la carte des loyers, 4,7 Mo chacun), au plus 4 requêtes simultanées
par hôte espacées de 120 ms, et cache en base (`market_cache`, `dvf_sales`).

Une source en erreur s'affiche « indisponible », jamais « 0 résultat ». L'enrichissement d'un bien déjà en cache
ne fait aucun appel externe ; « Actualiser les données » force un nouvel appel.

| Source | Usage | Point d'accès | Millésime constaté |
|---|---|---|---|
| DVF géolocalisées (Etalab, DGFiP) | Comparables, prix médian au m² | `https://files.data.gouv.fr/geo-dvf/latest/csv/{année}/communes/{dép}/{insee}.csv` | 2021 → 31/12/2025 (fichiers 2025 mis à jour le 18/05/2026) |
| Carte des loyers ANIL, édition 2025 | Loyer de marché | `https://static.data.gouv.fr/resources/carte-des-loyers-indicateurs-de-loyers-dannonce-par-commune-en-2025/…/pred-app-mef-dhup.csv` (et `pred-mai-…`) | 2025 (annonces 2019–2025, biens mis en location au 3e trimestre 2025) |
| DPE logements existants (ADEME) | DPE enregistrés à l'adresse | `https://data.ademe.fr/data-fair/api/v1/datasets/dpe03existant/lines` | DPE depuis juillet 2021, mis à jour quotidiennement |
| Géocodage de la Géoplateforme (IGN) | Adresse → coordonnées, code INSEE, identifiant BAN | `https://data.geopf.fr/geocodage/search` | continu |
| Géorisques (API v1) | Risques au point | `https://www.georisques.gouv.fr/api/v1/…` | continu |
| Encadrement des loyers — Paris | Plafond légal | `https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/logement-encadrement-des-loyers/records` | dernière année publiée : 2025 |
| Encadrement — Plaine Commune | Plafond légal | data.gouv.fr, jeu « Encadrement des loyers de Plaine Commune 2023 » (CSV + quartiers GeoJSON) | 2023 |
| Encadrement — Est Ensemble | Plafond légal | data.gouv.fr, jeu « Encadrement des loyers de Est Ensemble » (JSON 2023 + quartiers GeoJSON) | 2023 |
| Découpage administratif (geo.api.gouv.fr) | Communes d'une zone, contours | `https://geo.api.gouv.fr/departements/{dép}/communes?format=geojson&geometry=contour` | COG en vigueur |
| Plan IGN (WMTS Géoplateforme) | Fond de carte | `https://data.geopf.fr/wmts?…LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2…` | continu |

## DVF

- Une ligne par lot, local et culture : les lignes sont **regroupées par `id_mutation`**.
- Colonnes utilisées : `id_mutation, date_mutation, nature_mutation, valeur_fonciere, code_commune, type_local,
  surface_reelle_bati, nombre_pieces_principales, id_parcelle, lot1_numero, longitude, latitude` (+ adresse).
- Retenu comme comparable résidentiel : nature « Vente », une seule valeur foncière, **un seul local** Appartement ou Maison
  (dépendances acceptées, aucun local commercial). Les locaux répétés sur plusieurs lignes de culture sont dédoublonnés
  par (parcelle, lot, type, surface, pièces).
- Prix au m² = valeur foncière / surface réelle bâtie ; valeurs hors 1er–99e centile de la commune exclues
  (centiles « au rang le plus proche », pour ne pas écarter d'office les extrêmes d'un petit échantillon).
- Période : 24 mois **avant la fin du millésime publié** (lue dans `temporal_coverage.end` du jeu data.gouv.fr
  `5cc1b94a634f4165e96436c1`, vérifiée au plus une fois par jour). Au 9/10/2026 : 01/01/2024 → 31/12/2025.
- Périmètre : 500 m, surface ±30 % ; moins de 8 ventes → 1 km, puis la commune (affiché). Moins de 5 ventes :
  « comparables insuffisants ». Les communes à moins d'1 km sont chargées (8 points sondés sur le cercle).
- Paris, Lyon, Marseille : fichiers par arrondissement (`75115`…), comme les codes renvoyés par le géocodeur.
- **Non couverts : Alsace-Moselle (57, 67, 68) et Mayotte (976)** — le fichier n'existe pas (HTTP 404 constaté pour Strasbourg) ;
  l'outil l'affiche explicitement.
- Locaux commerciaux : ventes affichées à titre indicatif (surfaces souvent absentes), sans estimation.

## Carte des loyers (ANIL)

- CSV séparateur `;`, virgule décimale, encodage Windows-1252 (non UTF-8, vérifié).
- Colonnes : `INSEE_C, LIBGEO, DEP, loypredm2, lwr.IPm2, upr.IPm2, TYPPRED, nbobs_com, nbobs_mail, R2_adj`.
- Indicateur **charges comprises**, logements **non meublés**, bien type (appartement 52 m², maison 92 m²).
- Conversion en hors charges : charges récupérables saisies (part récupérable du profil) ou paramètre €/m²/mois du profil,
  étiqueté « hypothèse ».
- `TYPPRED = maille` : indicateur d'une maille plus large que la commune, signalé. R² < 0,5 : signalé.
- Mention obligatoire reprise dans l'interface : « Estimations ANIL, à partir des données du Groupe SeLoger et de leboncoin ».
- À la première demande pour une commune, les deux fichiers sont téléchargés et toutes les communes du département
  sont mises en cache (millésime 2025).

## DPE (ADEME)

- Jeu `dpe03existant` (virtuel, filtré sur `dpe_desactive = 0`). Recherche par `identifiant_ban_eq` = identifiant BAN
  renvoyé par le géocodeur (`92012_0651_00093`), tri `-date_etablissement_dpe`.
- Champs : `numero_dpe, date_etablissement_dpe, etiquette_dpe, etiquette_ges, surface_habitable_logement,
  type_energie_principale_chauffage, complement_adresse_logement`.
- Candidats affichés : même adresse et surface à ±10 % ; l'utilisateur confirme. Le DPE retenu est « estimé »
  (source ADEME, numéro cité) et passe « vérifié » via la checklist.
- Ne couvre que les DPE établis depuis juillet 2021.

## Géocodage (IGN)

- `search?q=…&limit=5` → GeoJSON ; propriétés `label, score, citycode, city, postcode, id (BAN), type`.
- Score conservé ; **sous 0,6, confirmation sur la carte** (marqueur déplaçable).

## Géorisques

- Le « rapport » complet (`resultats_rapport_risque`) répond en **15–16 s** (mesuré trois fois), au-delà du délai de 8 s :
  il n'est pas utilisé. L'outil interroge à la place, en parallèle :
  `gaspar/risques`, `rga`, `zonage_sismique`, `radon`, `gaspar/catnat`, `installations_classees` (500 m),
  `ssp/casias` (200 m), `gaspar/azi` (0,2 à 1,5 s chacun).
- Liste factuelle. « Notable » (alerte) selon des critères explicites : argiles exposition forte, sismicité zone ≥ 3,
  radon classe 3, établissement Seveso à moins de 500 m.

## Encadrement des loyers

- Paris : requête par point (`intersects(geo_shape, geom'POINT(lon lat)')`), année la plus récente publiée,
  nombre de pièces (1 à 4 et plus), époque, meublé. Au 9/10/2026, la dernière année publiée est **2025** :
  un arrêté plus récent peut s'appliquer, l'interface le signale.
- Plaine Commune et Est Ensemble : valeurs **2023** (dernières données ouvertes trouvées) et quartiers GeoJSON
  (propriété `Zone`). Signalées comme anciennes.
- Ailleurs : « non applicable dans les données ouvertes utilisées ». Dans tous les cas, l'utilisateur peut saisir le
  loyer de référence majoré en vigueur, qui prime.

## Supabase et Vercel (offres gratuites)

- Supabase Free : 2 projets actifs, 500 Mo de base, **mise en pause après 7 jours sans activité** (à vérifier dans les
  conditions en vigueur) ; e-mails d'authentification avec le serveur intégré limités en débit et réservés aux membres
  de l'organisation Supabase.
- Vercel Hobby : usage personnel et non commercial ; durée maximale des fonctions configurée à 60 s
  pour l'enrichissement.
