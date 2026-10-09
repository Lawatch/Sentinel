'use server';

import { revalidatePath } from 'next/cache';
import { DEMO_PROPERTIES } from '@/lib/domain/demo';
import { profileFor } from '@/lib/domain/property';
import { ASSET_TYPE_LABELS } from '@/lib/finance/schema';
import { ensureProfiles } from '@/lib/server/data';
import { requireUser } from '@/lib/supabase/server';
import type { ActionResult } from './properties';

export async function loadDemo(): Promise<ActionResult<{ n: number }>> {
  const { supabase, user } = await requireUser();
  const profiles = await ensureProfiles(supabase);
  let n = 0;
  for (const [i, x] of DEMO_PROPERTIES.entries()) {
    const url = `https://exemple.invalid/demo/${i + 1}`;
    const { data: exists } = await supabase.from('properties').select('id').eq('url_normalisee', url).maybeSingle();
    if (exists) continue;
    const profile = profileFor({ profile_id: null, type_actif: x.type_actif }, profiles);
    const { data, error } = await supabase
      .from('properties')
      .insert({
        user_id: user.id,
        type_actif: x.type_actif,
        titre: `${ASSET_TYPE_LABELS[x.type_actif]} ${Math.round(x.inputs.surface.valeur ?? 0)} m² — ${x.commune}`,
        adresse: x.adresse,
        commune: x.commune,
        code_insee: x.code_insee,
        lat: x.lat,
        lon: x.lon,
        url,
        url_normalisee: url,
        profile_id: profile.id,
        inputs: x.inputs,
        demo: true,
      })
      .select('id')
      .single();
    if (error) return { ok: false, error: error.message };
    const prix = x.inputs.prix.valeur!;
    // Un bien de démonstration a connu une baisse de prix.
    const obs = i === 1 ? [{ prix: Math.round(prix * 1.06), date: '2026-09-01T09:00:00Z' }, { prix, date: new Date().toISOString() }] : [{ prix, date: new Date().toISOString() }];
    await supabase.from('price_observations').insert(obs.map((o) => ({ user_id: user.id, property_id: data.id, prix: o.prix, date: o.date, origine: 'saisie' })));
    n++;
  }
  revalidatePath('/', 'layout');
  return { ok: true, data: { n } };
}

export async function deleteDemo(): Promise<ActionResult<{ n: number }>> {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.from('properties').delete().eq('demo', true).select('id');
  if (error) return { ok: false, error: error.message };
  revalidatePath('/', 'layout');
  return { ok: true, data: { n: data?.length ?? 0 } };
}
