import { expect } from 'vitest';
import { propertyInputsSchema, type ProfileParams, type PropertyInputs } from '@/lib/finance/schema';
import { DEFAULT_PROFILES } from '@/lib/finance/profiles';

/** Égalité à ±0,01 (euros ou points de pourcentage). */
export const close = (actual: number, expected: number, tol = 0.01) =>
  expect(Math.abs(actual - expected), `${actual} ≠ ${expected} (±${tol})`).toBeLessThanOrEqual(tol + 1e-9);

export const declared = (valeur: number) => ({ valeur, statut: 'declare' as const });
export const verified = (valeur: number) => ({ valeur, statut: 'verifie' as const });

export const inputs = (partial: Record<string, unknown>): PropertyInputs => propertyInputsSchema.parse(partial);

/** Profil de T4 : aucune valeur par défaut cachée. */
export const profileT4 = (over: Partial<ProfileParams> = {}): ProfileParams => ({
  ...DEFAULT_PROFILES[0].params,
  budget_max: null,
  apport: 28000,
  taux_credit: 0.036,
  duree_credit_mois: 240,
  assurance_taux: 0.003,
  assurance_mode: 'capital_initial',
  frais_notaire_ancien: 0.075,
  frais_bancaires: 3000,
  vacance: 0.05,
  gestion: 0,
  gli: 0,
  pno_annuelle: 150,
  entretien_m2_an: 10, // 40 m² × 10 = 400 €
  cash_flow_cible: 0,
  ...over,
});
