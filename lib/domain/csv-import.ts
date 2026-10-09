import { ASSET_TYPES, type AssetType } from '@/lib/finance/schema';
import { isValidUrl, normalizeUrl } from './url';

/** Colonnes reconnues à l'import (format documenté dans le README et docs/exemple-import.csv). */
export const IMPORT_COLUMNS = [
  { key: 'type_actif', label: 'Type d’actif', required: true, aliases: ['type', 'type_actif', 'type d actif', 'type de bien', 'actif'] },
  { key: 'prix', label: 'Prix demandé (€)', required: true, aliases: ['prix', 'prix demande', 'prix_demande', 'price'] },
  { key: 'surface', label: 'Surface (m²)', required: true, aliases: ['surface', 'surface m2', 'm2', 'surface_m2'] },
  { key: 'adresse', label: 'Adresse ou commune', required: true, aliases: ['adresse', 'commune', 'ville', 'localisation', 'address'] },
  { key: 'url', label: 'URL de l’annonce', required: true, aliases: ['url', 'lien', 'annonce', 'url annonce', 'link'] },
  { key: 'loyer', label: 'Loyer mensuel HC (€)', required: false, aliases: ['loyer', 'loyer hc', 'loyer_mensuel', 'loyer mensuel'] },
  { key: 'charges_copro', label: 'Charges de copropriété annuelles (€)', required: false, aliases: ['charges', 'charges copro', 'charges_copro', 'charges de copropriete'] },
  { key: 'taxe_fonciere', label: 'Taxe foncière (€/an)', required: false, aliases: ['taxe fonciere', 'taxe_fonciere', 'tf'] },
  { key: 'dpe', label: 'DPE (A à G)', required: false, aliases: ['dpe', 'classe energie', 'etiquette dpe'] },
  { key: 'travaux', label: 'Travaux estimés (€)', required: false, aliases: ['travaux', 'travaux estimes'] },
  { key: 'nb_lots', label: 'Nombre de lots', required: false, aliases: ['lots', 'nb lots', 'nb_lots', 'nombre de lots'] },
  { key: 'description', label: 'Description', required: false, aliases: ['description', 'texte', 'notes annonce'] },
] as const;

export type ImportKey = (typeof IMPORT_COLUMNS)[number]['key'];
export type ColumnMapping = Partial<Record<ImportKey, string>>;

export interface ImportRow {
  ligne: number;
  type_actif: AssetType;
  prix: number;
  surface: number;
  adresse: string;
  url: string;
  url_normalisee: string;
  loyer: number | null;
  charges_copro: number | null;
  taxe_fonciere: number | null;
  dpe: string | null;
  travaux: number | null;
  nb_lots: number | null;
  description: string;
}

export interface ImportError {
  ligne: number;
  messages: string[];
}

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Association automatique des colonnes par nom ; l'utilisateur peut la corriger. */
export function guessMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  for (const col of IMPORT_COLUMNS) {
    const found = headers.find((h) => col.aliases.some((a) => norm(a) === norm(h)));
    if (found) mapping[col.key] = found;
  }
  return mapping;
}

/** Nombre au format français ou anglais : « 250 000 », « 1 100,50 € », « 250.000 », « 1100.5 ». */
export function parseNumber(raw: string | undefined | null): number | null {
  if (raw === undefined || raw === null) return null;
  let s = String(raw).replace(/[\s  €]/g, '').replace(/m²|m2/gi, '');
  if (s === '' || s === '-') return null;
  if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
  else if (s.includes(',')) s = s.replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  if (!/^-?\d+(\.\d+)?$/.test(s)) return NaN;
  return Number(s);
}

const TYPE_ALIASES: Record<string, AssetType> = {
  appartement: 'appartement',
  appart: 'appartement',
  studio: 'appartement',
  maison: 'maison',
  immeuble: 'immeuble',
  'immeuble de rapport': 'immeuble',
  murs: 'murs_commerciaux',
  'murs commerciaux': 'murs_commerciaux',
  'local commercial': 'murs_commerciaux',
  fonds: 'fonds_commerce',
  'fonds de commerce': 'fonds_commerce',
  'titres de societe': 'titres_societe',
  'murs fonds': 'murs_et_fonds',
};

export function parseAssetType(raw: string | undefined): AssetType | null {
  if (!raw) return null;
  const n = norm(raw);
  if ((ASSET_TYPES as readonly string[]).includes(n.replace(/ /g, '_'))) return n.replace(/ /g, '_') as AssetType;
  return TYPE_ALIASES[n] ?? null;
}

/**
 * Valide chaque ligne et explique chaque erreur. Aucune écriture ici :
 * l'import n'est exécuté qu'après confirmation explicite de l'utilisateur.
 * `ligne` compte la ligne d'en-tête comme ligne 1.
 */
export function validateRows(rows: Record<string, string>[], mapping: ColumnMapping) {
  const valid: ImportRow[] = [];
  const errors: ImportError[] = [];
  const seen = new Map<string, number>();
  const missingColumns = IMPORT_COLUMNS.filter((c) => c.required && !mapping[c.key]).map((c) => c.label);
  if (missingColumns.length) {
    return { valid, errors, missingColumns };
  }
  const get = (row: Record<string, string>, key: ImportKey) => {
    const col = mapping[key];
    return col ? (row[col] ?? '').toString().trim() : '';
  };
  rows.forEach((row, i) => {
    const ligne = i + 2;
    const messages: string[] = [];
    const type = parseAssetType(get(row, 'type_actif'));
    if (!type) messages.push(`Type d’actif « ${get(row, 'type_actif')} » non reconnu (appartement, maison, immeuble, murs commerciaux, fonds de commerce)`);
    const num = (key: ImportKey, label: string, required: boolean, positive = true) => {
      const raw = get(row, key);
      const v = parseNumber(raw);
      if (v === null) {
        if (required) messages.push(`${label} manquant`);
        return null;
      }
      if (Number.isNaN(v)) {
        messages.push(`${label} illisible : « ${raw} »`);
        return null;
      }
      if (positive && v <= 0) {
        messages.push(`${label} doit être positif : « ${raw} »`);
        return null;
      }
      if (!positive && v < 0) {
        messages.push(`${label} ne peut pas être négatif : « ${raw} »`);
        return null;
      }
      return v;
    };
    const prix = num('prix', 'Prix', true);
    const surface = num('surface', 'Surface', true);
    const adresse = get(row, 'adresse');
    if (!adresse) messages.push('Adresse ou commune manquante');
    const url = get(row, 'url');
    if (!url) messages.push('URL de l’annonce manquante');
    else if (!isValidUrl(url)) messages.push(`URL invalide : « ${url} »`);
    const loyer = num('loyer', 'Loyer', false);
    const charges = num('charges_copro', 'Charges de copropriété', false, false);
    const tf = num('taxe_fonciere', 'Taxe foncière', false, false);
    const travaux = num('travaux', 'Travaux', false, false);
    const lots = num('nb_lots', 'Nombre de lots', false);
    const dpeRaw = get(row, 'dpe').toUpperCase();
    if (dpeRaw && !/^[A-G]$/.test(dpeRaw)) messages.push(`DPE « ${dpeRaw} » invalide (lettre de A à G attendue)`);
    let url_normalisee = '';
    if (url && isValidUrl(url)) {
      url_normalisee = normalizeUrl(url);
      const first = seen.get(url_normalisee);
      if (first !== undefined) messages.push(`Même annonce que la ligne ${first} (l’observation de prix sera ajoutée une seule fois)`);
      else seen.set(url_normalisee, ligne);
    }
    if (messages.length) {
      errors.push({ ligne, messages });
      return;
    }
    valid.push({
      ligne,
      type_actif: type!,
      prix: prix!,
      surface: surface!,
      adresse,
      url,
      url_normalisee,
      loyer,
      charges_copro: charges,
      taxe_fonciere: tf,
      dpe: dpeRaw || null,
      travaux,
      nb_lots: lots,
      description: get(row, 'description'),
    });
  });
  return { valid, errors, missingColumns: [] as string[] };
}

export type ImportAction =
  | { kind: 'creer'; row: ImportRow }
  | { kind: 'observation'; row: ImportRow; property_id: string; prix_actuel: number | null }
  | { kind: 'inchange'; row: ImportRow; property_id: string };

/**
 * Plan d'import : une URL déjà connue ajoute une observation de prix (si le prix change)
 * au lieu de dupliquer le bien. Les notes et statuts existants ne sont jamais modifiés.
 */
export function planImport(rows: ImportRow[], existing: { id: string; url_normalisee: string; prix_actuel: number | null }[]): ImportAction[] {
  const byUrl = new Map(existing.map((e) => [e.url_normalisee, e]));
  return rows.map((row) => {
    const e = byUrl.get(row.url_normalisee);
    if (!e) return { kind: 'creer', row };
    if (e.prix_actuel !== null && Math.abs(e.prix_actuel - row.prix) < 0.005) return { kind: 'inchange', row, property_id: e.id };
    return { kind: 'observation', row, property_id: e.id, prix_actuel: e.prix_actuel };
  });
}
