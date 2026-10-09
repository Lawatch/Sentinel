import { analyze, type Analysis } from '@/lib/finance/analyze';
import { DEFAULT_PROFILES } from '@/lib/finance/profiles';
import { profileParamsSchema, propertyInputsSchema, type AssetType, type ProfileParams, type PropertyInputs } from '@/lib/finance/schema';
import type { Confidence, Verdict } from '@/lib/finance/types';
import type { TrackingStatus } from '@/lib/domain/statuses';
import type { ChecklistValue } from '@/lib/domain/checklist';
import { marketContextOf, type Enrichment } from './enrichment';

export interface ProfileRow {
  id: string;
  nom: string;
  params: ProfileParams;
  par_defaut: boolean;
}

export interface PropertyRow {
  id: string;
  type_actif: AssetType;
  titre: string;
  adresse: string;
  commune: string | null;
  code_insee: string | null;
  lat: number | null;
  lon: number | null;
  geocode_score: number | null;
  geocode_label: string | null;
  ban_id: string | null;
  url: string;
  url_normalisee: string;
  profile_id: string | null;
  inputs: PropertyInputs;
  statut: TrackingStatus;
  motif_rejet: string | null;
  notes: string;
  checklist: ChecklistValue;
  enrichissement: Partial<Enrichment>;
  instantanes: Snapshot[];
  demo: boolean;
  created_at: string;
  updated_at: string;
}

export interface Snapshot {
  date: string;
  version_moteur: string;
  profil: { id: string | null; nom: string; params: ProfileParams };
  inputs: PropertyInputs;
  marche: ReturnType<typeof marketContextOf>;
  resultats: Analysis;
}

export interface PriceObservationRow {
  id: string;
  property_id: string;
  date: string;
  prix: number;
  origine: 'saisie' | 'import' | 'restauration';
}

export const today = () => new Date().toISOString().slice(0, 10);

export function parseProfile(r: { id: string; nom: string; params: unknown; par_defaut: boolean }): ProfileRow {
  const defaults = DEFAULT_PROFILES[0].params;
  const parsed = profileParamsSchema.safeParse({ ...defaults, ...(r.params as object) });
  return { id: r.id, nom: r.nom, par_defaut: r.par_defaut, params: parsed.success ? parsed.data : defaults };
}

export function parseProperty(r: Record<string, unknown>): PropertyRow {
  const inputs = propertyInputsSchema.safeParse(r.inputs ?? {});
  return {
    ...(r as unknown as PropertyRow),
    inputs: inputs.success ? inputs.data : propertyInputsSchema.parse({}),
    checklist: (r.checklist as ChecklistValue) ?? {},
    enrichissement: (r.enrichissement as Partial<Enrichment>) ?? {},
    instantanes: (r.instantanes as Snapshot[]) ?? [],
  };
}

/** Profil à appliquer à un bien : celui qui lui est associé, sinon le premier qui couvre son type, sinon le profil par défaut. */
export function profileFor(p: { profile_id: string | null; type_actif: AssetType }, profiles: ProfileRow[]): ProfileRow {
  return (
    profiles.find((x) => x.id === p.profile_id) ??
    profiles.find((x) => x.params.asset_types.includes(p.type_actif)) ??
    profiles.find((x) => x.par_defaut) ??
    profiles[0]
  );
}

export function analyzeProperty(p: PropertyRow, profile: ProfileRow, date = today()): Analysis {
  return analyze({ type: p.type_actif, inputs: p.inputs, profile: profile.params, market: marketContextOf(p.enrichissement), today: date });
}

export interface PropertySummary {
  id: string;
  titre: string;
  type_actif: AssetType;
  adresse: string;
  commune: string | null;
  lat: number | null;
  lon: number | null;
  url: string;
  statut: TrackingStatus;
  demo: boolean;
  created_at: string;
  prix: number | null;
  prix_precedent: number | null;
  baisse: boolean;
  surface: number | null;
  profil: string;
  verdict: Verdict | null;
  confiance: Confidence | null;
  cash_flow_prudent: number | null;
  prix_max: number | null;
  ecart_prix: number | null;
  ecart_dvf: number | null;
  hors_perimetre: boolean;
  enrichi: boolean;
}

export function summarize(p: PropertyRow, profiles: ProfileRow[], obs: PriceObservationRow[]): PropertySummary {
  const profile = profileFor(p, profiles);
  const a = analyzeProperty(p, profile);
  const mine = obs.filter((o) => o.property_id === p.id).sort((x, y) => x.date.localeCompare(y.date));
  const prix_precedent = mine.length > 1 ? Number(mine[mine.length - 2].prix) : null;
  const base = {
    id: p.id,
    titre: p.titre || p.adresse,
    type_actif: p.type_actif,
    adresse: p.adresse,
    commune: p.commune,
    lat: p.lat,
    lon: p.lon,
    url: p.url,
    statut: p.statut,
    demo: p.demo,
    created_at: p.created_at,
    prix: p.inputs.prix.valeur,
    prix_precedent,
    baisse: prix_precedent !== null && p.inputs.prix.valeur !== null && p.inputs.prix.valeur < prix_precedent,
    surface: p.inputs.surface.valeur,
    profil: profile.nom,
    enrichi: Boolean(p.enrichissement?.date),
  };
  if (a.kind === 'hors_perimetre')
    return { ...base, verdict: null, confiance: null, cash_flow_prudent: null, prix_max: null, ecart_prix: null, ecart_dvf: null, hors_perimetre: true };
  if (a.kind === 'fonds') {
    const tr = a.indicateurs.tresorerie;
    const o = a.offre.indicateur;
    return {
      ...base,
      verdict: a.verdict.verdict,
      confiance: a.confiance.niveau,
      cash_flow_prudent: tr.ok ? tr.valeur / 12 : null,
      prix_max: o.ok ? o.valeur : null,
      ecart_prix: o.ok && base.prix ? (o.valeur - base.prix) / base.prix : null,
      ecart_dvf: null,
      hors_perimetre: false,
    };
  }
  const cf = a.header.cash_flow_prudent;
  const pm = a.header.prix_max;
  return {
    ...base,
    verdict: a.verdict.verdict,
    confiance: a.confiance.niveau,
    cash_flow_prudent: cf.ok ? cf.valeur : null,
    prix_max: pm.ok ? pm.valeur : null,
    ecart_prix: a.offre.resultat?.atteignable ? a.offre.resultat.ecart : null,
    ecart_dvf: a.ecart_dvf.ok ? a.ecart_dvf.valeur : null,
    hors_perimetre: false,
  };
}

/** Ordre de tri par défaut : verdict, puis cash-flow prudent, puis confiance. */
const VERDICT_ORDER: Record<Verdict, number> = { a_visiter: 0, a_negocier: 1, donnees_insuffisantes: 2, hors_criteres: 3 };
const CONF_ORDER: Record<Confidence, number> = { A: 0, B: 1, C: 2 };
export function defaultSort(a: PropertySummary, b: PropertySummary) {
  const va = a.verdict ? VERDICT_ORDER[a.verdict] : 9;
  const vb = b.verdict ? VERDICT_ORDER[b.verdict] : 9;
  if (va !== vb) return va - vb;
  const ca = a.cash_flow_prudent ?? -Infinity;
  const cb = b.cash_flow_prudent ?? -Infinity;
  if (ca !== cb) return cb - ca;
  return (a.confiance ? CONF_ORDER[a.confiance] : 9) - (b.confiance ? CONF_ORDER[b.confiance] : 9);
}
