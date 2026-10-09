'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireUser } from '@/lib/supabase/server';
import type { ActionResult } from './properties';

const fail = (error: string) => ({ ok: false as const, error });

const zoneSchema = z.object({
  nom: z.string().trim().min(1).max(120),
  geojson: z.object({ type: z.enum(['Polygon', 'MultiPolygon']), coordinates: z.array(z.any()) }),
  communes: z.array(z.object({ code: z.string(), nom: z.string() })).max(30),
});

export async function saveZone(raw: z.infer<typeof zoneSchema>): Promise<ActionResult<{ id: string }>> {
  const parsed = zoneSchema.safeParse(raw);
  if (!parsed.success) return fail('Zone invalide (30 communes au maximum).');
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase.from('zones').insert({ user_id: user.id, ...parsed.data }).select('id').single();
  if (error) return fail(error.message);
  revalidatePath('/');
  return { ok: true, data: { id: data.id } };
}

export async function renameZone(id: string, nom: string): Promise<ActionResult> {
  if (!nom.trim()) return fail('Nom requis');
  const { supabase } = await requireUser();
  const { error } = await supabase.from('zones').update({ nom: nom.trim() }).eq('id', id);
  if (error) return fail(error.message);
  revalidatePath('/');
  return { ok: true, data: undefined };
}

export async function deleteZone(id: string): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const { error } = await supabase.from('zones').delete().eq('id', id);
  if (error) return fail(error.message);
  revalidatePath('/');
  return { ok: true, data: undefined };
}
