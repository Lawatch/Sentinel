'use server';

import { revalidatePath } from 'next/cache';
import { planImport, validateRows, type ColumnMapping } from '@/lib/domain/csv-import';
import { buildInputs } from '@/lib/domain/quick-add';
import { profileFor } from '@/lib/domain/property';
import { ASSET_TYPE_LABELS, type PropertyInputs } from '@/lib/finance/schema';
import { ensureProfiles } from '@/lib/server/data';
import { requireUser } from '@/lib/supabase/server';
import type { ActionResult } from './properties';

export interface ImportReport {
  crees: number;
  observations: number;
  inchanges: number;
  rejetees: { ligne: number; messages: string[] }[];
}

/**
 * Exécute un import CSV après confirmation explicite. Les lignes sont revalidées côté serveur.
 * Une URL connue ajoute une observation de prix ; notes et statuts ne sont jamais modifiés.
 */
export async function confirmImport(fichier: string, rows: Record<string, string>[], mapping: ColumnMapping): Promise<ActionResult<ImportReport>> {
  if (rows.length > 2000) return { ok: false, error: 'Import limité à 2 000 lignes.' };
  const { supabase, user } = await requireUser();
  const { valid, errors, missingColumns } = validateRows(rows, mapping);
  if (missingColumns.length) return { ok: false, error: `Colonnes obligatoires non associées : ${missingColumns.join(', ')}` };
  const profiles = await ensureProfiles(supabase);
  const { data: existing, error } = await supabase.from('properties').select('id,url_normalisee,inputs');
  if (error) return { ok: false, error: error.message };
  const plan = planImport(
    valid,
    (existing ?? []).map((e) => ({ id: e.id, url_normalisee: e.url_normalisee, prix_actuel: (e.inputs as PropertyInputs)?.prix?.valeur ?? null })),
  );
  const report: ImportReport = { crees: 0, observations: 0, inchanges: 0, rejetees: [...errors] };
  for (const action of plan) {
    const r = action.row;
    if (action.kind === 'creer') {
      const profile = profileFor({ profile_id: null, type_actif: r.type_actif }, profiles);
      const inputs = buildInputs({ ...r, dpe: r.dpe ?? null });
      for (const k of ['prix', 'surface', 'loyer', 'charges_copro', 'taxe_fonciere', 'travaux', 'nb_lots'] as const) {
        if (inputs[k].valeur !== null) inputs[k] = { ...inputs[k], source: `Import CSV « ${fichier} », ligne ${r.ligne}` };
      }
      const ins = await supabase
        .from('properties')
        .insert({
          user_id: user.id,
          type_actif: r.type_actif,
          titre: `${ASSET_TYPE_LABELS[r.type_actif]} ${Math.round(r.surface)} m² — ${r.adresse}`,
          adresse: r.adresse,
          url: r.url,
          url_normalisee: r.url_normalisee,
          profile_id: profile.id,
          inputs,
        })
        .select('id')
        .single();
      if (ins.error) {
        report.rejetees.push({ ligne: r.ligne, messages: [`Écriture refusée : ${ins.error.message}`] });
        continue;
      }
      await supabase.from('price_observations').insert({ user_id: user.id, property_id: ins.data.id, prix: r.prix, origine: 'import' });
      report.crees++;
    } else if (action.kind === 'observation') {
      const { data: row } = await supabase.from('properties').select('inputs').eq('id', action.property_id).single();
      const inputs = (row?.inputs ?? {}) as PropertyInputs;
      await supabase.from('price_observations').insert({ user_id: user.id, property_id: action.property_id, prix: r.prix, origine: 'import' });
      // Seul le prix évolue ; statut, notes et autres entrées restent intacts.
      await supabase
        .from('properties')
        .update({ inputs: { ...inputs, prix: { valeur: r.prix, statut: 'declare', source: `Import CSV « ${fichier} », ligne ${r.ligne}`, date: new Date().toISOString().slice(0, 10) } } })
        .eq('id', action.property_id);
      report.observations++;
    } else {
      report.inchanges++;
    }
  }
  report.rejetees.sort((a, b) => a.ligne - b.ligne);
  await supabase.from('import_jobs').insert({
    user_id: user.id,
    fichier,
    lignes_acceptees: report.crees + report.observations + report.inchanges,
    lignes_rejetees: report.rejetees.length,
    erreurs: report.rejetees,
  });
  revalidatePath('/');
  return { ok: true, data: report };
}
