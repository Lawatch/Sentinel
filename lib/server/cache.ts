import type { DvfSale } from '@/lib/market/dvf';

/** Entrée de cache d'une source externe, par source, clé (commune, point…) et millésime. */
export interface CacheEntry<T = unknown> {
  source: string;
  cle: string;
  millesime: string;
  url?: string | null;
  recupere_le?: string | null;
  statut: 'ok' | 'erreur';
  message?: string | null;
  payload?: T | null;
}

export interface CacheStore {
  get<T>(source: string, cle: string, millesime?: string): Promise<CacheEntry<T> | null>;
  set<T>(entry: CacheEntry<T>): Promise<void>;
  setMany<T>(entries: CacheEntry<T>[]): Promise<void>;
}

export interface DvfStore {
  insert(sales: DvfSale[]): Promise<void>;
  query(codes: string[], debut: string, fin: string): Promise<DvfSale[]>;
}

/** Implémentations en mémoire, pour les tests. */
export function memoryCache(): CacheStore & { entries: Map<string, CacheEntry> } {
  const entries = new Map<string, CacheEntry>();
  const k = (s: string, c: string, m = '') => `${s}|${c}|${m}`;
  return {
    entries,
    async get(source, cle, millesime = '') {
      return (entries.get(k(source, cle, millesime)) as never) ?? null;
    },
    async set(e) {
      entries.set(k(e.source, e.cle, e.millesime), e);
    },
    async setMany(es) {
      for (const e of es) entries.set(k(e.source, e.cle, e.millesime), e);
    },
  };
}

export function memoryDvf(): DvfStore & { sales: DvfSale[] } {
  const sales: DvfSale[] = [];
  return {
    sales,
    async insert(s) {
      const ids = new Set(sales.map((x) => x.id_mutation));
      for (const x of s) if (!ids.has(x.id_mutation)) sales.push(x);
    },
    async query(codes, debut, fin) {
      return sales.filter((s) => codes.includes(s.code_insee) && s.date_mutation >= debut && s.date_mutation <= fin);
    },
  };
}
