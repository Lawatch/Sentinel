import { describe, expect, it } from 'vitest';
import { normalizeUrl } from '@/lib/domain/url';
import { possibleDuplicates } from '@/lib/domain/duplicates';
import { priceHistory, shouldRecordPrice } from '@/lib/domain/price-history';
import { propertiesInZone } from '@/lib/domain/zones';
import { guessMapping, parseNumber, planImport, validateRows } from '@/lib/domain/csv-import';
import { close } from './helpers';

describe('T9 Historique de prix', () => {
  it('250 000 € puis 235 000 € : deux observations conservées, baisse de 6,0 % signalée', () => {
    const h = priceHistory([
      { date: '2026-10-01T10:00:00Z', prix: 250000, origine: 'saisie' },
      { date: '2026-10-08T10:00:00Z', prix: 235000, origine: 'saisie' },
    ]);
    expect(h.observations).toHaveLength(2);
    expect(h.precedent).toBe(250000);
    expect(h.actuel).toBe(235000);
    expect(h.baisse).toBe(true);
    close(h.variation! * 100, -6.0);
  });
  it('un prix inchangé ne crée pas de nouvelle observation', () => {
    expect(shouldRecordPrice([{ date: '2026-01-01', prix: 1000, origine: 'saisie' }], 1000)).toBe(false);
    expect(shouldRecordPrice([{ date: '2026-01-01', prix: 1000, origine: 'saisie' }], 990)).toBe(true);
  });
});

describe('T10 Doublon d’URL', () => {
  it('deux saisies de la même URL, l’une avec paramètres de suivi → un seul bien, deux observations', () => {
    const a = normalizeUrl('https://www.seloger.com/annonces/achat/appartement/paris-15eme-75/123456.htm');
    const b = normalizeUrl('https://seloger.com/annonces/achat/appartement/paris-15eme-75/123456.htm?utm_source=newsletter&utm_medium=email&fbclid=XYZ#photos');
    expect(a).toBe(b);
    const plan = planImport(
      [{ ligne: 2, type_actif: 'appartement', prix: 240000, surface: 40, adresse: 'Paris', url: 'x', url_normalisee: b, loyer: null, charges_copro: null, taxe_fonciere: null, dpe: null, travaux: null, nb_lots: null, description: '' }],
      [{ id: 'bien-1', url_normalisee: a, prix_actuel: 250000 }],
    );
    expect(plan[0].kind).toBe('observation');
  });
  it('conserve les paramètres utiles et ignore leur ordre', () => {
    expect(normalizeUrl('https://ex.fr/a?b=2&a=1')).toBe(normalizeUrl('https://EX.fr/a/?a=1&b=2'));
    expect(normalizeUrl('https://ex.fr/a?id=1')).not.toBe(normalizeUrl('https://ex.fr/a?id=2'));
  });
  it('doublon possible : même adresse et surface à 5 % près, sans fusion automatique', () => {
    const existing = [
      { id: '1', adresse: '12, Rue de la Paix 75002 Paris', surface: 40 },
      { id: '2', adresse: '12 rue de la paix 75002 paris', surface: 60 },
    ];
    const d = possibleDuplicates({ adresse: '12 Rue de la Paix, 75002 Paris', surface: 41.5 }, existing);
    expect(d.map((x) => x.id)).toEqual(['1']);
  });
});

describe('T11 Zone', () => {
  it('un polygone, un bien dedans, un dehors : seul le bien intérieur est listé', () => {
    const zone = {
      type: 'Polygon' as const,
      coordinates: [[[2.2, 48.8], [2.4, 48.8], [2.4, 48.9], [2.2, 48.9], [2.2, 48.8]]],
    };
    const items = [
      { id: 'dedans', lat: 48.85, lon: 2.3 },
      { id: 'dehors', lat: 48.95, lon: 2.3 },
      { id: 'sans-coordonnees', lat: null, lon: null },
    ];
    expect(propertiesInZone(items, zone).map((x) => x.id)).toEqual(['dedans']);
  });
});

describe('T15 Import CSV', () => {
  const header = ['type', 'prix', 'surface', 'adresse', 'url', 'loyer', 'dpe'];
  const rows: Record<string, string>[] = [
    ['appartement', '250 000', '40', '1 rue A Paris', 'https://ex.fr/1', '1 100', 'D'],
    ['maison', '320000', '95', 'Montreuil', 'https://ex.fr/2', '', 'C'],
    ['appartement', '180 000,00 €', '28', 'Saint-Denis', 'https://ex.fr/3', '850', ''],
    ['appartement', 'deux cent mille', '30', 'Paris', 'https://ex.fr/4', '', ''], // prix illisible
    ['appartement', '210000', '35', 'Pantin', 'https://ex.fr/5', '900', 'E'],
    ['murs commerciaux', '150000', '60', 'Bobigny', 'https://ex.fr/6', '', ''],
    ['appartement', '199000', '31', 'Bagnolet', 'https://ex.fr/7', '780', 'F'],
    ['studio', '120000', '18', 'Paris 18', 'https://ex.fr/8', '700', 'H'], // DPE invalide
    ['maison', '410000', '110', 'Vincennes', 'https://ex.fr/9', '', 'B'],
    ['appartement', '230000', '42', 'Ivry', 'https://ex.fr/10', '1000', 'D'],
  ].map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]])));

  it('10 lignes dont 2 malformées : rien n’est écrit avant confirmation ; 8 biens importables et 2 erreurs expliquées', () => {
    const mapping = guessMapping(header);
    expect(mapping.prix).toBe('prix');
    const writes: unknown[] = [];
    const { valid, errors, missingColumns } = validateRows(rows, mapping);
    expect(missingColumns).toEqual([]);
    expect(writes).toHaveLength(0); // la validation n’écrit rien
    expect(valid).toHaveLength(8);
    expect(errors).toHaveLength(2);
    expect(errors[0]).toMatchObject({ ligne: 5 });
    expect(errors[0].messages[0]).toMatch(/Prix illisible/);
    expect(errors[1]).toMatchObject({ ligne: 9 });
    expect(errors[1].messages[0]).toMatch(/DPE « H » invalide/);
    const plan = planImport(valid, []);
    expect(plan.filter((a) => a.kind === 'creer')).toHaveLength(8);
  });

  it('colonne obligatoire absente → aucune ligne acceptée et colonne signalée', () => {
    const { valid, missingColumns } = validateRows(rows, { prix: 'prix' });
    expect(valid).toHaveLength(0);
    expect(missingColumns.length).toBeGreaterThan(0);
  });

  it('lit les nombres au format français', () => {
    expect(parseNumber('1 100,50 €')).toBe(1100.5);
    expect(parseNumber('250.000')).toBe(250000);
    expect(parseNumber('1100.5')).toBe(1100.5);
    expect(parseNumber('')).toBeNull();
    expect(Number.isNaN(parseNumber('abc'))).toBe(true);
  });
});
