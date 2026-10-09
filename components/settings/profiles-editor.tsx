'use client';

import { useState, useTransition } from 'react';
import { createProfile, deleteProfile, saveProfile, setDefaultProfile } from '@/app/actions/profiles';
import type { ProfileRow } from '@/lib/domain/property';
import { ASSET_TYPES, ASSET_TYPE_LABELS, FISCAL_REGIME_LABELS, type FiscalRegime, type ProfileParams } from '@/lib/finance/schema';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/input';
import { StatusPill } from '@/components/data/status';

type NumPath = { path: string; label: string; unit?: string; pct?: boolean; nullable?: boolean };

const GROUPS: { title: string; fields: NumPath[] }[] = [
  {
    title: 'Budget et financement',
    fields: [
      { path: 'budget_max', label: 'Budget maximal (prix)', unit: '€', nullable: true },
      { path: 'apport', label: 'Apport disponible', unit: '€' },
      { path: 'taux_credit', label: 'Taux nominal du crédit', unit: '%', pct: true },
      { path: 'duree_credit_mois', label: 'Durée du crédit', unit: 'mois' },
      { path: 'assurance_taux', label: 'Assurance emprunteur (taux annuel)', unit: '%', pct: true },
      { path: 'frais_bancaires', label: 'Frais bancaires par défaut', unit: '€' },
      { path: 'frais_notaire_ancien', label: 'Frais de notaire — ancien', unit: '%', pct: true },
      { path: 'frais_notaire_neuf', label: 'Frais de notaire — neuf', unit: '%', pct: true },
      { path: 'cash_flow_cible', label: 'Cash-flow mensuel cible', unit: '€' },
    ],
  },
  {
    title: 'Exploitation (valeurs par défaut)',
    fields: [
      { path: 'vacance', label: 'Vacance locative', unit: '%', pct: true },
      { path: 'gestion', label: 'Gestion (% des loyers)', unit: '%', pct: true },
      { path: 'gli', label: 'Garantie loyers impayés (% des loyers)', unit: '%', pct: true },
      { path: 'pno_annuelle', label: 'Assurance PNO', unit: '€/an' },
      { path: 'entretien_m2_an', label: 'Provision d’entretien', unit: '€/m²/an' },
      { path: 'taxe_fonciere_m2_an', label: 'Taxe foncière par défaut', unit: '€/m²/an' },
      { path: 'charges_copro_m2_an', label: 'Charges de copropriété par défaut', unit: '€/m²/an' },
      { path: 'part_recuperable_copro', label: 'Part récupérable des charges', unit: '%', pct: true },
      { path: 'charges_recuperables_m2_mois', label: 'Charges récupérables (conversion CC → HC)', unit: '€/m²/mois' },
      { path: 'mobilier_defaut', label: 'Mobilier par défaut (meublé)', unit: '€' },
    ],
  },
  {
    title: 'Fiscalité et foyer (optionnels)',
    fields: [
      { path: 'tmi', label: 'Tranche marginale d’imposition', unit: '%', pct: true, nullable: true },
      { path: 'revenus_foyer_mensuels', label: 'Revenus nets mensuels du foyer', unit: '€', nullable: true },
      { path: 'mensualites_existantes', label: 'Mensualités de crédit existantes', unit: '€', nullable: true },
      { path: 'lmnp.part_terrain', label: 'LMNP : part du terrain (non amortissable)', unit: '%', pct: true },
      { path: 'lmnp.duree_bati_ans', label: 'LMNP : durée d’amortissement du bâti', unit: 'ans' },
      { path: 'lmnp.duree_travaux_ans', label: 'LMNP : durée d’amortissement des travaux', unit: 'ans' },
      { path: 'lmnp.duree_mobilier_ans', label: 'LMNP : durée d’amortissement du mobilier', unit: 'ans' },
    ],
  },
  {
    title: 'Scénarios et verdict',
    fields: [
      { path: 'scenarios.prudent_vacance_plus', label: 'Prudent : vacance + (points)', unit: '%', pct: true },
      { path: 'scenarios.favorable_vacance_moins', label: 'Favorable : vacance − (points)', unit: '%', pct: true },
      { path: 'scenarios.prudent_travaux_plus', label: 'Prudent : travaux +', unit: '%', pct: true },
      { path: 'scenarios.prudent_taux_plus', label: 'Prudent : taux + (points)', unit: '%', pct: true },
      { path: 'verdict.ecart_max_negociation', label: 'Verdict « À négocier » : écart maximal', unit: '%', pct: true },
      { path: 'verdict.couverture_min_fonds', label: 'Fonds : couverture minimale de la dette' },
      { path: 'hcsf.taux_max', label: 'HCSF : taux d’endettement maximal', unit: '%', pct: true },
      { path: 'hcsf.duree_max_mois', label: 'HCSF : durée maximale', unit: 'mois' },
      { path: 'hcsf.ponderation_loyers', label: 'Loyers retenus par la banque', unit: '%', pct: true },
      { path: 'murs.vacance_relocation_mois', label: 'Murs : vacance de relocation', unit: 'mois' },
      { path: 'murs.horizon_min_mois', label: 'Murs : horizon minimal', unit: 'mois' },
      { path: 'fonds.taux_marge_cv_defaut', label: 'Fonds : marge sur coûts variables par défaut', unit: '%', pct: true },
    ],
  },
];

const getAt = (o: Record<string, unknown>, path: string) => path.split('.').reduce<unknown>((x, k) => (x as Record<string, unknown>)?.[k], o) as number | null;
const setAt = (o: ProfileParams, path: string, v: number | null): ProfileParams => {
  const [a, b] = path.split('.');
  if (!b) return { ...o, [a]: v } as ProfileParams;
  return { ...o, [a]: { ...(o as unknown as Record<string, Record<string, unknown>>)[a], [b]: v } } as ProfileParams;
};
const show = (v: number | null, pct?: boolean) => (v === null || v === undefined ? '' : String(Math.round((pct ? v * 100 : v) * 10000) / 10000).replace('.', ','));

export function ProfilesEditor({ profiles }: { profiles: ProfileRow[] }) {
  const [currentId, setCurrentId] = useState(profiles.find((p) => p.par_defaut)?.id ?? profiles[0]?.id);
  const current = profiles.find((p) => p.id === currentId) ?? profiles[0];
  return (
    <Card>
      <CardHeader title="Profils d’investissement">
        <p className="text-xs text-muted">Toutes les valeurs par défaut sont des hypothèses, visibles et modifiables sans code. Chaque bien est analysé avec son profil.</p>
      </CardHeader>
      <CardBody className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          {profiles.map((p) => (
            <button
              key={p.id}
              onClick={() => setCurrentId(p.id)}
              className={`rounded-md border px-3 py-1.5 text-sm ${p.id === current?.id ? 'border-accent bg-accent-soft text-accent' : 'border-border hover:bg-surface-2'}`}
            >
              {p.nom} {p.par_defaut ? <Badge tone="accent">par défaut</Badge> : null}
            </button>
          ))}
        </div>
        {current ? <ProfileForm key={current.id + JSON.stringify(current.params)} profile={current} canDelete={profiles.length > 1} onCreated={setCurrentId} /> : null}
      </CardBody>
    </Card>
  );
}

function ProfileForm({ profile, canDelete, onCreated }: { profile: ProfileRow; canDelete: boolean; onCreated: (id: string) => void }) {
  const [nom, setNom] = useState(profile.nom);
  const [params, setParams] = useState<ProfileParams>(profile.params);
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const dirty = nom !== profile.nom || JSON.stringify(params) !== JSON.stringify(profile.params);
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Nom du profil">
          <Input value={nom} onChange={(e) => setNom(e.target.value)} />
        </Field>
        <Field label="Régime fiscal">
          <Select value={params.regime_fiscal} onChange={(e) => setParams({ ...params, regime_fiscal: e.target.value as FiscalRegime })}>
            {(Object.keys(FISCAL_REGIME_LABELS) as FiscalRegime[]).map((r) => (
              <option key={r} value={r}>
                {FISCAL_REGIME_LABELS[r]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Base de l’assurance emprunteur">
          <Select value={params.assurance_mode} onChange={(e) => setParams({ ...params, assurance_mode: e.target.value as ProfileParams['assurance_mode'] })}>
            <option value="capital_initial">Capital initial</option>
            <option value="capital_restant_du">Capital restant dû</option>
          </Select>
        </Field>
      </div>
      <fieldset className="rounded-lg border border-border p-3">
        <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-muted">Types d’actifs couverts</legend>
        <div className="flex flex-wrap gap-3">
          {ASSET_TYPES.filter((t) => t !== 'titres_societe' && t !== 'murs_et_fonds').map((t) => (
            <label key={t} className="flex items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[var(--color-accent)]"
                checked={params.asset_types.includes(t)}
                onChange={(e) => setParams({ ...params, asset_types: e.target.checked ? [...params.asset_types, t] : params.asset_types.filter((x) => x !== t) })}
              />
              {ASSET_TYPE_LABELS[t]}
            </label>
          ))}
        </div>
      </fieldset>
      {GROUPS.map((g) => (
        <fieldset key={g.title} className="rounded-lg border border-border p-3">
          <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-muted">{g.title}</legend>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {g.fields.map((f) => {
              const v = getAt(params as unknown as Record<string, unknown>, f.path);
              return (
                <Field
                  key={f.path}
                  label={
                    <span className="flex items-center justify-between gap-2">
                      {f.label} <StatusPill statut={v === null ? 'inconnu' : 'hypothese'} compact />
                    </span>
                  }
                >
                  <div className="relative">
                    <Input
                      inputMode="decimal"
                      value={texts[f.path] ?? show(v, f.pct)}
                      placeholder={f.nullable ? 'non renseigné' : ''}
                      className="pr-16"
                      onChange={(e) => {
                        const t = e.target.value;
                        setTexts({ ...texts, [f.path]: t });
                        const clean = t.replace(/\s/g, '').replace(',', '.');
                        if (clean === '' && f.nullable) return setParams(setAt(params, f.path, null));
                        const n = Number(clean);
                        if (clean !== '' && Number.isFinite(n)) setParams(setAt(params, f.path, f.pct ? n / 100 : n));
                      }}
                    />
                    {f.unit ? <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted">{f.unit}</span> : null}
                  </div>
                </Field>
              );
            })}
          </div>
        </fieldset>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="primary"
          disabled={!dirty || pending}
          onClick={() =>
            start(async () => {
              const r = await saveProfile(profile.id, nom, params);
              setMsg(r.ok ? 'Profil enregistré. Les analyses sont recalculées.' : r.error);
            })
          }
        >
          Enregistrer le profil
        </Button>
        {!profile.par_defaut ? (
          <Button disabled={pending} onClick={() => start(async () => setMsg((await setDefaultProfile(profile.id)).ok ? 'Profil par défaut.' : 'Échec'))}>
            Définir par défaut
          </Button>
        ) : null}
        <Button
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await createProfile(`${nom} (copie)`, profile.id);
              if (r.ok) onCreated(r.data.id);
              setMsg(r.ok ? 'Copie créée.' : r.error);
            })
          }
        >
          Dupliquer
        </Button>
        {canDelete ? (
          <Button
            variant="ghost"
            className="text-danger"
            disabled={pending}
            onClick={() => {
              if (!confirm(`Supprimer le profil « ${profile.nom} » ? Les biens associés utiliseront le profil par défaut.`)) return;
              start(async () => {
                const r = await deleteProfile(profile.id);
                setMsg(r.ok ? 'Profil supprimé.' : r.error);
              });
            }}
          >
            Supprimer
          </Button>
        ) : null}
        {msg ? <span className="text-sm text-muted">{msg}</span> : null}
      </div>
    </div>
  );
}
