import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import type { RentControl } from '@/lib/finance/market';

/**
 * Encadrement des loyers en Île-de-France : Paris, Plaine Commune, Est Ensemble.
 * Données ouvertes utilisées quand elles existent ; sinon l'utilisateur saisit le loyer de référence majoré.
 */
export const PARIS_DATASET = 'https://opendata.paris.fr/explore/dataset/logement-encadrement-des-loyers';
export const PARIS_API = 'https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/logement-encadrement-des-loyers/records';

export const TERRITOIRES = {
  plaine_commune: {
    nom: 'Plaine Commune',
    millesime: '2023',
    dataset: 'https://www.data.gouv.fr/datasets/encadrement-des-loyers-de-plaine-commune-2023',
    valeurs: 'https://static.data.gouv.fr/resources/encadrement-des-loyers-de-plaine-commune-1/20230601-143048/encadrements-plaine-commune-2023.csv',
    format: 'csv' as const,
    quartiers: 'https://static.data.gouv.fr/resources/encadrement-des-loyers-de-plaine-commune/20220608-122433/quartier-plaine-commune-geodata.json',
  },
  est_ensemble: {
    nom: 'Est Ensemble',
    millesime: '2023',
    dataset: 'https://www.data.gouv.fr/datasets/encadrement-des-loyers-de-est-ensemble',
    valeurs: 'https://static.data.gouv.fr/resources/encadrement-des-loyers-de-est-ensemble/20230601-202658/encadrements-est-ensemble-2023.json',
    format: 'json' as const,
    quartiers: 'https://static.data.gouv.fr/resources/encadrement-des-loyers-de-est-ensemble/20220608-121232/quartier-est-ensemble-geodata.json',
  },
} as const;
export type Territoire = keyof typeof TERRITOIRES;

export const isParis = (code: string) => /^751(0[1-9]|1\d|20)$/.test(code) || code === '75056';

export interface RentCategory {
  pieces: number | null;
  epoque: string | null; // 'avant_1946' | '1946_1970' | '1971_1990' | 'apres_1990'
  meuble: boolean;
  maison: boolean;
}

const PARIS_EPOQUE: Record<string, string> = {
  avant_1946: 'Avant 1946',
  '1946_1970': '1946-1970',
  '1971_1990': '1971-1990',
  apres_1990: 'Apres 1990',
};

const OUTDATED =
  'Valeurs issues des données ouvertes du millésime indiqué : un arrêté plus récent peut s’appliquer. Saisissez le loyer de référence majoré en vigueur pour le remplacer.';

export function parisQuery(lat: number, lon: number, annee: string, c: RentCategory): string {
  const where = [`intersects(geo_shape, geom'POINT(${lon} ${lat})')`, `annee='${annee}'`];
  if (c.pieces) where.push(`piece=${Math.min(4, Math.max(1, Math.round(c.pieces)))}`);
  if (c.epoque && PARIS_EPOQUE[c.epoque]) where.push(`epoque='${PARIS_EPOQUE[c.epoque]}'`);
  where.push(`meuble_txt='${c.meuble ? 'meublé' : 'non meublé'}'`);
  const qs = new URLSearchParams({
    select: 'annee,nom_quartier,piece,epoque,meuble_txt,ref,max,min',
    where: where.join(' and '),
    limit: '50',
  });
  return `${PARIS_API}?${qs.toString()}`;
}

interface ParisRecord {
  annee: string;
  nom_quartier: string;
  piece: number;
  epoque: string;
  meuble_txt: string;
  ref: number;
  max: number;
  min: number;
}

/** Interprète la réponse Paris : une seule catégorie si pièces et époque sont connues, sinon une fourchette. */
export function parseParis(records: ParisRecord[], c: RentCategory, annee: string): RentControl {
  const base = { source: 'Ville de Paris — encadrement des loyers', url: PARIS_DATASET, millesime: annee };
  if (records.length === 0) {
    return { ...base, status: 'ok', applicable: true, territoire: 'Paris', message: 'Aucun quartier trouvé à ce point : saisissez le loyer de référence majoré.' };
  }
  const quartier = records[0].nom_quartier;
  if (!c.pieces || !c.epoque) {
    const max = Math.max(...records.map((r) => r.max));
    const min = Math.min(...records.map((r) => r.max));
    return {
      ...base,
      status: 'insuffisant',
      applicable: true,
      territoire: `Paris — ${quartier}`,
      message: `Encadrement applicable (quartier ${quartier}) : loyer de référence majoré entre ${min} et ${max} €/m² selon la catégorie. Précisez le nombre de pièces et l’époque de construction. ${OUTDATED}`,
    };
  }
  const r = records[0];
  return {
    ...base,
    status: 'ok',
    applicable: true,
    territoire: `Paris — ${quartier}`,
    ref_majore_m2: r.max,
    ref_m2: r.ref,
    ref_minore_m2: r.min,
    categorie: `${r.piece} pièce(s), ${r.epoque}, ${r.meuble_txt}`,
    message: OUTDATED,
  };
}

export interface TerritoryValue {
  zone: number;
  nombre_de_piece: number;
  annee_de_construction: string;
  prix_min: number;
  prix_med: number;
  prix_max: number;
  maison: boolean;
  meuble: boolean;
}

const fr = (v: unknown) => (typeof v === 'number' ? v : Number(String(v).replace(',', '.')));
const bool = (v: unknown) => v === true || v === 'true' || v === 'True' || v === '1';

export function normalizeTerritoryValues(raw: Record<string, unknown>[]): TerritoryValue[] {
  return raw.map((r) => ({
    zone: Number(r.zone),
    nombre_de_piece: Number(r.nombre_de_piece),
    annee_de_construction: String(r.annee_de_construction),
    prix_min: fr(r.prix_min),
    prix_med: fr(r.prix_med),
    prix_max: fr(r.prix_max),
    maison: bool(r.maison),
    meuble: bool(r.meuble),
  }));
}

const TERRITORY_EPOQUE: Record<string, string> = {
  avant_1946: 'avant 1946',
  '1946_1970': '1946-1970',
  '1971_1990': '1971-1990',
  apres_1990: 'apres 1990',
};

/** Zone de loyer du point dans les quartiers d'un territoire (propriété « Zone » ou « zone »). */
export function zoneAtPoint(quartiers: FeatureCollection, lat: number, lon: number): number | null {
  for (const f of quartiers.features as Feature<Polygon | MultiPolygon>[]) {
    if (!f.geometry) continue;
    if (booleanPointInPolygon([lon, lat], f)) {
      const p = f.properties ?? {};
      const z = p.Zone ?? p.zone ?? p.ZONE ?? p.id_zone;
      return z === undefined ? null : Number(z);
    }
  }
  return null;
}

export function lookupTerritory(t: Territoire, values: TerritoryValue[], zone: number, c: RentCategory): RentControl {
  const meta = TERRITOIRES[t];
  const base = { source: `Encadrement des loyers — ${meta.nom}`, url: meta.dataset, millesime: meta.millesime, territoire: meta.nom };
  const inZone = values.filter((v) => v.zone === zone && v.meuble === c.meuble && v.maison === c.maison);
  if (!c.pieces || !c.epoque) {
    const maxes = inZone.map((v) => v.prix_max);
    return {
      ...base,
      status: 'insuffisant',
      applicable: true,
      message: `Encadrement applicable (${meta.nom}, zone ${zone})${maxes.length ? ` : loyer de référence majoré entre ${Math.min(...maxes)} et ${Math.max(...maxes)} €/m²` : ''}. Précisez le nombre de pièces et l’époque de construction. ${OUTDATED}`,
    };
  }
  const pieces = Math.min(4, Math.max(1, Math.round(c.pieces)));
  const v = inZone.find((x) => x.nombre_de_piece === pieces && x.annee_de_construction === TERRITORY_EPOQUE[c.epoque!]);
  if (!v) {
    return { ...base, status: 'insuffisant', applicable: true, message: `Catégorie introuvable dans les données ${meta.nom}. ${OUTDATED}` };
  }
  return {
    ...base,
    status: 'ok',
    applicable: true,
    ref_majore_m2: v.prix_max,
    ref_m2: v.prix_med,
    ref_minore_m2: v.prix_min,
    categorie: `zone ${zone}, ${pieces} pièce(s), ${v.annee_de_construction}, ${c.meuble ? 'meublé' : 'non meublé'}`,
    message: OUTDATED,
  };
}

export const notApplicable = (): RentControl => ({
  status: 'non_applicable',
  applicable: false,
  source: 'Encadrement des loyers',
  message: 'Pas d’encadrement des loyers connu à cette adresse dans les données ouvertes utilisées.',
});
