import { writeFileSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import { memoryCache, memoryDvf } from '@/lib/server/cache';
import { http } from '@/lib/server/http';
import { anilFor, communesForZone, dpeFor, dvfFor, dvfMillesime, encadrementFor, geocode, georisquesFor, radarCommune, type Deps } from '@/lib/server/sources';
import { checkSources } from '@/lib/server/health';
import { enrichProperty } from '@/lib/server/enrich';
import { analyze, type RentalAnalysis } from '@/lib/finance/analyze';
import { DEFAULT_PROFILES } from '@/lib/finance/profiles';
import { propertyInputsSchema } from '@/lib/finance/schema';
import { marketContextOf } from '@/lib/domain/enrichment';

/**
 * Vérifie le code d'intégration réel contre les sources publiques (aucune simulation).
 * Produit un rapport JSON (live-report.json) repris dans le rapport final.
 */
const d: Deps = { http, cache: memoryCache(), dvf: memoryDvf() };
const report: Record<string, unknown> = { date: new Date().toISOString() };
const timed = async <T>(key: string, fn: () => Promise<T>) => {
  const t0 = Date.now();
  const r = await fn();
  report[key] = { ms: Date.now() - t0, resultat: r };
  return r;
};

afterAll(() => {
  writeFileSync('live-report.json', JSON.stringify(report, null, 1));
});

describe('Sources publiques réelles', () => {
  it('santé de chaque source (appel léger)', async () => {
    const r = await timed('sante', () => checkSources(d));
    console.table(r.map((x) => ({ source: x.id, statut: x.statut, ms: x.ms, message: x.message })));
    expect(r.filter((x) => x.statut === 'ok').length).toBeGreaterThanOrEqual(6);
  });

  it('géocodage IGN : adresse → coordonnées, code INSEE, identifiant BAN', async () => {
    const g = await timed('geocodage', () => geocode(d, '93 rue de Bellevue, 92100 Boulogne-Billancourt'));
    expect(g.status).toBe('ok');
    expect(g.resultats[0]).toMatchObject({ citycode: '92012' });
    expect(g.resultats[0].ban_id).toMatch(/^92012_/);
    expect(g.resultats[0].score).toBeGreaterThan(0.6);
  });

  it('DVF : millésime publié et comparables à Boulogne-Billancourt', async () => {
    const fin = await timed('dvf_millesime', () => dvfMillesime(d));
    expect(fin).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const r = await timed('dvf_comparables', () => dvfFor(d, { lat: 48.8385, lon: 2.2420, code_insee: '92012', surface: 45, type: 'appartement' }));
    expect(r.status).toBe('ok');
    expect(r.n).toBeGreaterThanOrEqual(5);
    expect(r.mediane_m2).toBeGreaterThan(4000);
    expect(r.mediane_m2).toBeLessThan(20000);
  });

  it('DVF : Alsace-Moselle signalée comme non couverte', async () => {
    const r = await dvfFor(d, { lat: 48.5734, lon: 7.7521, code_insee: '67482', surface: 50, type: 'appartement' });
    expect(r.status).toBe('non_applicable');
  });

  it('carte des loyers ANIL 2025 : appartement à Boulogne-Billancourt', async () => {
    const r = await timed('anil', () => anilFor(d, '92012', 'appartement'));
    expect(r.status).toBe('ok');
    expect(r.loypredm2).toBeGreaterThan(15);
    expect(r.lwr_m2).toBeLessThan(r.loypredm2!);
    expect(r.typpred).toBe('commune');
  });

  it('DPE ADEME : candidats à l’adresse BAN', async () => {
    const r = await timed('dpe', () => dpeFor(d, '92012_0651_00093', 48.7));
    expect(r.status).toBe('ok');
    expect(r.candidats.length + r.autres).toBeGreaterThan(0);
  });

  it('Géorisques : liste factuelle au point', async () => {
    const r = await timed('georisques', () => georisquesFor(d, 48.8385, 2.2420, '92012'));
    expect(r.status).toBe('ok');
    expect(r.items.length).toBeGreaterThan(2);
  });

  it('encadrement : Paris (catégorie précise)', async () => {
    const r = await timed('encadrement_paris', () => encadrementFor(d, 48.8507, 2.3086, '75107', { pieces: 2, epoque: '1971_1990', meuble: false, maison: false }));
    expect(r.applicable).toBe(true);
    expect(r.ref_majore_m2).toBeGreaterThan(20);
  });

  it('encadrement : Plaine Commune (Saint-Denis) et Est Ensemble (Montreuil)', async () => {
    const pc = await timed('encadrement_plaine_commune', () => encadrementFor(d, 48.9356, 2.3539, '93066', { pieces: 2, epoque: 'avant_1946', meuble: false, maison: false }));
    expect(pc.applicable).toBe(true);
    expect(pc.territoire).toBe('Plaine Commune');
    const ee = await timed('encadrement_est_ensemble', () => encadrementFor(d, 48.8611, 2.4433, '93048', { pieces: 2, epoque: 'avant_1946', meuble: false, maison: false }));
    expect(ee.applicable).toBe(true);
    expect(ee.territoire).toBe('Est Ensemble');
  });

  it('encadrement : non applicable hors territoires', async () => {
    const r = await encadrementFor(d, 48.8385, 2.2420, '92012', { pieces: 2, epoque: 'avant_1946', meuble: false, maison: false });
    expect(r.applicable).toBe(false);
  });

  it('zone dessinée : communes intersectées (≤ 30)', async () => {
    const poly = { type: 'Polygon' as const, coordinates: [[[2.40, 48.84], [2.47, 48.84], [2.47, 48.88], [2.40, 48.88], [2.40, 48.84]]] };
    const r = await timed('zone', () => communesForZone(d, poly));
    expect(r.tropGrande).toBe(false);
    expect(r.communes.map((c) => c.code)).toContain('93048');
    report.zone = { ...(report.zone as object), resultat: { communes: r.communes } };
  });

  it('radar : rendement brut théorique d’une commune', async () => {
    const r = await timed('radar_montreuil', () => radarCommune(d, '93048', 'appartement', 2));
    expect(r.status).toBe('ok');
    expect(r.rendement_brut).toBeGreaterThan(0.02);
    expect(r.rendement_brut).toBeLessThan(0.12);
  });

  it('enrichissement complet + analyse en moins de 5 s une fois en cache', async () => {
    const p = {
      type_actif: 'appartement' as const,
      adresse: '20 avenue de Ségur, 75007 Paris',
      lat: null,
      lon: null,
      code_insee: null,
      ban_id: null,
      inputs: propertyInputsSchema.parse({ prix: { valeur: 420000, statut: 'declare' }, surface: { valeur: 40, statut: 'declare' }, loyer: { valeur: 1300, statut: 'declare' }, pieces: { valeur: 2, statut: 'declare' }, epoque: { valeur: 'avant_1946', statut: 'declare' } }),
      enrichissement: null,
    };
    const first = await timed('enrichissement_froid', () => enrichProperty(d, p));
    expect(first.code_insee).toBe('75107');
    const t0 = Date.now();
    const second = await enrichProperty(d, { ...p, lat: first.lat, lon: first.lon, code_insee: first.code_insee, ban_id: first.ban_id, enrichissement: first.enrichissement });
    const a = analyze({ type: 'appartement', inputs: p.inputs, profile: DEFAULT_PROFILES[0].params, market: marketContextOf(second.enrichissement), today: new Date().toISOString().slice(0, 10) }) as RentalAnalysis;
    const ms = Date.now() - t0;
    report.enrichissement_en_cache = { ms, verdict: a.verdict, confiance: a.confiance, statuts: Object.fromEntries(Object.entries(second.enrichissement).map(([k, v]) => [k, (v as { status?: string })?.status])) };
    expect(ms).toBeLessThan(5000);
    expect(second.enrichissement.dvf?.status).toBe('ok');
    expect(second.enrichissement.loyer?.status).toBe('ok');
    expect(second.enrichissement.encadrement?.applicable).toBe(true);
  });
});
