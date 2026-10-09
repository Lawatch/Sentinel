import Papa from 'papaparse';
import type { DvfSummary } from '@/lib/finance/market';

/**
 * DVF géolocalisées (Etalab). Une ligne par lot / local / culture, pas par vente :
 * on regroupe par id_mutation avant tout calcul.
 */
export interface DvfSale {
  id_mutation: string;
  date_mutation: string;
  prix: number;
  type_local: 'Appartement' | 'Maison' | 'Local';
  surface: number | null;
  pieces: number | null;
  lon: number | null;
  lat: number | null;
  code_insee: string;
  adresse: string | null;
  millesime: string;
}

export const DVF_BASE_URL = 'https://files.data.gouv.fr/geo-dvf/latest/csv';
export const dvfCommuneUrl = (year: number, codeInsee: string) => {
  const dep = codeInsee.startsWith('97') ? codeInsee.slice(0, 3) : codeInsee.slice(0, 2);
  return `${DVF_BASE_URL}/${year}/communes/${dep}/${codeInsee}.csv`;
};

/** DVF ne couvre ni l'Alsace-Moselle (67, 68, 57) ni Mayotte (976). */
export function dvfNotCovered(codeInsee: string): string | null {
  if (/^(57|67|68)/.test(codeInsee)) return 'DVF ne couvre pas l’Alsace-Moselle (livre foncier).';
  if (codeInsee.startsWith('976')) return 'DVF ne couvre pas Mayotte.';
  return null;
}

const LOCAL_TYPES: Record<string, DvfSale['type_local']> = {
  Appartement: 'Appartement',
  Maison: 'Maison',
  'Local industriel. commercial ou assimilé': 'Local',
};

type Raw = Record<string, string>;

const num = (s: string | undefined) => {
  if (s === undefined || s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

/**
 * Filtre les mutations utiles :
 * - nature « Vente », une seule valeur foncière ;
 * - un seul local du type visé (Appartement ou Maison), dépendances acceptées → comparable résidentiel ;
 * - ou un seul local commercial sans logement → vente commerciale (indicative).
 * Les ventes de plusieurs logements sont exclues.
 */
export function filterMutations(rows: Raw[], millesime: string): DvfSale[] {
  const groups = new Map<string, Raw[]>();
  for (const r of rows) {
    if (!r.id_mutation) continue;
    const g = groups.get(r.id_mutation);
    if (g) g.push(r);
    else groups.set(r.id_mutation, [r]);
  }
  const out: DvfSale[] = [];
  for (const [id, g] of groups) {
    if (g.some((r) => r.nature_mutation !== 'Vente')) continue;
    const values = new Set(g.map((r) => r.valeur_fonciere));
    if (values.size !== 1) continue;
    const prix = num(g[0].valeur_fonciere);
    if (!prix || prix <= 0) continue;
    const locals = new Map<string, Raw>();
    for (const r of g) {
      const t = LOCAL_TYPES[r.type_local];
      if (!t) continue;
      const key = [r.id_parcelle, r.lot1_numero, r.type_local, r.surface_reelle_bati, r.nombre_pieces_principales].join('|');
      locals.set(key, r);
    }
    const all = [...locals.values()];
    const residential = all.filter((r) => LOCAL_TYPES[r.type_local] !== 'Local');
    const commercial = all.filter((r) => LOCAL_TYPES[r.type_local] === 'Local');
    let chosen: Raw | null = null;
    if (residential.length === 1 && commercial.length === 0) {
      chosen = residential[0];
      if (!num(chosen.surface_reelle_bati)) continue;
    } else if (commercial.length === 1 && residential.length === 0) {
      chosen = commercial[0];
    } else continue;
    const withCoords = g.find((r) => r.longitude && r.latitude) ?? chosen;
    out.push({
      id_mutation: id,
      date_mutation: chosen.date_mutation,
      prix,
      type_local: LOCAL_TYPES[chosen.type_local],
      surface: num(chosen.surface_reelle_bati),
      pieces: num(chosen.nombre_pieces_principales),
      lon: num(withCoords.longitude),
      lat: num(withCoords.latitude),
      code_insee: chosen.code_commune,
      adresse: [chosen.adresse_numero, chosen.adresse_suffixe, chosen.adresse_nom_voie].filter(Boolean).join(' ') || null,
      millesime,
    });
  }
  return out;
}

export function parseDvfCsv(text: string, millesime: string): DvfSale[] {
  const parsed = Papa.parse<Raw>(text, { header: true, skipEmptyLines: true });
  return filterMutations(parsed.data, millesime);
}

/* ------------------------------------------------------------------ */

export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

export function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Premier jour d'une fenêtre de `months` mois se terminant le jour `fin` inclus (24 mois au 31/12/2025 → 01/01/2024). */
export const windowStart = (fin: string, months: number) => {
  const d = new Date(fin + 'T00:00:00Z');
  d.setUTCMonth(d.getUTCMonth() - months);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

export const ppm2 = (s: DvfSale) => (s.surface ? s.prix / s.surface : NaN);

/** Exclut les prix au m² hors 1er–99e centile de leur commune. */
export function withoutOutliers(sales: DvfSale[]): DvfSale[] {
  const byCommune = new Map<string, number[]>();
  for (const s of sales) {
    const v = ppm2(s);
    if (!Number.isFinite(v)) continue;
    const arr = byCommune.get(s.code_insee) ?? [];
    arr.push(v);
    byCommune.set(s.code_insee, arr);
  }
  // Centiles au « rang le plus proche » : sur un petit échantillon, on n'écarte pas d'office les extrêmes.
  const nearestRank = (sorted: number[], p: number) => sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)];
  const bounds = new Map<string, [number, number]>();
  for (const [c, arr] of byCommune) {
    arr.sort((a, b) => a - b);
    bounds.set(c, [nearestRank(arr, 0.01), nearestRank(arr, 0.99)]);
  }
  return sales.filter((s) => {
    const b = bounds.get(s.code_insee);
    const v = ppm2(s);
    return b && v >= b[0] && v <= b[1];
  });
}

export interface ComparableQuery {
  lat: number;
  lon: number;
  surface: number;
  type: 'Appartement' | 'Maison';
  code_insee: string;
  /** Dernière date couverte par le millésime DVF chargé. */
  fin: string;
  mois?: number;
}

export interface ComparablesResult extends DvfSummary {
  ventes: (DvfSale & { distance_m: number; prix_m2: number })[];
}

/**
 * Comparables résidentiels : 24 mois, 500 m, surface ±30 % ; si moins de 8 ventes,
 * élargir à 1 km puis à la commune ; sous 5 ventes, pas d'estimation.
 */
export function findComparables(sales: DvfSale[], q: ComparableQuery, meta: { source: string; millesime: string; recupere_le?: string | null }): ComparablesResult {
  const debut = windowStart(q.fin, q.mois ?? 24);
  const pool = withoutOutliers(
    sales.filter((s) => s.type_local === q.type && s.surface && s.date_mutation >= debut && s.date_mutation <= q.fin),
  ).filter((s) => s.surface! >= q.surface * 0.7 && s.surface! <= q.surface * 1.3);
  const withDist = pool.map((s) => ({
    ...s,
    distance_m: s.lat !== null && s.lon !== null ? haversineMeters(q.lat, q.lon, s.lat, s.lon) : Number.POSITIVE_INFINITY,
    prix_m2: ppm2(s),
  }));
  const steps: { label: string; pick: (s: (typeof withDist)[number]) => boolean }[] = [
    { label: '500 m', pick: (s) => s.distance_m <= 500 },
    { label: '1 km (élargi)', pick: (s) => s.distance_m <= 1000 },
    { label: 'commune (élargi)', pick: (s) => s.code_insee === q.code_insee },
  ];
  let chosen = withDist.filter(steps[0].pick);
  let perimetre = steps[0].label;
  for (const step of steps.slice(1)) {
    if (chosen.length >= 8) break;
    chosen = withDist.filter(step.pick);
    perimetre = step.label;
  }
  chosen.sort((a, b) => a.distance_m - b.distance_m);
  const base = {
    source: meta.source,
    millesime: meta.millesime,
    recupere_le: meta.recupere_le ?? null,
    periode: { debut, fin: q.fin },
    perimetre,
    n: chosen.length,
    ventes: chosen,
  };
  if (chosen.length < 5) {
    return { ...base, status: 'insuffisant', message: `Comparables insuffisants (${chosen.length} vente${chosen.length > 1 ? 's' : ''} sur 24 mois)` };
  }
  const prices = chosen.map((s) => s.prix_m2).sort((a, b) => a - b);
  return {
    ...base,
    status: 'ok',
    mediane_m2: percentile(prices, 0.5),
    p25_m2: percentile(prices, 0.25),
    p75_m2: percentile(prices, 0.75),
  };
}

/** Prix médian au m² d'une commune (radar) : 24 mois, type visé, hors valeurs aberrantes. */
export function communeMedian(sales: DvfSale[], codeInsee: string, type: 'Appartement' | 'Maison', fin: string) {
  const debut = windowStart(fin, 24);
  const pool = withoutOutliers(
    sales.filter((s) => s.code_insee === codeInsee && s.type_local === type && s.surface && s.date_mutation >= debut && s.date_mutation <= fin),
  );
  const prices = pool.map(ppm2).sort((a, b) => a - b);
  return { n: prices.length, mediane_m2: prices.length ? percentile(prices, 0.5) : null, periode: { debut, fin } };
}

/** Années de fichiers DVF à charger pour couvrir 24 mois avant la fin du millésime. */
export function yearsToLoad(fin: string, mois = 24): number[] {
  const end = Number(fin.slice(0, 4));
  const start = Number(windowStart(fin, mois).slice(0, 4));
  const years: number[] = [];
  for (let y = start; y <= end; y++) years.push(y);
  return years;
}
