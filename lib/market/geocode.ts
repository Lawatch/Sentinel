/** Géocodage de la Géoplateforme (IGN) : https://data.geopf.fr/geocodage */
export const GEOCODE_URL = 'https://data.geopf.fr/geocodage/search';
export const GEOCODE_MIN_SCORE = 0.6;

export interface GeocodeResult {
  label: string;
  score: number;
  lat: number;
  lon: number;
  citycode: string;
  city: string;
  postcode: string | null;
  ban_id: string | null;
  type: string;
}

interface Feature {
  geometry: { coordinates: [number, number] };
  properties: Record<string, unknown>;
}

export function parseGeocode(json: { features?: Feature[] }): GeocodeResult[] {
  return (json.features ?? []).map((f) => ({
    label: String(f.properties.label ?? ''),
    score: Number(f.properties.score ?? 0),
    lon: f.geometry.coordinates[0],
    lat: f.geometry.coordinates[1],
    citycode: String(f.properties.citycode ?? ''),
    city: String(f.properties.city ?? ''),
    postcode: (f.properties.postcode as string) ?? null,
    // Identifiant BAN au format « 92012_0651_00093 », utilisé pour retrouver les DPE.
    ban_id: f.properties.type === 'housenumber' ? String(f.properties.id ?? '') || null : null,
    type: String(f.properties.type ?? ''),
  }));
}
