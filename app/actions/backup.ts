'use server';

import { revalidatePath } from 'next/cache';
import { backupSchema, planRestore } from '@/lib/domain/backup';
import { requireUser } from '@/lib/supabase/server';
import type { ActionResult } from './properties';

export async function restoreBackup(json: string): Promise<ActionResult<{ profils: number; zones: number; biens: number; observations: number }>> {
  let parsed;
  try {
    parsed = backupSchema.safeParse(JSON.parse(json));
  } catch {
    return { ok: false, error: 'Fichier illisible (JSON attendu).' };
  }
  if (!parsed.success) return { ok: false, error: 'Ce fichier n’est pas une sauvegarde Sentinel valide.' };
  const { supabase, user } = await requireUser();
  const [props, obs] = await Promise.all([
    supabase.from('properties').select('id,url_normalisee'),
    supabase.from('price_observations').select('id,property_id,date,prix'),
  ]);
  if (props.error || obs.error) return { ok: false, error: (props.error ?? obs.error)!.message };
  const plan = planRestore(parsed.data, {
    properties: props.data ?? [],
    price_observations: (obs.data ?? []).map((o) => ({ ...o, prix: Number(o.prix) })),
  });
  const withUser = <T extends Record<string, unknown>>(rows: T[]) => rows.map((r) => ({ ...r, user_id: user.id }));
  for (const [table, rows] of [
    ['profiles', plan.profiles],
    ['zones', plan.zones],
    ['properties', plan.properties],
    ['price_observations', plan.price_observations],
    ['import_jobs', plan.import_jobs],
  ] as const) {
    if (rows.length === 0) continue;
    const { error } = await supabase.from(table).upsert(withUser(rows as Record<string, unknown>[]), { onConflict: 'id' });
    if (error) return { ok: false, error: `${table} : ${error.message}` };
  }
  revalidatePath('/', 'layout');
  return { ok: true, data: { profils: plan.profiles.length, zones: plan.zones.length, biens: plan.properties.length, observations: plan.price_observations.length } };
}
