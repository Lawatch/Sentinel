import { amortizationSchedule, firstYearInsurance, monthlyPayment, type InsuranceMode } from './credit';
import { FISCAL_PARAMS } from './fiscal-params';
import type { FiscalRegime } from './schema';

/**
 * Modèle numérique d'une opération locative (sections 6.1 à 6.7).
 * Entrées : uniquement des nombres déjà résolus ; aucune valeur par défaut cachée ici.
 */
export interface RentalNumbers {
  prix: number;
  taux_notaire: number;
  honoraires_agence: number;
  honoraires_inclus: boolean;
  travaux: number;
  frais_bancaires: number;
  mobilier: number;
  apport: number;
  taux_credit: number;
  duree_mois: number;
  assurance_taux: number;
  assurance_mode: InsuranceMode;
  /** Loyer mensuel hors charges théorique (tous lots). */
  loyer_mensuel_hc: number;
  vacance: number;
  taxe_fonciere: number;
  copro_non_recup: number;
  pno: number;
  gestion_taux: number;
  entretien: number;
  gli_taux: number;
}

export interface CostLine {
  label: string;
  montant: number;
}

export interface RentalResult {
  cout_lignes: CostLine[];
  frais_notaire: number;
  cout_total: number;
  capital: number;
  mensualite: number;
  assurance_annuelle: number;
  loyer_annuel_theorique: number;
  revenu_effectif: number;
  charges_lignes: CostLine[];
  charges: number;
  rne: number;
  rendement_brut: number;
  rendement_net: number;
  cf_avant_financement: number;
  cf_apres_credit: number;
  interets_annee1: number;
}

export function projectCost(n: RentalNumbers) {
  const frais_notaire = n.prix * n.taux_notaire;
  const honoraires = n.honoraires_inclus ? 0 : n.honoraires_agence;
  const lignes: CostLine[] = [
    { label: 'Prix', montant: n.prix },
    { label: 'Frais de notaire', montant: frais_notaire },
    { label: n.honoraires_inclus ? 'Honoraires d’agence (inclus dans le prix)' : 'Honoraires d’agence acquéreur', montant: honoraires },
    { label: 'Travaux', montant: n.travaux },
    { label: 'Frais bancaires', montant: n.frais_bancaires },
    { label: 'Mobilier', montant: n.mobilier },
  ];
  return { lignes, frais_notaire, total: lignes.reduce((s, l) => s + l.montant, 0) };
}

export function computeRental(n: RentalNumbers): RentalResult {
  const cost = projectCost(n);
  const capital = Math.max(0, cost.total - n.apport);
  const mensualite = monthlyPayment(capital, n.taux_credit, n.duree_mois);
  const assurance_annuelle = firstYearInsurance(capital, n.assurance_taux, n.assurance_mode, n.taux_credit, n.duree_mois);
  const loyer_annuel_theorique = n.loyer_mensuel_hc * 12;
  const revenu_effectif = loyer_annuel_theorique * (1 - n.vacance);
  const charges_lignes: CostLine[] = [
    { label: 'Taxe foncière', montant: n.taxe_fonciere },
    { label: 'Copropriété non récupérable', montant: n.copro_non_recup },
    { label: 'Assurance PNO', montant: n.pno },
    { label: 'Gestion', montant: revenu_effectif * n.gestion_taux },
    { label: 'Provision d’entretien', montant: n.entretien },
    { label: 'Garantie loyers impayés', montant: revenu_effectif * n.gli_taux },
  ];
  const charges = charges_lignes.reduce((s, l) => s + l.montant, 0);
  const rne = revenu_effectif - charges;
  const schedule = capital > 0 ? amortizationSchedule(capital, n.taux_credit, n.duree_mois).slice(0, 12) : [];
  const interets_annee1 = schedule.reduce((s, r) => s + r.interets, 0);
  return {
    cout_lignes: cost.lignes,
    frais_notaire: cost.frais_notaire,
    cout_total: cost.total,
    capital,
    mensualite,
    assurance_annuelle,
    loyer_annuel_theorique,
    revenu_effectif,
    charges_lignes,
    charges,
    rne,
    rendement_brut: n.prix > 0 ? loyer_annuel_theorique / n.prix : NaN,
    rendement_net: cost.total > 0 ? rne / cost.total : NaN,
    cf_avant_financement: rne / 12,
    cf_apres_credit: (rne - mensualite * 12 - assurance_annuelle) / 12,
    interets_annee1,
  };
}

/** Cash-flow mensuel avant impôt seul (utilisé par les solveurs). */
export const cashflowBeforeTax = (n: RentalNumbers): number => computeRental(n).cf_apres_credit;

export interface TaxInput {
  regime: FiscalRegime;
  tmi: number;
  n: RentalNumbers;
  r: RentalResult;
  lmnp: { part_terrain: number; duree_bati_ans: number; duree_travaux_ans: number; duree_mobilier_ans: number };
}

export interface TaxResult {
  base: number;
  taux: number;
  impot: number;
  detail: CostLine[];
  notes: string[];
}

/**
 * Fiscalité simplifiée de l'année 1 (section 6.7). Impôt = base imposable × (TMI + prélèvements sociaux).
 * Pas de report pluriannuel de déficit : un déficit de l'année 1 donne un impôt nul.
 */
export function computeTax({ regime, tmi, n, r, lmnp }: TaxInput): TaxResult | null {
  const P = FISCAL_PARAMS;
  const recettes = r.revenu_effectif;
  const notes: string[] = [];
  switch (regime) {
    case 'aucun':
      return null;
    case 'micro_foncier': {
      const ab = P.micro_foncier_abattement.valeur;
      if (recettes > P.micro_foncier_plafond.valeur)
        notes.push(`Recettes supérieures au plafond du micro-foncier (${P.micro_foncier_plafond.valeur} €) : régime réel obligatoire.`);
      const base = recettes * (1 - ab);
      const taux = tmi + P.ps_foncier.valeur;
      return {
        base,
        taux,
        impot: Math.max(0, base) * taux,
        detail: [
          { label: 'Loyers encaissés', montant: recettes },
          { label: `Abattement ${Math.round(ab * 100)} %`, montant: -recettes * ab },
        ],
        notes,
      };
    }
    case 'reel_foncier': {
      const base = recettes - r.charges - r.interets_annee1 - r.assurance_annuelle;
      const taux = tmi + P.ps_foncier.valeur;
      if (base < 0) notes.push('Déficit foncier non valorisé (pas de report ni d’imputation dans cette estimation simplifiée).');
      notes.push('Les travaux déductibles et les frais d’emprunt ne sont pas déduits dans cette estimation simplifiée.');
      return {
        base,
        taux,
        impot: Math.max(0, base) * taux,
        detail: [
          { label: 'Loyers encaissés', montant: recettes },
          { label: 'Charges d’exploitation', montant: -r.charges },
          { label: 'Intérêts d’emprunt (année 1)', montant: -r.interets_annee1 },
          { label: 'Assurance emprunteur (année 1)', montant: -r.assurance_annuelle },
        ],
        notes,
      };
    }
    case 'lmnp_micro': {
      const ab = P.micro_bic_meuble_abattement.valeur;
      if (recettes > P.micro_bic_meuble_plafond.valeur)
        notes.push(`Recettes supérieures au plafond du micro-BIC (${P.micro_bic_meuble_plafond.valeur} €) : régime réel obligatoire.`);
      if (!n.mobilier) notes.push('Le régime LMNP suppose une location meublée : cochez « meublé » et renseignez le mobilier.');
      const base = recettes * (1 - ab);
      const taux = tmi + P.ps_lmnp.valeur;
      return {
        base,
        taux,
        impot: Math.max(0, base) * taux,
        detail: [
          { label: 'Loyers encaissés', montant: recettes },
          { label: `Abattement ${Math.round(ab * 100)} %`, montant: -recettes * ab },
        ],
        notes,
      };
    }
    case 'lmnp_reel': {
      const avantAmort = recettes - r.charges - r.interets_annee1 - r.assurance_annuelle;
      const amortBati = (n.prix * (1 - lmnp.part_terrain)) / lmnp.duree_bati_ans;
      const amortTravaux = n.travaux / lmnp.duree_travaux_ans;
      const amortMobilier = n.mobilier / lmnp.duree_mobilier_ans;
      const amortTotal = amortBati + amortTravaux + amortMobilier;
      // L'amortissement ne peut pas créer de déficit.
      const amortRetenu = Math.min(amortTotal, Math.max(0, avantAmort));
      const base = avantAmort - amortRetenu;
      const taux = tmi + P.ps_lmnp.valeur;
      if (amortRetenu < amortTotal) notes.push('Amortissement plafonné pour ne pas créer de déficit (l’excédent n’est pas reporté ici).');
      if (avantAmort < 0) notes.push('Déficit avant amortissement non valorisé (pas de report dans cette estimation).');
      return {
        base,
        taux,
        impot: Math.max(0, base) * taux,
        detail: [
          { label: 'Loyers encaissés', montant: recettes },
          { label: 'Charges d’exploitation', montant: -r.charges },
          { label: 'Intérêts d’emprunt (année 1)', montant: -r.interets_annee1 },
          { label: 'Assurance emprunteur (année 1)', montant: -r.assurance_annuelle },
          { label: `Amortissement bâti (hors terrain ${Math.round(lmnp.part_terrain * 100)} %, ${lmnp.duree_bati_ans} ans)`, montant: -Math.min(amortBati, amortRetenu) },
          { label: `Amortissement travaux (${lmnp.duree_travaux_ans} ans) et mobilier (${lmnp.duree_mobilier_ans} ans)`, montant: -(amortRetenu - Math.min(amortBati, amortRetenu)) },
        ],
        notes,
      };
    }
  }
}

/** Taux d'endettement (section 6.8). */
export function debtRatio(input: {
  revenus_mensuels: number;
  mensualites_existantes: number;
  nouvelle_mensualite_assurance_comprise: number;
  loyer_mensuel: number;
  ponderation_loyers: number;
}): number {
  const num = input.mensualites_existantes + input.nouvelle_mensualite_assurance_comprise;
  const den = input.revenus_mensuels + input.ponderation_loyers * input.loyer_mensuel;
  return den > 0 ? num / den : Number.POSITIVE_INFINITY;
}

/**
 * Enrichissement à 10 ans = capital remboursé cumulé + cash-flows cumulés avant impôt,
 * sans hypothèse de revente ni d'indexation.
 */
export function tenYearEnrichment(n: RentalNumbers, r: RentalResult, years = 10) {
  const months = years * 12;
  const rows =
    r.capital > 0 ? amortizationSchedule(r.capital, n.taux_credit, n.duree_mois, n.assurance_taux, n.assurance_mode) : [];
  const horizon = rows.slice(0, months);
  const capitalRembourse = horizon.reduce((s, x) => s + x.capital_rembourse, 0);
  const servicesDette = horizon.reduce((s, x) => s + x.mensualite + x.assurance, 0);
  const cashflows = r.rne * years - servicesDette;
  return { capital_rembourse: capitalRembourse, cashflows_cumules: cashflows, total: capitalRembourse + cashflows };
}
