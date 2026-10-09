'use server';

import { revalidatePath } from 'next/cache';
import { profileParamsSchema } from '@/lib/finance/schema';
import { DEFAULT_PROFILES } from '@/lib/finance/profiles';
import { requireUser } from '@/lib/supabase/server';
import type { ActionResult } from './properties';

const fail = (error: string) => ({ ok: false as const, error });

export async function saveProfile(id: string, nom: string, params: unknown): Promise<ActionResult> {
  const parsed = profileParamsSchema.safeParse(params);
  if (!parsed.success) return fail('Paramètres invalides : ' + parsed.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join(' ; '));
  if (!nom.trim()) return fail('Nom requis');
  const { supabase } = await requireUser();
  const { error } = await supabase.from('profiles').update({ nom: nom.trim(), params: parsed.data }).eq('id', id);
  if (error) return fail(error.message);
  revalidatePath('/', 'layout');
  return { ok: true, data: undefined };
}

export async function createProfile(nom: string, fromId: string | null): Promise<ActionResult<{ id: string }>> {
  const { supabase, user } = await requireUser();
  let params: unknown = DEFAULT_PROFILES[0].params;
  if (fromId) {
    const { data } = await supabase.from('profiles').select('params').eq('id', fromId).single();
    if (data) params = data.params;
  }
  const { data, error } = await supabase.from('profiles').insert({ user_id: user.id, nom: nom.trim() || 'Nouveau profil', params }).select('id').single();
  if (error) return fail(error.message);
  revalidatePath('/', 'layout');
  return { ok: true, data: { id: data.id } };
}

export async function deleteProfile(id: string): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const { count } = await supabase.from('profiles').select('id', { count: 'exact', head: true });
  if ((count ?? 0) <= 1) return fail('Gardez au moins un profil.');
  const { error } = await supabase.from('profiles').delete().eq('id', id);
  if (error) return fail(error.message);
  revalidatePath('/', 'layout');
  return { ok: true, data: undefined };
}

export async function setDefaultProfile(id: string): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const a = await supabase.from('profiles').update({ par_defaut: false }).neq('id', id);
  if (a.error) return fail(a.error.message);
  const b = await supabase.from('profiles').update({ par_defaut: true }).eq('id', id);
  if (b.error) return fail(b.error.message);
  revalidatePath('/', 'layout');
  return { ok: true, data: undefined };
}
