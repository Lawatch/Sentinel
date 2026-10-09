import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import type { Feature, MultiPolygon, Polygon } from 'geojson';

export type ZoneGeometry = Polygon | MultiPolygon | Feature<Polygon | MultiPolygon>;

/** Biens situés dans la zone (test point-dans-polygone, WGS84). Un bien sans coordonnées n'est pas listé. */
export function propertiesInZone<T extends { lat: number | null; lon: number | null }>(items: T[], zone: ZoneGeometry): T[] {
  return items.filter(
    (p) => p.lat !== null && p.lon !== null && booleanPointInPolygon([p.lon, p.lat], zone as Polygon | MultiPolygon),
  );
}

export const MAX_COMMUNES_PER_ZONE = 30;
