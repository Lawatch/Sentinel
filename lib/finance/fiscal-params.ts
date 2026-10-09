/**
 * Paramètres fiscaux et réglementaires utilisés par le moteur.
 *
 * Toutes les valeurs ci-dessous ont été relevées le 9 octobre 2026. Elles
 * proviennent de textes officiels lorsque c'était possible (CGI, arrêtés) et,
 * à défaut, de publications professionnelles concordantes. Elles doivent être
 * revérifiées sur impots.gouv.fr / BOFiP / Légifrance avant toute décision :
 * l'écran affiche « estimation simplifiée, à valider avec un conseil ».
 *
 * Un seul fichier, daté et sourcé : modifier une valeur ici la change partout.
 */

export const FISCAL_PARAMS_VERSION = '2026-10-09';

export interface SourcedValue<T> {
  valeur: T;
  source: string;
  verifie_le: string;
  a_verifier: boolean;
}

const v = <T>(valeur: T, source: string, a_verifier = true): SourcedValue<T> => ({
  valeur,
  source,
  verifie_le: FISCAL_PARAMS_VERSION,
  a_verifier,
});

export const FISCAL_PARAMS = {
  /** Prélèvements sociaux sur revenus fonciers (location nue). */
  ps_foncier: v(
    0.172,
    "LFSS 2026 : les revenus fonciers restent au taux de CSG de 9,2 %, soit 17,2 % de prélèvements sociaux (publications professionnelles, à confirmer sur service-public.fr F2329).",
  ),
  /** Prélèvements sociaux sur revenus de location meublée non professionnelle. */
  ps_lmnp: v(
    0.186,
    'LFSS 2026 : CSG sur revenus du patrimoine portée à 10,6 %, soit 18,6 % de prélèvements sociaux, applicable à la location meublée (date d’effet à confirmer).',
  ),
  micro_foncier_abattement: v(0.3, 'CGI art. 32 : abattement forfaitaire de 30 %.', false),
  micro_foncier_plafond: v(15000, 'CGI art. 32 : recettes foncières brutes ≤ 15 000 €.', false),
  micro_bic_meuble_abattement: v(
    0.5,
    'CGI art. 50-0 (loi n° 2024-1039 du 19/11/2024) : location meublée de longue durée, abattement 50 %.',
  ),
  micro_bic_meuble_plafond: v(
    77700,
    'CGI art. 50-0 : plafond de recettes 77 700 € pour la location meublée de longue durée (revalorisation éventuelle à vérifier).',
  ),
  /** Barème des droits d'enregistrement sur cession de fonds de commerce. */
  droits_cession_fonds: v(
    [
      { jusqua: 23000, taux: 0 },
      { jusqua: 200000, taux: 0.03 },
      { jusqua: Number.POSITIVE_INFINITY, taux: 0.05 },
    ],
    'CGI art. 719 : 0 % jusqu’à 23 000 €, 3 % de 23 000 € à 200 000 €, 5 % au-delà (part départementale et communale incluses).',
  ),
} as const;

/** Paramètres réglementaires datés (DPE, HCSF). */
export const REGULATORY_PARAMS = {
  version: FISCAL_PARAMS_VERSION,
  dpe: {
    /** Classe G : interdite à la location pour tout nouveau bail depuis le 1er janvier 2025 (loi Climat et résilience). */
    interdiction: [
      { classe: 'G', date: '2025-01-01', bloquant: true },
      { classe: 'F', date: '2028-01-01', bloquant: false },
      { classe: 'E', date: '2034-01-01', bloquant: false },
    ],
    gel_loyers_classes: ['F', 'G'],
    /** Arrêté du 13 août 2025 : coefficient de conversion de l'électricité ramené de 2,3 à 1,9 au 1er janvier 2026. */
    changement_coefficient_electricite: '2026-01-01',
    source:
      'Loi n° 2021-1104 (Climat et résilience) ; arrêté du 13/08/2025 (coefficient électricité 1,9). Calendrier à revérifier en cas de report législatif.',
  },
  hcsf: {
    taux_endettement_max: 0.35,
    duree_max_mois: 300,
    ponderation_loyers: 0.7,
    source: 'Décision D-HCSF-2021-7 modifiée : 35 % assurance comprise, 25 ans ; loyers retenus à 70 % (pratique bancaire, paramétrable).',
  },
} as const;
