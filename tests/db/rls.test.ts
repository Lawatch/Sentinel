import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * T16 Isolation : l'utilisateur B interroge les biens de A → aucun résultat (RLS).
 * Exécuté sur un Postgres local auquel on applique l'émulation Supabase puis les migrations.
 */
const url = process.env.TEST_DATABASE_URL;
const A = '00000000-0000-0000-0000-00000000000a';
const B = '00000000-0000-0000-0000-00000000000b';

describe.skipIf(!url)('Migrations et RLS (Postgres)', () => {
  const db = new Client({ connectionString: url });

  const asUser = async <T>(uid: string, fn: () => Promise<T>) => {
    await db.query('begin');
    await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid]);
    await db.query('set local role authenticated');
    try {
      return await fn();
    } finally {
      await db.query('rollback');
    }
  };

  beforeAll(async () => {
    await db.connect();
    await db.query('drop schema if exists public cascade; create schema public; drop schema if exists auth cascade;');
    await db.query(readFileSync(path.join(__dirname, 'supabase-stub.sql'), 'utf8'));
    const dir = path.join(__dirname, '../../supabase/migrations');
    for (const f of readdirSync(dir).sort()) await db.query(readFileSync(path.join(dir, f), 'utf8'));
    await db.query(`insert into auth.users (id, email) values ($1, 'a@test'), ($2, 'b@test')`, [A, B]);
    // Données de A, insérées en tant que A (donc via RLS).
    await db.query('begin');
    await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [A]);
    await db.query('set local role authenticated');
    const p = await db.query(
      `insert into public.properties (type_actif, url, url_normalisee, adresse) values ('appartement', 'https://ex.fr/a', 'https://ex.fr/a', '1 rue A') returning id`,
    );
    await db.query(`insert into public.price_observations (property_id, prix, origine) values ($1, 250000, 'saisie')`, [p.rows[0].id]);
    await db.query(`insert into public.profiles (nom, params) values ('Profil A', '{}')`);
    await db.query('commit');
  });

  afterAll(async () => {
    await db.end();
  });

  it('T16 : B ne voit aucun bien, aucune observation ni aucun profil de A', async () => {
    await asUser(B, async () => {
      expect((await db.query('select * from public.properties')).rowCount).toBe(0);
      expect((await db.query('select * from public.price_observations')).rowCount).toBe(0);
      expect((await db.query('select * from public.profiles')).rowCount).toBe(0);
    });
  });

  it('A voit ses propres données', async () => {
    await asUser(A, async () => {
      expect((await db.query('select * from public.properties')).rowCount).toBe(1);
      expect((await db.query('select * from public.price_observations')).rowCount).toBe(1);
    });
  });

  it('B ne peut ni modifier ni supprimer les biens de A', async () => {
    await asUser(B, async () => {
      const u = await db.query(`update public.properties set notes = 'piraté'`);
      const d = await db.query(`delete from public.properties`);
      expect(u.rowCount).toBe(0);
      expect(d.rowCount).toBe(0);
    });
  });

  it('B ne peut pas créer une ligne au nom de A', async () => {
    await expect(
      asUser(B, () =>
        db.query(`insert into public.properties (user_id, type_actif, url, url_normalisee) values ($1, 'maison', 'u', 'u')`, [A]),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it('B ne peut pas ajouter une observation de prix sur un bien de A', async () => {
    const id = (await db.query('select id from public.properties limit 1')).rows[0].id;
    await expect(
      asUser(B, () => db.query(`insert into public.price_observations (property_id, prix, origine) values ($1, 1, 'saisie')`, [id])),
    ).rejects.toThrow(/row-level security/);
  });

  it('Les données publiques sont lisibles par un utilisateur connecté mais pas modifiables', async () => {
    await db.query(`insert into public.market_cache (source, cle, statut) values ('test', 'x', 'ok')`);
    await asUser(B, async () => {
      expect((await db.query('select * from public.market_cache')).rowCount).toBe(1);
    });
    await expect(asUser(B, () => db.query(`insert into public.market_cache (source, cle, statut) values ('t', 'y', 'ok')`))).rejects.toThrow(
      /row-level security/,
    );
  });

  it('Aucun accès anonyme', async () => {
    await db.query('begin');
    await db.query('set local role anon');
    await expect(db.query('select * from public.properties')).rejects.toThrow(/permission denied/);
    await db.query('rollback');
  });

  it('Un URL normalisé est unique par utilisateur', async () => {
    await expect(
      asUser(A, () => db.query(`insert into public.properties (type_actif, url, url_normalisee) values ('maison', 'x', 'https://ex.fr/a')`)),
    ).rejects.toThrow(/properties_url_unique/);
  });

  it('Un rejet exige un motif', async () => {
    await expect(asUser(A, () => db.query(`update public.properties set statut = 'rejete'`))).rejects.toThrow(/properties_rejet_motif/);
  });
});
