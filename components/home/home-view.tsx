'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import type { Feature, MultiPolygon, Polygon } from 'geojson';
import { Columns3, Pencil, Trash2, TrendingDown } from 'lucide-react';
import { deleteZone, renameZone, saveZone } from '@/app/actions/zones';
import { defaultSort, type PropertySummary } from '@/lib/domain/property';
import { propertiesInZone } from '@/lib/domain/zones';
import { TRACKING_LABELS, TRACKING_STATUSES, type TrackingStatus } from '@/lib/domain/statuses';
import { ASSET_TYPES, ASSET_TYPE_LABELS, type AssetType } from '@/lib/finance/schema';
import { VERDICT_LABELS, type Verdict } from '@/lib/finance/types';
import type { MarketFeature } from '@/components/map/main-map';
import { DemoBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/input';
import { cn } from '@/components/ui/cn';
import { ConfidenceBadge, VerdictBadge } from '@/components/data/verdict';
import { fmtDate, fmtEur, fmtNum, fmtPct } from '@/components/data/format';

const MainMap = dynamic(() => import('@/components/map/main-map'), { ssr: false, loading: () => <div className="h-full min-h-[360px] animate-pulse bg-surface-2" /> });

export interface ZoneRow {
  id: string;
  nom: string;
  geojson: Polygon | MultiPolygon;
  communes: { code: string; nom: string }[];
}

interface Radar {
  code: string;
  status: string;
  n_ventes: number;
  mediane_m2: number | null;
  loyer_hc_m2: number | null;
  loyer_cc_m2: number | null;
  rendement_brut: number | null;
  millesime_dvf?: string;
  millesime_loyers?: string;
  periode?: { debut: string; fin: string };
  message?: string;
  typpred?: string;
  charges_recup_m2?: number;
}

const SORTS = {
  defaut: 'Verdict, cash-flow, confiance',
  cash_flow: 'Cash-flow prudent',
  prix_max: 'Prix d’offre maximal',
  ecart_dvf: 'Écart au marché (DVF)',
  confiance: 'Confiance',
  statut: 'Statut',
  date: 'Date d’ajout',
} as const;
type SortKey = keyof typeof SORTS;

/** Rampe séquentielle (rendement brut théorique). */
const YIELD_STEPS = [
  { max: 0.03, color: '#d6e6f2', label: '< 3 %' },
  { max: 0.04, color: '#a7c8e2', label: '3–4 %' },
  { max: 0.05, color: '#6fa3cc', label: '4–5 %' },
  { max: 0.06, color: '#3f7cb0', label: '5–6 %' },
  { max: Infinity, color: '#1b4f80', label: '≥ 6 %' },
];
const yieldColor = (y: number) => YIELD_STEPS.find((s) => y < s.max)!.color;
const INSUFFICIENT = '#b9b9b0';

export function HomeView({ summaries, zones, budgetDefaut }: { summaries: PropertySummary[]; zones: ZoneRow[]; budgetDefaut: number | null }) {
  const router = useRouter();
  const [mode, setMode] = useState<'biens' | 'marche'>('biens');
  const [mobileTab, setMobileTab] = useState<'carte' | 'liste'>('liste');
  const [zoneId, setZoneId] = useState<string | null>(null);
  const [type, setType] = useState<AssetType | ''>('');
  const [statut, setStatut] = useState<TrackingStatus | ''>('');
  const [verdict, setVerdict] = useState<Verdict | ''>('');
  const [budget, setBudget] = useState('');
  const [sort, setSort] = useState<SortKey>('defaut');
  const [selected, setSelected] = useState<string[]>([]);
  const [draft, setDraft] = useState<{ geojson: Polygon; nom: string; error: string | null; busy: boolean } | null>(null);
  const [radarType, setRadarType] = useState<'appartement' | 'maison'>('appartement');
  const [radar, setRadar] = useState<Record<string, Radar>>({});
  const [features, setFeatures] = useState<Feature<Polygon | MultiPolygon>[]>([]);
  const [progress, setProgress] = useState<string | null>(null);
  const [, start] = useTransition();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [bulk, setBulk] = useState<string | null>(null);
  const zone = zones.find((z) => z.id === zoneId) ?? null;
  const notEnriched = summaries.filter((s) => !s.enrichi && !s.hors_perimetre);

  // Enrichit à la suite les biens jamais enrichis (après un import ou la démonstration).
  const enrichAll = async () => {
    const list = [...notEnriched];
    let done = 0;
    let failed = 0;
    for (const s of list) {
      setBulk(`Enrichissement ${done + 1}/${list.length} : ${s.titre}…`);
      const r = await fetch(`/api/biens/${s.id}/enrichir`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }).catch(() => null);
      if (!r || !r.ok) failed++;
      done++;
    }
    setBulk(`${done - failed} bien(s) enrichi(s)${failed ? `, ${failed} échec(s)` : ''}.`);
    router.refresh();
  };

  const filtered = useMemo(() => {
    let list = summaries;
    if (zone) list = propertiesInZone(list, zone.geojson);
    if (type) list = list.filter((s) => s.type_actif === type);
    if (statut) list = list.filter((s) => s.statut === statut);
    if (verdict) list = list.filter((s) => s.verdict === verdict);
    const b = Number(budget.replace(/\s/g, ''));
    if (budget && b > 0) list = list.filter((s) => s.prix !== null && s.prix <= b);
    const sorted = [...list];
    const num = (v: number | null, dir = -1) => (v === null ? Infinity : dir * v);
    switch (sort) {
      case 'cash_flow':
        sorted.sort((a, b) => num(a.cash_flow_prudent) - num(b.cash_flow_prudent));
        break;
      case 'prix_max':
        sorted.sort((a, b) => num(a.ecart_prix) - num(b.ecart_prix));
        break;
      case 'ecart_dvf':
        sorted.sort((a, b) => num(a.ecart_dvf, 1) - num(b.ecart_dvf, 1));
        break;
      case 'confiance':
        sorted.sort((a, b) => (a.confiance ?? 'Z').localeCompare(b.confiance ?? 'Z'));
        break;
      case 'statut':
        sorted.sort((a, b) => TRACKING_STATUSES.indexOf(a.statut) - TRACKING_STATUSES.indexOf(b.statut));
        break;
      case 'date':
        sorted.sort((a, b) => b.created_at.localeCompare(a.created_at));
        break;
      default:
        sorted.sort(defaultSort);
    }
    return sorted;
  }, [summaries, zone, type, statut, verdict, budget, sort]);

  // Couche marché : contours des communes de la zone et rendement de chacune.
  const loading = useRef(0);
  useEffect(() => {
    if (mode !== 'marche' || !zone) return;
    const run = ++loading.current;
    (async () => {
      setProgress('Chargement des contours…');
      const res = await fetch(`/api/zones/communes?codes=${zone.communes.map((c) => c.code).join(',')}`);
      const json = await res.json().catch(() => ({}));
      if (run !== loading.current) return;
      if (!res.ok) return setProgress(json.error ?? 'Contours indisponibles');
      setFeatures(json.features ?? []);
      const todo = zone.communes.filter((c) => !radar[`${radarType}:${c.code}`]);
      let done = zone.communes.length - todo.length;
      setProgress(todo.length ? `Marché : ${done}/${zone.communes.length} communes` : null);
      const queue = [...todo];
      const worker = async () => {
        while (queue.length && run === loading.current) {
          const c = queue.shift()!;
          const r = await fetch('/api/marche/commune', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: c.code, type: radarType }) });
          const data: Radar = await r.json().catch(() => ({ code: c.code, status: 'indisponible', n_ventes: 0, mediane_m2: null, loyer_hc_m2: null, loyer_cc_m2: null, rendement_brut: null, message: 'Réponse illisible' }));
          if (!r.ok) Object.assign(data, { code: c.code, status: 'indisponible', message: (data as unknown as { error?: string }).error ?? `HTTP ${r.status}` });
          setRadar((prev) => ({ ...prev, [`${radarType}:${c.code}`]: data }));
          done++;
          if (run === loading.current) setProgress(done < zone.communes.length ? `Marché : ${done}/${zone.communes.length} communes` : null);
        }
      };
      await Promise.all([worker(), worker(), worker()]);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, zone?.id, radarType]);

  const marketFeatures: MarketFeature[] = useMemo(
    () =>
      features.map((f) => {
        const code = String(f.properties?.code);
        const nom = String(f.properties?.nom);
        const r = radar[`${radarType}:${code}`];
        const ok = r?.status === 'ok' && r.rendement_brut !== null;
        const tooltip = !r
          ? `${nom} : chargement…`
          : ok
            ? `<strong>${nom}</strong><br/>Rendement brut théorique : ${fmtPct(r.rendement_brut, 2)}<br/>Loyer HC ${fmtNum(r.loyer_hc_m2, 2)} €/m² · médiane DVF ${fmtNum(r.mediane_m2)} €/m²<br/>${r.n_ventes} ventes (${fmtDate(r.periode?.debut)} – ${fmtDate(r.periode?.fin)}) · loyers ${r.millesime_loyers}${r.typpred === 'maille' ? ' (maille)' : ''}`
            : `<strong>${nom}</strong><br/>${r.status === 'indisponible' ? 'Source indisponible' : 'Données insuffisantes'}${r.message ? ` : ${r.message}` : ''}`;
        return { feature: f, color: ok ? yieldColor(r.rendement_brut!) : INSUFFICIENT, tooltip };
      }),
    [features, radar, radarType],
  );

  const ranking = useMemo(
    () =>
      (zone?.communes ?? [])
        .map((c) => ({ ...c, r: radar[`${radarType}:${c.code}`] }))
        .sort((a, b) => (b.r?.rendement_brut ?? -1) - (a.r?.rendement_brut ?? -1)),
    [zone, radar, radarType],
  );

  const onDrawZone = (g: Polygon) => setDraft({ geojson: g, nom: `Zone ${zones.length + 1}`, error: null, busy: false });

  const confirmZone = async () => {
    if (!draft) return;
    setDraft({ ...draft, busy: true, error: null });
    const res = await fetch('/api/zones/communes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ geojson: draft.geojson }) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return setDraft({ ...draft, busy: false, error: json.error ?? 'Découpage communal indisponible' });
    const r = await saveZone({ nom: draft.nom, geojson: draft.geojson, communes: json.communes });
    if (!r.ok) return setDraft({ ...draft, busy: false, error: r.error });
    setDraft(null);
    setZoneId(r.data.id);
    router.refresh();
  };

  const mapProps = filtered.map((s) => ({ id: s.id, titre: s.titre, lat: s.lat, lon: s.lon, verdict: s.verdict, prix: s.prix, demo: s.demo }));

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col">
      <div className={cn('flex-wrap items-end gap-2 border-b border-border bg-surface px-3 py-2', filtersOpen ? 'flex' : 'hidden md:flex')}>
        <div className="flex rounded-md border border-border p-0.5" role="tablist" aria-label="Couche de la carte">
          {(['biens', 'marche'] as const).map((m) => (
            <button key={m} role="tab" aria-selected={mode === m} onClick={() => setMode(m)} className={cn('rounded px-2.5 py-1 text-sm', mode === m ? 'bg-accent text-accent-fg' : 'text-muted hover:text-fg')}>
              {m === 'biens' ? 'Mes biens' : 'Marché'}
            </button>
          ))}
        </div>
        <Field label="Zone" className="w-40">
          <Select value={zoneId ?? ''} onChange={(e) => setZoneId(e.target.value || null)} aria-label="Zone">
            <option value="">Toutes</option>
            {zones.map((z) => (
              <option key={z.id} value={z.id}>
                {z.nom}
              </option>
            ))}
          </Select>
        </Field>
        {mode === 'biens' ? (
          <>
            <Field label="Type" className="w-36">
              <Select value={type} onChange={(e) => setType(e.target.value as AssetType | '')}>
                <option value="">Tous</option>
                {ASSET_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {ASSET_TYPE_LABELS[t]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Statut" className="w-32">
              <Select value={statut} onChange={(e) => setStatut(e.target.value as TrackingStatus | '')}>
                <option value="">Tous</option>
                {TRACKING_STATUSES.map((t) => (
                  <option key={t} value={t}>
                    {TRACKING_LABELS[t]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Verdict" className="w-40">
              <Select value={verdict} onChange={(e) => setVerdict(e.target.value as Verdict | '')}>
                <option value="">Tous</option>
                {(Object.keys(VERDICT_LABELS) as Verdict[]).map((v) => (
                  <option key={v} value={v}>
                    {VERDICT_LABELS[v]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Budget max (€)" className="w-32">
              <Input inputMode="numeric" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder={budgetDefaut ? String(budgetDefaut) : ''} />
            </Field>
            <Field label="Tri" className="w-48">
              <Select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
                {(Object.keys(SORTS) as SortKey[]).map((k) => (
                  <option key={k} value={k}>
                    {SORTS[k]}
                  </option>
                ))}
              </Select>
            </Field>
          </>
        ) : (
          <Field label="Type de logement" className="w-40">
            <Select value={radarType} onChange={(e) => setRadarType(e.target.value as 'appartement' | 'maison')}>
              <option value="appartement">Appartements</option>
              <option value="maison">Maisons</option>
            </Select>
          </Field>
        )}
        {selected.length >= 2 ? (
          <Button asChild variant="primary" size="sm" className="ml-auto hidden md:inline-flex">
            <Link href={`/comparer?ids=${selected.join(',')}`}>
              <Columns3 className="h-4 w-4" /> Comparer ({selected.length})
            </Link>
          </Button>
        ) : null}
      </div>

      <div className="flex border-b border-border md:hidden">
        <button onClick={() => setFiltersOpen(!filtersOpen)} className="border-r border-border px-3 text-sm text-accent" aria-expanded={filtersOpen}>
          {filtersOpen ? 'Masquer' : 'Filtres'}
        </button>
        {(['liste', 'carte'] as const).map((t) => (
          <button key={t} onClick={() => setMobileTab(t)} className={cn('flex-1 py-2 text-sm', mobileTab === t ? 'border-b-2 border-accent font-medium' : 'text-muted')}>
            {t === 'liste' ? (mode === 'biens' ? `Liste (${filtered.length})` : 'Classement') : 'Carte'}
          </button>
        ))}
        {selected.length >= 2 ? (
          <Link href={`/comparer?ids=${selected.join(',')}`} className="flex items-center gap-1 border-l border-border px-3 text-sm font-medium text-accent">
            <Columns3 className="h-4 w-4" /> {selected.length}
          </Link>
        ) : null}
      </div>

      <div className="flex min-h-0 flex-1">
        <div className={cn('relative min-h-0 flex-1 md:block md:w-[55%] md:flex-none', mobileTab === 'carte' ? 'block' : 'hidden')}>
          <MainMap
            properties={mapProps}
            zones={zones.map((z) => ({ id: z.id, nom: z.nom, geojson: z.geojson }))}
            selectedZoneId={zoneId}
            market={marketFeatures}
            mode={mode}
            onDrawZone={onDrawZone}
            onOpenProperty={(id) => router.push(`/biens/${id}`)}
          />
          <div className="pointer-events-none absolute bottom-3 left-3 z-[800] max-w-[90%] rounded-md bg-surface/95 p-2 text-xs shadow">
            {mode === 'marche' ? (
              <>
                <p className="font-medium">Rendement brut théorique (loyer HC × 12 / prix médian DVF)</p>
                <div className="mt-1 flex flex-wrap gap-2">
                  {YIELD_STEPS.map((s) => (
                    <span key={s.label} className="flex items-center gap-1">
                      <span className="h-3 w-3 rounded-sm" style={{ background: s.color }} /> {s.label}
                    </span>
                  ))}
                  <span className="flex items-center gap-1">
                    <span className="h-3 w-3 rounded-sm" style={{ background: INSUFFICIENT }} /> données insuffisantes
                  </span>
                </div>
                {!zone ? <p className="mt-1 text-warning">Sélectionnez ou dessinez une zone (outils en haut à gauche).</p> : null}
                {progress ? <p className="mt-1 text-muted">{progress}</p> : null}
              </>
            ) : (
              <p>Dessinez une zone avec les outils en haut à gauche (30 communes au maximum).</p>
            )}
          </div>
        </div>

        <div className={cn('min-h-0 flex-1 overflow-y-auto md:block', mobileTab === 'liste' ? 'block' : 'hidden')}>
          {zone ? <ZoneBar key={zone.id + zone.nom} zone={zone} onDeleted={() => setZoneId(null)} /> : null}
          {mode === 'biens' && (notEnriched.length || bulk) ? (
            <div className="flex flex-wrap items-center gap-2 border-b border-border bg-warning/5 px-3 py-2 text-xs">
              {notEnriched.length ? <span>{notEnriched.length} bien(s) pas encore enrichi(s) avec les données publiques.</span> : null}
              {notEnriched.length && !bulk?.startsWith('Enrichissement') ? (
                <Button size="sm" onClick={() => start(enrichAll)} data-testid="enrichir-tout">
                  Enrichir maintenant
                </Button>
              ) : null}
              {bulk ? <span className="text-muted">{bulk}</span> : null}
            </div>
          ) : null}
          {mode === 'marche' ? (
            <MarketRanking zone={zone} ranking={ranking} />
          ) : (
            <PropertyList list={filtered} total={summaries.length} selected={selected} setSelected={setSelected} />
          )}
        </div>
      </div>

      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        {draft ? (
          <DialogContent title="Enregistrer la zone" description="Les communes intersectées seront calculées (30 au maximum).">
            <div className="flex flex-col gap-3">
              <Field label="Nom de la zone">
                <Input value={draft.nom} onChange={(e) => setDraft({ ...draft, nom: e.target.value })} autoFocus />
              </Field>
              {draft.error ? <p className="text-sm text-danger">{draft.error}</p> : null}
              <div className="flex justify-end gap-2">
                <Button onClick={() => setDraft(null)}>Annuler</Button>
                <Button variant="primary" disabled={draft.busy || !draft.nom.trim()} onClick={() => start(confirmZone)}>
                  {draft.busy ? 'Calcul des communes…' : 'Enregistrer'}
                </Button>
              </div>
            </div>
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}

function ZoneBar({ zone, onDeleted }: { zone: ZoneRow; onDeleted: () => void }) {
  const [editing, setEditing] = useState(false);
  const [nom, setNom] = useState(zone.nom);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border bg-accent-soft/50 px-3 py-2 text-sm">
      {editing ? (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              await renameZone(zone.id, nom);
              setEditing(false);
            });
          }}
        >
          <Input value={nom} onChange={(e) => setNom(e.target.value)} className="h-8 w-48" autoFocus />
          <Button size="sm" type="submit" disabled={pending}>
            OK
          </Button>
        </form>
      ) : (
        <span className="font-medium">
          {zone.nom} · {zone.communes.length} commune{zone.communes.length > 1 ? 's' : ''}
        </span>
      )}
      <button className="text-muted hover:text-fg" aria-label="Renommer la zone" onClick={() => setEditing(!editing)}>
        <Pencil className="h-3.5 w-3.5" />
      </button>
      <button
        className="text-muted hover:text-danger"
        aria-label="Supprimer la zone"
        onClick={() => {
          if (!confirm(`Supprimer la zone « ${zone.nom} » ?`)) return;
          start(async () => {
            await deleteZone(zone.id);
            onDeleted();
          });
        }}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function MarketRanking({ zone, ranking }: { zone: ZoneRow | null; ranking: { code: string; nom: string; r?: Radar }[] }) {
  if (!zone) return <p className="p-4 text-sm text-muted">Sélectionnez une zone pour classer ses communes par rendement brut théorique.</p>;
  const first = ranking.find((x) => x.r?.status === 'ok')?.r;
  return (
    <div className="p-3">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted">
            <th className="py-2 pr-2">Commune</th>
            <th className="py-2 pr-2 text-right">Rendement brut</th>
            <th className="py-2 pr-2 text-right">Loyer HC</th>
            <th className="py-2 pr-2 text-right">Médiane DVF</th>
            <th className="py-2 text-right">Ventes</th>
          </tr>
        </thead>
        <tbody>
          {ranking.map(({ code, nom, r }) => (
            <tr key={code} className="border-b border-border last:border-0">
              <td className="py-1.5 pr-2">
                {nom} <span className="text-xs text-muted">{code}</span>
              </td>
              {!r ? (
                <td colSpan={4} className="py-1.5 text-right text-xs text-muted">
                  chargement…
                </td>
              ) : r.status === 'ok' ? (
                <>
                  <td className="py-1.5 pr-2 text-right font-semibold">{fmtPct(r.rendement_brut, 2)}</td>
                  <td className="py-1.5 pr-2 text-right">{fmtNum(r.loyer_hc_m2, 2)} €/m²</td>
                  <td className="py-1.5 pr-2 text-right">{fmtNum(r.mediane_m2)} €/m²</td>
                  <td className="py-1.5 text-right">{r.n_ventes}</td>
                </>
              ) : (
                <td colSpan={4} className={cn('py-1.5 text-right text-xs', r.status === 'indisponible' ? 'text-danger' : 'text-muted')}>
                  {r.status === 'indisponible' ? 'indisponible' : 'données insuffisantes'}
                  {r.message ? ` — ${r.message}` : ''}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-xs text-muted">
        Rendement brut théorique = loyer de marché HC × 12 / prix médian DVF au m² (24 mois, hors valeurs aberrantes). Loyer HC = indicateur ANIL charges comprises − {first?.charges_recup_m2 ?? '…'} €/m² de
        charges récupérables (hypothèse du profil). Moins de 10 ventes : données insuffisantes.
        {first ? ` DVF jusqu’au ${fmtDate(first.millesime_dvf)} ; carte des loyers ${first.millesime_loyers}.` : ''} DVF ne couvre ni l’Alsace-Moselle ni Mayotte.
      </p>
    </div>
  );
}

function PropertyList({ list, total, selected, setSelected }: { list: PropertySummary[]; total: number; selected: string[]; setSelected: (s: string[]) => void }) {
  const toggle = (id: string) => setSelected(selected.includes(id) ? selected.filter((x) => x !== id) : selected.length >= 4 ? selected : [...selected, id]);
  if (total === 0)
    return (
      <div className="p-6 text-sm text-muted">
        <p className="font-medium text-fg">Aucun bien pour l’instant.</p>
        <p className="mt-1">Ajoutez une annonce avec le bouton « + Bien », importez un CSV ou chargez les données de démonstration dans Réglages.</p>
      </div>
    );
  return (
    <div className="flex flex-col" data-testid="liste-biens">
      <p className="px-3 py-2 text-xs text-muted">
        {list.length} bien{list.length > 1 ? 's' : ''} affiché{list.length > 1 ? 's' : ''} sur {total}. Cochez 2 à 4 biens pour les comparer.
      </p>
      {list.map((s) => (
        <div key={s.id} className="flex gap-2 border-b border-border px-3 py-2.5 hover:bg-surface">
          <input type="checkbox" aria-label={`Comparer ${s.titre}`} className="mt-1 h-4 w-4 accent-[var(--color-accent)]" checked={selected.includes(s.id)} onChange={() => toggle(s.id)} />
          <Link href={`/biens/${s.id}`} className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="truncate font-medium">{s.titre}</span>
              {s.demo ? <DemoBadge /> : null}
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
              <span>{fmtEur(s.prix)}</span>
              {s.baisse ? (
                <span className="flex items-center gap-0.5 text-success">
                  <TrendingDown className="h-3 w-3" /> baisse ({fmtEur(s.prix_precedent)})
                </span>
              ) : null}
              {s.surface ? <span>{fmtNum(s.surface, 1)} m²</span> : null}
              <span>{TRACKING_LABELS[s.statut]}</span>
              <span>ajouté le {fmtDate(s.created_at)}</span>
              {!s.enrichi ? <span className="text-warning">non enrichi</span> : null}
            </div>
            <div className="mt-0.5 grid grid-cols-2 gap-x-3 gap-y-1 text-xs sm:grid-cols-[auto_1fr_1fr_1fr_auto] sm:items-center">
              {s.hors_perimetre ? (
                <span className="col-span-2 text-warning">Hors périmètre : analyse dédiée nécessaire</span>
              ) : (
                <>
                  <span className="w-fit">
                    <VerdictBadge verdict={s.verdict} size="sm" />
                  </span>
                  <span>
                    <span className="text-muted">{s.type_actif === 'fonds_commerce' ? 'Trésorerie ' : 'CF prudent '}</span>
                    <span className={cn('font-medium', s.cash_flow_prudent !== null && (s.cash_flow_prudent >= 0 ? 'text-success' : 'text-danger'))}>
                      {s.cash_flow_prudent === null ? 'n. c.' : `${fmtEur(s.cash_flow_prudent)}/mois`}
                    </span>
                  </span>
                  <span>
                    <span className="text-muted">Prix max </span>
                    <span className="font-medium">{s.prix_max === null ? 'n. c.' : fmtEur(s.prix_max)}</span>
                    {s.ecart_prix !== null ? <span className="text-muted"> ({fmtPct(s.ecart_prix, 0, true)})</span> : null}
                  </span>
                  <span>
                    <span className="text-muted">vs DVF </span>
                    <span className="font-medium">{s.ecart_dvf === null ? 'n. c.' : fmtPct(s.ecart_dvf, 0, true)}</span>
                  </span>
                  <ConfidenceBadge niveau={s.confiance} />
                </>
              )}
            </div>
          </Link>
        </div>
      ))}
      {list.length === 0 ? <p className="p-4 text-sm text-muted">Aucun bien ne correspond aux filtres.</p> : null}
    </div>
  );
}
