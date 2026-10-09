'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { ExternalLink, Printer, Save } from 'lucide-react';
import { updateInputs } from '@/app/actions/properties';
import { analyze } from '@/lib/finance/analyze';
import { ASSET_TYPES, ASSET_TYPE_LABELS, type AssetType, type PropertyInputs } from '@/lib/finance/schema';
import { marketContextOf } from '@/lib/domain/enrichment';
import type { PriceObservationRow, ProfileRow, PropertyRow } from '@/lib/domain/property';
import { profileFor } from '@/lib/domain/property';
import { Badge, DemoBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StatusLegend } from '@/components/data/status';
import { TRACKING_LABELS } from '@/lib/domain/statuses';
import { InputsEditor } from './inputs-editor';
import { VerdictHeader } from './verdict-header';
import { FondsResults, RentalResults } from './analysis-results';
import { MarketTab } from './market-tab';
import { ChecksTab } from './checks-tab';
import { TrackingTab } from './tracking-tab';

export function PropertyView({ p, observations, profiles, autoEnrich, today }: { p: PropertyRow; observations: PriceObservationRow[]; profiles: ProfileRow[]; autoEnrich: boolean; today: string }) {
  const router = useRouter();
  const [inputs, setInputs] = useState<PropertyInputs>(p.inputs);
  const [type, setType] = useState<AssetType>(p.type_actif);
  const [profileId, setProfileId] = useState<string | null>(p.profile_id);
  const [adresse, setAdresse] = useState(p.adresse);
  const [saving, startSave] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [enriching, setEnriching] = useState(false);
  const [enrichMsg, setEnrichMsg] = useState<string | null>(null);
  const started = useRef(false);

  // Après un rafraîchissement serveur, se resynchroniser sur les valeurs enregistrées,
  // sauf si l'utilisateur est en train de modifier la fiche (ses saisies sont conservées).
  const [saved, setSaved] = useState({ at: p.updated_at, inputs: JSON.stringify(p.inputs), type: p.type_actif, profileId: p.profile_id, adresse: p.adresse });
  if (p.updated_at !== saved.at) {
    const untouched = JSON.stringify(inputs) === saved.inputs && type === saved.type && profileId === saved.profileId && adresse.trim() === saved.adresse;
    setSaved({ at: p.updated_at, inputs: JSON.stringify(p.inputs), type: p.type_actif, profileId: p.profile_id, adresse: p.adresse });
    if (untouched) {
      setInputs(p.inputs);
      setType(p.type_actif);
      setProfileId(p.profile_id);
      setAdresse(p.adresse);
    }
  }

  const profile = profileFor({ profile_id: profileId, type_actif: type }, profiles);
  const analysis = useMemo(
    () => analyze({ type, inputs, profile: profile.params, market: marketContextOf(p.enrichissement), today }),
    [type, inputs, profile.params, p.enrichissement, today],
  );
  const dirty = JSON.stringify(inputs) !== JSON.stringify(p.inputs) || type !== p.type_actif || profileId !== p.profile_id || adresse.trim() !== p.adresse;

  const enrich = useCallback(
    async (opts: { force?: boolean; regeocode?: boolean }) => {
      setEnriching(true);
      setEnrichMsg('Récupération des données publiques…');
      const t0 = performance.now();
      try {
        const res = await fetch(`/api/biens/${p.id}/enrichir`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(opts) });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) setEnrichMsg(`Enrichissement impossible : ${json.error ?? res.status}`);
        else setEnrichMsg(`Données publiques mises à jour en ${((performance.now() - t0) / 1000).toFixed(1)} s.`);
        router.refresh();
      } catch (e) {
        setEnrichMsg(`Enrichissement impossible : ${(e as Error).message}`);
      } finally {
        setEnriching(false);
      }
    },
    [p.id, router],
  );

  // Enrichissement automatique à la création (ou si le bien n'a jamais été enrichi).
  useEffect(() => {
    if (started.current || !(autoEnrich || !p.enrichissement?.date)) return;
    const t = setTimeout(() => {
      started.current = true;
      enrich({});
      if (autoEnrich) router.replace(`/biens/${p.id}`, { scroll: false });
    }, 0);
    return () => clearTimeout(t);
  }, [autoEnrich, p.enrichissement?.date, p.id, enrich, router]);

  const save = () =>
    startSave(async () => {
      setMsg(null);
      const r = await updateInputs(p.id, inputs, { adresse, type_actif: type, profile_id: profileId });
      if (!r.ok) return setMsg(r.error);
      setMsg(r.data.prixChange ? 'Enregistré. Nouveau prix ajouté à l’historique.' : 'Enregistré.');
      if (r.data.adresseChange) enrich({ regeocode: true, force: true });
    });

  const rental = analysis.kind === 'residentiel' || analysis.kind === 'murs' ? analysis : null;

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-4 px-3 py-4 sm:px-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold">{p.titre || p.adresse}</h1>
            {p.demo ? <DemoBadge /> : null}
            <Badge>{TRACKING_LABELS[p.statut]}</Badge>
          </div>
          <p className="text-sm text-muted">{p.geocode_label ?? p.adresse}</p>
        </div>
        <div className="flex flex-wrap gap-2 no-print">
          <Button asChild size="sm">
            <a href={p.url} target="_blank" rel="noreferrer">
              <ExternalLink className="h-3.5 w-3.5" /> Annonce
            </a>
          </Button>
          <Button asChild size="sm">
            <Link href={`/biens/${p.id}/imprimer`}>
              <Printer className="h-3.5 w-3.5" /> Fiche imprimable
            </Link>
          </Button>
        </div>
      </div>

      {enrichMsg ? <p className="text-xs text-muted" aria-live="polite">{enrichMsg}</p> : null}

      <VerdictHeader a={analysis} />

      <Tabs defaultValue="analyse">
        <TabsList>
          <TabsTrigger value="analyse">Analyse</TabsTrigger>
          <TabsTrigger value="marche">Marché</TabsTrigger>
          <TabsTrigger value="verifications">Vérifications</TabsTrigger>
          <TabsTrigger value="suivi">Suivi</TabsTrigger>
        </TabsList>

        <TabsContent value="analyse" className="mt-4 flex flex-col gap-4">
          <div className="grid gap-3 rounded-lg border border-border bg-surface p-3 sm:grid-cols-3">
            <Field label="Type d’actif">
              <Select value={type} onChange={(e) => setType(e.target.value as AssetType)}>
                {ASSET_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {ASSET_TYPE_LABELS[t]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Profil d’investissement">
              <Select value={profile.id} onChange={(e) => setProfileId(e.target.value)}>
                {profiles.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.nom}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Adresse ou commune">
              <Input value={adresse} onChange={(e) => setAdresse(e.target.value)} />
            </Field>
          </div>
          <div className="flex flex-col gap-2">
            <StatusLegend />
            <p className="text-xs text-muted">
              Les valeurs inconnues restent inconnues ; les valeurs par défaut du profil apparaissent comme « hypothèse ». Les résultats se recalculent à chaque saisie.
            </p>
          </div>
          {analysis.kind !== 'hors_perimetre' ? <InputsEditor type={type} inputs={inputs} onChange={setInputs} /> : null}
          <div
            className={`flex flex-wrap items-center gap-2 no-print ${dirty ? 'sticky bottom-2 z-10 rounded-lg border border-accent/40 bg-surface p-2 shadow-lg' : ''}`}
          >
            <Button variant="primary" onClick={save} disabled={!dirty || saving} data-testid="enregistrer">
              <Save className="h-4 w-4" /> {saving ? 'Enregistrement…' : dirty ? 'Enregistrer les modifications' : 'Enregistré'}
            </Button>
            {dirty ? (
              <Button
                onClick={() => {
                  setInputs(p.inputs);
                  setType(p.type_actif);
                  setProfileId(p.profile_id);
                  setAdresse(p.adresse);
                }}
              >
                Annuler
              </Button>
            ) : null}
            {dirty ? <span className="text-xs text-muted">Résultats recalculés, non enregistrés.</span> : null}
            {msg ? <span className="text-sm text-muted">{msg}</span> : null}
          </div>
          {rental ? <RentalResults a={rental} profile={profile.params} /> : null}
          {analysis.kind === 'fonds' ? <FondsResults a={analysis} /> : null}
        </TabsContent>

        <TabsContent value="marche" className="mt-4">
          <MarketTab
            propertyId={p.id}
            e={p.enrichissement}
            inputs={inputs}
            analysis={rental}
            lat={p.lat}
            lon={p.lon}
            code={p.code_insee}
            enriching={enriching}
            onRefresh={enrich}
          />
        </TabsContent>

        <TabsContent value="verifications" className="mt-4">
          <ChecksTab propertyId={p.id} type={type} checklist={p.checklist} />
        </TabsContent>

        <TabsContent value="suivi" className="mt-4">
          <TrackingTab
            propertyId={p.id}
            statut={p.statut}
            motif={p.motif_rejet}
            notes={p.notes}
            url={p.url}
            observations={observations.map((o) => ({ id: o.id, date: o.date, prix: Number(o.prix), origine: o.origine }))}
            snapshots={p.instantanes}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
