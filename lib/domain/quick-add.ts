import { z } from 'zod';
import { isValidUrl } from './url';
import { assetTypeSchema, propertyInputsSchema, type AssetType, type PropertyInputs } from '@/lib/finance/schema';

const declared = (v: number | null | undefined) => (v === null || v === undefined || Number.isNaN(v) ? { valeur: null, statut: 'inconnu' as const } : { valeur: v, statut: 'declare' as const, source: 'Annonce' });

export const quickAddSchema = z.object({
  type_actif: assetTypeSchema,
  prix: z.number().positive('Prix demandé requis'),
  surface: z.number().positive('Surface requise'),
  adresse: z.string().trim().min(2, 'Adresse ou commune requise'),
  url: z.string().trim().refine(isValidUrl, 'URL de l’annonce invalide'),
  loyer: z.number().nonnegative().nullable().optional(),
  charges_copro: z.number().nonnegative().nullable().optional(),
  taxe_fonciere: z.number().nonnegative().nullable().optional(),
  dpe: z.string().regex(/^[A-G]$/).nullable().optional(),
  travaux: z.number().nonnegative().nullable().optional(),
  nb_lots: z.number().int().positive().nullable().optional(),
  description: z.string().max(20000).optional(),
});
export type QuickAdd = z.infer<typeof quickAddSchema>;

export function buildInputs(q: Omit<QuickAdd, 'type_actif' | 'adresse' | 'url'> & { type_actif?: AssetType }): PropertyInputs {
  const inputs = propertyInputsSchema.parse({
    prix: declared(q.prix),
    surface: declared(q.surface),
    loyer: declared(q.loyer),
    charges_copro: declared(q.charges_copro),
    taxe_fonciere: declared(q.taxe_fonciere),
    travaux: declared(q.travaux),
    nb_lots: declared(q.nb_lots),
    description: q.description ?? '',
    dpe: { classe: q.dpe ? { valeur: q.dpe, statut: 'declare', source: 'Annonce' } : { valeur: null, statut: 'inconnu' } },
  });
  if (q.type_actif === 'murs_commerciaux') inputs.murs = propertyInputsSchema.shape.murs.unwrap().parse({ loue: q.loyer !== null && q.loyer !== undefined, loyer_annuel_ht: q.loyer ? { valeur: q.loyer * 12, statut: 'declare', source: 'Annonce (loyer mensuel × 12)' } : undefined });
  if (q.type_actif === 'fonds_commerce') inputs.fonds = propertyInputsSchema.shape.fonds.unwrap().parse({});
  return inputs;
}

