'use client';

import dynamic from 'next/dynamic';
import { useState, useTransition } from 'react';
import { RefreshCw } from 'lucide-react';
import { chooseDpe, confirmLocation } from '@/app/actions/properties';
import type { Enrichment } from '@/lib/domain/enrichment';
import type { SourceStatus } from '@/lib/finance/market';
import type { PropertyInputs } from '@/lib/finance/schema';
import type { RentalAnalysis } from '@/lib/finance/analyze';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { fmtDate, fmtDateTime, fmtEur, fmtNum, fmtPct } from '@/components/data/format';

const PointPicker = dynamic(() => import('@/components/map/point-picker'), { ssr: false, loading: () => <div className="h-64 animate-pulse rounded-md bg-surface-2" /> });

const STATUS: Record<SourceStatus, { label: string; tone: 'success' | 'danger' | 'warning' | 'neutral' }> = {
  ok: { label: 'opérationnelle', tone: 'success' },
  indisponible: { label: 'indisponible', tone: 'danger' },
  a_configurer: { label: 'à configurer', tone: 'warning' },
  insuffisant: { label: 'données insuffisantes', tone: 'warning' },
  non_applicable: { label: 'sans objet', tone: 'neutral' },
  non_demande: { label: 'non interrogée', tone: 'neutral' },
};

export function SourceBadge({ status }: { status: SourceStatus | undefined }) {
  const s = STATUS[status ?? 'non_demande'];
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

function Meta({ source, url, millesime, recupere_le }: { source?: string; url?: string; millesime?: string | null; recupere_le?: string | null }) {
  return (
    <p className="mt-2 text-[11px] text-muted">
      Source : {url ? <a className="underline" href={url} target="_blank" rel="noreferrer">{source}</a> : source}
      {millesime ? ` · millésime ${millesime}` : ''}
      {recupere_le ? ` · récupéré le ${fmtDateTime(recupere_le)}` : ''}
    </p>
  );
}

export function MarketTab({
  propertyId,
  e,
  inputs,
  analysis,
  lat,
  lon,
  code,
  enriching,
  onRefresh,
}: {
  propertyId: string;
  e: Partial<Enrichment>;
  inputs: PropertyInputs;
  analysis: RentalAnalysis | null;
  lat: number | null;
  lon: number | null;
  code: string | null;
  enriching: boolean;
  onRefresh: (opts: { force?: boolean; regeocode?: boolean }) => void;
}) {
  const [pending, start] = useTransition();
  const [pos, setPos] = useState<{ lat: number; lon: number } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const g = e.geocodage;
  const dvf = e.dvf;
  const loyer = e.loyer;
  const enc = e.encadrement;
  const dpe = e.dpe;
  const risques = e.risques;
  const S = inputs.surface.valeur;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">
          {e.date ? `Données publiques récupérées le ${fmtDateTime(e.date)}. ` : 'Aucune donnée publique récupérée pour l’instant. '}
          Un bien déjà en cache ne déclenche aucun appel externe.
        </p>
        <Button size="sm" onClick={() => onRefresh({ force: true })} disabled={enriching} className="no-print">
          <RefreshCw className={`h-3.5 w-3.5 ${enriching ? 'animate-spin' : ''}`} /> {enriching ? 'Actualisation…' : 'Actualiser les données'}
        </Button>
      </div>

      <Card>
        <CardHeader title="Localisation" action={<SourceBadge status={g?.status} />} />
        <CardBody className="text-sm">
          {g?.label ? (
            <p>
              {g.label} {g.score !== undefined ? <span className="text-muted">(score de géocodage {fmtNum(g.score, 2)})</span> : null}
              {code ? <span className="text-muted"> · code INSEE {code}</span> : null}
            </p>
          ) : null}
          {g?.message ? <p className={g.a_confirmer ? 'mt-1 text-warning' : 'mt-1 text-muted'}>{g.message}</p> : null}
          {lat !== null && lon !== null && (g?.a_confirmer || pos) ? (
            <div className="mt-3 flex flex-col gap-2">
              <p className="text-xs text-muted">Déplacez le marqueur ou cliquez sur la carte, puis confirmez.</p>
              <PointPicker lat={lat} lon={lon} onMove={(la, lo) => setPos({ lat: la, lon: lo })} />
              <Button
                size="sm"
                variant="primary"
                className="self-start"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const r = await confirmLocation(propertyId, { lat: pos?.lat ?? lat, lon: pos?.lon ?? lon, code_insee: code });
                    setMsg(r.ok ? 'Position confirmée.' : r.error);
                    if (r.ok) onRefresh({});
                  })
                }
              >
                Confirmer cette position
              </Button>
            </div>
          ) : null}
          {g && g.status !== 'ok' ? (
            <Button size="sm" className="mt-2" onClick={() => onRefresh({ regeocode: true, force: true })} disabled={enriching}>
              Relancer le géocodage
            </Button>
          ) : null}
          {msg ? <p className="mt-2 text-xs text-muted">{msg}</p> : null}
          {g ? <Meta source={g.source} url="https://geoservices.ign.fr/documentation/services/services-geoplateforme/geocodage" recupere_le={g.recupere_le} /> : null}
        </CardBody>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Comparables de vente (DVF)" action={<SourceBadge status={dvf?.status} />} />
          <CardBody className="text-sm">
            {dvf?.status === 'ok' && dvf.mediane_m2 !== undefined ? (
              <>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <div>
                    <p className="text-xs text-muted">Médiane</p>
                    <p className="font-semibold">{fmtNum(dvf.mediane_m2)} €/m²</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted">P25 – P75</p>
                    <p className="font-semibold">
                      {fmtNum(dvf.p25_m2)} – {fmtNum(dvf.p75_m2)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted">Ventes</p>
                    <p className="font-semibold">{dvf.n}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted">Écart du prix demandé</p>
                    <p className="font-semibold">{analysis?.ecart_dvf.ok ? fmtPct(analysis.ecart_dvf.valeur, 1, true) : '—'}</p>
                  </div>
                </div>
                <p className="mt-2 text-xs text-muted">
                  Périmètre : {dvf.perimetre} · surface ±30 % · période {fmtDate(dvf.periode?.debut)} – {fmtDate(dvf.periode?.fin)} · ventes d’un seul logement, valeurs hors 1er–99e centile exclues.
                  Une annonce n’est jamais un comparable.
                </p>
              </>
            ) : (
              <p className={dvf?.status === 'indisponible' ? 'text-danger' : 'text-muted'}>{dvf?.message ?? 'Non interrogé.'}</p>
            )}
            {dvf?.status === 'ok' && dvf.message ? <p className="mt-1 text-xs text-muted">{dvf.message}</p> : null}
            {dvf?.ventes?.length ? (
              <details className="mt-3">
                <summary className="cursor-pointer text-xs text-accent">Voir les {dvf.ventes.length} ventes retenues</summary>
                <div className="mt-2 max-h-72 overflow-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-muted">
                        <th className="py-1 pr-2">Date</th>
                        <th className="py-1 pr-2">Adresse</th>
                        <th className="py-1 pr-2 text-right">Prix</th>
                        <th className="py-1 pr-2 text-right">m²</th>
                        <th className="py-1 pr-2 text-right">€/m²</th>
                        <th className="py-1 text-right">Distance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dvf.ventes.map((v) => (
                        <tr key={v.id_mutation} className="border-t border-border">
                          <td className="py-1 pr-2 whitespace-nowrap">{fmtDate(v.date)}</td>
                          <td className="py-1 pr-2">{v.adresse ?? '—'}</td>
                          <td className="py-1 pr-2 text-right">{fmtEur(v.prix)}</td>
                          <td className="py-1 pr-2 text-right">{fmtNum(v.surface)}</td>
                          <td className="py-1 pr-2 text-right">{Number.isFinite(v.prix_m2) ? fmtNum(v.prix_m2) : '—'}</td>
                          <td className="py-1 text-right">{Number.isFinite(v.distance_m) ? `${fmtNum(v.distance_m)} m` : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            ) : null}
            {dvf ? <Meta source={dvf.source} url={dvf.url} millesime={dvf.millesime ? `données jusqu’au ${fmtDate(dvf.millesime)}` : null} recupere_le={dvf.recupere_le} /> : null}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Loyer de marché (carte des loyers)" action={<SourceBadge status={loyer?.status} />} />
          <CardBody className="text-sm">
            {loyer?.status === 'ok' && loyer.loypredm2 !== undefined ? (
              <>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <div>
                    <p className="text-xs text-muted">Indicateur (CC)</p>
                    <p className="font-semibold">{fmtNum(loyer.loypredm2, 2)} €/m²</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted">Intervalle de prédiction</p>
                    <p className="font-semibold">
                      {fmtNum(loyer.lwr_m2, 2)} – {fmtNum(loyer.upr_m2, 2)} €/m²
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted">Observations</p>
                    <p className="font-semibold">
                      {fmtNum(loyer.nbobs_com)} (commune) · {fmtNum(loyer.nbobs_mail)} (maille)
                    </p>
                  </div>
                </div>
                {analysis?.entrees.loyer_marche.valeur !== null && analysis?.entrees.loyer_marche.valeur !== undefined && S ? (
                  <p className="mt-2">
                    Loyer HC estimé pour {fmtNum(S, 1)} m² : <strong>{fmtEur(analysis.entrees.loyer_marche.valeur)}</strong> / mois (borne basse{' '}
                    {fmtEur(analysis.entrees.loyer_marche_bas.valeur)}).
                    <span className="block text-xs text-muted">{analysis.entrees.loyer_marche.source}</span>
                  </p>
                ) : null}
                {loyer.typpred === 'maille' ? <p className="mt-1 text-xs text-warning">Indicateur issu d’une maille plus large que la commune.</p> : null}
                {loyer.r2_adj !== undefined && loyer.r2_adj < 0.5 ? <p className="mt-1 text-xs text-warning">R² ajusté inférieur à 0,5 : indicateur à prendre avec prudence.</p> : null}
                <p className="mt-2 text-xs text-muted">{loyer.message} L’indicateur sous-estime souvent le loyer au m² des petites surfaces.</p>
              </>
            ) : (
              <p className={loyer?.status === 'indisponible' ? 'text-danger' : 'text-muted'}>{loyer?.message ?? 'Non interrogé.'}</p>
            )}
            {loyer ? <Meta source={loyer.source} url={loyer.url} millesime={loyer.millesime} recupere_le={loyer.recupere_le} /> : null}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Encadrement des loyers" action={<SourceBadge status={enc?.status} />} />
          <CardBody className="text-sm">
            {enc?.status === 'ok' && enc.ref_majore_m2 ? (
              <>
                <p>
                  {enc.territoire} · {enc.categorie}
                </p>
                <p className="mt-1">
                  Loyer de référence majoré : <strong>{fmtNum(enc.ref_majore_m2, 1)} €/m²</strong> (référence {fmtNum(enc.ref_m2, 1)}, minoré {fmtNum(enc.ref_minore_m2, 1)})
                  {S ? <> soit un plafond de <strong>{fmtEur(enc.ref_majore_m2 * S)}</strong> / mois HC.</> : null}
                </p>
              </>
            ) : null}
            {enc?.message ? <p className={enc.status === 'indisponible' ? 'text-danger' : 'mt-1 text-xs text-muted'}>{enc.message}</p> : <p className="text-muted">Non interrogé.</p>}
            {inputs.loyer_reference_majore.valeur !== null ? (
              <p className="mt-2 text-xs">Loyer de référence majoré saisi : {fmtNum(inputs.loyer_reference_majore.valeur, 1)} €/m² (prioritaire sur les données ouvertes).</p>
            ) : null}
            {enc ? <Meta source={enc.source} url={enc.url} millesime={enc.millesime} recupere_le={enc.recupere_le} /> : null}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="DPE enregistrés à l’adresse (ADEME)" action={<SourceBadge status={dpe?.status} />} />
          <CardBody className="text-sm">
            {dpe?.candidats?.length ? (
              <>
                <p className="mb-2 text-xs text-muted">Candidats de même adresse et de surface à ±10 %. Confirmez celui qui correspond au bien.</p>
                <ul className="flex flex-col gap-2">
                  {dpe.candidats.map((c) => (
                    <li key={c.numero_dpe} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-2">
                      <span>
                        <strong className="mr-1">{c.etiquette_dpe}</strong> · {fmtNum(c.surface_habitable_logement, 1)} m² · établi le {fmtDate(c.date_etablissement_dpe)} · {c.type_energie_principale_chauffage ?? 'énergie inconnue'}
                        {c.complement_adresse_logement ? <span className="block text-xs text-muted">{c.complement_adresse_logement}</span> : null}
                        <span className="block text-[11px] text-muted">n° {c.numero_dpe}</span>
                      </span>
                      <Button
                        size="sm"
                        disabled={pending || inputs.dpe.numero === c.numero_dpe}
                        onClick={() =>
                          start(async () => {
                            const r = await chooseDpe(propertyId, { numero: c.numero_dpe, classe: c.etiquette_dpe, date: c.date_etablissement_dpe, energie: c.type_energie_principale_chauffage });
                            setMsg(r.ok ? 'DPE retenu.' : r.error);
                          })
                        }
                      >
                        {inputs.dpe.numero === c.numero_dpe ? 'Retenu' : 'C’est ce logement'}
                      </Button>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className={dpe?.status === 'indisponible' ? 'text-danger' : 'text-muted'}>
                {dpe?.message ?? (dpe ? 'Aucun DPE de surface proche à cette adresse.' : 'Non interrogé.')}
              </p>
            )}
            {dpe?.autres ? <p className="mt-1 text-xs text-muted">{dpe.autres} autre(s) DPE à cette adresse, de surface différente.</p> : null}
            <p className="mt-2 text-xs text-muted">La base ne couvre que les DPE établis depuis juillet 2021.</p>
            {dpe ? <Meta source={dpe.source} url={dpe.url} recupere_le={dpe.recupere_le} /> : null}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title="Risques (Géorisques)" action={<SourceBadge status={risques?.status} />} />
        <CardBody className="text-sm">
          {risques?.items?.length ? (
            <ul className="flex flex-col gap-1">
              {risques.items.map((r, i) => (
                <li key={i} className={r.notable ? 'text-warning' : ''}>
                  {r.notable ? '⚠ ' : '· '}
                  {r.libelle}
                  {r.detail ? <span className="text-muted"> — {r.detail}</span> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className={risques?.status === 'indisponible' ? 'text-danger' : 'text-muted'}>{risques?.message ?? 'Non interrogé.'}</p>
          )}
          {risques?.status === 'ok' && risques.message ? <p className="mt-1 text-xs text-muted">{risques.message}</p> : null}
          <p className="mt-2 text-xs text-muted">
            Liste factuelle, sans note de risque. « Notable » : argiles exposition forte, sismicité zone 3 ou plus, radon classe 3, établissement Seveso à moins de 500 m.
          </p>
          {risques ? <Meta source={risques.source} url={risques.url} recupere_le={risques.recupere_le} /> : null}
        </CardBody>
      </Card>
    </div>
  );
}
