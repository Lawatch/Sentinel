import 'server-only';

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { allow } from './rate-limit';

export async function apiUser(limit?: { key: string; max: number; windowMs: number }) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { error: NextResponse.json({ error: 'Non connecté' }, { status: 401 }) } as const;
  if (limit && !allow(`${limit.key}:${data.user.id}`, limit.max, limit.windowMs)) {
    return { error: NextResponse.json({ error: 'Trop de requêtes : réessayez dans une minute.' }, { status: 429 }) } as const;
  }
  return { supabase, user: data.user } as const;
}
