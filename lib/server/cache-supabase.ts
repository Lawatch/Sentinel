import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { DvfSale } from '@/lib/market/dvf';
import type { CacheEntry, CacheStore, DvfStore } from './cache';

/** Cache et ventes DVF en base, écrits avec la clé de service (données publiques partagées). */
export function supabaseCache(admin: SupabaseClient): CacheStore {
  const toRow = (e: CacheEntry) => ({
    source: e.source,
    cle: e.cle,
    millesime: e.millesime ?? '',
    url: e.url ?? null,
    recupere_le: e.recupere_le ?? null,
    derniere_tentative: new Date().toISOString(),
    statut: e.statut,
    message: e.message ?? null,
    payload: e.payload ?? null,
  });
  return {
    async get(source, cle, millesime = '') {
      const { data, error } = await admin
        .from('market_cache')
        .select('*')
        .eq('source', source)
        .eq('cle', cle)
        .eq('millesime', millesime)
        .maybeSingle();
      if (error) throw new Error(`cache : ${error.message}`);
      return data as never;
    },
    async set(e) {
      const { error } = await admin.from('market_cache').upsert(toRow(e), { onConflict: 'source,cle,millesime' });
      if (error) throw new Error(`cache : ${error.message}`);
    },
    async setMany(es) {
      for (let i = 0; i < es.length; i += 500) {
        const { error } = await admin.from('market_cache').upsert(es.slice(i, i + 500).map(toRow), { onConflict: 'source,cle,millesime' });
        if (error) throw new Error(`cache : ${error.message}`);
      }
    },
  };
}

export function supabaseDvf(admin: SupabaseClient): DvfStore {
  return {
    async insert(sales: DvfSale[]) {
      for (let i = 0; i < sales.length; i += 1000) {
        const { error } = await admin.from('dvf_sales').upsert(sales.slice(i, i + 1000), { onConflict: 'id_mutation', ignoreDuplicates: true });
        if (error) throw new Error(`dvf_sales : ${error.message}`);
      }
    },
    async query(codes, debut, fin) {
      const out: DvfSale[] = [];
      const page = 1000;
      for (let from = 0; ; from += page) {
        const { data, error } = await admin
          .from('dvf_sales')
          .select('id_mutation,date_mutation,prix,type_local,surface,pieces,lon,lat,code_insee,adresse,millesime')
          .in('code_insee', codes)
          .gte('date_mutation', debut)
          .lte('date_mutation', fin)
          .order('id_mutation')
          .range(from, from + page - 1);
        if (error) throw new Error(`dvf_sales : ${error.message}`);
        out.push(...(data ?? []).map((d) => ({ ...d, prix: Number(d.prix), surface: d.surface === null ? null : Number(d.surface) }) as DvfSale));
        if (!data || data.length < page) break;
      }
      return out;
    },
  };
}
