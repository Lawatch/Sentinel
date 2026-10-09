'use server';

import { refresh, revalidatePath } from 'next/cache';
import { z } from 'zod';
import { possibleDuplicates } from '@/lib/domain/duplicates';
import { analyzeProperty, parseProfile, parseProperty, profileFor, type Snapshot } from '@/lib/domain/property';
import { marketContextOf } from '@/lib/domain/enrichment';
import { TRACKING_STATUSES } from '@/lib/domain/statuses';
import { isValidUrl, normalizeUrl } from '@/lib/domain/url';
import { ASSET_TYPE_LABELS, propertyInputsSchema, type AssetType, type PropertyInputs } from '@/lib/finance/schema';
import { buildInputs, quickAddSchema, type QuickAdd } from '@/lib/domain/quick-add';
import { ENGINE_VERSION } from '@/lib/finance/types';
import { ensureProfiles } from '@/lib/server/data';
import { requireUser } from '@/lib/supabase/server';

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };
const fail = (error: string) => ({ ok: false as const, error });

const titleOf = (type: AssetType, surface: number | null, lieu: string) =>
  `${ASSET_TYPE_LABELS[type]}${surface ? ` ${Math.round(surface)} m²` : ''} — ${lieu}`;

/** Vérifie l'URL et les doublons possibles avant création (aucune écriture). */
export async function checkBeforeCreate(input: { url: string; adresse: string; surface: number | null }): Promise<
  ActionResult<{ existant: { id: string; titre: string; prix: number | null } | null; doublons: { id: string; titre: string; surface: number | null }[] }>
> {
  const { supabase } = await requireUser();
  if (!isValidUrl(input.url)) return fail('URL invalide');
  const url_normalisee = normalizeUrl(input.url);
  const { data, error } = await supabase.from('properties').select('id,titre,adresse,ban_id,inputs,url_normalisee');
  if (error) return fail(error.message);
  const rows = data ?? [];
  const same = rows.find((r) => r.url_normalisee === url_normalisee);
  const existing = rows.map((r) => ({ id: r.id, titre: r.titre, adresse: r.adresse, ban_id: r.ban_id, surface: (r.inputs as PropertyInputs)?.surface?.valeur ?? null }));
  const doublons = same ? [] : possibleDuplicates({ adresse: input.adresse, surface: input.surface }, existing);
  return {
    ok: true,
    data: {
      existant: same ? { id: same.id, titre: same.titre, prix: (same.inputs as PropertyInputs)?.prix?.valeur ?? null } : null,
      doublons: doublons.map((d) => ({ id: d.id, titre: d.titre ?? d.adresse, surface: d.surface })),
    },
  };
}

export async function createProperty(raw: QuickAdd): Promise<ActionResult<{ id: string }>> {
  const parsed = quickAddSchema.safeParse(raw);
  if (!parsed.success) return fail(parsed.error.issues.map((i) => i.message).join(' ; '));
  const q = parsed.data;
  const { supabase, user } = await requireUser();
  const profiles = await ensureProfiles(supabase);
  const profile = profileFor({ profile_id: null, type_actif: q.type_actif }, profiles);
  const { data, error } = await supabase
    .from('properties')
    .insert({
      user_id: user.id,
      type_actif: q.type_actif,
      titre: titleOf(q.type_actif, q.surface, q.adresse),
      adresse: q.adresse,
      url: q.url,
      url_normalisee: normalizeUrl(q.url),
      profile_id: profile.id,
      inputs: buildInputs(q),
    })
    .select('id')
    .single();
  if (error) {
    if (error.code === '23505') return fail('Cette annonce existe déjà (même URL).');
    return fail(error.message);
  }
  const obs = await supabase.from('price_observations').insert({ user_id: user.id, property_id: data.id, prix: q.prix, origine: 'saisie' });
  if (obs.error) return fail(obs.error.message);
  revalidatePath('/');
  return { ok: true, data: { id: data.id } };
}

/** Nouvelle observation de prix datée ; l'ancien prix reste dans l'historique. */
export async function addPriceObservation(propertyId: string, prix: number, origine: 'saisie' | 'import' = 'saisie'): Promise<ActionResult> {
  if (!(prix > 0)) return fail('Prix invalide');
  const { supabase, user } = await requireUser();
  const { data: row, error } = await supabase.from('properties').select('inputs').eq('id', propertyId).single();
  if (error) return fail(error.message);
  const inputs = propertyInputsSchema.parse(row.inputs ?? {});
  const ins = await supabase.from('price_observations').insert({ user_id: user.id, property_id: propertyId, prix, origine });
  if (ins.error) return fail(ins.error.message);
  inputs.prix = { valeur: prix, statut: inputs.prix.statut === 'inconnu' ? 'declare' : inputs.prix.statut, source: inputs.prix.source ?? 'Annonce', date: new Date().toISOString().slice(0, 10) };
  const up = await supabase.from('properties').update({ inputs }).eq('id', propertyId);
  if (up.error) return fail(up.error.message);
  revalidatePath('/');
  refresh();
  return { ok: true, data: undefined };
}

export async function updateInputs(propertyId: string, raw: unknown, extra?: { adresse?: string; type_actif?: AssetType; profile_id?: string | null }): Promise<ActionResult<{ prixChange: boolean; adresseChange: boolean }>> {
  const parsed = propertyInputsSchema.safeParse(raw);
  if (!parsed.success) return fail('Entrées invalides : ' + parsed.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join(' ; '));
  const { supabase, user } = await requireUser();
  const { data: row, error } = await supabase.from('properties').select('inputs,adresse,type_actif').eq('id', propertyId).single();
  if (error) return fail(error.message);
  const before = propertyInputsSchema.parse(row.inputs ?? {});
  const after = parsed.data;
  const prixChange = after.prix.valeur !== null && after.prix.valeur !== before.prix.valeur;
  const adresseChange = extra?.adresse !== undefined && extra.adresse.trim() !== row.adresse;
  const patch: Record<string, unknown> = { inputs: after };
  if (extra?.type_actif) patch.type_actif = extra.type_actif;
  if (extra?.profile_id !== undefined) patch.profile_id = extra.profile_id;
  if (adresseChange) {
    patch.adresse = extra!.adresse!.trim();
    // La position sera recalculée par le prochain enrichissement.
    patch.lat = null;
    patch.lon = null;
    patch.code_insee = null;
    patch.ban_id = null;
  }
  if (extra?.type_actif === 'murs_commerciaux' && !after.murs) after.murs = propertyInputsSchema.shape.murs.unwrap().parse({});
  if (extra?.type_actif === 'fonds_commerce' && !after.fonds) after.fonds = propertyInputsSchema.shape.fonds.unwrap().parse({});
  const up = await supabase.from('properties').update(patch).eq('id', propertyId);
  if (up.error) return fail(up.error.message);
  if (prixChange) {
    const ins = await supabase.from('price_observations').insert({ user_id: user.id, property_id: propertyId, prix: after.prix.valeur, origine: 'saisie' });
    if (ins.error) return fail(ins.error.message);
  }
  revalidatePath('/');
  refresh();
  return { ok: true, data: { prixChange, adresseChange } };
}

const trackingSchema = z.object({
  statut: z.enum(TRACKING_STATUSES),
  motif_rejet: z.string().trim().max(2000).nullable(),
  notes: z.string().max(50000),
});

/** Statut, motif de rejet et notes. Le passage à « Offre faite » fige une copie de l'analyse. */
export async function updateTracking(propertyId: string, raw: z.infer<typeof trackingSchema>): Promise<ActionResult> {
  const parsed = trackingSchema.safeParse(raw);
  if (!parsed.success) return fail('Données de suivi invalides');
  const t = parsed.data;
  if (t.statut === 'rejete' && !t.motif_rejet) return fail('Indiquez le motif du rejet.');
  const { supabase } = await requireUser();
  const { data: row, error } = await supabase.from('properties').select('*').eq('id', propertyId).single();
  if (error) return fail(error.message);
  const p = parseProperty(row);
  const patch: Record<string, unknown> = { statut: t.statut, motif_rejet: t.statut === 'rejete' ? t.motif_rejet : null, notes: t.notes };
  if (t.statut === 'offre_faite' && p.statut !== 'offre_faite') {
    const { data: profRows } = await supabase.from('profiles').select('id,nom,params,par_defaut');
    const profile = profileFor(p, (profRows ?? []).map(parseProfile));
    const snapshot: Snapshot = {
      date: new Date().toISOString(),
      version_moteur: ENGINE_VERSION,
      profil: { id: profile.id, nom: profile.nom, params: profile.params },
      inputs: p.inputs,
      marche: marketContextOf(p.enrichissement),
      resultats: analyzeProperty(p, profile),
    };
    patch.instantanes = [...p.instantanes, snapshot];
  }
  const up = await supabase.from('properties').update(patch).eq('id', propertyId);
  if (up.error) return fail(up.error.message);
  revalidatePath('/');
  refresh();
  return { ok: true, data: undefined };
}

export async function updateChecklist(propertyId: string, itemId: string, value: { etat: 'a_faire' | 'ok' | 'probleme'; note?: string }): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const { data: row, error } = await supabase.from('properties').select('checklist').eq('id', propertyId).single();
  if (error) return fail(error.message);
  const checklist = { ...(row.checklist ?? {}), [itemId]: { etat: value.etat, note: value.note ?? '' } };
  const up = await supabase.from('properties').update({ checklist }).eq('id', propertyId);
  if (up.error) return fail(up.error.message);
  refresh();
  return { ok: true, data: undefined };
}

/** Passe un champ au statut « vérifié » après validation d'un justificatif. */
export async function markVerified(propertyId: string, champ: string, justificatif: string): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const { data: row, error } = await supabase.from('properties').select('inputs').eq('id', propertyId).single();
  if (error) return fail(error.message);
  const inputs = propertyInputsSchema.parse(row.inputs ?? {}) as Record<string, unknown>;
  const date = new Date().toISOString().slice(0, 10);
  const verify = (f: { valeur: unknown; statut: string; source?: string | null; date?: string | null }) =>
    f && f.valeur !== null ? { ...f, statut: 'verifie', source: justificatif, date } : f;
  const path = champ.split('.');
  if (path[0] === 'fonds' && path[1] === 'ca') {
    const fonds = inputs.fonds as { ca: never[]; ebe: never[] } | undefined;
    if (fonds) {
      fonds.ca = fonds.ca.map(verify as never) as never[];
      fonds.ebe = fonds.ebe.map(verify as never) as never[];
    }
  } else if (path.length === 2) {
    const parent = inputs[path[0]] as Record<string, never> | undefined;
    if (parent && parent[path[1]]) parent[path[1]] = verify(parent[path[1]]) as never;
  } else if (champ === 'loyer') {
    inputs.loyer = verify(inputs.loyer as never);
    inputs.loyers_lots = (inputs.loyers_lots as never[]).map(verify as never);
  } else if (inputs[champ]) {
    inputs[champ] = verify(inputs[champ] as never);
  }
  const up = await supabase.from('properties').update({ inputs: propertyInputsSchema.parse(inputs) }).eq('id', propertyId);
  if (up.error) return fail(up.error.message);
  refresh();
  return { ok: true, data: undefined };
}

/** Confirme (ou déplace) la position géocodée d'un bien. */
export async function confirmLocation(propertyId: string, pos: { lat: number; lon: number; code_insee: string | null }): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const { data: row, error } = await supabase.from('properties').select('enrichissement').eq('id', propertyId).single();
  if (error) return fail(error.message);
  const e = row.enrichissement ?? {};
  const geocodage = { ...(e.geocodage ?? { source: 'Saisie manuelle', status: 'ok' }), a_confirmer: false, confirme: true, message: 'Position confirmée par l’utilisateur.' };
  const up = await supabase
    .from('properties')
    .update({ lat: pos.lat, lon: pos.lon, ...(pos.code_insee ? { code_insee: pos.code_insee } : {}), enrichissement: { ...e, geocodage } })
    .eq('id', propertyId);
  if (up.error) return fail(up.error.message);
  refresh();
  return { ok: true, data: undefined };
}

/** Retient un DPE candidat de la base ADEME (confirmé par l'utilisateur). */
export async function chooseDpe(propertyId: string, dpe: { numero: string; classe: string; date: string; energie: string | null }): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const { data: row, error } = await supabase.from('properties').select('inputs').eq('id', propertyId).single();
  if (error) return fail(error.message);
  const inputs = propertyInputsSchema.parse(row.inputs ?? {});
  const source = `Base DPE ADEME n° ${dpe.numero}, confirmé par l’utilisateur`;
  inputs.dpe = {
    numero: dpe.numero,
    classe: { valeur: dpe.classe, statut: 'estime', source, date: dpe.date },
    date: { valeur: dpe.date, statut: 'estime', source },
    energie_chauffage: { valeur: dpe.energie, statut: dpe.energie ? 'estime' : 'inconnu', source },
  };
  const up = await supabase.from('properties').update({ inputs }).eq('id', propertyId);
  if (up.error) return fail(up.error.message);
  refresh();
  return { ok: true, data: undefined };
}

export async function deleteProperty(propertyId: string): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const { error } = await supabase.from('properties').delete().eq('id', propertyId);
  if (error) return fail(error.message);
  revalidatePath('/');
  return { ok: true, data: undefined };
}
