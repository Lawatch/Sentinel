import bbox from '@turf/bbox';
import booleanIntersects from '@turf/boolean-intersects';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import type { DvfSummary, MarketRent, RentControl, Risks, SourceStatus } from '@/lib/finance/market';
import { ANIL_FILES, ANIL_MILLESIME, ANIL_SOURCE, ANIL_DATASET, parseAnilCsv, type AnilRow } from '@/lib/market/anil';
import { GEO_API } from '@/lib/market/communes';
import {
  communeMedian,
  dvfCommuneUrl,
  dvfNotCovered,
  findComparables,
  haversineMeters,
  parseDvfCsv,
  windowStart,
  yearsToLoad,
  type DvfSale,
} from '@/lib/market/dvf';
import {
  TERRITOIRES,
  isParis,
  lookupTerritory,
  normalizeTerritoryValues,
  notApplicable,
  parisQuery,
  parseParis,
  zoneAtPoint,
  type RentCategory,
  type Territoire,
} from '@/lib/market/encadrement';
import { GEOCODE_MIN_SCORE, GEOCODE_URL, parseGeocode, type GeocodeResult } from '@/lib/market/geocode';
import { GEORISQUES_SOURCE, georisquesUrls, parseGeorisques, type GeorisquesRaw } from '@/lib/market/georisques';
import { MAX_COMMUNES_PER_ZONE } from '@/lib/domain/zones';
import type { CacheStore, DvfStore } from './cache';
import { SourceError, type Http } from './http';
import Papa from 'papaparse';

export interface Deps {
  http: Http;
  cache: CacheStore;
  dvf: DvfStore;
  now?: () => Date;
}

const nowIso = (d: Deps) => (d.now ? d.now() : new Date()).toISOString();
const errMsg = (e: unknown) => (e instanceof SourceError ? e.message : e instanceof Error ? e.message : String(e));
const DAY = 86400000;

/* ------------------------------------------------------------------ */
/* Géocodage (Géoplateforme IGN)                                        */
/* ------------------------------------------------------------------ */

export interface GeocodeOutcome {
  status: SourceStatus;
  source: string;
  url: string;
  recupere_le: string | null;
  resultats: GeocodeResult[];
  message?: string;
}

export async function geocode(d: Deps, query: string): Promise<GeocodeOutcome> {
  const q = query.trim().replace(/\s+/g, ' ');
  const url = `${GEOCODE_URL}?q=${encodeURIComponent(q)}&limit=5`;
  const key = q.toLowerCase();
  const base = { source: 'Géocodage de la Géoplateforme (IGN)', url: 'https://geoservices.ign.fr/documentation/services/services-geoplateforme/geocodage' };
  const cached = await d.cache.get<GeocodeResult[]>('geocodage', key);
  if (cached?.statut === 'ok' && cached.payload) return { ...base, status: 'ok', recupere_le: cached.recupere_le ?? null, resultats: cached.payload };
  try {
    const json = await d.http.json<{ features: never[] }>(url);
    const resultats = parseGeocode(json);
    const at = nowIso(d);
    await d.cache.set({ source: 'geocodage', cle: key, millesime: '', url, recupere_le: at, statut: 'ok', payload: resultats });
    return { ...base, status: 'ok', recupere_le: at, resultats };
  } catch (e) {
    await d.cache.set({ source: 'geocodage', cle: key, millesime: '', url, statut: 'erreur', message: errMsg(e) }).catch(() => {});
    return { ...base, status: 'indisponible', recupere_le: null, resultats: [], message: errMsg(e) };
  }
}

export const needsConfirmation = (r: GeocodeResult | undefined) => !r || r.score < GEOCODE_MIN_SCORE;

/* ------------------------------------------------------------------ */
/* Communes (geo.api.gouv.fr)                                           */
/* ------------------------------------------------------------------ */

/** Commune (ou arrondissement municipal pour Paris, Lyon, Marseille) contenant un point. */
export async function communeAt(d: Deps, lat: number, lon: number): Promise<{ code: string; nom: string } | null> {
  const list = await d.http.json<{ code: string; nom: string }[] | null>(`${GEO_API}/communes?lat=${lat}&lon=${lon}&fields=code,nom`);
  const c = list?.[0] ?? null;
  // DVF et l'ANIL utilisent les codes d'arrondissement : on les préfère au code de la commune.
  if (c && ['75056', '69123', '13055'].includes(c.code)) {
    const arr = await d.http.json<{ code: string; nom: string }[] | null>(`${GEO_API}/communes?lat=${lat}&lon=${lon}&type=arrondissement-municipal&fields=code,nom`);
    return arr?.[0] ?? c;
  }
  return c;
}

/** Contours simplifiés des communes d'un département (arrondissements pour Paris), en cache. */
export async function departmentContours(d: Deps, dep: string): Promise<FeatureCollection<Polygon | MultiPolygon>> {
  const cached = await d.cache.get<FeatureCollection<Polygon | MultiPolygon>>('communes_contours', dep);
  if (cached?.statut === 'ok' && cached.payload) return cached.payload;
  const url =
    dep === '75'
      ? `${GEO_API}/communes?type=arrondissement-municipal&codeDepartement=75&format=geojson&geometry=contour&fields=code,nom`
      : `${GEO_API}/departements/${dep}/communes?format=geojson&geometry=contour&fields=code,nom`;
  const fc = await d.http.json<FeatureCollection<Polygon | MultiPolygon>>(url);
  await d.cache.set({ source: 'communes_contours', cle: dep, millesime: '', url, recupere_le: nowIso(d), statut: 'ok', payload: fc });
  return fc;
}

/** Communes intersectées par une zone dessinée (au plus 30). */
export async function communesForZone(d: Deps, zone: Feature<Polygon | MultiPolygon> | Polygon | MultiPolygon) {
  const [minX, minY, maxX, maxY] = bbox(zone as never);
  // Départements concernés : échantillonnage d'une grille de points dans l'emprise.
  const points: [number, number][] = [];
  const N = 5;
  for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) points.push([minX + ((maxX - minX) * i) / N, minY + ((maxY - minY) * j) / N]);
  const deps = new Set<string>();
  await Promise.all(
    points.map(async ([lon, lat]) => {
      try {
        const c = await communeAt(d, lat, lon);
        if (c) deps.add(c.code.startsWith('97') ? c.code.slice(0, 3) : c.code.slice(0, 2));
      } catch {
        /* point en mer ou hors France */
      }
    }),
  );
  if (deps.size === 0) throw new SourceError('aucune commune trouvée dans cette zone');
  if (deps.size > 4) return { communes: [], features: [], tropGrande: true, nombre: null as number | null };
  const features: Feature<Polygon | MultiPolygon>[] = [];
  for (const dep of deps) {
    const fc = await departmentContours(d, dep);
    for (const f of fc.features) if (booleanIntersects(f, zone as never)) features.push(f);
  }
  const communes = features.map((f) => ({ code: String(f.properties?.code), nom: String(f.properties?.nom) }));
  if (communes.length > MAX_COMMUNES_PER_ZONE) return { communes: [], features: [], tropGrande: true, nombre: communes.length };
  return { communes, features, tropGrande: false, nombre: communes.length };
}

/* ------------------------------------------------------------------ */
/* DVF                                                                  */
/* ------------------------------------------------------------------ */

const DVF_DATASET_API = 'https://www.data.gouv.fr/api/1/datasets/5cc1b94a634f4165e96436c1/';
export const DVF_SOURCE = 'DVF géolocalisées (Etalab, DGFiP)';

/** Dernière date couverte par le millésime DVF publié (vérifiée au plus une fois par jour). */
export async function dvfMillesime(d: Deps): Promise<string> {
  const cached = await d.cache.get<{ fin: string }>('dvf_millesime', 'latest');
  const fresh = cached?.statut === 'ok' && cached.payload && cached.recupere_le && Date.now() - Date.parse(cached.recupere_le) < DAY;
  if (fresh) return cached!.payload!.fin;
  try {
    const json = await d.http.json<{ temporal_coverage?: { end?: string } }>(DVF_DATASET_API);
    const fin = json.temporal_coverage?.end?.slice(0, 10);
    if (!fin) throw new SourceError('millésime DVF introuvable');
    await d.cache.set({ source: 'dvf_millesime', cle: 'latest', millesime: '', url: DVF_DATASET_API, recupere_le: nowIso(d), statut: 'ok', payload: { fin } });
    return fin;
  } catch (e) {
    if (cached?.payload) return cached.payload.fin;
    throw e;
  }
}

/** Charge (une fois par millésime) les ventes DVF filtrées d'une commune dans dvf_sales. */
export async function ensureDvfCommune(d: Deps, code: string, fin: string, force = false) {
  const cached = await d.cache.get<{ ventes: number }>('dvf', code, fin);
  if (!force && cached?.statut === 'ok') return { recupere_le: cached.recupere_le ?? null, ventes: cached.payload?.ventes ?? 0 };
  const years = yearsToLoad(fin);
  let total = 0;
  const urls: string[] = [];
  for (const y of years) {
    const url = dvfCommuneUrl(y, code);
    urls.push(url);
    let text: string;
    try {
      text = new TextDecoder('utf-8').decode(await d.http.buffer(url));
    } catch (e) {
      // Aucune vente cette année-là dans une petite commune : fichier absent.
      if (e instanceof SourceError && e.status === 404) continue;
      await d.cache.set({ source: 'dvf', cle: code, millesime: fin, url, statut: 'erreur', message: errMsg(e) }).catch(() => {});
      throw e;
    }
    const sales = parseDvfCsv(text, fin);
    total += sales.length;
    await d.dvf.insert(sales);
  }
  const at = nowIso(d);
  await d.cache.set({ source: 'dvf', cle: code, millesime: fin, url: urls.join(' '), recupere_le: at, statut: 'ok', payload: { ventes: total } });
  return { recupere_le: at, ventes: total };
}

export type DvfOutcome = DvfSummary & {
  ventes?: { id_mutation: string; date: string; prix: number; surface: number | null; prix_m2: number; distance_m: number; adresse: string | null; type: string }[];
};


/** Communes situées à moins d'1 km du bien (échantillonnage de 8 points sur le cercle). */
async function communesWithin1km(d: Deps, lat: number, lon: number, code: string) {
  const codes = new Set([code]);
  const dLat = 1000 / 111320;
  const dLon = 1000 / (111320 * Math.cos((lat * Math.PI) / 180));
  await Promise.all(
    Array.from({ length: 8 }, (_, k) => (k * Math.PI) / 4).map(async (a) => {
      try {
        const c = await communeAt(d, lat + dLat * Math.sin(a), lon + dLon * Math.cos(a));
        if (c && !dvfNotCovered(c.code)) codes.add(c.code);
      } catch {
        /* ignoré : la commune du bien suffit */
      }
    }),
  );
  return [...codes].slice(0, 6);
}

export async function dvfFor(
  d: Deps,
  p: { lat: number; lon: number; code_insee: string; surface: number | null; type: 'appartement' | 'maison' | 'immeuble' | 'murs_commerciaux' },
  force = false,
): Promise<DvfOutcome> {
  const base = { source: DVF_SOURCE, url: 'https://www.data.gouv.fr/datasets/demandes-de-valeurs-foncieres-geolocalisees', n: 0 };
  const nc = dvfNotCovered(p.code_insee);
  if (nc) return { ...base, status: 'non_applicable', message: nc };
  let fin: string;
  try {
    fin = await dvfMillesime(d);
    const codes = await communesWithin1km(d, p.lat, p.lon, p.code_insee);
    let recupere: string | null = null;
    for (const c of codes) recupere = (await ensureDvfCommune(d, c, fin, force)).recupere_le ?? recupere;
    const sales = await d.dvf.query(codes, windowStart(fin, 24), fin);
    if (p.type === 'murs_commerciaux') {
      const locaux = sales
        .filter((s) => s.type_local === 'Local' && s.lat !== null && s.lon !== null)
        .map((s) => ({ s, dist: haversineMeters(p.lat, p.lon, s.lat!, s.lon!) }))
        .filter((x) => x.dist <= 1000)
        .sort((a, b) => a.dist - b.dist);
      return {
        ...base,
        status: 'ok',
        millesime: fin,
        recupere_le: recupere,
        n: locaux.length,
        periode: { debut: windowStart(fin, 24), fin },
        perimetre: '1 km',
        message: 'Locaux commerciaux : ventes affichées à titre indicatif (surfaces souvent absentes), sans estimation.',
        ventes: locaux.slice(0, 30).map(({ s, dist }) => ({
          id_mutation: s.id_mutation,
          date: s.date_mutation,
          prix: s.prix,
          surface: s.surface,
          prix_m2: s.surface ? s.prix / s.surface : NaN,
          distance_m: dist,
          adresse: s.adresse,
          type: s.type_local,
        })),
      };
    }
    if (p.surface === null) return { ...base, status: 'insuffisant', millesime: fin, message: 'Surface inconnue : comparables non calculables.' };
    const r = findComparables(
      sales,
      { lat: p.lat, lon: p.lon, surface: p.surface, type: p.type === 'maison' ? 'Maison' : 'Appartement', code_insee: p.code_insee, fin },
      { source: DVF_SOURCE, millesime: fin, recupere_le: recupere },
    );
    const { ventes, ...summary } = r;
    return {
      ...base,
      ...summary,
      url: base.url,
      ventes: ventes.slice(0, 30).map((s) => ({
        id_mutation: s.id_mutation,
        date: s.date_mutation,
        prix: s.prix,
        surface: s.surface,
        prix_m2: s.prix_m2,
        distance_m: Math.round(s.distance_m),
        adresse: s.adresse,
        type: s.type_local,
      })),
    };
  } catch (e) {
    return { ...base, status: 'indisponible', message: `DVF indisponible : ${errMsg(e)}` };
  }
}

/* ------------------------------------------------------------------ */
/* Carte des loyers ANIL                                                */
/* ------------------------------------------------------------------ */

type AnilPayload = { appartement?: AnilRow; maison?: AnilRow };

export async function anilFor(d: Deps, code: string, type: 'appartement' | 'maison', force = false): Promise<MarketRent> {
  const base = { source: ANIL_SOURCE, url: ANIL_DATASET, millesime: ANIL_MILLESIME, type_bien: type };
  const toRent = (row: AnilRow | undefined, recupere_le: string | null): MarketRent =>
    row
      ? {
          ...base,
          status: 'ok',
          recupere_le,
          loypredm2: row.loypredm2,
          lwr_m2: row.lwr_m2,
          upr_m2: row.upr_m2,
          typpred: row.typpred,
          nbobs_com: row.nbobs_com,
          nbobs_mail: row.nbobs_mail,
          r2_adj: row.r2_adj,
          message:
            'Loyer d’annonce charges comprises, logement non meublé, pour un bien type (52 m² pour un appartement, 92 m² pour une maison).',
        }
      : { ...base, status: 'insuffisant', recupere_le, message: 'Commune absente de la carte des loyers.' };
  const cached = await d.cache.get<AnilPayload>('anil', code, ANIL_MILLESIME);
  if (!force && cached?.statut === 'ok') return toRent(cached.payload?.[type], cached.recupere_le ?? null);
  try {
    const [app, mai] = await Promise.all([
      d.http.buffer(ANIL_FILES.appartement, { timeoutMs: 20000 }),
      d.http.buffer(ANIL_FILES.maison, { timeoutMs: 20000 }),
    ]);
    const apps = parseAnilCsv(app);
    const mais = parseAnilCsv(mai);
    const dep = code.startsWith('97') ? code.slice(0, 3) : code.slice(0, 2);
    const byCode = new Map<string, AnilPayload>();
    for (const r of apps) if (r.dep === dep || r.code_insee === code) byCode.set(r.code_insee, { ...(byCode.get(r.code_insee) ?? {}), appartement: r });
    for (const r of mais) if (r.dep === dep || r.code_insee === code) byCode.set(r.code_insee, { ...(byCode.get(r.code_insee) ?? {}), maison: r });
    const at = nowIso(d);
    await d.cache.setMany(
      [...byCode.entries()].map(([cle, payload]) => ({ source: 'anil', cle, millesime: ANIL_MILLESIME, url: `${ANIL_FILES.appartement} ${ANIL_FILES.maison}`, recupere_le: at, statut: 'ok' as const, payload })),
    );
    if (!byCode.has(code)) await d.cache.set({ source: 'anil', cle: code, millesime: ANIL_MILLESIME, recupere_le: at, statut: 'ok', payload: {} });
    return toRent(byCode.get(code)?.[type], at);
  } catch (e) {
    await d.cache.set({ source: 'anil', cle: code, millesime: ANIL_MILLESIME, statut: 'erreur', message: errMsg(e) }).catch(() => {});
    if (cached?.statut === 'ok') return toRent(cached.payload?.[type], cached.recupere_le ?? null);
    return { ...base, status: 'indisponible', message: `Carte des loyers indisponible : ${errMsg(e)}` };
  }
}

/* ------------------------------------------------------------------ */
/* DPE (ADEME)                                                          */
/* ------------------------------------------------------------------ */

export const DPE_API = 'https://data.ademe.fr/data-fair/api/v1/datasets/dpe03existant/lines';
export interface DpeCandidate {
  numero_dpe: string;
  date_etablissement_dpe: string;
  etiquette_dpe: string;
  etiquette_ges: string | null;
  surface_habitable_logement: number | null;
  type_energie_principale_chauffage: string | null;
  complement_adresse_logement: string | null;
  adresse_ban: string;
  type_batiment: string | null;
}
export interface DpeOutcome {
  status: SourceStatus;
  source: string;
  url: string;
  recupere_le: string | null;
  candidats: DpeCandidate[];
  autres: number;
  message?: string;
}

export async function dpeFor(d: Deps, banId: string | null, surface: number | null, force = false): Promise<DpeOutcome> {
  const base = { source: 'DPE logements existants depuis juillet 2021 (ADEME)', url: 'https://data.ademe.fr/datasets/dpe03existant', candidats: [], autres: 0 };
  if (!banId) return { ...base, status: 'insuffisant', recupere_le: null, message: 'Adresse sans numéro précis : recherche de DPE impossible.' };
  const select = 'numero_dpe,date_etablissement_dpe,etiquette_dpe,etiquette_ges,surface_habitable_logement,type_energie_principale_chauffage,complement_adresse_logement,adresse_ban,type_batiment';
  const url = `${DPE_API}?size=100&select=${select}&identifiant_ban_eq=${encodeURIComponent(banId)}&sort=-date_etablissement_dpe`;
  const filter = (all: DpeCandidate[], at: string | null): DpeOutcome => {
    const ok = surface === null ? all : all.filter((c) => c.surface_habitable_logement !== null && Math.abs(c.surface_habitable_logement - surface) <= surface * 0.1);
    return {
      ...base,
      status: 'ok',
      recupere_le: at,
      candidats: ok.slice(0, 10),
      autres: all.length - ok.length,
      message: all.length === 0 ? 'Aucun DPE enregistré à cette adresse depuis juillet 2021.' : undefined,
    };
  };
  const cached = await d.cache.get<DpeCandidate[]>('dpe', banId);
  if (!force && cached?.statut === 'ok' && cached.payload) return filter(cached.payload, cached.recupere_le ?? null);
  try {
    const json = await d.http.json<{ results: DpeCandidate[] }>(url);
    const at = nowIso(d);
    await d.cache.set({ source: 'dpe', cle: banId, millesime: '', url, recupere_le: at, statut: 'ok', payload: json.results });
    return filter(json.results, at);
  } catch (e) {
    await d.cache.set({ source: 'dpe', cle: banId, millesime: '', url, statut: 'erreur', message: errMsg(e) }).catch(() => {});
    return { ...base, status: 'indisponible', recupere_le: null, message: `Base DPE indisponible : ${errMsg(e)}` };
  }
}

/* ------------------------------------------------------------------ */
/* Géorisques                                                           */
/* ------------------------------------------------------------------ */

export async function georisquesFor(d: Deps, lat: number, lon: number, code: string, force = false): Promise<Risks> {
  const key = `${lat.toFixed(4)},${lon.toFixed(4)}`;
  const cached = await d.cache.get<Risks>('georisques', key);
  if (!force && cached?.statut === 'ok' && cached.payload) return { ...cached.payload, recupere_le: cached.recupere_le };
  const urls = georisquesUrls(lat, lon, code);
  const raw: GeorisquesRaw = {};
  const failed: string[] = [];
  await Promise.all(
    (Object.keys(urls) as (keyof typeof urls)[]).map(async (k) => {
      try {
        raw[k] = await d.http.json(urls[k]);
      } catch (e) {
        raw[k] = null;
        failed.push(`${k} (${errMsg(e)})`);
      }
    }),
  );
  const risks = parseGeorisques(raw, code, failed);
  const at = nowIso(d);
  if (risks.status === 'ok') {
    await d.cache.set({ source: 'georisques', cle: key, millesime: '', url: urls.rga, recupere_le: at, statut: 'ok', payload: risks });
    return { ...risks, recupere_le: at };
  }
  await d.cache.set({ source: 'georisques', cle: key, millesime: '', url: urls.rga, statut: 'erreur', message: failed.join(' ; ') }).catch(() => {});
  return { status: 'indisponible', source: GEORISQUES_SOURCE, items: [], message: `Géorisques indisponible : ${failed.join(' ; ')}` };
}

/* ------------------------------------------------------------------ */
/* Encadrement des loyers                                               */
/* ------------------------------------------------------------------ */

async function territoryData(d: Deps, t: Territoire) {
  const meta = TERRITOIRES[t];
  const cached = await d.cache.get<{ values: ReturnType<typeof normalizeTerritoryValues>; quartiers: FeatureCollection }>('encadrement', t, meta.millesime);
  if (cached?.statut === 'ok' && cached.payload) return cached.payload;
  const [valuesBuf, quartiers] = await Promise.all([d.http.buffer(meta.valeurs), d.http.json<FeatureCollection>(meta.quartiers)]);
  const text = new TextDecoder('utf-8').decode(valuesBuf);
  const raw = meta.format === 'csv' ? Papa.parse<Record<string, unknown>>(text, { header: true, skipEmptyLines: true }).data : (JSON.parse(text) as Record<string, unknown>[]);
  const payload = { values: normalizeTerritoryValues(raw), quartiers };
  await d.cache.set({ source: 'encadrement', cle: t, millesime: meta.millesime, url: `${meta.valeurs} ${meta.quartiers}`, recupere_le: nowIso(d), statut: 'ok', payload });
  return payload;
}

async function parisLatestYear(d: Deps): Promise<string> {
  const cached = await d.cache.get<{ annee: string }>('encadrement_paris_annee', 'latest');
  if (cached?.statut === 'ok' && cached.payload && cached.recupere_le && Date.now() - Date.parse(cached.recupere_le) < 7 * DAY) return cached.payload.annee;
  const url = 'https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/logement-encadrement-des-loyers/records?select=annee&group_by=annee&order_by=annee%20desc&limit=1';
  const json = await d.http.json<{ results: { annee: string }[] }>(url);
  const annee = json.results[0]?.annee;
  if (!annee) throw new SourceError('année introuvable');
  await d.cache.set({ source: 'encadrement_paris_annee', cle: 'latest', millesime: '', url, recupere_le: nowIso(d), statut: 'ok', payload: { annee } });
  return annee;
}

export async function encadrementFor(d: Deps, lat: number, lon: number, code: string, c: RentCategory): Promise<RentControl> {
  try {
    if (isParis(code)) {
      const annee = await parisLatestYear(d);
      const url = parisQuery(lat, lon, annee, c);
      const json = await d.http.json<{ results: never[] }>(url);
      return { ...parseParis(json.results, c, annee), recupere_le: nowIso(d) };
    }
    if (code.startsWith('93')) {
      for (const t of Object.keys(TERRITOIRES) as Territoire[]) {
        const data = await territoryData(d, t);
        const zone = zoneAtPoint(data.quartiers, lat, lon);
        if (zone !== null) return { ...lookupTerritory(t, data.values, zone, c), recupere_le: nowIso(d) };
      }
    }
    return notApplicable();
  } catch (e) {
    return { status: 'indisponible', applicable: false, source: 'Encadrement des loyers', message: `Données d’encadrement indisponibles : ${errMsg(e)}` };
  }
}

/* ------------------------------------------------------------------ */
/* Radar de marché                                                      */
/* ------------------------------------------------------------------ */

export interface RadarCommune {
  code: string;
  status: SourceStatus;
  n_ventes: number;
  mediane_m2: number | null;
  loyer_cc_m2: number | null;
  loyer_hc_m2: number | null;
  rendement_brut: number | null;
  typpred?: string;
  periode?: { debut: string; fin: string };
  millesime_dvf?: string;
  millesime_loyers?: string;
  message?: string;
}

/** Rendement brut théorique = loyer de marché HC × 12 / prix médian DVF au m² (moins de 10 ventes : données insuffisantes). */
export async function radarCommune(d: Deps, code: string, type: 'appartement' | 'maison', chargesRecupM2: number): Promise<RadarCommune> {
  const nc = dvfNotCovered(code);
  if (nc) return { code, status: 'non_applicable', n_ventes: 0, mediane_m2: null, loyer_cc_m2: null, loyer_hc_m2: null, rendement_brut: null, message: nc };
  let fin: string;
  let sales: DvfSale[];
  try {
    fin = await dvfMillesime(d);
    await ensureDvfCommune(d, code, fin);
    sales = await d.dvf.query([code], windowStart(fin, 24), fin);
  } catch (e) {
    return { code, status: 'indisponible', n_ventes: 0, mediane_m2: null, loyer_cc_m2: null, loyer_hc_m2: null, rendement_brut: null, message: `DVF indisponible : ${errMsg(e)}` };
  }
  const m = communeMedian(sales, code, type === 'maison' ? 'Maison' : 'Appartement', fin);
  const rent = await anilFor(d, code, type);
  const loyerHc = rent.status === 'ok' && rent.loypredm2 !== undefined ? Math.max(0, rent.loypredm2 - chargesRecupM2) : null;
  const base = {
    code,
    n_ventes: m.n,
    mediane_m2: m.mediane_m2,
    loyer_cc_m2: rent.loypredm2 ?? null,
    loyer_hc_m2: loyerHc,
    typpred: rent.typpred,
    periode: m.periode,
    millesime_dvf: fin,
    millesime_loyers: ANIL_MILLESIME,
  };
  if (m.n < 10) return { ...base, status: 'insuffisant', rendement_brut: null, message: `Données insuffisantes (${m.n} ventes sur 24 mois)` };
  if (loyerHc === null) return { ...base, status: rent.status === 'indisponible' ? 'indisponible' : 'insuffisant', rendement_brut: null, message: rent.message };
  return { ...base, status: 'ok', rendement_brut: (loyerHc * 12) / m.mediane_m2! };
}

export { booleanPointInPolygon };
