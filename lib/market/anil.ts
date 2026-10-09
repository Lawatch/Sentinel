import Papa from 'papaparse';

/**
 * Carte des loyers ANIL, édition 2025 (indicateurs de loyers d'annonce, charges comprises,
 * logements non meublés, bien type). Fichiers CSV « ; », virgule décimale, encodage Windows-1252.
 */
export const ANIL_MILLESIME = '2025';
export const ANIL_DATASET = 'https://www.data.gouv.fr/datasets/carte-des-loyers-indicateurs-de-loyers-dannonce-par-commune-en-2025';
export const ANIL_FILES = {
  appartement:
    'https://static.data.gouv.fr/resources/carte-des-loyers-indicateurs-de-loyers-dannonce-par-commune-en-2025/20251211-145010/pred-app-mef-dhup.csv',
  maison:
    'https://static.data.gouv.fr/resources/carte-des-loyers-indicateurs-de-loyers-dannonce-par-commune-en-2025/20251211-145039/pred-mai-mef-dhup.csv',
} as const;
export const ANIL_SOURCE = 'Estimations ANIL, à partir des données du Groupe SeLoger et de leboncoin';

export interface AnilRow {
  code_insee: string;
  libelle: string;
  dep: string;
  loypredm2: number;
  lwr_m2: number;
  upr_m2: number;
  typpred: string;
  nbobs_com: number;
  nbobs_mail: number;
  r2_adj: number;
}

const fr = (s: string | undefined) => (s === undefined || s === '' ? NaN : Number(String(s).replace(',', '.')));

export function parseAnilCsv(buf: ArrayBuffer | Uint8Array): AnilRow[] {
  const text = new TextDecoder('windows-1252').decode(buf);
  const parsed = Papa.parse<Record<string, string>>(text, { header: true, delimiter: ';', skipEmptyLines: true });
  return parsed.data
    .map((r) => ({
      code_insee: r.INSEE_C,
      libelle: r.LIBGEO,
      dep: r.DEP,
      loypredm2: fr(r.loypredm2),
      lwr_m2: fr(r['lwr.IPm2']),
      upr_m2: fr(r['upr.IPm2']),
      typpred: r.TYPPRED,
      nbobs_com: Number(r.nbobs_com),
      nbobs_mail: Number(r.nbobs_mail),
      r2_adj: fr(r.R2_adj),
    }))
    .filter((r) => r.code_insee && Number.isFinite(r.loypredm2));
}
