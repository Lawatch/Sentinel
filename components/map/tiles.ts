/** Fond Plan IGN de la Géoplateforme (WMTS, sans clé). */
export const IGN_PLAN_URL =
  'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&TILEMATRIXSET=PM&FORMAT=image/png&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}';
export const IGN_ATTRIBUTION = '© <a href="https://www.ign.fr/" target="_blank" rel="noreferrer">IGN</a> – Géoplateforme';
export const IDF_CENTER: [number, number] = [48.8566, 2.3522];
