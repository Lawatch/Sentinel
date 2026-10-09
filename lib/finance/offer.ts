import { cashflowBeforeTax, type RentalNumbers } from './residential';
import { bisect, maxSatisfying } from './solver';

export type OfferResult =
  | { atteignable: true; prix_max: number; capital: number; ecart: number; prix_demande: number }
  | { atteignable: false; prix_demande: number; raison: string };

/**
 * Prix d'offre maximal (section 6.9) : P tel que le cash-flow mensuel avant impôt égale la cible,
 * en recalculant tout ce qui dépend de P (frais de notaire, capital emprunté à apport constant).
 */
export function maxOfferPrice(n: RentalNumbers, cible: number): OfferResult {
  const f = (P: number) => cashflowBeforeTax({ ...n, prix: P });
  const P = maxSatisfying(f, cible, n.prix);
  if (P === null || P <= 0) {
    return { atteignable: false, prix_demande: n.prix, raison: 'Objectif inatteignable avec ces hypothèses.' };
  }
  const notaire = P * n.taux_notaire;
  const honoraires = n.honoraires_inclus ? 0 : n.honoraires_agence;
  const capital = Math.max(0, P + notaire + honoraires + n.travaux + n.frais_bancaires + n.mobilier - n.apport);
  return { atteignable: true, prix_max: P, capital, ecart: n.prix > 0 ? (P - n.prix) / n.prix : NaN, prix_demande: n.prix };
}

/** Loyer mensuel HC minimal pour un cash-flow avant impôt nul. */
export function breakevenRent(n: RentalNumbers): number | null {
  const f = (L: number) => cashflowBeforeTax({ ...n, loyer_mensuel_hc: L });
  if (f(0) >= 0) return 0;
  let hi = Math.max(n.loyer_mensuel_hc, 100);
  let guard = 0;
  while (f(hi) < 0 && guard++ < 60) hi *= 2;
  if (f(hi) < 0) return null; // vacance 100 % ou gestion ≥ 100 %
  return bisect(f, 0, 0, hi, { tolerance: 1e-6 });
}

/** Taux nominal maximal pour un cash-flow avant impôt nul (null si même à 0 % le cash-flow est négatif). */
export function breakevenRate(n: RentalNumbers): number | null {
  const f = (t: number) => cashflowBeforeTax({ ...n, taux_credit: t });
  if (f(0) < 0) return null;
  if (f(0.3) >= 0) return 0.3;
  return bisect(f, 0, 0, 0.3, { tolerance: 1e-9 });
}
