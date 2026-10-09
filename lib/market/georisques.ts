import type { RiskItem, Risks } from '@/lib/finance/market';
import { parentCommune } from './communes';

/**
 * Géorisques, API v1 (sans clé). Le « rapport » complet répond en 15 s environ : on interroge
 * plutôt des points d'accès rapides et on produit une liste factuelle, sans note inventée.
 * « Notable » suit des critères explicites et paramétrables (voir NOTABLE).
 */
export const GEORISQUES_API = 'https://www.georisques.gouv.fr/api/v1';
export const GEORISQUES_SOURCE = 'Géorisques (BRGM / ministère de la Transition écologique)';

export const NOTABLE = {
  rga_code_min: 3, // exposition forte au retrait-gonflement des argiles
  sismicite_zone_min: 3, // zone de sismicité modérée ou plus
  radon_classe_min: 3, // potentiel radon significatif
  icpe_seveso_rayon_m: 500, // établissement Seveso à moins de 500 m
};

export function georisquesUrls(lat: number, lon: number, codeInsee: string) {
  const ll = `${lon.toFixed(5)},${lat.toFixed(5)}`;
  const commune = parentCommune(codeInsee);
  return {
    gaspar: `${GEORISQUES_API}/gaspar/risques?latlon=${ll}`,
    rga: `${GEORISQUES_API}/rga?latlon=${ll}`,
    sismique: `${GEORISQUES_API}/zonage_sismique?latlon=${ll}`,
    radon: `${GEORISQUES_API}/radon?code_insee=${commune}`,
    catnat: `${GEORISQUES_API}/gaspar/catnat?code_insee=${commune}&page_size=100`,
    icpe: `${GEORISQUES_API}/installations_classees?latlon=${ll}&rayon=${NOTABLE.icpe_seveso_rayon_m}&page_size=100`,
    casias: `${GEORISQUES_API}/ssp/casias?latlon=${ll}&rayon=200&page_size=100`,
    azi: `${GEORISQUES_API}/gaspar/azi?latlon=${ll}`,
  };
}

type Json = Record<string, any>;
export type GeorisquesRaw = Partial<Record<keyof ReturnType<typeof georisquesUrls>, Json | null>>;

/** Construit la liste factuelle à partir des réponses obtenues (une réponse absente est ignorée et signalée). */
export function parseGeorisques(raw: GeorisquesRaw, codeInsee: string, failed: string[]): Risks {
  const items: RiskItem[] = [];
  const commune = parentCommune(codeInsee);

  const rga = raw.rga;
  if (rga?.exposition) {
    items.push({
      libelle: `Retrait-gonflement des argiles : ${String(rga.exposition).toLowerCase()}`,
      notable: Number(rga.codeExposition) >= NOTABLE.rga_code_min,
    });
  }
  const sis = raw.sismique?.data?.find((d: Json) => d.code_insee === codeInsee || d.code_insee === commune) ?? raw.sismique?.data?.[0];
  if (sis?.zone_sismicite) {
    items.push({ libelle: `Sismicité : zone ${String(sis.zone_sismicite).toLowerCase()}`, notable: Number(sis.code_zone) >= NOTABLE.sismicite_zone_min });
  }
  const radon = raw.radon?.data?.[0];
  if (radon?.classe_potentiel) {
    items.push({ libelle: `Potentiel radon de la commune : classe ${radon.classe_potentiel}`, notable: Number(radon.classe_potentiel) >= NOTABLE.radon_classe_min });
  }
  const gaspar = raw.gaspar?.data?.find((d: Json) => d.code_insee === commune || d.code_insee === codeInsee);
  if (gaspar?.risques_detail?.length) {
    const libs = [...new Set(gaspar.risques_detail.map((r: Json) => r.libelle_risque_long as string))];
    items.push({ libelle: 'Risques recensés dans la commune', detail: libs.join(', '), notable: false });
  }
  const azi = raw.azi?.data?.filter((d: Json) => d.code_insee === commune || d.code_insee === codeInsee) ?? [];
  if (azi.length) {
    items.push({ libelle: 'Atlas des zones inondables couvrant la commune', detail: [...new Set(azi.map((a: Json) => a.libelle_azi))].join(', '), notable: false });
  }
  if (raw.catnat) {
    const n = Number(raw.catnat.results ?? raw.catnat.data?.length ?? 0);
    const recents = (raw.catnat.data ?? [])
      .map((c: Json) => `${c.libelle_risque_jo} (${c.date_debut_evt})`)
      .slice(-3)
      .join(' ; ');
    items.push({ libelle: `${n} arrêté(s) de catastrophe naturelle dans la commune`, detail: recents || undefined, notable: false });
  }
  if (raw.icpe) {
    const list: Json[] = raw.icpe.data ?? [];
    const seveso = list.filter((i) => i.statutSeveso && !/non seveso/i.test(String(i.statutSeveso)));
    items.push({
      libelle: `${raw.icpe.results ?? list.length} installation(s) classée(s) à moins de ${NOTABLE.icpe_seveso_rayon_m} m`,
      detail: seveso.length ? `dont Seveso : ${seveso.map((s) => `${s.raisonSociale} (${s.statutSeveso})`).join(', ')}` : undefined,
      notable: seveso.length > 0,
    });
  }
  if (raw.casias) {
    const n = Number(raw.casias.results ?? raw.casias.data?.length ?? 0);
    items.push({ libelle: `${n} ancien(s) site(s) industriel(s) ou de service (CASIAS) à moins de 200 m`, notable: false });
  }
  const answered = Object.values(raw).filter(Boolean).length;
  return {
    status: answered === 0 ? 'indisponible' : 'ok',
    source: GEORISQUES_SOURCE,
    url: 'https://www.georisques.gouv.fr/doc-api',
    items,
    message: failed.length ? `Réponses indisponibles : ${failed.join(', ')}.` : undefined,
  };
}
