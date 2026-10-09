import type { Deps } from './sources';
import { ANIL_FILES } from '@/lib/market/anil';
import { GEOCODE_URL } from '@/lib/market/geocode';
import { PARIS_API } from '@/lib/market/encadrement';
import { GEORISQUES_API } from '@/lib/market/georisques';
import { GEO_API } from '@/lib/market/communes';
import { DPE_API } from './sources';
import { SourceError } from './http';

/** Sources publiques utilisées, avec un appel de contrôle léger pour chacune. */
export const SOURCES = [
  { id: 'dvf', nom: 'DVF géolocalisées (Etalab)', usage: 'Comparables de vente, prix médian au m²', test: 'https://www.data.gouv.fr/api/1/datasets/5cc1b94a634f4165e96436c1/' },
  { id: 'anil', nom: 'Carte des loyers ANIL 2025', usage: 'Loyer de marché par commune', test: ANIL_FILES.appartement, head: true },
  { id: 'dpe', nom: 'DPE logements existants (ADEME)', usage: 'DPE enregistrés à l’adresse', test: `${DPE_API}?size=1&select=numero_dpe` },
  { id: 'geocodage', nom: 'Géocodage Géoplateforme (IGN)', usage: 'Adresse → coordonnées, code INSEE', test: `${GEOCODE_URL}?q=${encodeURIComponent('20 avenue de Ségur Paris')}&limit=1` },
  { id: 'georisques', nom: 'Géorisques', usage: 'Risques naturels et technologiques au point', test: `${GEORISQUES_API}/rga?latlon=2.3086,48.8507` },
  { id: 'encadrement', nom: 'Encadrement des loyers (Paris, Plaine Commune, Est Ensemble)', usage: 'Plafond légal du loyer', test: `${PARIS_API}?limit=1&select=annee` },
  { id: 'communes', nom: 'Découpage administratif (geo.api.gouv.fr)', usage: 'Communes d’une zone et contours', test: `${GEO_API}/communes?code=75056&fields=nom` },
  { id: 'fond_ign', nom: 'Fond de carte Plan IGN', usage: 'Carte', test: 'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetCapabilities', head: true },
] as const;

export async function checkSources(d: Deps) {
  const now = new Date().toISOString();
  return Promise.all(
    SOURCES.map(async (s) => {
      const t0 = Date.now();
      try {
        if ('head' in s && s.head) {
          const res = await fetch(s.test, { method: 'HEAD', signal: AbortSignal.timeout(8000) });
          if (!res.ok) throw new SourceError(`HTTP ${res.status}`, res.status);
        } else {
          await d.http.json(s.test);
        }
        const r = { id: s.id, statut: 'ok' as const, ms: Date.now() - t0, message: null as string | null, date: now };
        await d.cache.set({ source: `sante:${s.id}`, cle: 'dernier', millesime: '', url: s.test, recupere_le: now, statut: 'ok', payload: r });
        return r;
      } catch (e) {
        const r = { id: s.id, statut: 'erreur' as const, ms: Date.now() - t0, message: (e as Error).message, date: now };
        await d.cache.set({ source: `sante:${s.id}`, cle: 'dernier', millesime: '', url: s.test, statut: 'erreur', message: r.message, payload: r }).catch(() => {});
        return r;
      }
    }),
  );
}
