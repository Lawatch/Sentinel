import { z } from 'zod';

/** Format de sauvegarde complète (toutes les tables du propriétaire). */
export const BACKUP_FORMAT = 'sentinel-sauvegarde';
export const BACKUP_VERSION = 1;

const row = z.record(z.string(), z.unknown());
export const backupSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  version: z.number().int(),
  exporte_le: z.string(),
  tables: z.object({
    profiles: z.array(row),
    zones: z.array(row),
    properties: z.array(row),
    price_observations: z.array(row),
    import_jobs: z.array(row).default([]),
  }),
});
export type Backup = z.infer<typeof backupSchema>;

type Row = Record<string, unknown>;
const strip = (r: Row) => {
  const { user_id: _u, ...rest } = r;
  return rest;
};

export function buildBackup(tables: Backup['tables'], now = new Date().toISOString()): Backup {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exporte_le: now,
    tables: {
      profiles: tables.profiles.map(strip),
      zones: tables.zones.map(strip),
      properties: tables.properties.map(strip),
      price_observations: tables.price_observations.map(strip),
      import_jobs: tables.import_jobs.map(strip),
    },
  };
}

export interface ExistingState {
  properties: { id: string; url_normalisee: string }[];
  price_observations: { id: string; property_id: string; date: string; prix: number }[];
}

export interface RestorePlan {
  profiles: Row[];
  zones: Row[];
  properties: Row[];
  price_observations: Row[];
  import_jobs: Row[];
}

/**
 * Plan de restauration idempotent : chaque ligne est réécrite à son identifiant (upsert) ;
 * un bien dont l'URL existe déjà sous un autre identifiant est rattaché à l'existant ;
 * une observation de prix identique (même bien, même date, même prix) n'est jamais dupliquée.
 */
export function planRestore(b: Backup, existing: ExistingState): RestorePlan {
  const byUrl = new Map(existing.properties.map((p) => [p.url_normalisee, p.id]));
  const idMap = new Map<string, string>();
  const properties = b.tables.properties.map((p) => {
    const fileId = String(p.id);
    const target = existing.properties.some((e) => e.id === fileId) ? fileId : (byUrl.get(String(p.url_normalisee)) ?? fileId);
    idMap.set(fileId, target);
    return { ...strip(p), id: target };
  });
  const obsKey = (o: { property_id: unknown; date: unknown; prix: unknown }) => `${o.property_id}|${new Date(String(o.date)).toISOString()}|${Number(o.prix).toFixed(2)}`;
  const known = new Map(existing.price_observations.map((o) => [obsKey(o), o.id]));
  const price_observations: Row[] = [];
  for (const o of b.tables.price_observations) {
    const property_id = idMap.get(String(o.property_id)) ?? String(o.property_id);
    const candidate = { ...strip(o), property_id };
    const k = obsKey(candidate as never);
    const existingId = known.get(k);
    if (existingId && existingId !== o.id) continue; // déjà présente sous un autre identifiant
    known.set(k, String(o.id));
    price_observations.push(candidate);
  }
  return {
    profiles: b.tables.profiles.map(strip),
    zones: b.tables.zones.map(strip),
    properties,
    price_observations,
    import_jobs: b.tables.import_jobs.map(strip),
  };
}
