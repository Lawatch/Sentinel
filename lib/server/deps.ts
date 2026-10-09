import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { supabaseCache, supabaseDvf } from './cache-supabase';
import { http } from './http';
import type { Deps } from './sources';

export function serverDeps(): Deps {
  const admin = createAdminClient();
  return { http, cache: supabaseCache(admin), dvf: supabaseDvf(admin) };
}
