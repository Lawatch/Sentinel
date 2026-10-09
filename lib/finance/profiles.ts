import type { ProfileParams } from './schema';

/**
 * Trois profils préremplis. Toutes leurs valeurs sont des hypothèses : elles
 * apparaissent avec la pastille « hypothèse » et se modifient dans Réglages.
 */
const base: Omit<ProfileParams, 'asset_types'> = {
  budget_max: 300000,
  apport: 30000,
  taux_credit: 0.036,
  duree_credit_mois: 240,
  assurance_taux: 0.003,
  assurance_mode: 'capital_initial',
  frais_notaire_ancien: 0.08,
  frais_notaire_neuf: 0.025,
  frais_bancaires: 2500,
  vacance: 0.05,
  gestion: 0,
  gli: 0,
  pno_annuelle: 150,
  entretien_m2_an: 5,
  taxe_fonciere_m2_an: 15,
  charges_copro_m2_an: 30,
  part_recuperable_copro: 0.6,
  charges_recuperables_m2_mois: 2,
  mobilier_defaut: 5000,
  regime_fiscal: 'aucun',
  tmi: null,
  revenus_foyer_mensuels: null,
  mensualites_existantes: null,
  cash_flow_cible: 0,
  scenarios: {
    prudent_vacance_plus: 0.05,
    favorable_vacance_moins: 0.02,
    prudent_travaux_plus: 0.2,
    prudent_taux_plus: 0.005,
  },
  verdict: { ecart_max_negociation: 0.1, couverture_min_fonds: 1.25 },
  lmnp: { part_terrain: 0.15, duree_bati_ans: 30, duree_travaux_ans: 15, duree_mobilier_ans: 7 },
  hcsf: { taux_max: 0.35, duree_max_mois: 300, ponderation_loyers: 0.7 },
  murs: { vacance_relocation_mois: 12, horizon_min_mois: 36 },
  fonds: { taux_marge_cv_defaut: 0.6 },
};

export const DEFAULT_PROFILES: { nom: string; params: ProfileParams }[] = [
  {
    nom: 'Locatif résidentiel',
    params: { ...base, asset_types: ['appartement', 'maison', 'immeuble'] },
  },
  {
    nom: 'Murs commerciaux',
    params: {
      ...base,
      asset_types: ['murs_commerciaux'],
      budget_max: 400000,
      apport: 60000,
      duree_credit_mois: 180,
      taux_credit: 0.042,
      vacance: 0.08,
      charges_copro_m2_an: 0,
    },
  },
  {
    nom: 'Reprise de fonds de commerce',
    params: {
      ...base,
      asset_types: ['fonds_commerce'],
      budget_max: 250000,
      apport: 60000,
      duree_credit_mois: 84,
      taux_credit: 0.045,
      cash_flow_cible: 0,
    },
  },
];

/** Libellés des paramètres, pour l'écran Réglages et « Comment c'est calculé ». */
export const PROFILE_PARAM_LABELS: Record<string, string> = {
  budget_max: 'Budget maximal (prix)',
  apport: 'Apport disponible',
  taux_credit: 'Taux nominal du crédit',
  duree_credit_mois: 'Durée du crédit (mois)',
  assurance_taux: 'Assurance emprunteur (taux annuel)',
  assurance_mode: 'Base de l’assurance',
  frais_notaire_ancien: 'Frais de notaire — ancien',
  frais_notaire_neuf: 'Frais de notaire — neuf',
  frais_bancaires: 'Frais bancaires (dossier, garantie, courtage)',
  vacance: 'Vacance locative',
  gestion: 'Gestion (% des loyers encaissés)',
  gli: 'Garantie loyers impayés (% des loyers)',
  pno_annuelle: 'Assurance PNO (€/an)',
  entretien_m2_an: 'Provision d’entretien (€/m²/an)',
  taxe_fonciere_m2_an: 'Taxe foncière par défaut (€/m²/an)',
  charges_copro_m2_an: 'Charges de copropriété par défaut (€/m²/an)',
  part_recuperable_copro: 'Part récupérable des charges de copropriété',
  charges_recuperables_m2_mois: 'Charges récupérables (€/m²/mois, conversion CC → HC)',
  mobilier_defaut: 'Mobilier par défaut (location meublée)',
  regime_fiscal: 'Régime fiscal',
  tmi: 'Tranche marginale d’imposition',
  revenus_foyer_mensuels: 'Revenus nets mensuels du foyer',
  mensualites_existantes: 'Mensualités de crédit existantes',
  cash_flow_cible: 'Cash-flow mensuel cible',
};
