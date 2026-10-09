/**
 * Données de marché déjà récupérées et mises en cache, passées au moteur.
 * Le moteur ne fait aucun appel réseau : il reçoit ces objets tels quels.
 */

export type SourceStatus = 'ok' | 'indisponible' | 'a_configurer' | 'non_applicable' | 'insuffisant' | 'non_demande';

export interface SourceMeta {
  source: string;
  url?: string;
  millesime?: string | null;
  recupere_le?: string | null;
}

export interface MarketRent extends SourceMeta {
  status: SourceStatus;
  /** Indicateur ANIL charges comprises, €/m²/mois. */
  loypredm2?: number;
  lwr_m2?: number;
  upr_m2?: number;
  /** « commune » ou « maille » (maille plus large que la commune). */
  typpred?: string;
  nbobs_com?: number;
  nbobs_mail?: number;
  r2_adj?: number;
  type_bien?: 'appartement' | 'maison';
  message?: string;
}

export interface DvfSummary extends SourceMeta {
  status: SourceStatus;
  n: number;
  mediane_m2?: number;
  p25_m2?: number;
  p75_m2?: number;
  periode?: { debut: string; fin: string };
  perimetre?: string;
  message?: string;
}

export interface RentControl extends SourceMeta {
  status: SourceStatus;
  applicable: boolean;
  territoire?: string;
  /** Loyer de référence majoré, €/m²/mois hors charges. */
  ref_majore_m2?: number;
  ref_m2?: number;
  ref_minore_m2?: number;
  categorie?: string;
  message?: string;
}

export interface RiskItem {
  libelle: string;
  detail?: string;
  notable: boolean;
}

export interface Risks extends SourceMeta {
  status: SourceStatus;
  items: RiskItem[];
  message?: string;
}

export interface MarketContext {
  loyer?: MarketRent;
  dvf?: DvfSummary;
  encadrement?: RentControl;
  risques?: Risks;
}
