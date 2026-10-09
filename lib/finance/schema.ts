import { z } from 'zod';

/**
 * Schémas des entrées d'un bien et des profils d'investissement.
 * Chaque valeur qui entre dans un calcul est stockée { valeur, statut, source, date }.
 */

export const fieldStatusSchema = z.enum(['declare', 'verifie', 'estime', 'hypothese', 'inconnu']);

export const numField = z.object({
  valeur: z.number().finite().nullable(),
  statut: fieldStatusSchema,
  source: z.string().nullish(),
  date: z.string().nullish(),
});
export const strField = z.object({
  valeur: z.string().nullable(),
  statut: fieldStatusSchema,
  source: z.string().nullish(),
  date: z.string().nullish(),
});

export type NumField = z.infer<typeof numField>;
export type StrField = z.infer<typeof strField>;

export const unknownNum = (): NumField => ({ valeur: null, statut: 'inconnu' });
export const unknownStr = (): StrField => ({ valeur: null, statut: 'inconnu' });

export const ASSET_TYPES = [
  'appartement',
  'maison',
  'immeuble',
  'murs_commerciaux',
  'fonds_commerce',
  'titres_societe',
  'murs_et_fonds',
] as const;
export const assetTypeSchema = z.enum(ASSET_TYPES);
export type AssetType = z.infer<typeof assetTypeSchema>;

export const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  appartement: 'Appartement',
  maison: 'Maison',
  immeuble: 'Immeuble de rapport',
  murs_commerciaux: 'Murs commerciaux',
  fonds_commerce: 'Fonds de commerce',
  titres_societe: 'Titres de société',
  murs_et_fonds: 'Murs + fonds',
};

/** Types hors périmètre V1 : aucun calcul, message dédié. */
export const OUT_OF_SCOPE_TYPES: AssetType[] = ['titres_societe', 'murs_et_fonds'];
export const RESIDENTIAL_TYPES: AssetType[] = ['appartement', 'maison', 'immeuble'];

export const EPOQUES = ['avant_1946', '1946_1970', '1971_1990', 'apres_1990'] as const;
export const EPOQUE_LABELS: Record<(typeof EPOQUES)[number], string> = {
  avant_1946: 'Avant 1946',
  '1946_1970': '1946–1970',
  '1971_1990': '1971–1990',
  apres_1990: 'Après 1990',
};

export const triState = z.enum(['oui', 'non', 'inconnu']);

export const mursSchema = z.object({
  loue: z.boolean().default(true),
  /** Loyer contractuel annuel hors taxes. */
  loyer_annuel_ht: numField.default(unknownNum),
  /** Loyer de marché annuel HT saisi par l'utilisateur (relocation). */
  loyer_marche_annuel_ht: numField.default(unknownNum),
  indice: z.enum(['ILC', 'ILAT', 'ICC', 'autre', 'inconnu']).default('inconnu'),
  fin_bail: z.string().nullable().default(null),
  prochaine_triennale: z.string().nullable().default(null),
  refacturation_tf: triState.default('inconnu'),
  refacturation_charges: triState.default('inconnu'),
  charges_annuelles: numField.default(unknownNum),
  depot_garantie: numField.default(unknownNum),
  activite_locataire: z.string().default(''),
  regime_tva: z.string().default(''),
  travaux_remise_en_etat: numField.default(unknownNum),
});
export type MursInputs = z.infer<typeof mursSchema>;

export const retraitementSchema = z.object({
  libelle: z.string(),
  montant: z.number().finite(),
  justificatif: z.string().default(''),
});

export const fondsSchema = z.object({
  stock_inclus: z.boolean().default(false),
  ca: z.array(numField).default(() => [unknownNum(), unknownNum(), unknownNum()]),
  ebe: z.array(numField).default(() => [unknownNum(), unknownNum(), unknownNum()]),
  remuneration_cedant: numField.default(unknownNum),
  remuneration_cible: numField.default(unknownNum),
  retraitements: z.array(retraitementSchema).default([]),
  loyer_annuel: numField.default(unknownNum),
  charges_locatives_annuelles: numField.default(unknownNum),
  duree_restante_bail_mois: numField.default(unknownNum),
  destination_bail: z.string().default(''),
  effectif: numField.default(unknownNum),
  masse_salariale: numField.default(unknownNum),
  stock: numField.default(unknownNum),
  investissements_initiaux: numField.default(unknownNum),
  investissements_maintien: numField.default(unknownNum),
  bfr: numField.default(unknownNum),
  bfr_aide: z
    .object({ stocks: z.number().nullable(), creances: z.number().nullable(), dettes: z.number().nullable() })
    .default({ stocks: null, creances: null, dettes: null }),
  honoraires: numField.default(unknownNum),
  apport: numField.default(unknownNum),
  pret_montant: numField.default(unknownNum),
  pret_taux: numField.default(unknownNum),
  pret_duree_mois: numField.default(unknownNum),
  taux_marge_cv: numField.default(unknownNum),
});
export type FondsInputs = z.infer<typeof fondsSchema>;

export const dpeSchema = z.object({
  classe: strField.default(unknownStr),
  date: strField.default(unknownStr),
  energie_chauffage: strField.default(unknownStr),
  numero: z.string().nullable().default(null),
});

export const propertyInputsSchema = z.object({
  prix: numField.default(unknownNum),
  surface: numField.default(unknownNum),
  /** Loyer mensuel hors charges, tous lots confondus. */
  loyer: numField.default(unknownNum),
  /** Loyers mensuels HC par lot (si plusieurs lots) : leur somme remplace « loyer ». */
  loyers_lots: z.array(numField).default([]),
  nb_lots: numField.default(unknownNum),
  /** Charges de copropriété annuelles totales. */
  charges_copro: numField.default(unknownNum),
  /** Part non récupérable des charges de copropriété, annuelle (si connue). */
  charges_copro_non_recup: numField.default(unknownNum),
  taxe_fonciere: numField.default(unknownNum),
  travaux: numField.default(unknownNum),
  travaux_renovation_energetique: z.boolean().default(false),
  honoraires_agence: numField.default(unknownNum),
  honoraires_inclus: z.boolean().default(true),
  frais_bancaires: numField.default(unknownNum),
  mobilier: numField.default(unknownNum),
  meuble: z.boolean().default(false),
  neuf: z.boolean().default(false),
  dpe: dpeSchema.default(() => dpeSchema.parse({})),
  pieces: numField.default(unknownNum),
  epoque: strField.default(unknownStr),
  /** Loyer de référence majoré (€/m²/mois HC) saisi quand les données ouvertes manquent. */
  loyer_reference_majore: numField.default(unknownNum),
  description: z.string().default(''),
  murs: mursSchema.optional(),
  fonds: fondsSchema.optional(),
});
export type PropertyInputs = z.infer<typeof propertyInputsSchema>;

export const fiscalRegimeSchema = z.enum(['aucun', 'micro_foncier', 'reel_foncier', 'lmnp_micro', 'lmnp_reel']);
export type FiscalRegime = z.infer<typeof fiscalRegimeSchema>;
export const FISCAL_REGIME_LABELS: Record<FiscalRegime, string> = {
  aucun: 'Non renseigné',
  micro_foncier: 'Micro-foncier',
  reel_foncier: 'Réel foncier',
  lmnp_micro: 'LMNP micro-BIC',
  lmnp_reel: 'LMNP réel',
};

/** Paramètres d'un profil d'investissement (jsonb validé). Les valeurs par défaut sont des hypothèses. */
export const profileParamsSchema = z.object({
  asset_types: z.array(assetTypeSchema).min(1),
  budget_max: z.number().nonnegative().nullable(),
  apport: z.number().nonnegative(),
  taux_credit: z.number().min(0).max(0.3),
  duree_credit_mois: z.number().int().min(12).max(420),
  assurance_taux: z.number().min(0).max(0.05),
  assurance_mode: z.enum(['capital_initial', 'capital_restant_du']),
  frais_notaire_ancien: z.number().min(0).max(0.2),
  frais_notaire_neuf: z.number().min(0).max(0.2),
  frais_bancaires: z.number().nonnegative(),
  vacance: z.number().min(0).max(1),
  gestion: z.number().min(0).max(0.5),
  gli: z.number().min(0).max(0.2),
  pno_annuelle: z.number().nonnegative(),
  entretien_m2_an: z.number().nonnegative(),
  taxe_fonciere_m2_an: z.number().nonnegative(),
  charges_copro_m2_an: z.number().nonnegative(),
  part_recuperable_copro: z.number().min(0).max(1),
  charges_recuperables_m2_mois: z.number().nonnegative(),
  mobilier_defaut: z.number().nonnegative(),
  regime_fiscal: fiscalRegimeSchema,
  tmi: z.number().min(0).max(0.45).nullable(),
  revenus_foyer_mensuels: z.number().nonnegative().nullable(),
  mensualites_existantes: z.number().nonnegative().nullable(),
  cash_flow_cible: z.number(),
  scenarios: z.object({
    prudent_vacance_plus: z.number().min(0).max(1),
    favorable_vacance_moins: z.number().min(0).max(1),
    prudent_travaux_plus: z.number().min(0).max(5),
    prudent_taux_plus: z.number().min(0).max(0.1),
  }),
  verdict: z.object({
    ecart_max_negociation: z.number().min(0).max(1),
    couverture_min_fonds: z.number().min(0).max(10),
  }),
  lmnp: z.object({
    part_terrain: z.number().min(0).max(1),
    duree_bati_ans: z.number().min(1).max(100),
    duree_travaux_ans: z.number().min(1).max(50),
    duree_mobilier_ans: z.number().min(1).max(20),
  }),
  hcsf: z.object({
    taux_max: z.number().min(0).max(1),
    duree_max_mois: z.number().int().min(12).max(420),
    ponderation_loyers: z.number().min(0).max(1),
  }),
  murs: z.object({
    vacance_relocation_mois: z.number().min(0).max(60),
    horizon_min_mois: z.number().min(12).max(240),
  }),
  fonds: z.object({
    taux_marge_cv_defaut: z.number().min(0.01).max(1),
  }),
});
export type ProfileParams = z.infer<typeof profileParamsSchema>;
