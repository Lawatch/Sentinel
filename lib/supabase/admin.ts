import 'server-only';

import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL } from './env';

/**
 * Client « service » : contourne la RLS. Réservé à l'écriture des données publiques
 * partagées (dvf_sales, market_cache). Ne jamais l'utiliser pour les tables du propriétaire.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !key) throw new Error('Clé de service Supabase non configurée (SUPABASE_SECRET_KEY).');
  return createClient(SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
