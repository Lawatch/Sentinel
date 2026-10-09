import type { MarketContext, MarketRent, RentControl, Risks, SourceStatus } from '@/lib/finance/market';
import type { GeocodeResult } from '@/lib/market/geocode';
import type { DpeOutcome, DvfOutcome } from '@/lib/server/sources';

/** Résultat d'enrichissement stocké dans properties.enrichissement. */
export interface Enrichment {
  date: string;
  geocodage?: {
    status: SourceStatus;
    source: string;
    recupere_le: string | null;
    label?: string;
    score?: number;
    a_confirmer: boolean;
    confirme: boolean;
    candidats?: GeocodeResult[];
    message?: string;
  };
  dvf?: DvfOutcome;
  loyer?: MarketRent;
  dpe?: DpeOutcome;
  risques?: Risks;
  encadrement?: RentControl;
}

/** Contexte de marché passé au moteur (aucun appel réseau). */
export function marketContextOf(e: Partial<Enrichment> | null | undefined): MarketContext {
  if (!e) return {};
  return { loyer: e.loyer, dvf: e.dvf, encadrement: e.encadrement, risques: e.risques };
}

export const STATUS_LABELS: Record<SourceStatus, string> = {
  ok: 'opérationnelle',
  indisponible: 'indisponible',
  a_configurer: 'à configurer',
  non_applicable: 'sans objet',
  insuffisant: 'données insuffisantes',
  non_demande: 'non interrogée',
};
