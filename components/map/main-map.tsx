'use client';

import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css';
import type { Feature, MultiPolygon, Polygon } from 'geojson';
import type * as Leaflet from 'leaflet';
import { useEffect, useEffectEvent, useRef } from 'react';
import type { Verdict } from '@/lib/finance/types';
import { VERDICT_LABELS } from '@/lib/finance/types';
import { IDF_CENTER, IGN_ATTRIBUTION, IGN_PLAN_URL } from './tiles';

export interface MapProperty {
  id: string;
  titre: string;
  lat: number | null;
  lon: number | null;
  verdict: Verdict | null;
  prix: number | null;
  demo: boolean;
}
export interface MapZone {
  id: string;
  nom: string;
  geojson: Polygon | MultiPolygon;
}
export interface MarketFeature {
  feature: Feature<Polygon | MultiPolygon>;
  color: string;
  tooltip: string;
}

const VERDICT_COLORS: Record<Verdict, string> = {
  a_visiter: '#23824a',
  a_negocier: '#b7791f',
  hors_criteres: '#b83a2e',
  donnees_insuffisantes: '#6b6b63',
};

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export default function MainMap({
  properties,
  zones,
  selectedZoneId,
  market,
  mode,
  onDrawZone,
  onOpenProperty,
}: {
  properties: MapProperty[];
  zones: MapZone[];
  selectedZoneId: string | null;
  market: MarketFeature[];
  mode: 'biens' | 'marche';
  onDrawZone: (g: Polygon) => void;
  onOpenProperty: (id: string) => void;
}) {
  const el = useRef<HTMLDivElement>(null);
  const L = useRef<typeof Leaflet | null>(null);
  const map = useRef<Leaflet.Map | null>(null);
  const layers = useRef<{ markers?: Leaflet.LayerGroup; zones?: Leaflet.LayerGroup; market?: Leaflet.LayerGroup }>({});
  const ready = useRef(false);
  const drawZone = useEffectEvent((g: Polygon) => onDrawZone(g));
  const openProperty = useEffectEvent((id: string) => onOpenProperty(id));

  const redraw = useEffectEvent(() => {
    const Lf = L.current;
    const m = map.current;
    if (!Lf || !m) return;
    // Zones dessinées.
    layers.current.zones?.remove();
    const zg = Lf.layerGroup();
    for (const z of zones) {
      const sel = z.id === selectedZoneId;
      Lf.geoJSON(z.geojson as never, {
        style: { color: sel ? '#1f5f8b' : '#5b7f99', weight: sel ? 3 : 2, dashArray: sel ? undefined : '6 4', fillOpacity: mode === 'marche' ? 0 : 0.04 },
        pmIgnore: true,
      } as Leaflet.GeoJSONOptions)
        .bindTooltip(esc(z.nom), { sticky: true })
        .addTo(zg);
    }
    zg.addTo(m);
    layers.current.zones = zg;
    // Couche marché.
    layers.current.market?.remove();
    if (mode === 'marche') {
      const mg = Lf.layerGroup();
      for (const f of market) {
        Lf.geoJSON(f.feature as never, { style: { color: '#ffffff', weight: 1, fillColor: f.color, fillOpacity: 0.72 }, pmIgnore: true } as Leaflet.GeoJSONOptions)
          .bindTooltip(f.tooltip, { sticky: true })
          .addTo(mg);
      }
      mg.addTo(m);
      layers.current.market = mg;
    }
    // Marqueurs regroupés.
    layers.current.markers?.remove();
    if (mode === 'biens') {
      const cluster = (Lf as unknown as { markerClusterGroup: (o: object) => Leaflet.LayerGroup }).markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 40 });
      for (const p of properties) {
        if (p.lat === null || p.lon === null) continue;
        const color = p.verdict ? VERDICT_COLORS[p.verdict] : '#8a8a82';
        const marker = Lf.marker([p.lat, p.lon], {
          icon: Lf.divIcon({
            className: '',
            html: `<div style="width:16px;height:16px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.35)"></div>`,
            iconSize: [16, 16],
            iconAnchor: [8, 8],
          }),
        });
        marker.bindTooltip(`${esc(p.titre)}${p.demo ? ' (DÉMO)' : ''}<br/>${p.verdict ? VERDICT_LABELS[p.verdict] : 'Sans verdict'}${p.prix ? ` · ${Math.round(p.prix).toLocaleString('fr-FR')} €` : ''}`);
        marker.on('click', () => openProperty(p.id));
        cluster.addLayer(marker);
      }
      cluster.addTo(m);
      layers.current.markers = cluster;
    }
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const Lf = (await import('leaflet')).default;
      (window as unknown as { L: typeof Leaflet }).L = Lf;
      await import('leaflet.markercluster');
      await import('@geoman-io/leaflet-geoman-free');
      if (cancelled || !el.current) return;
      L.current = Lf;
      const m = Lf.map(el.current, { zoomControl: true }).setView(IDF_CENTER, 10);
      Lf.tileLayer(IGN_PLAN_URL, { attribution: IGN_ATTRIBUTION, maxZoom: 19, maxNativeZoom: 18 }).addTo(m);
      const pm = (m as unknown as { pm: { setLang: (l: string) => void; addControls: (o: object) => void } }).pm;
      pm.setLang('fr');
      pm.addControls({
        position: 'topleft',
        drawMarker: false,
        drawCircleMarker: false,
        drawPolyline: false,
        drawCircle: false,
        drawText: false,
        drawPolygon: true,
        drawRectangle: true,
        editMode: false,
        dragMode: false,
        cutPolygon: false,
        removalMode: false,
        rotateMode: false,
      });
      m.on('pm:create', (e: { layer: Leaflet.Layer }) => {
        const gj = (e.layer as unknown as { toGeoJSON: () => Feature<Polygon> }).toGeoJSON();
        m.removeLayer(e.layer);
        drawZone(gj.geometry);
      });
      map.current = m;
      // La taille du conteneur peut changer après l'initialisation (mise en page, bascule mobile).
      const ro = new ResizeObserver(() => m.invalidateSize());
      ro.observe(el.current);
      m.once('unload', () => ro.disconnect());
      setTimeout(() => m.invalidateSize(), 50);
      ready.current = true;
      redraw();
      const pts = properties.filter((p) => p.lat !== null && p.lon !== null).map((p) => [p.lat!, p.lon!] as [number, number]);
      if (pts.length) m.fitBounds(Lf.latLngBounds(pts).pad(0.2), { maxZoom: 14 });
    })();
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
      ready.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (ready.current) redraw();
  }, [properties, zones, selectedZoneId, market, mode]);

  // Centrer sur la zone sélectionnée.
  useEffect(() => {
    const Lf = L.current;
    const m = map.current;
    const z = zones.find((x) => x.id === selectedZoneId);
    if (Lf && m && z) m.fitBounds(Lf.geoJSON(z.geojson as never).getBounds().pad(0.1));
  }, [selectedZoneId, zones]);

  return <div ref={el} className="h-full min-h-[360px] w-full" data-testid="carte" />;
}
