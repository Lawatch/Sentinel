import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { DEFAULT_PROFILES } from '@/lib/finance/profiles';
import { parseProfile, parseProperty, type PriceObservationRow, type ProfileRow } from '@/lib/domain/property';

/** Crée les trois profils préremplis au premier accès. */
export async function ensureProfiles(supabase: SupabaseClient): Promise<ProfileRow[]> {
  const { data, error } = await supabase.from('profiles').select('id,nom,params,par_defaut').order('created_at');
  if (error) throw new Error(error.message);
  if (data && data.length > 0) return data.map(parseProfile);
  const rows = DEFAULT_PROFILES.map((p, i) => ({ nom: p.nom, params: p.params, par_defaut: i === 0 }));
  const ins = await supabase.from('profiles').insert(rows).select('id,nom,params,par_defaut');
  if (ins.error) throw new Error(ins.error.message);
  return (ins.data ?? []).map(parseProfile);
}

export async function loadAll(supabase: SupabaseClient) {
  const [profiles, props, obs, zones] = await Promise.all([
    ensureProfiles(supabase),
    supabase.from('properties').select('*').order('created_at', { ascending: false }),
    supabase.from('price_observations').select('id,property_id,date,prix,origine').order('date'),
    supabase.from('zones').select('id,nom,geojson,communes,created_at').order('created_at'),
  ]);
  if (props.error) throw new Error(props.error.message);
  if (obs.error) throw new Error(obs.error.message);
  if (zones.error) throw new Error(zones.error.message);
  const properties = (props.data ?? []).map(parseProperty);
  const observations = (obs.data ?? []).map((o) => ({ ...o, prix: Number(o.prix) })) as PriceObservationRow[];
  return { profiles, properties, observations, zones: zones.data ?? [] };
}

