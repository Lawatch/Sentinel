import type { SourceStatus } from '@/lib/finance/market';
import type { Enrichment } from '@/lib/domain/enrichment';
import { RESIDENTIAL_TYPES, type AssetType, type PropertyInputs } from '@/lib/finance/schema';
import { anilFor, dpeFor, dvfFor, encadrementFor, geocode, georisquesFor, needsConfirmation, type Deps } from './sources';

export interface PropertyForEnrichment {
  type_actif: AssetType;
  adresse: string;
  lat: number | null;
  lon: number | null;
  code_insee: string | null;
  ban_id: string | null;
  inputs: PropertyInputs;
  enrichissement: Partial<Enrichment> | null;
}

export interface EnrichmentPatch {
  lat: number | null;
  lon: number | null;
  code_insee: string | null;
  commune: string | null;
  geocode_score: number | null;
  geocode_label: string | null;
  ban_id: string | null;
  enrichissement: Enrichment;
}

const unavailable = (source: string, message: string) => ({ status: 'indisponible' as const, source, message });

/**
 * Enrichit un bien : géocodage puis, en parallèle, DVF, loyer de marché, DPE, Géorisques et encadrement.
 * Chaque source échoue indépendamment : l'analyse est toujours produite et la source en erreur
 * est marquée « indisponible » (jamais « 0 résultat »).
 */
export async function enrichProperty(d: Deps, p: PropertyForEnrichment, opts: { force?: boolean; regeocode?: boolean } = {}): Promise<EnrichmentPatch> {
  const now = (d.now ? d.now() : new Date()).toISOString();
  const prev = p.enrichissement ?? {};
  let { lat, lon, code_insee: code, ban_id } = p;
  let commune: string | null = null;
  let score: number | null = prev.geocodage?.score ?? null;
  let label: string | null = prev.geocodage?.label ?? null;
  let geo: Enrichment['geocodage'] = prev.geocodage;

  const confirmed = prev.geocodage?.confirme === true;
  if ((lat === null || lon === null || !code || opts.regeocode) && !confirmed) {
    const g = await geocode(d, p.adresse);
    const best = g.resultats[0];
    if (g.status === 'ok' && best) {
      lat = best.lat;
      lon = best.lon;
      code = best.citycode;
      ban_id = best.ban_id;
      commune = best.city;
      score = best.score;
      label = best.label;
      geo = {
        status: 'ok',
        source: g.source,
        recupere_le: g.recupere_le,
        label: best.label,
        score: best.score,
        a_confirmer: needsConfirmation(best),
        confirme: false,
        candidats: g.resultats.slice(0, 5),
        message: needsConfirmation(best) ? 'Score de géocodage inférieur à 0,6 : confirmez la position sur la carte.' : undefined,
      };
    } else {
      geo = {
        status: g.status === 'ok' ? 'insuffisant' : 'indisponible',
        source: g.source,
        recupere_le: g.recupere_le,
        a_confirmer: true,
        confirme: false,
        message: g.status === 'ok' ? 'Adresse introuvable : précisez-la ou placez le bien sur la carte.' : `Géocodage indisponible : ${g.message}`,
      };
    }
  }

  if (!geo && lat !== null && lon !== null) {
    geo = {
      status: 'ok',
      source: 'Coordonnées enregistrées avec le bien',
      recupere_le: null,
      label: p.adresse,
      a_confirmer: false,
      confirme: true,
      message: 'Position déjà connue : pas de géocodage nécessaire.',
    };
  }
  const enrichment: Enrichment = { date: now, geocodage: geo };
  const located = lat !== null && lon !== null && !!code;
  if (!located) {
    const msg = 'Bien non localisé : enrichissement impossible tant que l’adresse n’est pas géocodée.';
    enrichment.dvf = { ...unavailable('DVF', msg), status: 'non_demande', n: 0 };
    enrichment.loyer = { ...unavailable('Carte des loyers', msg), status: 'non_demande' };
    enrichment.risques = { ...unavailable('Géorisques', msg), status: 'non_demande', items: [] };
    enrichment.encadrement = { ...unavailable('Encadrement', msg), status: 'non_demande', applicable: false };
    return { lat, lon, code_insee: code, commune, geocode_score: score, geocode_label: label, ban_id, enrichissement: enrichment };
  }

  const type = p.type_actif;
  const residential = RESIDENTIAL_TYPES.includes(type);
  const surface = p.inputs.surface.valeur;
  const force = !!opts.force;
  const tasks: Promise<void>[] = [];

  if (residential || type === 'murs_commerciaux') {
    tasks.push(
      dvfFor(d, { lat: lat!, lon: lon!, code_insee: code!, surface, type: type as 'appartement' | 'maison' | 'immeuble' | 'murs_commerciaux' }, force).then((r) => {
        enrichment.dvf = r;
      }),
    );
  } else {
    enrichment.dvf = { status: 'non_applicable', source: 'DVF', n: 0, message: 'Sans objet pour ce type d’actif.' };
  }

  if (residential) {
    tasks.push(
      anilFor(d, code!, type === 'maison' ? 'maison' : 'appartement', force).then((r) => {
        enrichment.loyer = r;
      }),
      dpeFor(d, ban_id, surface, force).then((r) => {
        enrichment.dpe = r;
      }),
      encadrementFor(d, lat!, lon!, code!, {
        pieces: p.inputs.pieces.valeur,
        epoque: p.inputs.epoque.valeur,
        meuble: p.inputs.meuble,
        maison: type === 'maison',
      }).then((r) => {
        enrichment.encadrement = r;
      }),
    );
  } else {
    enrichment.loyer = { status: 'non_applicable', source: 'Carte des loyers ANIL', message: 'Indicateur résidentiel : sans objet pour ce type d’actif.' };
    enrichment.encadrement = { status: 'non_applicable', applicable: false, source: 'Encadrement des loyers', message: 'Sans objet pour ce type d’actif.' };
  }

  tasks.push(
    georisquesFor(d, lat!, lon!, code!, force).then((r) => {
      enrichment.risques = r;
    }),
  );

  // Chaque tâche gère ses erreurs ; allSettled protège contre une exception inattendue.
  const settled = await Promise.allSettled(tasks);
  for (const s of settled) if (s.status === 'rejected') console.error('Enrichissement : tâche en échec', s.reason);
  enrichment.dvf ??= { status: 'indisponible', source: 'DVF', n: 0, message: 'DVF indisponible.' };
  if (residential) enrichment.loyer ??= { status: 'indisponible', source: 'Carte des loyers ANIL', message: 'Indisponible.' };
  enrichment.risques ??= { status: 'indisponible', source: 'Géorisques', items: [], message: 'Indisponible.' };

  return { lat, lon, code_insee: code, commune: commune ?? null, geocode_score: score, geocode_label: label, ban_id, enrichissement: enrichment };
}


export { marketContextOf, STATUS_LABELS, type Enrichment } from '@/lib/domain/enrichment';
