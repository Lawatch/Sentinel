const j = (b) => JSON.parse(b.toString('utf8'));
const head = (n, enc = 'utf8') => (b) => { const s = new TextDecoder(enc).decode(b); const l = s.split('\n'); return l.slice(0, n).join('\n') + `\n... (${l.length} lignes)`; };
const grep = (re, enc = 'utf8') => (b) => new TextDecoder(enc).decode(b).split('\n').filter((l) => re.test(l)).slice(0, 8).join('\n');
const GR = 'https://www.georisques.gouv.fr/api/v1';
export default [
  { url: 'https://static.data.gouv.fr/resources/carte-des-loyers-indicateurs-de-loyers-dannonce-par-commune-en-2025/20251211-145010/pred-app-mef-dhup.csv', fn: async (b) => head(3, 'latin1')(b) + '\n' + grep(/^"?[^;]*;"?(92012|75115|93066|75056)\b/, 'latin1')(b) + '\nUTF8 valid? ' + (() => { try { new TextDecoder('utf-8', { fatal: true }).decode(b); return 'yes'; } catch { return 'no'; } })() },
  { url: 'https://static.data.gouv.fr/resources/carte-des-loyers-indicateurs-de-loyers-dannonce-par-commune-en-2025/20251211-145039/pred-mai-mef-dhup.csv', fn: head(3, 'latin1') },
  { url: 'https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/logement-encadrement-des-loyers/records?select=annee,count(*)%20as%20n&group_by=annee', max: 800 },
  { url: "https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/logement-encadrement-des-loyers/records?select=annee,nom_quartier,piece,epoque,meuble_txt,ref,max,min&where=intersects(geo_shape,geom'POINT(2.3086 48.8507)')%20and%20annee='2025'&limit=40", max: 5000 },
  { url: 'https://static.data.gouv.fr/resources/encadrement-des-loyers-de-plaine-commune-1/20230601-143048/encadrements-plaine-commune-2023.csv', fn: head(6) },
  { url: 'https://static.data.gouv.fr/resources/encadrement-des-loyers-de-plaine-commune/20220608-122433/quartier-plaine-commune-geodata.json', max: 700 },
  { url: 'https://static.data.gouv.fr/resources/encadrement-des-loyers-de-est-ensemble/20230601-202658/encadrements-est-ensemble-2023.json', max: 1200 },
  { url: 'https://static.data.gouv.fr/resources/encadrement-des-loyers-de-est-ensemble/20220608-121232/quartier-est-ensemble-geodata.json', max: 700 },
  { url: 'https://www.data.gouv.fr/api/1/datasets/encadrement-des-loyers-de-plaine-commune/', fn: (b) => j(b).resources.map((r) => `${r.title} | ${r.url} | ${r.last_modified}`).join('\n') },
  { url: 'https://www.data.gouv.fr/api/1/datasets/?q=encadrement%20loyers%202025&page_size=10', fn: (b) => j(b).data.map((d) => `${d.title} | ${d.slug} | ${d.organization?.name} | ${d.last_update}`).join('\n') },
  { url: `${GR}/gaspar/risques?latlon=2.2420,48.8383`, max: 900 },
  { url: `${GR}/rga?latlon=2.2420,48.8383`, max: 600 },
  { url: `${GR}/zonage_sismique?latlon=2.2420,48.8383`, max: 600 },
  { url: `${GR}/radon?code_insee=92012`, max: 600 },
  { url: `${GR}/gaspar/catnat?code_insee=92012&page_size=3`, max: 900 },
  { url: `${GR}/gaspar/azi?latlon=2.2420,48.8383`, max: 600 },
  { url: `${GR}/ppr?latlon=2.2420,48.8383`, max: 900 },
  { url: `${GR}/installations_classees?latlon=2.2420,48.8383&rayon=500&page_size=2`, max: 900 },
  { url: `${GR}/ssp/casias?latlon=2.2420,48.8383&rayon=200&page_size=2`, max: 600 },
  { url: 'https://data.ademe.fr/data-fair/api/v1/datasets/dpe03existant/lines?size=5&select=numero_dpe,date_etablissement_dpe,etiquette_dpe,adresse_ban,identifiant_ban,surface_habitable_logement,type_batiment,type_energie_principale_chauffage,complement_adresse_logement&identifiant_ban_eq=92012_0651_00093&sort=-date_etablissement_dpe', max: 3000 },
  { url: 'https://data.geopf.fr/geocodage/completion?text=20%20av%20de%20segur&maximumResponses=3', max: 900 },
  { url: 'https://data.geopf.fr/geocodage/search?q=Montreuil&type=municipality&limit=2', max: 900 },
  { url: 'https://data.geopf.fr/geocodage/reverse?lon=2.3086&lat=48.8507&limit=1', max: 600 },
  { url: 'https://www.data.gouv.fr/api/1/datasets/demandes-de-valeurs-foncieres-geolocalisees/', fn: (b) => { const d = j(b); return { id: d.id, slug: d.slug, temporal: d.temporal_coverage, last: d.last_update, res: d.resources.slice(0, 4).map((r) => r.title + ' ' + r.url) }; } },
];
