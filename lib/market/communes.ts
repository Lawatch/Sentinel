/** Codes INSEE : arrondissements municipaux ↔ commune (Paris, Lyon, Marseille). */
export function parentCommune(code: string): string {
  if (/^751(0[1-9]|1\d|20)$/.test(code)) return '75056';
  if (/^6938[1-9]$/.test(code)) return '69123';
  if (/^132(0[1-9]|1[0-6])$/.test(code)) return '13055';
  return code;
}

export const GEO_API = 'https://geo.api.gouv.fr';
