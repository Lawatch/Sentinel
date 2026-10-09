import { monthlyPayment } from './credit';
import { FISCAL_PARAMS } from './fiscal-params';
import { maxSatisfying } from './solver';

/**
 * Fonds de commerce (section 7.2–7.3). On achète une capacité bénéficiaire :
 * jamais de rendement locatif ici.
 */
export interface FondsNumbers {
  prix: number;
  stock_inclus: boolean;
  stock: number;
  honoraires: number;
  investissements_initiaux: number;
  bfr: number;
  /** Montant du prêt ; l'apport nécessaire en découle. */
  pret_montant: number;
  pret_taux: number;
  pret_duree_mois: number;
  ca: number;
  ca_precedent: number | null;
  ebe_comptable: number;
  remuneration_cedant: number;
  remuneration_cible: number;
  retraitements: number;
  loyer_annuel: number;
  masse_salariale: number | null;
  investissements_maintien: number;
  /** Taux de marge sur coûts variables (pour point mort et scénarios). */
  taux_marge_cv: number;
}

export function registrationDuties(prix: number, bareme = FISCAL_PARAMS.droits_cession_fonds.valeur): number {
  let duties = 0;
  let floor = 0;
  for (const t of bareme) {
    const top = Math.min(prix, t.jusqua);
    if (top > floor) duties += (top - floor) * t.taux;
    floor = t.jusqua;
    if (prix <= floor) break;
  }
  return duties;
}

export interface FondsResult {
  droits: number;
  frais_acquisition: number;
  besoin_total: number;
  besoin_lignes: { label: string; montant: number }[];
  apport_necessaire: number;
  mensualite: number;
  annuite: number;
  ebe_retraite: number;
  couverture_dette: number;
  tresorerie_apres_dette: number;
  ratios: {
    evolution_ca: number | null;
    ebe_sur_ca: number;
    loyer_sur_ca: number;
    masse_salariale_sur_ca: number | null;
    prix_sur_ca: number;
    prix_sur_ebe_retraite: number;
  };
  point_mort_ca: number;
  scenarios: { label: string; ca: number; ebe_retraite: number; couverture: number; tresorerie: number }[];
}

export function computeFonds(n: FondsNumbers): FondsResult {
  const droits = registrationDuties(n.prix);
  const frais_acquisition = droits + n.honoraires;
  const stockAjoute = n.stock_inclus ? 0 : n.stock;
  const besoin_lignes = [
    { label: 'Prix de cession', montant: n.prix },
    { label: 'Droits d’enregistrement', montant: droits },
    { label: 'Honoraires', montant: n.honoraires },
    { label: n.stock_inclus ? 'Stock (inclus dans le prix)' : 'Stock', montant: stockAjoute },
    { label: 'Investissements initiaux', montant: n.investissements_initiaux },
    { label: 'BFR initial', montant: n.bfr },
  ];
  const besoin_total = besoin_lignes.reduce((s, l) => s + l.montant, 0);
  const mensualite = n.pret_montant > 0 ? monthlyPayment(n.pret_montant, n.pret_taux, n.pret_duree_mois) : 0;
  const annuite = mensualite * 12;
  const ebe_retraite = n.ebe_comptable + n.remuneration_cedant - n.remuneration_cible + n.retraitements;
  const couverture = (ebe: number) => (annuite > 0 ? (ebe - n.investissements_maintien) / annuite : Number.POSITIVE_INFINITY);
  const tresorerie = (ebe: number) => ebe - n.investissements_maintien - annuite;
  const ebeAt = (ca: number) => ebe_retraite + (ca - n.ca) * n.taux_marge_cv;
  // Point mort : CA tel que la trésorerie après rémunération et dette est nulle, à taux de marge sur coûts variables saisi.
  const point_mort_ca = n.ca - tresorerie(ebe_retraite) / n.taux_marge_cv;
  return {
    droits,
    frais_acquisition,
    besoin_total,
    besoin_lignes,
    apport_necessaire: besoin_total - n.pret_montant,
    mensualite,
    annuite,
    ebe_retraite,
    couverture_dette: couverture(ebe_retraite),
    tresorerie_apres_dette: tresorerie(ebe_retraite),
    ratios: {
      evolution_ca: n.ca_precedent && n.ca_precedent > 0 ? (n.ca - n.ca_precedent) / n.ca_precedent : null,
      ebe_sur_ca: n.ebe_comptable / n.ca,
      loyer_sur_ca: n.loyer_annuel / n.ca,
      masse_salariale_sur_ca: n.masse_salariale === null ? null : n.masse_salariale / n.ca,
      prix_sur_ca: n.prix / n.ca,
      prix_sur_ebe_retraite: n.prix / ebe_retraite,
    },
    point_mort_ca,
    scenarios: [0, -0.1, -0.2].map((d) => {
      const ca = n.ca * (1 + d);
      const ebe = ebeAt(ca);
      return {
        label: d === 0 ? 'CA actuel' : `CA ${Math.round(d * 100)} %`,
        ca,
        ebe_retraite: ebe,
        couverture: couverture(ebe),
        tresorerie: tresorerie(ebe),
      };
    }),
  };
}

/**
 * Prix de cession maximal pour que la trésorerie annuelle du scénario prudent (CA −10 %)
 * atteigne la cible, à apport constant (le prêt couvre le reste du besoin).
 */
export function maxFondsPrice(n: FondsNumbers, apport: number, cibleAnnuelle: number, choc = -0.1) {
  const f = (P: number) => {
    const besoin = computeFonds({ ...n, prix: P, pret_montant: 0 }).besoin_total;
    const pret = Math.max(0, besoin - apport);
    const r = computeFonds({ ...n, prix: P, pret_montant: pret });
    return r.scenarios.find((s) => Math.abs(s.ca - n.ca * (1 + choc)) < 1e-6)?.tresorerie ?? r.tresorerie_apres_dette;
  };
  const P = maxSatisfying(f, cibleAnnuelle, n.prix);
  if (P === null || P <= 0) return { atteignable: false as const };
  return { atteignable: true as const, prix_max: P, ecart: (P - n.prix) / n.prix };
}
