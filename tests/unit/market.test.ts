import { describe, expect, it } from 'vitest';
import { filterMutations, findComparables, parseDvfCsv, yearsToLoad, type DvfSale } from '@/lib/market/dvf';
import { parseAnilCsv } from '@/lib/market/anil';
import { lookupTerritory, normalizeTerritoryValues, parseParis, zoneAtPoint } from '@/lib/market/encadrement';
import { parseGeorisques } from '@/lib/market/georisques';
import { memoryCache, memoryDvf } from '@/lib/server/cache';
import { SourceError, type Http } from '@/lib/server/http';
import { enrichProperty, marketContextOf } from '@/lib/server/enrich';
import { analyze, type RentalAnalysis } from '@/lib/finance/analyze';
import { declared, inputs, profileT4 } from './helpers';

const HEADER =
  'id_mutation,date_mutation,numero_disposition,nature_mutation,valeur_fonciere,adresse_numero,adresse_suffixe,adresse_nom_voie,adresse_code_voie,code_postal,code_commune,nom_commune,code_departement,ancien_code_commune,ancien_nom_commune,id_parcelle,ancien_id_parcelle,numero_volume,lot1_numero,lot1_surface_carrez,lot2_numero,lot2_surface_carrez,lot3_numero,lot3_surface_carrez,lot4_numero,lot4_surface_carrez,lot5_numero,lot5_surface_carrez,nombre_lots,code_type_local,type_local,surface_reelle_bati,nombre_pieces_principales,code_nature_culture,nature_culture,code_nature_culture_speciale,nature_culture_speciale,surface_terrain,longitude,latitude';
// Lignes réelles du fichier 2025 de Boulogne-Billancourt (92012), plus une vente de deux appartements.
const LINES = [
  '2025-1193189,2025-01-02,000001,Vente,425200,40,,QUAI GEORGES GORSE,4145,92100,92012,Boulogne-Billancourt,92,,,92012000BD0090,,,630,,,,,,,,,,1,3,Dépendance,,0,,,,,,2.236695,48.824998',
  '2025-1193189,2025-01-02,000001,Vente,425200,38,,QUAI GEORGES GORSE,4145,92100,92012,Boulogne-Billancourt,92,,,92012000BD0090,,,477,43.4,,,,,,,,,1,2,Appartement,44,2,,,,,,2.236695,48.824998',
  '2025-9999999,2025-02-03,000001,Vente,900000,1,,RUE TEST,0001,92100,92012,Boulogne-Billancourt,92,,,92012000AA0001,,,10,50,,,,,,,,,1,2,Appartement,50,2,,,,,,2.24,48.83',
  '2025-9999999,2025-02-03,000001,Vente,900000,1,,RUE TEST,0001,92100,92012,Boulogne-Billancourt,92,,,92012000AA0001,,,11,60,,,,,,,,,1,2,Appartement,60,3,,,,,,2.24,48.83',
  '2025-1193201,2025-01-03,000001,Vente,500000,14,,RUE DE LA BELLE FEUILLE,0640,92100,92012,Boulogne-Billancourt,92,,,920120000Y0154,,,605,,753,58.53,,,,,,,2,2,Appartement,52,2,,,,,,2.242039,48.838368',
  '2025-1193201,2025-01-03,000001,Vente,500000,16,,RUE DE LA BELLE FEUILLE,0640,92100,92012,Boulogne-Billancourt,92,,,920120000Y0154,,,413,,,,,,,,,,1,3,Dépendance,,0,,,,,,2.242039,48.838368',
  '2025-1193201,2025-01-03,000001,Vente,500000,14,,RUE DE LA BELLE FEUILLE,0640,92100,92012,Boulogne-Billancourt,92,,,920120000Y0154,,,605,,753,58.53,,,,,,,2,3,Dépendance,,0,,,,,,2.242039,48.838368',
  '2025-8888888,2025-03-01,000001,Echange,300000,2,,RUE X,0002,92100,92012,Boulogne-Billancourt,92,,,92012000AA0002,,,1,,,,,,,,,,1,2,Appartement,40,2,,,,,,2.24,48.83',
];

describe('T12 Filtre DVF', () => {
  it('une mutation de deux appartements et une d’un appartement : seule la seconde est un comparable', () => {
    const sales = parseDvfCsv([HEADER, ...LINES].join('\n'), '2025-12-31');
    const ids = sales.map((s) => s.id_mutation).sort();
    expect(ids).toEqual(['2025-1193189', '2025-1193201']);
    const s = sales.find((x) => x.id_mutation === '2025-1193201')!;
    expect(s).toMatchObject({ type_local: 'Appartement', surface: 52, pieces: 2, prix: 500000, code_insee: '92012' });
  });
  it('exclut les natures autres que « Vente »', () => {
    expect(filterMutations([{ id_mutation: 'x', nature_mutation: 'Echange', valeur_fonciere: '1', type_local: 'Appartement', surface_reelle_bati: '20' }], 'm')).toHaveLength(0);
  });
  it('années de fichiers à charger pour 24 mois', () => {
    expect(yearsToLoad('2025-12-31')).toEqual([2023, 2024, 2025]);
  });
});

describe('Comparables DVF', () => {
  const mk = (i: number, dist: number, prixM2: number, surface = 40, code = '92012'): DvfSale => ({
    id_mutation: `m${i}`,
    date_mutation: '2025-06-01',
    prix: prixM2 * surface,
    type_local: 'Appartement',
    surface,
    pieces: 2,
    lat: 48.83 + dist / 111320,
    lon: 2.24,
    code_insee: code,
    adresse: null,
    millesime: '2025-12-31',
  });
  const q = { lat: 48.83, lon: 2.24, surface: 40, type: 'Appartement' as const, code_insee: '92012', fin: '2025-12-31' };
  const meta = { source: 'DVF', millesime: '2025-12-31' };
  it('8 ventes à moins de 500 m : périmètre 500 m, médiane et quartiles', () => {
    const sales = Array.from({ length: 8 }, (_, i) => mk(i, 100 + i * 10, 9000 + i * 100));
    const r = findComparables(sales, q, meta);
    expect(r.status).toBe('ok');
    expect(r.perimetre).toBe('500 m');
    expect(r.n).toBe(8);
    expect(r.mediane_m2).toBeCloseTo(9350, 6);
  });
  it('moins de 8 ventes à 500 m → élargit à 1 km et l’affiche', () => {
    const sales = [...Array.from({ length: 3 }, (_, i) => mk(i, 100, 9000)), ...Array.from({ length: 6 }, (_, i) => mk(10 + i, 800, 9500))];
    const r = findComparables(sales, q, meta);
    expect(r.perimetre).toBe('1 km (élargi)');
    expect(r.n).toBe(9);
  });
  it('moins de 5 ventes → « comparables insuffisants », pas d’estimation', () => {
    const r = findComparables([mk(1, 100, 9000), mk(2, 100, 9100)], q, meta);
    expect(r.status).toBe('insuffisant');
    expect(r.mediane_m2).toBeUndefined();
    expect(r.message).toMatch(/Comparables insuffisants/);
  });
  it('surface hors ±30 % exclue', () => {
    const r = findComparables(Array.from({ length: 10 }, (_, i) => mk(i, 100, 9000, 80)), q, meta);
    expect(r.n).toBe(0);
  });
});

describe('Sources ouvertes : analyse des formats réels', () => {
  it('Carte des loyers ANIL (CSV « ; », virgule décimale, Windows-1252)', () => {
    const csv =
      '"id_zone";"INSEE_C";"LIBGEO";"EPCI";"DEP";"REG";"loypredm2";"lwr.IPm2";"upr.IPm2";"TYPPRED";"nbobs_com";"nbobs_mail";"R2_adj"\n' +
      '"3046";"92012";"Boulogne-Billancourt";"200054781";"92";"11";29,7322054471064;23,9513952838298;36,9082481531152;"commune";20474;20474;0,926215468216904\n';
    const bytes = new Uint8Array([...csv].map((c) => c.charCodeAt(0)));
    const rows = parseAnilCsv(bytes);
    expect(rows[0]).toMatchObject({ code_insee: '92012', typpred: 'commune', nbobs_com: 20474 });
    expect(rows[0].loypredm2).toBeCloseTo(29.7322, 4);
    expect(rows[0].lwr_m2).toBeCloseTo(23.9514, 4);
  });
  it('Encadrement Paris : catégorie précise, ou fourchette si pièces / époque inconnues', () => {
    const recs = [
      { annee: '2025', nom_quartier: 'Ecole-Militaire', piece: 2, epoque: '1971-1990', meuble_txt: 'non meublé', ref: 28.8, max: 34.6, min: 20.2 },
    ];
    const ok = parseParis(recs, { pieces: 2, epoque: '1971_1990', meuble: false, maison: false }, '2025');
    expect(ok).toMatchObject({ status: 'ok', applicable: true, ref_majore_m2: 34.6 });
    const partial = parseParis(recs, { pieces: null, epoque: null, meuble: false, maison: false }, '2025');
    expect(partial.status).toBe('insuffisant');
    expect(partial.ref_majore_m2).toBeUndefined();
  });
  it('Encadrement Plaine Commune / Est Ensemble : zone au point puis catégorie', () => {
    const quartiers = {
      type: 'FeatureCollection' as const,
      features: [
        { type: 'Feature' as const, properties: { Zone: '315' }, geometry: { type: 'Polygon' as const, coordinates: [[[2.3, 48.9], [2.4, 48.9], [2.4, 49], [2.3, 49], [2.3, 48.9]]] } },
      ],
    };
    expect(zoneAtPoint(quartiers, 48.95, 2.35)).toBe(315);
    expect(zoneAtPoint(quartiers, 48.5, 2.35)).toBeNull();
    const values = normalizeTerritoryValues([
      { zone: '315', nombre_de_piece: '2', annee_de_construction: 'avant 1946', prix_min: '14,1', prix_med: '20,1', prix_max: '24,1', maison: 'false', meuble: 'false' },
    ]);
    const r = lookupTerritory('plaine_commune', values, 315, { pieces: 2, epoque: 'avant_1946', meuble: false, maison: false });
    expect(r).toMatchObject({ status: 'ok', ref_majore_m2: 24.1, millesime: '2023' });
  });
  it('Géorisques : liste factuelle, critères « notables » explicites', () => {
    const r = parseGeorisques(
      {
        rga: { codeExposition: '3', exposition: 'Exposition forte' },
        sismique: { data: [{ code_insee: '92012', code_zone: '1', zone_sismicite: '1 - TRES FAIBLE' }] },
        radon: { data: [{ classe_potentiel: '1' }] },
        catnat: { results: 7, data: [] },
        icpe: { results: 1, data: [{ raisonSociale: 'Usine', statutSeveso: 'Seveso seuil haut' }] },
      },
      '92012',
      ['azi (délai de 8 s dépassé)'],
    );
    expect(r.status).toBe('ok');
    expect(r.items.filter((i) => i.notable).map((i) => i.libelle)).toEqual([
      'Retrait-gonflement des argiles : exposition forte',
      '1 installation(s) classée(s) à moins de 500 m',
    ]);
    expect(r.message).toMatch(/azi/);
  });
});

describe('T13 Source en panne', () => {
  it('DVF en erreur, carte des loyers disponible : analyse produite, DVF « indisponible », jamais « 0 vente »', async () => {
    const anilCsv =
      '"id_zone";"INSEE_C";"LIBGEO";"EPCI";"DEP";"REG";"loypredm2";"lwr.IPm2";"upr.IPm2";"TYPPRED";"nbobs_com";"nbobs_mail";"R2_adj"\n' +
      '"3046";"92012";"Boulogne-Billancourt";"200054781";"92";"11";29,73;23,95;36,90;"commune";20474;20474;0,92\n';
    const http: Http = {
      json: (async (url: string) => {
        if (url.includes('geocodage'))
          return { features: [{ geometry: { coordinates: [2.2418, 48.8379] }, properties: { label: '26 Allée de la Belle Feuille 92100 Boulogne-Billancourt', score: 0.95, citycode: '92012', city: 'Boulogne-Billancourt', id: '92012_0640_00026', type: 'housenumber' } }] };
        if (url.includes('data.gouv.fr/api')) throw new SourceError('HTTP 503', 503); // DVF en panne
        if (url.includes('geo.api.gouv.fr')) return [{ code: '92012', nom: 'Boulogne-Billancourt' }];
        if (url.includes('data.ademe.fr')) return { results: [] };
        if (url.includes('georisques')) return {};
        throw new SourceError('inattendu');
      }) as Http['json'],
      buffer: (async (url: string) => {
        if (url.includes('pred-')) return new Uint8Array([...anilCsv].map((c) => c.charCodeAt(0))).buffer;
        throw new SourceError('HTTP 503', 503);
      }) as Http['buffer'],
    };
    const cache = memoryCache();
    const patch = await enrichProperty(
      { http, cache, dvf: memoryDvf(), now: () => new Date('2026-10-09T12:00:00Z') },
      {
        type_actif: 'appartement',
        adresse: '26 allée de la Belle Feuille, Boulogne-Billancourt',
        lat: null,
        lon: null,
        code_insee: null,
        ban_id: null,
        inputs: inputs({ prix: declared(300000), surface: declared(40) }),
        enrichissement: null,
      },
    );
    expect(patch.code_insee).toBe('92012');
    expect(patch.enrichissement.dvf?.status).toBe('indisponible');
    expect(patch.enrichissement.dvf?.message).toMatch(/indisponible/);
    expect(patch.enrichissement.loyer?.status).toBe('ok');
    const a = analyze({
      type: 'appartement',
      today: '2026-10-09',
      profile: profileT4(),
      inputs: inputs({ prix: declared(300000), surface: declared(40) }),
      market: marketContextOf(patch.enrichissement),
    }) as RentalAnalysis;
    // L'analyse est produite à partir du loyer de marché.
    expect(a.header.cash_flow_prudent.ok).toBe(true);
    expect(a.ecart_dvf.ok).toBe(false);
    if (!a.ecart_dvf.ok) expect(a.ecart_dvf.note).toMatch(/indisponible/);
    expect(JSON.stringify(a.ecart_dvf)).not.toMatch(/0 vente/);
  });
});

describe('En-têtes HTTP', () => {
  it('l’en-tête User-Agent ne contient que des caractères ASCII (sinon fetch échoue)', async () => {
    const src = (await import('node:fs')).readFileSync('lib/server/http.ts', 'utf8');
    const ua = src.match(/'user-agent': '([^']+)'/)?.[1] ?? '';
    expect(ua.length).toBeGreaterThan(5);
    expect(/^[\x20-\x7e]+$/.test(ua)).toBe(true);
  });
});
