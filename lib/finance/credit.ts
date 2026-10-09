/**
 * Crédit amortissable à mensualités constantes, au taux nominal (jamais le TAEG).
 *   M = C · i / (1 − (1 + i)^−n),  i = taux nominal annuel / 12 ;  M = C / n si i = 0
 */

export type InsuranceMode = 'capital_initial' | 'capital_restant_du';

export function monthlyPayment(capital: number, annualRate: number, months: number): number {
  if (months <= 0) throw new RangeError('La durée du crédit doit être positive.');
  if (capital <= 0) return 0;
  const i = annualRate / 12;
  if (i === 0) return capital / months;
  return (capital * i) / (1 - Math.pow(1 + i, -months));
}

export interface AmortizationRow {
  mois: number;
  mensualite: number;
  interets: number;
  capital_rembourse: number;
  capital_restant: number;
  assurance: number;
}

/** Tableau d'amortissement mois par mois, assurance calculée selon le mode choisi. */
export function amortizationSchedule(
  capital: number,
  annualRate: number,
  months: number,
  insuranceRate = 0,
  insuranceMode: InsuranceMode = 'capital_initial',
): AmortizationRow[] {
  const rows: AmortizationRow[] = [];
  if (capital <= 0) return rows;
  const m = monthlyPayment(capital, annualRate, months);
  const i = annualRate / 12;
  let remaining = capital;
  for (let k = 1; k <= months; k++) {
    const interest = remaining * i;
    const principal = k === months ? remaining : m - interest;
    const insuranceBase = insuranceMode === 'capital_initial' ? capital : remaining;
    const insurance = (insuranceBase * insuranceRate) / 12;
    remaining = Math.max(0, remaining - principal);
    rows.push({
      mois: k,
      mensualite: m,
      interets: interest,
      capital_rembourse: principal,
      capital_restant: remaining,
      assurance: insurance,
    });
  }
  return rows;
}

export interface YearSummary {
  annee: number;
  mensualites: number;
  interets: number;
  capital_rembourse: number;
  assurance: number;
  capital_restant_fin: number;
}

/** Agrège le tableau par année (année 1 = mois 1 à 12). */
export function yearlySummary(rows: AmortizationRow[], years: number): YearSummary[] {
  const out: YearSummary[] = [];
  for (let y = 1; y <= years; y++) {
    const slice = rows.filter((r) => r.mois > (y - 1) * 12 && r.mois <= y * 12);
    out.push({
      annee: y,
      mensualites: slice.reduce((s, r) => s + r.mensualite, 0),
      interets: slice.reduce((s, r) => s + r.interets, 0),
      capital_rembourse: slice.reduce((s, r) => s + r.capital_rembourse, 0),
      assurance: slice.reduce((s, r) => s + r.assurance, 0),
      // Après la dernière échéance, il ne reste plus de capital dû.
      capital_restant_fin: slice.at(-1)?.capital_restant ?? 0,
    });
  }
  return out;
}

/** Assurance emprunteur de l'année 1 (12 premiers mois). */
export function firstYearInsurance(
  capital: number,
  insuranceRate: number,
  insuranceMode: InsuranceMode,
  annualRate: number,
  months: number,
): number {
  if (capital <= 0 || insuranceRate <= 0) return 0;
  if (insuranceMode === 'capital_initial') return capital * insuranceRate;
  return amortizationSchedule(capital, annualRate, months, insuranceRate, insuranceMode)
    .slice(0, 12)
    .reduce((s, r) => s + r.assurance, 0);
}
