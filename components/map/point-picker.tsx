'use client';

import 'leaflet/dist/leaflet.css';
import { useEffect, useEffectEvent, useRef } from 'react';
import { IGN_ATTRIBUTION, IGN_PLAN_URL } from './tiles';

/** Petite carte avec un marqueur déplaçable pour confirmer la position d'un bien. */
export default function PointPicker({ lat, lon, onMove }: { lat: number; lon: number; onMove: (lat: number, lon: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const move = useEffectEvent((la: number, lo: number) => onMove(la, lo));
  useEffect(() => {
    let map: import('leaflet').Map | undefined;
    let cancelled = false;
    (async () => {
      const L = (await import('leaflet')).default;
      if (cancelled || !ref.current) return;
      map = L.map(ref.current, { zoomControl: true }).setView([lat, lon], 17);
      L.tileLayer(IGN_PLAN_URL, { attribution: IGN_ATTRIBUTION, maxZoom: 19, maxNativeZoom: 18 }).addTo(map);
      const m = map;
      setTimeout(() => m.invalidateSize(), 50);
      const marker = L.marker([lat, lon], {
        draggable: true,
        icon: L.divIcon({ className: '', html: '<div style="width:18px;height:18px;border-radius:50%;background:#1f5f8b;border:3px solid #fff;box-shadow:0 0 0 1px #1f5f8b"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }),
      }).addTo(map);
      marker.on('dragend', () => {
        const p = marker.getLatLng();
        move(p.lat, p.lng);
      });
      map.on('click', (e) => {
        marker.setLatLng(e.latlng);
        move(e.latlng.lat, e.latlng.lng);
      });
    })();
    return () => {
      cancelled = true;
      map?.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <div ref={ref} className="h-64 w-full overflow-hidden rounded-md border border-border" />;
}
