/** Statut d'une donnée d'entrée (section 2 du cahier des charges). */
export type FieldStatus = 'declare' | 'verifie' | 'estime' | 'hypothese' | 'inconnu';

export const FIELD_STATUS_LABELS: Record<FieldStatus, string> = {
  declare: 'Déclaré',
  verifie: 'Vérifié',
  estime: 'Estimé',
  hypothese: 'Hypothèse',
  inconnu: 'Inconnu',
};

/** Une valeur d'entrée avec son origine : { valeur, statut, source, date }. */
export interface Field<T = number> {
  valeur: T | null;
  statut: FieldStatus;
  source?: string | null;
  date?: string | null;
}

/** Terme d'une formule affichée dans « Comment c'est calculé ». */
export interface Term {
  label: string;
  valeur: number | string | null;
  unite?: '€' | '€/mois' | '€/an' | '%' | 'mois' | 'm²' | '€/m²' | '';
  statut?: FieldStatus;
  source?: string | null;
}

/** Résultat calculable ou non, avec la formule et les valeurs utilisées. */
export type Indicator =
  | { ok: true; valeur: number; formule: string; termes: Term[]; note?: string }
  | { ok: false; manquants: string[]; formule: string; note?: string };

export const indicator = (valeur: number, formule: string, termes: Term[], note?: string): Indicator => ({
  ok: true,
  valeur,
  formule,
  termes,
  ...(note ? { note } : {}),
});

export const notComputable = (manquants: string[], formule: string, note?: string): Indicator => ({
  ok: false,
  manquants: [...new Set(manquants)],
  formule,
  ...(note ? { note } : {}),
});

export type Confidence = 'A' | 'B' | 'C';
export type Verdict = 'a_visiter' | 'a_negocier' | 'hors_criteres' | 'donnees_insuffisantes';

export const VERDICT_LABELS: Record<Verdict, string> = {
  a_visiter: 'À visiter',
  a_negocier: 'À négocier',
  hors_criteres: 'Hors critères',
  donnees_insuffisantes: 'Données insuffisantes',
};

export type ScenarioName = 'prudent' | 'central' | 'favorable';

export const ENGINE_VERSION = '1.0.0';
