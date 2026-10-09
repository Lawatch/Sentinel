'use client';

import { Plus, Trash2 } from 'lucide-react';
import {
  EPOQUES,
  EPOQUE_LABELS,
  RESIDENTIAL_TYPES,
  mursSchema,
  fondsSchema,
  type AssetType,
  type FondsInputs,
  type MursInputs,
  type NumField,
  type PropertyInputs,
} from '@/lib/finance/schema';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/input';
import { DateFieldEditor, NumFieldEditor, StrFieldEditor } from './field-editor';

const DPE_OPTIONS = ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((c) => ({ value: c, label: c }));
const ENERGIES = ['Électricité', 'Gaz naturel', 'Fioul domestique', 'Réseau de chauffage urbain', 'Bois', 'GPL', 'Autre'].map((e) => ({ value: e, label: e }));

function Group({ title, children, description }: { title: string; children: React.ReactNode; description?: string }) {
  return (
    <fieldset className="rounded-lg border border-border p-3">
      <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-muted">{title}</legend>
      {description ? <p className="mb-2 text-xs text-muted">{description}</p> : null}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">{children}</div>
    </fieldset>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" className="h-4 w-4 accent-[var(--color-accent)]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

export function InputsEditor({ type, inputs, onChange }: { type: AssetType; inputs: PropertyInputs; onChange: (i: PropertyInputs) => void }) {
  const set = <K extends keyof PropertyInputs>(k: K) => (v: PropertyInputs[K]) => onChange({ ...inputs, [k]: v });
  const residential = RESIDENTIAL_TYPES.includes(type);
  const murs: MursInputs = inputs.murs ?? mursSchema.parse({});
  const setMurs = <K extends keyof MursInputs>(k: K) => (v: MursInputs[K]) => onChange({ ...inputs, murs: { ...murs, [k]: v } });

  if (type === 'fonds_commerce') return <FondsEditor inputs={inputs} onChange={onChange} />;

  const lots = inputs.loyers_lots;
  const nbLots = inputs.nb_lots.valeur ?? 0;

  return (
    <div className="flex flex-col gap-4">
      <Group title="Prix et coût d’acquisition">
        <NumFieldEditor label="Prix demandé" unit="€" field={inputs.prix} onChange={set('prix')} testId="champ-prix" />
        <NumFieldEditor label="Surface" unit="m²" field={inputs.surface} onChange={set('surface')} />
        <NumFieldEditor label="Travaux estimés" unit="€" field={inputs.travaux} onChange={set('travaux')} hint="Inconnu : 0 € retenu comme hypothèse." />
        <div className="flex flex-col gap-2">
          <Check label="Honoraires d’agence inclus dans le prix" checked={inputs.honoraires_inclus} onChange={set('honoraires_inclus')} />
          {!inputs.honoraires_inclus ? <NumFieldEditor label="Honoraires à la charge de l’acquéreur" unit="€" field={inputs.honoraires_agence} onChange={set('honoraires_agence')} /> : null}
          <Check label="Logement neuf (frais de notaire réduits)" checked={inputs.neuf} onChange={set('neuf')} />
          {residential ? <Check label="Travaux de rénovation énergétique" checked={inputs.travaux_renovation_energetique} onChange={set('travaux_renovation_energetique')} /> : null}
        </div>
        <NumFieldEditor label="Frais bancaires (dossier, garantie, courtage)" unit="€" field={inputs.frais_bancaires} onChange={set('frais_bancaires')} hint="Inconnu : valeur du profil (hypothèse)." />
        {residential ? (
          <div className="flex flex-col gap-2">
            <Check label="Location meublée" checked={inputs.meuble} onChange={set('meuble')} />
            {inputs.meuble ? <NumFieldEditor label="Mobilier" unit="€" field={inputs.mobilier} onChange={set('mobilier')} /> : null}
          </div>
        ) : null}
      </Group>

      {type === 'murs_commerciaux' ? (
        <Group title="Bail commercial" description="Un bail loué reste un revenu à risque : le loyer reste « déclaré » tant que le bail n’est pas joint.">
          <Check label="Local loué (décocher si libre)" checked={murs.loue} onChange={setMurs('loue')} />
          <NumFieldEditor label="Loyer contractuel annuel HT" unit="€/an" field={murs.loyer_annuel_ht} onChange={setMurs('loyer_annuel_ht')} />
          <NumFieldEditor label="Loyer de marché annuel HT (relocation)" unit="€/an" field={murs.loyer_marche_annuel_ht} onChange={setMurs('loyer_marche_annuel_ht')} />
          <Field label="Indice d’indexation">
            <Select value={murs.indice} onChange={(e) => setMurs('indice')(e.target.value as MursInputs['indice'])}>
              {['inconnu', 'ILC', 'ILAT', 'ICC', 'autre'].map((i) => (
                <option key={i} value={i}>
                  {i === 'inconnu' ? 'Inconnu' : i}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Prochaine échéance triennale">
            <Input type="date" value={murs.prochaine_triennale ?? ''} onChange={(e) => setMurs('prochaine_triennale')(e.target.value || null)} />
          </Field>
          <Field label="Fin du bail">
            <Input type="date" value={murs.fin_bail ?? ''} onChange={(e) => setMurs('fin_bail')(e.target.value || null)} />
          </Field>
          <Field label="Taxe foncière refacturée au locataire">
            <Select value={murs.refacturation_tf} onChange={(e) => setMurs('refacturation_tf')(e.target.value as MursInputs['refacturation_tf'])}>
              <option value="inconnu">Inconnu</option>
              <option value="oui">Oui</option>
              <option value="non">Non</option>
            </Select>
          </Field>
          <Field label="Charges refacturées au locataire">
            <Select value={murs.refacturation_charges} onChange={(e) => setMurs('refacturation_charges')(e.target.value as MursInputs['refacturation_charges'])}>
              <option value="inconnu">Inconnu</option>
              <option value="oui">Oui</option>
              <option value="non">Non</option>
            </Select>
          </Field>
          <NumFieldEditor label="Charges annuelles (non refacturées si « non »)" unit="€/an" field={murs.charges_annuelles} onChange={setMurs('charges_annuelles')} />
          <NumFieldEditor label="Dépôt de garantie" unit="€" field={murs.depot_garantie} onChange={setMurs('depot_garantie')} />
          <NumFieldEditor label="Travaux de remise en état (scénario prudent)" unit="€" field={murs.travaux_remise_en_etat} onChange={setMurs('travaux_remise_en_etat')} />
          <Field label="Activité du locataire">
            <Input value={murs.activite_locataire} onChange={(e) => setMurs('activite_locataire')(e.target.value)} />
          </Field>
          <Field label="Régime de TVA (à vérifier)">
            <Input value={murs.regime_tva} onChange={(e) => setMurs('regime_tva')(e.target.value)} />
          </Field>
          <NumFieldEditor label="Taxe foncière" unit="€/an" field={inputs.taxe_fonciere} onChange={set('taxe_fonciere')} />
        </Group>
      ) : (
        <Group title="Revenus et charges">
          {nbLots > 1 ? (
            <div className="flex flex-col gap-2 sm:col-span-2 xl:col-span-3">
              <span className="text-xs font-medium text-muted">Loyers mensuels HC par lot</span>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {lots.map((l, i) => (
                  <div key={i} className="relative">
                    <NumFieldEditor label={`Lot ${i + 1}`} unit="€/mois" field={l} onChange={(v) => set('loyers_lots')(lots.map((x, j) => (j === i ? v : x)))} />
                    <button type="button" className="absolute right-0 top-0 p-1 text-muted hover:text-danger" aria-label={`Retirer le lot ${i + 1}`} onClick={() => set('loyers_lots')(lots.filter((_, j) => j !== i))}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
              {lots.length < nbLots ? (
                <Button type="button" size="sm" className="self-start" onClick={() => set('loyers_lots')([...lots, { valeur: null, statut: 'inconnu' }])}>
                  <Plus className="h-3.5 w-3.5" /> Ajouter un lot
                </Button>
              ) : null}
            </div>
          ) : (
            <NumFieldEditor label="Loyer mensuel hors charges" unit="€/mois" field={inputs.loyer} onChange={set('loyer')} hint="Inconnu : loyer de marché estimé (carte des loyers)." testId="champ-loyer" />
          )}
          <NumFieldEditor label="Nombre de lots" field={inputs.nb_lots} onChange={set('nb_lots')} />
          <NumFieldEditor label="Taxe foncière" unit="€/an" field={inputs.taxe_fonciere} onChange={set('taxe_fonciere')} hint="Inconnue : valeur au m² du profil (hypothèse)." />
          <NumFieldEditor label="Charges de copropriété (total)" unit="€/an" field={inputs.charges_copro} onChange={set('charges_copro')} hint="Seule la part non récupérable est une charge (part récupérable : paramètre du profil)." />
          <NumFieldEditor label="dont part non récupérable (si connue)" unit="€/an" field={inputs.charges_copro_non_recup} onChange={set('charges_copro_non_recup')} />
        </Group>
      )}

      {residential ? (
        <Group title="Logement, DPE et encadrement">
          <NumFieldEditor label="Nombre de pièces principales" field={inputs.pieces} onChange={set('pieces')} />
          <StrFieldEditor label="Époque de construction" field={inputs.epoque} onChange={set('epoque')} options={EPOQUES.map((e) => ({ value: e, label: EPOQUE_LABELS[e] }))} />
          <StrFieldEditor label="Classe DPE" field={inputs.dpe.classe} onChange={(v) => set('dpe')({ ...inputs.dpe, classe: v })} options={DPE_OPTIONS} />
          <DateFieldEditor label="Date du DPE" field={inputs.dpe.date} onChange={(v) => set('dpe')({ ...inputs.dpe, date: v })} />
          <StrFieldEditor label="Énergie de chauffage" field={inputs.dpe.energie_chauffage} onChange={(v) => set('dpe')({ ...inputs.dpe, energie_chauffage: v })} options={ENERGIES} />
          <NumFieldEditor
            label="Loyer de référence majoré"
            unit="€/m²"
            field={inputs.loyer_reference_majore}
            onChange={set('loyer_reference_majore')}
            hint="À saisir si l’encadrement s’applique et que les données ouvertes manquent ou sont anciennes."
          />
        </Group>
      ) : null}
    </div>
  );
}

function FondsEditor({ inputs, onChange }: { inputs: PropertyInputs; onChange: (i: PropertyInputs) => void }) {
  const f: FondsInputs = inputs.fonds ?? fondsSchema.parse({});
  const setF = <K extends keyof FondsInputs>(k: K) => (v: FondsInputs[K]) => onChange({ ...inputs, fonds: { ...f, [k]: v } });
  const years = ['N−2', 'N−1', 'N (dernier)'];
  const setYear = (k: 'ca' | 'ebe', i: number) => (v: NumField) => setF(k)(f[k].map((x, j) => (j === i ? v : x)));
  const aide = f.bfr_aide;
  const bfrCalc = aide.stocks !== null || aide.creances !== null || aide.dettes !== null ? (aide.stocks ?? 0) + (aide.creances ?? 0) - (aide.dettes ?? 0) : null;
  return (
    <div className="flex flex-col gap-4">
      <Group title="Cession" description="CA et EBE restent « déclarés » tant que les liasses fiscales ne sont pas jointes.">
        <NumFieldEditor label="Prix de cession" unit="€" field={inputs.prix} onChange={(v) => onChange({ ...inputs, prix: v })} />
        <Check label="Stock inclus dans le prix" checked={f.stock_inclus} onChange={setF('stock_inclus')} />
        <NumFieldEditor label="Stock" unit="€" field={f.stock} onChange={setF('stock')} />
        <NumFieldEditor label="Honoraires" unit="€" field={f.honoraires} onChange={setF('honoraires')} />
        <NumFieldEditor label="Investissements initiaux" unit="€" field={f.investissements_initiaux} onChange={setF('investissements_initiaux')} />
        <NumFieldEditor label="Investissements de maintien" unit="€/an" field={f.investissements_maintien} onChange={setF('investissements_maintien')} />
      </Group>
      <Group title="Activité (3 exercices)">
        {years.map((y, i) => (
          <NumFieldEditor key={`ca${i}`} label={`Chiffre d’affaires ${y}`} unit="€" field={f.ca[i]} onChange={setYear('ca', i)} />
        ))}
        {years.map((y, i) => (
          <NumFieldEditor key={`ebe${i}`} label={`EBE comptable ${y}`} unit="€" field={f.ebe[i]} onChange={setYear('ebe', i)} />
        ))}
        <NumFieldEditor label="Rémunération du cédant déjà comptabilisée" unit="€/an" field={f.remuneration_cedant} onChange={setF('remuneration_cedant')} />
        <NumFieldEditor label="Rémunération cible du repreneur (charges comprises)" unit="€/an" field={f.remuneration_cible} onChange={setF('remuneration_cible')} />
        <NumFieldEditor label="Taux de marge sur coûts variables" unit="%" ratio field={f.taux_marge_cv} onChange={setF('taux_marge_cv')} hint="Pour le point mort et les scénarios CA −10 % / −20 %." />
      </Group>
      <Group title="Retraitements de l’EBE" description="Chaque ligne indique le justificatif attendu.">
        <div className="flex flex-col gap-2 sm:col-span-2 xl:col-span-3">
          {f.retraitements.map((r, i) => (
            <div key={i} className="grid grid-cols-1 gap-2 sm:grid-cols-[2fr_1fr_2fr_auto]">
              <Input placeholder="Libellé" value={r.libelle} onChange={(e) => setF('retraitements')(f.retraitements.map((x, j) => (j === i ? { ...x, libelle: e.target.value } : x)))} />
              <Input
                inputMode="decimal"
                placeholder="± montant"
                value={String(r.montant)}
                onChange={(e) => setF('retraitements')(f.retraitements.map((x, j) => (j === i ? { ...x, montant: Number(e.target.value.replace(',', '.')) || 0 } : x)))}
              />
              <Input placeholder="Justificatif attendu" value={r.justificatif} onChange={(e) => setF('retraitements')(f.retraitements.map((x, j) => (j === i ? { ...x, justificatif: e.target.value } : x)))} />
              <Button type="button" variant="ghost" size="icon" aria-label="Supprimer" onClick={() => setF('retraitements')(f.retraitements.filter((_, j) => j !== i))}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button type="button" size="sm" className="self-start" onClick={() => setF('retraitements')([...f.retraitements, { libelle: '', montant: 0, justificatif: '' }])}>
            <Plus className="h-3.5 w-3.5" /> Ajouter un retraitement
          </Button>
        </div>
      </Group>
      <Group title="Bail, personnel et BFR">
        <NumFieldEditor label="Loyer annuel" unit="€/an" field={f.loyer_annuel} onChange={setF('loyer_annuel')} />
        <NumFieldEditor label="Charges locatives annuelles" unit="€/an" field={f.charges_locatives_annuelles} onChange={setF('charges_locatives_annuelles')} />
        <NumFieldEditor label="Durée restante du bail" unit="mois" field={f.duree_restante_bail_mois} onChange={setF('duree_restante_bail_mois')} />
        <Field label="Destination du bail">
          <Input value={f.destination_bail} onChange={(e) => setF('destination_bail')(e.target.value)} />
        </Field>
        <NumFieldEditor label="Effectif" field={f.effectif} onChange={setF('effectif')} />
        <NumFieldEditor label="Masse salariale" unit="€/an" field={f.masse_salariale} onChange={setF('masse_salariale')} />
        <NumFieldEditor label="BFR initial" unit="€" field={f.bfr} onChange={setF('bfr')} />
        <div className="flex flex-col gap-1 rounded-md bg-surface-2 p-2 text-xs sm:col-span-2">
          <span className="font-medium">Aide au calcul du BFR : stocks + créances clients − dettes fournisseurs</span>
          <div className="grid grid-cols-3 gap-2">
            {(['stocks', 'creances', 'dettes'] as const).map((k) => (
              <Input
                key={k}
                aria-label={k}
                placeholder={k === 'stocks' ? 'Stocks' : k === 'creances' ? 'Créances' : 'Dettes'}
                inputMode="decimal"
                value={aide[k] ?? ''}
                onChange={(e) => setF('bfr_aide')({ ...aide, [k]: e.target.value === '' ? null : Number(e.target.value.replace(',', '.')) || 0 })}
              />
            ))}
          </div>
          {bfrCalc !== null ? (
            <Button type="button" size="sm" className="self-start" onClick={() => setF('bfr')({ valeur: bfrCalc, statut: 'declare', source: 'Aide au calcul (stocks + créances − dettes)' })}>
              Utiliser {bfrCalc.toLocaleString('fr-FR')} € comme BFR
            </Button>
          ) : null}
        </div>
      </Group>
      <Group title="Financement">
        <NumFieldEditor label="Apport" unit="€" field={f.apport} onChange={setF('apport')} hint="Inconnu : apport du profil." />
        <NumFieldEditor label="Montant du prêt" unit="€" field={f.pret_montant} onChange={setF('pret_montant')} hint="Inconnu : besoin total − apport." />
        <NumFieldEditor label="Taux du prêt" unit="%" ratio field={f.pret_taux} onChange={setF('pret_taux')} />
        <NumFieldEditor label="Durée du prêt" unit="mois" field={f.pret_duree_mois} onChange={setF('pret_duree_mois')} />
      </Group>
    </div>
  );
}
