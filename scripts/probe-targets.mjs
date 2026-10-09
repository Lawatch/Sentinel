const j = (b) => JSON.parse(b.toString('utf8'));
const ds = (b) => j(b).data.map((d) => ({ title: d.title, slug: d.slug, org: d.organization?.name, last: d.last_update, resources: d.resources.map((r) => ({ t: r.title, f: r.format, u: r.url, m: r.last_modified, size: r.filesize })) }));
const lines = (n, enc = 'utf8') => (b) => { const s = new TextDecoder(enc).decode(b); const l = s.split('\n'); return l.slice(0, n).join('\n') + `\n... (${l.length} lignes) dernière: ${l[l.length - 2]}`; };
export default [
  { url: 'https://www.data.gouv.fr/api/1/datasets/693aa2feed1bf4da603faa49/', fn: (b) => { const d = j(b); return { title: d.title, resources: d.resources.map((r) => ({ t: r.title, f: r.format, u: r.url, m: r.last_modified, size: r.filesize })) }; } },
  { url: 'https://data.ademe.fr/data-fair/api/v1/datasets/dpe03existant/schema', fn: (b) => j(b).map((c) => c.key).join(' ') },
  { url: 'https://data.ademe.fr/data-fair/api/v1/datasets/dpe03existant/lines?size=3&select=numero_dpe,date_etablissement_dpe,etiquette_dpe,etiquette_ges,adresse_ban,identifiant_ban,code_insee_ban,surface_habitable_logement,type_batiment,type_energie_principale_chauffage,complement_adresse_logement,numero_etage_appartement&q=93%20Rue%20de%20Bellevue&q_fields=adresse_ban&code_insee_ban_eq=92012', max: 4000 },
  { url: 'https://www.georisques.gouv.fr/api/v1/resultats_rapport_risque?latlon=2.2420,48.8383', fn: (b) => b.toString('utf8').slice(0, 400) },
  { url: 'https://www.georisques.gouv.fr/api/v1/resultats_rapport_risque?latlon=2.4500,48.8000', fn: (b) => b.toString('utf8').slice(0, 400) },
  { url: 'https://www.data.gouv.fr/api/1/datasets/?q=encadrement%20loyers%20plaine%20commune&page_size=5', fn: ds },
  { url: 'https://www.data.gouv.fr/api/1/datasets/?q=encadrement%20loyers%20est%20ensemble&page_size=5', fn: ds },
  { url: 'https://www.data.gouv.fr/api/1/datasets/?q=loyers%20de%20reference%20drihl&page_size=5', fn: ds },
  { url: 'https://geo.api.gouv.fr/communes?type=arrondissement-municipal&codeDepartement=75&fields=code,nom', max: 400 },
  { url: 'https://geo.api.gouv.fr/departements/92/communes?format=geojson&geometry=contour&fields=code,nom', fn: (b) => `features=${j(b).features.length} first=${JSON.stringify(j(b).features[0]).slice(0, 300)}` },
  { url: 'https://geo.api.gouv.fr/communes?type=arrondissement-municipal&codeDepartement=75&format=geojson&geometry=contour&fields=code,nom', fn: (b) => `features=${j(b).features.length}` },
  { url: 'https://files.data.gouv.fr/geo-dvf/latest/csv/2025/communes/75/75115.csv', fn: lines(2) },
  { url: 'https://files.data.gouv.fr/geo-dvf/latest/csv/2025/communes/92/92012.csv', fn: (b) => { const l = b.toString('utf8').trim().split('\n'); const d = l.slice(1).map((x) => x.split(',')[1]).sort(); return `min=${d[0]} max=${d[d.length - 1]} rows=${l.length - 1}`; } },
  { url: 'https://files.data.gouv.fr/geo-dvf/latest/csv/2024/communes/92/92012.csv', fn: (b) => `rows=${b.toString('utf8').trim().split('\n').length - 1}` },
  { url: 'https://files.data.gouv.fr/geo-dvf/latest/csv/2025/communes/67/67482.csv', max: 200 },
  { url: 'https://www.data.gouv.fr/api/1/datasets/?q=demandes%20de%20valeurs%20foncieres%20geolocalisees&page_size=3', fn: (b) => j(b).data.map((d) => ({ title: d.title, last: d.last_update, temporal: d.temporal_coverage })) },
];
