'use client';

import { ChevronDown, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { addPriceObservation, checkBeforeCreate, createProperty } from '@/app/actions/properties';
import { parseNumber } from '@/lib/domain/csv-import';
import { ASSET_TYPES, ASSET_TYPE_LABELS, type AssetType } from '@/lib/finance/schema';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { fmtEur } from '@/components/data/format';

type Check = { existant: { id: string; titre: string; prix: number | null } | null; doublons: { id: string; titre: string; surface: number | null }[] };

const EMPTY = { type_actif: 'appartement' as AssetType, prix: '', surface: '', adresse: '', url: '', loyer: '', charges_copro: '', taxe_fonciere: '', dpe: '', travaux: '', nb_lots: '', description: '' };

/** Ajout rapide : 5 champs obligatoires, le reste replié. Visible sur toutes les pages. */
export function QuickAdd() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [more, setMore] = useState(false);
  const [f, setF] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [check, setCheck] = useState<Check | null>(null);
  const [pending, start] = useTransition();

  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const num = (s: string) => {
    const n = parseNumber(s);
    return n === null || Number.isNaN(n) ? null : n;
  };
  const payload = () => ({
    type_actif: f.type_actif,
    prix: num(f.prix) ?? NaN,
    surface: num(f.surface) ?? NaN,
    adresse: f.adresse,
    url: f.url,
    loyer: num(f.loyer),
    charges_copro: num(f.charges_copro),
    taxe_fonciere: num(f.taxe_fonciere),
    dpe: f.dpe || null,
    travaux: num(f.travaux),
    nb_lots: num(f.nb_lots),
    description: f.description,
  });

  const reset = () => {
    setF(EMPTY);
    setCheck(null);
    setError(null);
    setMore(false);
  };

  const create = () =>
    start(async () => {
      const r = await createProperty(payload());
      if (!r.ok) return setError(r.error);
      setOpen(false);
      reset();
      router.push(`/biens/${r.data.id}?enrichir=1`);
    });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const p = payload();
    const missing = [!p.type_actif && 'type d’actif', !(p.prix > 0) && 'prix', !(p.surface > 0) && 'surface', !p.adresse.trim() && 'adresse ou commune', !p.url.trim() && 'URL'].filter(Boolean);
    if (missing.length) return setError(`Champs obligatoires manquants ou invalides : ${missing.join(', ')}.`);
    start(async () => {
      const r = await checkBeforeCreate({ url: p.url, adresse: p.adresse, surface: p.surface });
      if (!r.ok) return setError(r.error);
      if (r.data.existant || r.data.doublons.length) return setCheck(r.data);
      const c = await createProperty(p);
      if (!c.ok) return setError(c.error);
      setOpen(false);
      reset();
      router.push(`/biens/${c.data.id}?enrichir=1`);
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="primary" size="md" data-testid="ajout-rapide">
          <Plus className="h-4 w-4" /> Bien
        </Button>
      </DialogTrigger>
      <DialogContent title="Ajouter une annonce" description="Cinq champs suffisent ; l’enrichissement se lance à l’enregistrement.">
        {check ? (
          <div className="flex flex-col gap-3 text-sm">
            {check.existant ? (
              <>
                <p>
                  Cette annonce existe déjà : <strong>{check.existant.titre}</strong> (prix actuel {fmtEur(check.existant.prix)}).
                </p>
                <p>Ajouter une nouvelle observation de prix à {fmtEur(payload().prix)} au bien existant plutôt que de le dupliquer ?</p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="primary"
                    disabled={pending}
                    onClick={() =>
                      start(async () => {
                        const r = await addPriceObservation(check.existant!.id, payload().prix);
                        if (!r.ok) return setError(r.error);
                        setOpen(false);
                        reset();
                        router.push(`/biens/${check.existant!.id}`);
                      })
                    }
                  >
                    Ajouter l’observation de prix
                  </Button>
                  <Button onClick={() => setCheck(null)}>Retour</Button>
                </div>
              </>
            ) : (
              <>
                <p className="font-medium text-warning">Doublon possible</p>
                <p>Un bien de même adresse et de surface proche (à 5 % près) existe déjà :</p>
                <ul className="list-disc pl-5">
                  {check.doublons.map((d) => (
                    <li key={d.id}>
                      <a className="text-accent underline" href={`/biens/${d.id}`} target="_blank" rel="noreferrer">
                        {d.titre}
                      </a>
                    </li>
                  ))}
                </ul>
                <p className="text-muted">Rien n’est fusionné automatiquement : à vous de décider.</p>
                <div className="flex flex-wrap gap-2">
                  <Button variant="primary" disabled={pending} onClick={create}>
                    Créer quand même
                  </Button>
                  <Button onClick={() => setCheck(null)}>Retour</Button>
                </div>
              </>
            )}
          </div>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Type d’actif *" htmlFor="qa-type" className="col-span-2 sm:col-span-1">
                <Select id="qa-type" value={f.type_actif} onChange={set('type_actif')}>
                  {ASSET_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {ASSET_TYPE_LABELS[t]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Prix demandé (€) *" htmlFor="qa-prix" className="col-span-1">
                <Input id="qa-prix" inputMode="decimal" value={f.prix} onChange={set('prix')} placeholder="250 000" />
              </Field>
              <Field label="Surface (m²) *" htmlFor="qa-surface" className="col-span-1">
                <Input id="qa-surface" inputMode="decimal" value={f.surface} onChange={set('surface')} placeholder="42" />
              </Field>
              <Field label="Adresse ou commune *" htmlFor="qa-adresse" className="col-span-2">
                <Input id="qa-adresse" value={f.adresse} onChange={set('adresse')} placeholder="12 rue Danton, Montreuil" autoComplete="off" />
              </Field>
              <Field label="URL de l’annonce *" htmlFor="qa-url" className="col-span-2" hint="Seule l’URL est conservée : l’annonce n’est jamais lue automatiquement.">
                <Input id="qa-url" type="url" value={f.url} onChange={set('url')} placeholder="https://…" />
              </Field>
            </div>
            <button type="button" className="flex items-center gap-1 self-start text-sm text-accent" onClick={() => setMore(!more)} aria-expanded={more}>
              <ChevronDown className={`h-4 w-4 transition-transform ${more ? 'rotate-180' : ''}`} /> Champs optionnels
            </button>
            {more ? (
              <div className="grid grid-cols-2 gap-3">
                <Field label={f.type_actif === 'murs_commerciaux' ? 'Loyer mensuel HT (€)' : 'Loyer mensuel HC (€)'} htmlFor="qa-loyer">
                  <Input id="qa-loyer" inputMode="decimal" value={f.loyer} onChange={set('loyer')} />
                </Field>
                <Field label="Charges de copro. (€/an)" htmlFor="qa-charges">
                  <Input id="qa-charges" inputMode="decimal" value={f.charges_copro} onChange={set('charges_copro')} />
                </Field>
                <Field label="Taxe foncière (€/an)" htmlFor="qa-tf">
                  <Input id="qa-tf" inputMode="decimal" value={f.taxe_fonciere} onChange={set('taxe_fonciere')} />
                </Field>
                <Field label="DPE" htmlFor="qa-dpe">
                  <Select id="qa-dpe" value={f.dpe} onChange={set('dpe')}>
                    <option value="">Inconnu</option>
                    {['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Travaux estimés (€)" htmlFor="qa-travaux">
                  <Input id="qa-travaux" inputMode="decimal" value={f.travaux} onChange={set('travaux')} />
                </Field>
                <Field label="Nombre de lots" htmlFor="qa-lots">
                  <Input id="qa-lots" inputMode="numeric" value={f.nb_lots} onChange={set('nb_lots')} />
                </Field>
                <Field label="Texte de l’annonce (usage personnel)" htmlFor="qa-desc" className="col-span-2">
                  <Textarea id="qa-desc" value={f.description} onChange={set('description')} rows={4} />
                </Field>
              </div>
            ) : null}
            {error ? (
              <p className="text-sm text-danger" role="alert">
                {error}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button type="submit" variant="primary" disabled={pending}>
                {pending ? 'Enregistrement…' : 'Enregistrer et analyser'}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
