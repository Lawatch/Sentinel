export interface PriceObservation {
  id?: string;
  date: string;
  prix: number;
  origine: 'saisie' | 'import' | 'restauration';
}

export interface PriceHistory {
  observations: PriceObservation[];
  actuel: number | null;
  precedent: number | null;
  initial: number | null;
  /** Variation du dernier prix par rapport au précédent (négative = baisse). */
  variation: number | null;
  variation_totale: number | null;
  baisse: boolean;
}

/** Historique trié : l'ancien prix reste visible et une baisse est signalée. */
export function priceHistory(obs: PriceObservation[]): PriceHistory {
  const observations = [...obs].sort((a, b) => a.date.localeCompare(b.date));
  const n = observations.length;
  const actuel = n ? observations[n - 1].prix : null;
  const precedent = n > 1 ? observations[n - 2].prix : null;
  const initial = n ? observations[0].prix : null;
  const variation = actuel !== null && precedent ? (actuel - precedent) / precedent : null;
  const variation_totale = actuel !== null && initial && n > 1 ? (actuel - initial) / initial : null;
  return { observations, actuel, precedent, initial, variation, variation_totale, baisse: variation !== null && variation < 0 };
}

/** Une nouvelle observation n'est créée que si le prix change. */
export const shouldRecordPrice = (history: PriceObservation[], prix: number) => {
  const last = [...history].sort((a, b) => a.date.localeCompare(b.date)).at(-1);
  return !last || Math.abs(last.prix - prix) > 0.004;
};
