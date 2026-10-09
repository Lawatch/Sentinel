import { amortizationSchedule, type AmortizationRow } from './credit';
import { computeFonds, maxFondsPrice, type FondsNumbers, type FondsResult } from './fonds';
import { REGULATORY_PARAMS } from './fiscal-params';
import type { MarketContext } from './market';
import { breakevenRate, breakevenRent, maxOfferPrice, type OfferResult } from './offer';
import {
  computeRental,
  computeTax,
  debtRatio,
  tenYearEnrichment,
  type RentalNumbers,
  type RentalResult,
  type TaxResult,
} from './residential';
import {
  OUT_OF_SCOPE_TYPES,
  RESIDENTIAL_TYPES,
  type AssetType,
  type NumField,
  type ProfileParams,
  type PropertyInputs,
} from './schema';
import {
  ENGINE_VERSION,
  indicator,
  notComputable,
  type Confidence,
  type FieldStatus,
  type Indicator,
  type ScenarioName,
  type Term,
  type Verdict,
} from './types';

/* ------------------------------------------------------------------ */
/* Résolution des valeurs d'entrée                                     */
/* ------------------------------------------------------------------ */

export interface Resolved {
  label: string;
  valeur: number | null;
  statut: FieldStatus;
  source?: string | null;
}

const known = (f: NumField | undefined): f is NumField & { valeur: number } =>
  !!f && f.valeur !== null && f.statut !== 'inconnu' && Number.isFinite(f.valeur);

const fromField = (label: string, f: NumField | undefined): Resolved =>
  known(f)
    ? { label, valeur: f.valeur, statut: f.statut, source: f.source ?? null }
    : { label, valeur: null, statut: 'inconnu' };

const hypothesis = (label: string, valeur: number, source: string): Resolved => ({
  label,
  valeur,
  statut: 'hypothese',
  source,
});

const orHypothesis = (label: string, f: NumField | undefined, valeur: number | null, source: string): Resolved =>
  known(f) ? fromField(label, f) : valeur === null ? { label, valeur: null, statut: 'inconnu' } : hypothesis(label, valeur, source);

const isWeak = (s: FieldStatus) => s === 'hypothese' || s === 'inconnu';
const fr = (v: number, d = 2) => v.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });

const term = (r: Resolved, unite: Term['unite'] = '€'): Term => ({
  label: r.label,
  valeur: r.valeur,
  unite,
  statut: r.statut,
  source: r.source ?? null,
});

/* ------------------------------------------------------------------ */
/* Types de sortie                                                     */
/* ------------------------------------------------------------------ */

export type AlertLevel = 'bloquant' | 'alerte' | 'info';
export interface Alert {
  niveau: AlertLevel;
  message: string;
}

export interface ScenarioResult {
  nom: ScenarioName;
  hypotheses: Resolved[];
  numbers: RentalNumbers | null;
  result: RentalResult | null;
  impot: TaxResult | null;
  indicateurs: {
    cout_total: Indicator;
    rendement_brut: Indicator;
    rendement_net: Indicator;
    cf_avant_financement: Indicator;
    cf_apres_credit: Indicator;
    cf_apres_impot: Indicator;
  };
}

export interface Header {
  cash_flow_prudent: Indicator;
  prix_max: Indicator;
  ecart_dvf: Indicator;
  confiance: Confidence;
}

export interface RentalAnalysis {
  kind: 'residentiel' | 'murs';
  version_moteur: string;
  entrees: Record<string, Resolved>;
  scenarios: Record<ScenarioName, ScenarioResult>;
  offre: { indicateur: Indicator; resultat: OfferResult | null };
  seuils: { loyer_min: Indicator; taux_max: Indicator };
  enrichissement_10ans: Indicator;
  endettement: Indicator | null;
  ecart_dvf: Indicator;
  amortissement: AmortizationRow[];
  alertes: Alert[];
  confiance: { niveau: Confidence; raisons: string[] };
  verdict: { verdict: Verdict; raisons: string[] };
  header: Header;
}

export interface FondsAnalysis {
  kind: 'fonds';
  version_moteur: string;
  entrees: Record<string, Resolved>;
  resultat: FondsResult | null;
  manquants: string[];
  indicateurs: {
    couverture: Indicator;
    tresorerie: Indicator;
    prix_sur_ebe: Indicator;
    besoin_total: Indicator;
    point_mort: Indicator;
  };
  offre: { indicateur: Indicator };
  alertes: Alert[];
  confiance: { niveau: Confidence; raisons: string[] };
  verdict: { verdict: Verdict; raisons: string[] };
}

export interface OutOfScopeAnalysis {
  kind: 'hors_perimetre';
  version_moteur: string;
  message: string;
}

export type Analysis = RentalAnalysis | FondsAnalysis | OutOfScopeAnalysis;

export interface AnalyzeInput {
  type: AssetType;
  inputs: PropertyInputs;
  profile: ProfileParams;
  market?: MarketContext;
  /** Date de référence (AAAA-MM-JJ) pour le calendrier DPE et les échéances de bail. */
  today: string;
}

/* ------------------------------------------------------------------ */
/* Point d'entrée                                                      */
/* ------------------------------------------------------------------ */

export function analyze(input: AnalyzeInput): Analysis {
  if (OUT_OF_SCOPE_TYPES.includes(input.type)) {
    return {
      kind: 'hors_perimetre',
      version_moteur: ENGINE_VERSION,
      message: 'Analyse juridique, comptable et fiscale dédiée nécessaire : ce type d’opération est hors périmètre de l’outil.',
    };
  }
  if (input.type === 'fonds_commerce') return analyzeFonds(input);
  return analyzeRental(input);
}

/* ------------------------------------------------------------------ */
/* Locatif (résidentiel et murs commerciaux)                           */
/* ------------------------------------------------------------------ */

const monthsBetween = (from: string, to: string) => {
  const a = new Date(from + 'T00:00:00Z');
  const b = new Date(to + 'T00:00:00Z');
  return (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
};

function resolveDeclaredRent(inputs: PropertyInputs): Resolved {
  const lots = inputs.loyers_lots.filter(known);
  if (lots.length > 0) {
    const statut: FieldStatus = lots.every((l) => l.statut === 'verifie')
      ? 'verifie'
      : lots.some((l) => l.statut === 'hypothese')
        ? 'hypothese'
        : 'declare';
    return {
      label: 'Loyer déclaré (somme des lots)',
      valeur: lots.reduce((s, l) => s + l.valeur, 0),
      statut,
      source: `${lots.length} lot(s)`,
    };
  }
  return fromField('Loyer déclaré', inputs.loyer);
}

function analyzeRental(input: AnalyzeInput): RentalAnalysis {
  const { inputs, profile: p, market = {}, type, today } = input;
  const isMurs = type === 'murs_commerciaux';
  const isResidential = RESIDENTIAL_TYPES.includes(type);
  const murs = inputs.murs;

  const prix = fromField('Prix demandé', inputs.prix);
  const surface = fromField('Surface', inputs.surface);
  const S = surface.valeur;

  // Loyer de marché HC (ANIL charges comprises − charges récupérables).
  let recupM2: Resolved;
  if (known(inputs.charges_copro) && S) {
    recupM2 = {
      label: 'Charges récupérables',
      valeur: (inputs.charges_copro.valeur * p.part_recuperable_copro) / 12 / S,
      statut: 'hypothese',
      source: `Charges de copropriété saisies × part récupérable ${Math.round(p.part_recuperable_copro * 100)} % (hypothèse)`,
    };
  } else {
    recupM2 = hypothesis('Charges récupérables', p.charges_recuperables_m2_mois, 'Profil : charges récupérables €/m²/mois');
  }
  const ml = market.loyer;
  const marketOk = !isMurs && ml?.status === 'ok' && ml.loypredm2 !== undefined && S !== null;
  const marketCentral: Resolved = marketOk
    ? {
        label: 'Loyer de marché HC (central)',
        valeur: Math.max(0, (ml!.loypredm2! - recupM2.valeur!) * S!),
        statut: 'estime',
        source: `${ml!.source} ${ml!.millesime ?? ''} : ${fr(ml!.loypredm2!)} €/m² CC − ${fr(recupM2.valeur!)} €/m² de charges récupérables`,
      }
    : { label: 'Loyer de marché HC (central)', valeur: null, statut: 'inconnu' };
  const marketLow: Resolved =
    marketOk && ml!.lwr_m2 !== undefined
      ? {
          label: 'Loyer de marché HC (borne basse)',
          valeur: Math.max(0, (ml!.lwr_m2 - recupM2.valeur!) * S!),
          statut: 'estime',
          source: `${ml!.source} : borne basse de l’intervalle de prédiction ${fr(ml!.lwr_m2)} €/m² CC`,
        }
      : { label: 'Loyer de marché HC (borne basse)', valeur: null, statut: 'inconnu' };

  // Plafond d'encadrement (résidentiel uniquement).
  let plafond: Resolved = { label: 'Plafond d’encadrement', valeur: null, statut: 'inconnu' };
  if (isResidential && S) {
    if (known(inputs.loyer_reference_majore)) {
      plafond = {
        label: 'Plafond d’encadrement',
        valeur: inputs.loyer_reference_majore.valeur * S,
        statut: inputs.loyer_reference_majore.statut,
        source: `Loyer de référence majoré saisi ${fr(inputs.loyer_reference_majore.valeur, 1)} €/m² × ${fr(S, 1)} m²`,
      };
    } else if (market.encadrement?.status === 'ok' && market.encadrement.applicable && market.encadrement.ref_majore_m2) {
      plafond = {
        label: 'Plafond d’encadrement',
        valeur: market.encadrement.ref_majore_m2 * S,
        statut: 'estime',
        source: `${market.encadrement.source} ${market.encadrement.millesime ?? ''} : ${fr(market.encadrement.ref_majore_m2, 1)} €/m² × ${fr(S, 1)} m²`,
      };
    }
  }

  // Loyer déclaré : résidentiel (mensuel HC) ou murs (annuel HT → mensuel).
  let declared: Resolved;
  let marketForMurs: Resolved = { label: 'Loyer de marché saisi', valeur: null, statut: 'inconnu' };
  if (isMurs && murs) {
    const cur = fromField('Loyer contractuel HT', murs.loyer_annuel_ht);
    declared = murs.loue
      ? { ...cur, label: 'Loyer contractuel HT (mensuel)', valeur: cur.valeur === null ? null : cur.valeur / 12 }
      : { label: 'Loyer contractuel HT (mensuel)', valeur: null, statut: 'inconnu' };
    const mk = fromField('Loyer de marché HT', murs.loyer_marche_annuel_ht);
    marketForMurs = { ...mk, label: 'Loyer de marché HT (mensuel)', valeur: mk.valeur === null ? null : mk.valeur / 12 };
  } else {
    declared = resolveDeclaredRent(inputs);
  }

  const minOf = (label: string, xs: Resolved[]): Resolved => {
    const ok = xs.filter((x) => x.valeur !== null);
    const missing = xs.filter((x) => x.valeur === null).map((x) => x.label.toLowerCase());
    if (ok.length === 0) return { label, valeur: null, statut: 'inconnu' };
    const best = ok.reduce((a, b) => (b.valeur! < a.valeur! ? b : a));
    const source =
      ok.length === 1
        ? `${best.label} (seule valeur disponible${missing.length ? ` ; indisponible : ${missing.join(', ')}` : ''})`
        : `Minimum de : ${ok.map((x) => x.label.toLowerCase()).join(', ')} → ${best.label.toLowerCase()}`;
    return { ...best, label, source };
  };

  const rentFor = (s: ScenarioName): Resolved => {
    if (isMurs) {
      if (s === 'prudent') return minOf('Loyer retenu', [declared, marketForMurs]);
      if (s === 'central') return declared.valeur !== null ? { ...declared, label: 'Loyer retenu' } : { ...marketForMurs, label: 'Loyer retenu' };
      return declared.valeur !== null ? { ...declared, label: 'Loyer retenu' } : { ...marketForMurs, label: 'Loyer retenu' };
    }
    if (s === 'prudent') return minOf('Loyer retenu', [declared, marketLow, plafond]);
    if (s === 'central')
      return declared.valeur !== null ? { ...declared, label: 'Loyer retenu' } : { ...marketCentral, label: 'Loyer retenu' };
    return declared.valeur !== null ? { ...declared, label: 'Loyer retenu' } : { ...marketCentral, label: 'Loyer retenu' };
  };

  // Charges et coûts.
  const perM2 = (label: string, f: NumField | undefined, rate: number, src: string) =>
    orHypothesis(label, f, S === null ? null : rate * S, src);
  let taxeFonciere = perM2('Taxe foncière', inputs.taxe_fonciere, p.taxe_fonciere_m2_an, `Profil : ${p.taxe_fonciere_m2_an} €/m²/an`);
  let copro: Resolved;
  if (isMurs && murs) {
    copro = orHypothesis('Charges non refacturées', murs.charges_annuelles, 0, 'Aucune charge saisie (hypothèse)');
  } else if (known(inputs.charges_copro_non_recup)) {
    copro = fromField('Copropriété non récupérable', inputs.charges_copro_non_recup);
  } else if (known(inputs.charges_copro)) {
    copro = {
      label: 'Copropriété non récupérable',
      valeur: inputs.charges_copro.valeur * (1 - p.part_recuperable_copro),
      statut: inputs.charges_copro.statut,
      source: `Charges totales × (1 − part récupérable ${Math.round(p.part_recuperable_copro * 100)} %, hypothèse)`,
    };
  } else if (type === 'maison') {
    copro = hypothesis('Copropriété non récupérable', 0, 'Maison : pas de copropriété supposée');
  } else {
    copro =
      S === null
        ? { label: 'Copropriété non récupérable', valeur: null, statut: 'inconnu' }
        : hypothesis(
            'Copropriété non récupérable',
            p.charges_copro_m2_an * S * (1 - p.part_recuperable_copro),
            `Profil : ${p.charges_copro_m2_an} €/m²/an × (1 − ${Math.round(p.part_recuperable_copro * 100)} %)`,
          );
  }
  const travaux = orHypothesis('Travaux', inputs.travaux, 0, 'Aucun travaux saisis (hypothèse)');
  const remiseEnEtat = isMurs && murs ? fromField('Travaux de remise en état', murs.travaux_remise_en_etat) : null;
  const pno = hypothesis('Assurance PNO', p.pno_annuelle, 'Profil');
  const entretien = S === null ? { label: 'Provision d’entretien', valeur: null, statut: 'inconnu' as const } : hypothesis('Provision d’entretien', p.entretien_m2_an * S, `Profil : ${p.entretien_m2_an} €/m²/an`);
  const fraisBancaires = orHypothesis('Frais bancaires', inputs.frais_bancaires, p.frais_bancaires, 'Profil');
  const honoraires: Resolved = inputs.honoraires_inclus
    ? { label: 'Honoraires d’agence', valeur: 0, statut: 'declare', source: 'Inclus dans le prix' }
    : fromField('Honoraires d’agence', inputs.honoraires_agence);
  const mobilier = inputs.meuble
    ? orHypothesis('Mobilier', inputs.mobilier, p.mobilier_defaut, 'Profil')
    : { label: 'Mobilier', valeur: 0, statut: 'declare' as const, source: 'Location nue' };
  const tauxNotaire = hypothesis(
    'Taux de frais de notaire',
    inputs.neuf ? p.frais_notaire_neuf : p.frais_notaire_ancien,
    inputs.neuf ? 'Profil (neuf)' : 'Profil (ancien)',
  );
  const vacanceCentral = hypothesis('Vacance', p.vacance, 'Profil');
  const tauxCentral = hypothesis('Taux nominal', p.taux_credit, 'Profil');

  // Murs : refacturation au locataire.
  const refact = (tri: 'oui' | 'non' | 'inconnu' | undefined, s: ScenarioName) =>
    tri === 'oui' ? true : tri === 'non' ? false : s === 'favorable';
  if (isMurs && murs && refact(murs.refacturation_tf, 'central')) {
    taxeFonciere = { ...taxeFonciere, label: 'Taxe foncière (refacturée)', valeur: 0 };
  }

  const entrees: Record<string, Resolved> = {
    prix,
    surface,
    loyer_declare: declared,
    loyer_marche: isMurs ? marketForMurs : marketCentral,
    loyer_marche_bas: marketLow,
    plafond_encadrement: plafond,
    taxe_fonciere: taxeFonciere,
    copro,
    travaux,
    frais_bancaires: fraisBancaires,
    honoraires,
    mobilier,
    taux_notaire: tauxNotaire,
    vacance: vacanceCentral,
    taux_credit: tauxCentral,
    apport: hypothesis('Apport', p.apport, 'Profil'),
    pno,
    entretien,
    ...(remiseEnEtat ? { remise_en_etat: remiseEnEtat } : {}),
  };

  // Vacance prudente des murs : relocation à la prochaine échéance du bail.
  const mursVacancePrudente = (): Resolved => {
    const vacMois = p.murs.vacance_relocation_mois;
    let horizon = p.murs.horizon_min_mois;
    let src = `${vacMois} mois de vacance sur un horizon de ${horizon} mois`;
    if (murs?.loue) {
      const echeance = murs.prochaine_triennale ?? murs.fin_bail;
      if (echeance) {
        horizon = Math.max(horizon, monthsBetween(today, echeance) + vacMois);
        src = `${vacMois} mois de vacance à la prochaine échéance (${echeance}), horizon ${horizon} mois`;
      } else {
        src += ' (échéance du bail inconnue)';
      }
    } else {
      src = `Local libre : ${vacMois} mois de vacance sur ${horizon} mois`;
    }
    const v = Math.max(p.vacance + p.scenarios.prudent_vacance_plus, vacMois / horizon);
    return hypothesis('Vacance', v, src);
  };

  const scenarioHyp = (s: ScenarioName) => {
    const loyer = rentFor(s);
    const vacance: Resolved =
      s === 'prudent'
        ? isMurs
          ? mursVacancePrudente()
          : hypothesis('Vacance', p.vacance + p.scenarios.prudent_vacance_plus, `Profil + ${fr(p.scenarios.prudent_vacance_plus * 100, 0)} points`)
        : s === 'favorable'
          ? hypothesis('Vacance', Math.max(0, p.vacance - p.scenarios.favorable_vacance_moins), `Profil − ${fr(p.scenarios.favorable_vacance_moins * 100, 0)} points (minimum 0)`)
          : vacanceCentral;
    const baseTravaux = travaux.valeur ?? 0;
    const extra = s === 'prudent' && remiseEnEtat?.valeur ? remiseEnEtat.valeur : 0;
    const trav: Resolved =
      s === 'prudent'
        ? {
            ...travaux,
            label: 'Travaux',
            valeur: baseTravaux * (1 + p.scenarios.prudent_travaux_plus) + extra,
            source: `Saisis + ${fr(p.scenarios.prudent_travaux_plus * 100, 0)} %${extra ? ' + remise en état' : ''}`,
          }
        : travaux;
    const taux: Resolved =
      s === 'prudent'
        ? hypothesis('Taux nominal', p.taux_credit + p.scenarios.prudent_taux_plus, `Profil + ${fr(p.scenarios.prudent_taux_plus * 100, 1)} point`)
        : tauxCentral;
    let tf = taxeFonciere;
    let cop = copro;
    if (isMurs && murs) {
      const tfBase = orHypothesis('Taxe foncière', inputs.taxe_fonciere, S === null ? null : p.taxe_fonciere_m2_an * S, 'Profil');
      tf = refact(murs.refacturation_tf, s) ? { ...tfBase, label: 'Taxe foncière (refacturée)', valeur: 0 } : tfBase;
      cop = refact(murs.refacturation_charges, s) ? { ...copro, label: 'Charges (refacturées)', valeur: 0 } : copro;
    }
    return { loyer, vacance, travaux: trav, taux, tf, cop };
  };

  const buildNumbers = (h: ReturnType<typeof scenarioHyp>): { n: RentalNumbers | null; missing: string[] } => {
    const required: Resolved[] = [prix, h.loyer, h.tf, h.cop, entretien, honoraires];
    const missing = required
      .filter((r) => r.valeur === null)
      .map((r) => (r === h.loyer ? 'Loyer (déclaré ou de marché)' : r.label));
    if (missing.length) return { n: null, missing };
    return {
      missing: [],
      n: {
        prix: prix.valeur!,
        taux_notaire: tauxNotaire.valeur!,
        honoraires_agence: honoraires.valeur!,
        honoraires_inclus: inputs.honoraires_inclus,
        travaux: h.travaux.valeur!,
        frais_bancaires: fraisBancaires.valeur!,
        mobilier: mobilier.valeur!,
        apport: p.apport,
        taux_credit: h.taux.valeur!,
        duree_mois: p.duree_credit_mois,
        assurance_taux: p.assurance_taux,
        assurance_mode: p.assurance_mode,
        loyer_mensuel_hc: h.loyer.valeur!,
        vacance: h.vacance.valeur!,
        taxe_fonciere: h.tf.valeur!,
        copro_non_recup: h.cop.valeur!,
        pno: pno.valeur!,
        gestion_taux: p.gestion,
        entretien: entretien.valeur!,
        gli_taux: p.gli,
      },
    };
  };

  const scenarios = {} as Record<ScenarioName, ScenarioResult>;
  for (const s of ['prudent', 'central', 'favorable'] as ScenarioName[]) {
    const h = scenarioHyp(s);
    const { n, missing } = buildNumbers(h);
    const hyps = [h.loyer, h.vacance, h.travaux, h.taux];
    if (!n) {
      const nc = (f: string) => notComputable(missing, f);
      scenarios[s] = {
        nom: s,
        hypotheses: hyps,
        numbers: null,
        result: null,
        impot: null,
        indicateurs: {
          cout_total: prix.valeur === null ? nc('Prix + frais + travaux') : notComputable(missing.filter((m) => m === 'Honoraires d’agence'), 'Prix + frais + travaux'),
          rendement_brut: nc('Loyer HC annuel théorique / prix d’achat'),
          rendement_net: nc('RNE / coût total du projet'),
          cf_avant_financement: nc('RNE / 12'),
          cf_apres_credit: nc('(RNE − mensualités × 12 − assurance annuelle) / 12'),
          cf_apres_impot: nc('Cash-flow après crédit − impôt / 12'),
        },
      };
      continue;
    }
    const r = computeRental(n);
    const tax =
      p.regime_fiscal !== 'aucun' && p.tmi !== null
        ? computeTax({ regime: p.regime_fiscal, tmi: p.tmi, n, r, lmnp: p.lmnp })
        : null;
    const loyerTerm = term({ ...h.loyer, label: 'Loyer HC mensuel' }, '€/mois');
    scenarios[s] = {
      nom: s,
      hypotheses: hyps,
      numbers: n,
      result: r,
      impot: tax,
      indicateurs: {
        cout_total: indicator(
          r.cout_total,
          'Prix + frais de notaire + honoraires acquéreur + travaux + frais bancaires + mobilier',
          r.cout_lignes.map((l) => ({ label: l.label, valeur: l.montant, unite: '€' as const })),
        ),
        rendement_brut: indicator(r.rendement_brut, 'Loyer HC annuel théorique / prix d’achat', [
          { label: 'Loyer HC annuel théorique', valeur: r.loyer_annuel_theorique, unite: '€/an', statut: h.loyer.statut },
          term(prix),
        ]),
        rendement_net: indicator(r.rendement_net, 'RNE / coût total du projet (avant financement et avant impôt)', [
          { label: 'RNE', valeur: r.rne, unite: '€/an' },
          { label: 'Coût total du projet', valeur: r.cout_total, unite: '€' },
        ]),
        cf_avant_financement: indicator(r.cf_avant_financement, 'RNE / 12, avec RNE = loyer HC × 12 × (1 − vacance) − charges non récupérables', [
          loyerTerm,
          { label: 'Vacance', valeur: h.vacance.valeur! * 100, unite: '%', statut: h.vacance.statut, source: h.vacance.source },
          { label: 'Revenu effectif annuel', valeur: r.revenu_effectif, unite: '€/an' },
          ...r.charges_lignes.map((l) => ({ label: l.label, valeur: -l.montant, unite: '€/an' as const })),
          { label: 'RNE', valeur: r.rne, unite: '€/an' },
        ]),
        cf_apres_credit: indicator(r.cf_apres_credit, '(RNE − mensualités × 12 − assurance emprunteur annuelle) / 12', [
          { label: 'RNE', valeur: r.rne, unite: '€/an' },
          { label: 'Capital emprunté (coût total − apport)', valeur: r.capital, unite: '€' },
          { label: `Mensualité hors assurance (${(n.taux_credit * 100).toFixed(2)} %, ${n.duree_mois} mois)`, valeur: r.mensualite, unite: '€/mois', statut: h.taux.statut },
          { label: 'Assurance emprunteur annuelle', valeur: r.assurance_annuelle, unite: '€/an', statut: 'hypothese' },
        ]),
        cf_apres_impot: tax
          ? indicator(
              r.cf_apres_credit - tax.impot / 12,
              'Cash-flow après crédit − impôt estimé de l’année 1 / 12 (estimation simplifiée, à valider avec un conseil)',
              [
                { label: 'Cash-flow après crédit', valeur: r.cf_apres_credit, unite: '€/mois' },
                { label: 'Base imposable', valeur: tax.base, unite: '€/an' },
                { label: 'Taux (TMI + prélèvements sociaux)', valeur: tax.taux * 100, unite: '%', statut: 'hypothese' },
                { label: 'Impôt estimé', valeur: tax.impot, unite: '€/an' },
              ],
              tax.notes.join(' '),
            )
          : notComputable(['Régime fiscal', 'TMI'], 'Renseignez un régime fiscal et une TMI dans le profil'),
      },
    };
  }

  const prudent = scenarios.prudent;
  const central = scenarios.central;

  // Prix d'offre maximal sur le scénario prudent.
  let offre: RentalAnalysis['offre'];
  if (prudent.numbers) {
    const o = maxOfferPrice(prudent.numbers, p.cash_flow_cible);
    offre = {
      resultat: o,
      indicateur: o.atteignable
        ? indicator(
            o.prix_max,
            'Prix P tel que le cash-flow mensuel avant impôt du scénario prudent = cible (frais de notaire et capital recalculés, apport constant)',
            [
              { label: 'Cash-flow cible', valeur: p.cash_flow_cible, unite: '€/mois', statut: 'hypothese' },
              { label: 'Prix demandé', valeur: o.prix_demande, unite: '€' },
              { label: 'Capital emprunté au prix maximal', valeur: o.capital, unite: '€' },
              { label: 'Écart au prix demandé', valeur: o.ecart * 100, unite: '%' },
            ],
          )
        : notComputable([], 'Prix tel que cash-flow prudent = cible', 'Objectif inatteignable avec ces hypothèses.'),
    };
  } else {
    offre = { resultat: null, indicateur: prudent.indicateurs.cf_apres_credit };
  }

  // Seuils de bascule et enrichissement (scénario central).
  let seuils: RentalAnalysis['seuils'];
  let enrichissement: Indicator;
  let amortissement: AmortizationRow[] = [];
  if (central.numbers && central.result) {
    const n = central.numbers;
    const lmin = breakevenRent(n);
    const tmax = breakevenRate(n);
    seuils = {
      loyer_min:
        lmin === null
          ? notComputable([], 'Loyer HC tel que cash-flow avant impôt = 0', 'Aucun loyer ne permet un cash-flow nul avec ces hypothèses.')
          : indicator(lmin, 'Loyer HC mensuel tel que le cash-flow avant impôt (scénario central) = 0', [
              { label: 'Loyer retenu (central)', valeur: n.loyer_mensuel_hc, unite: '€/mois' },
            ]),
      taux_max:
        tmax === null
          ? notComputable([], 'Taux nominal tel que cash-flow avant impôt = 0', 'Cash-flow négatif même à 0 % : aucun taux ne l’annule.')
          : indicator(tmax, 'Taux nominal maximal tel que le cash-flow avant impôt (scénario central) = 0', [
              { label: 'Taux du profil', valeur: n.taux_credit * 100, unite: '%', statut: 'hypothese' },
            ]),
    };
    const e = tenYearEnrichment(n, central.result);
    enrichissement = indicator(e.total, 'Capital remboursé cumulé sur 10 ans + cash-flows cumulés avant impôt, sans revente ni indexation', [
      { label: 'Capital remboursé cumulé', valeur: e.capital_rembourse, unite: '€' },
      { label: 'Cash-flows cumulés avant impôt', valeur: e.cashflows_cumules, unite: '€' },
    ]);
    amortissement = central.result.capital > 0 ? amortizationSchedule(central.result.capital, n.taux_credit, n.duree_mois, n.assurance_taux, n.assurance_mode) : [];
  } else {
    const nc = notComputable(central.indicateurs.cf_apres_credit.ok ? [] : central.indicateurs.cf_apres_credit.manquants, '—');
    seuils = { loyer_min: nc, taux_max: nc };
    enrichissement = nc;
  }

  // Finançabilité (optionnelle).
  let endettement: Indicator | null = null;
  if (p.revenus_foyer_mensuels !== null && central.result && central.numbers) {
    const mens = central.result.mensualite + central.result.assurance_annuelle / 12;
    const ratio = debtRatio({
      revenus_mensuels: p.revenus_foyer_mensuels,
      mensualites_existantes: p.mensualites_existantes ?? 0,
      nouvelle_mensualite_assurance_comprise: mens,
      loyer_mensuel: central.numbers.loyer_mensuel_hc,
      ponderation_loyers: p.hcsf.ponderation_loyers,
    });
    endettement = indicator(ratio, '(mensualités existantes + nouvelle mensualité assurance comprise) / (revenus + pondération × loyers)', [
      { label: 'Mensualités existantes', valeur: p.mensualites_existantes ?? 0, unite: '€/mois', statut: 'hypothese' },
      { label: 'Nouvelle mensualité assurance comprise', valeur: mens, unite: '€/mois' },
      { label: 'Revenus nets du foyer', valeur: p.revenus_foyer_mensuels, unite: '€/mois', statut: 'hypothese' },
      { label: `Loyers pondérés à ${Math.round(p.hcsf.ponderation_loyers * 100)} %`, valeur: central.numbers.loyer_mensuel_hc * p.hcsf.ponderation_loyers, unite: '€/mois' },
      { label: 'Plafond HCSF', valeur: p.hcsf.taux_max * 100, unite: '%' },
    ]);
  }

  // Écart du prix au m² à la médiane DVF (résidentiel uniquement).
  let ecart_dvf: Indicator;
  const dvf = market.dvf;
  if (isMurs) {
    ecart_dvf = notComputable([], 'Prix au m² / médiane DVF − 1', 'Locaux commerciaux : ventes DVF affichées à titre indicatif, sans estimation.');
  } else if (!dvf || dvf.status === 'non_demande') {
    ecart_dvf = notComputable(['Comparables DVF'], 'Prix au m² / médiane DVF − 1');
  } else if (dvf.status !== 'ok' || dvf.mediane_m2 === undefined) {
    ecart_dvf = notComputable(
      [],
      'Prix au m² / médiane DVF − 1',
      dvf.status === 'indisponible' ? 'Source DVF indisponible.' : dvf.message ?? 'Comparables insuffisants.',
    );
  } else if (prix.valeur === null || S === null) {
    ecart_dvf = notComputable(['Prix', 'Surface'].filter((x, i) => (i === 0 ? prix.valeur === null : S === null)), 'Prix au m² / médiane DVF − 1');
  } else {
    const pm2 = prix.valeur / S;
    ecart_dvf = indicator((pm2 - dvf.mediane_m2) / dvf.mediane_m2, '(prix demandé / surface − médiane DVF au m²) / médiane', [
      { label: 'Prix demandé au m²', valeur: pm2, unite: '€/m²', statut: prix.statut },
      { label: `Médiane DVF (${dvf.n} ventes, ${dvf.perimetre ?? ''})`, valeur: dvf.mediane_m2, unite: '€/m²', statut: 'estime', source: dvf.source },
      { label: 'P25', valeur: dvf.p25_m2 ?? null, unite: '€/m²' },
      { label: 'P75', valeur: dvf.p75_m2 ?? null, unite: '€/m²' },
    ]);
  }

  // Alertes et points bloquants.
  const alertes: Alert[] = [];
  if (isResidential) {
    alertes.push(...dpeAlerts(inputs, today));
    if (plafond.valeur !== null && declared.valeur !== null && declared.valeur > plafond.valeur + 1e-9) {
      // Un plafond issu de données ouvertes anciennes (antérieures à l'année précédente) ne suffit pas à bloquer.
      const millesime = Number(market.encadrement?.millesime ?? NaN);
      const ancien = plafond.statut === 'estime' && Number.isFinite(millesime) && millesime < Number(today.slice(0, 4)) - 1;
      alertes.push(
        ancien
          ? {
              niveau: 'alerte',
              message: `Loyer déclaré (${Math.round(declared.valeur)} €) supérieur au plafond calculé avec les données ${millesime} (${Math.round(plafond.valeur)} €) : vérifiez le loyer de référence majoré en vigueur.`,
            }
          : {
              niveau: 'bloquant',
              message: `Loyer déclaré (${Math.round(declared.valeur)} €) supérieur au plafond d’encadrement (${Math.round(plafond.valeur)} €).`,
            },
      );
    }
    if (market.encadrement?.applicable && market.encadrement.message) alertes.push({ niveau: 'info', message: market.encadrement.message });
    if (marketOk) {
      if (ml!.typpred === 'maille')
        alertes.push({ niveau: 'info', message: 'Loyer de marché issu d’une maille plus large que la commune (peu d’annonces locales).' });
      if (S !== null && S < 35)
        alertes.push({
          niveau: 'info',
          message: 'L’indicateur de loyer vise un bien type et sous-estime souvent le loyer au m² des petites surfaces.',
        });
    }
  }
  if (isMurs && murs?.loue) {
    alertes.push({ niveau: 'alerte', message: 'Locataire unique : risque de concentration du revenu.' });
    if (murs.loyer_annuel_ht.statut !== 'verifie')
      alertes.push({ niveau: 'info', message: 'Revenu à risque : le loyer reste « déclaré » tant que le bail n’est pas joint.' });
  }
  for (const it of market.risques?.items ?? []) {
    if (it.notable) alertes.push({ niveau: 'alerte', message: `Risque notable (Géorisques) : ${it.libelle}${it.detail ? ` — ${it.detail}` : ''}` });
  }
  if (endettement?.ok) {
    if (endettement.valeur > p.hcsf.taux_max)
      alertes.push({ niveau: 'alerte', message: `Taux d’endettement ${(endettement.valeur * 100).toFixed(1)} % supérieur au plafond HCSF de ${p.hcsf.taux_max * 100} %.` });
  }
  if (p.duree_credit_mois > p.hcsf.duree_max_mois)
    alertes.push({ niveau: 'alerte', message: `Durée de crédit supérieure aux ${p.hcsf.duree_max_mois / 12} ans recommandés par le HCSF.` });
  const budgetDepasse = p.budget_max !== null && prix.valeur !== null && prix.valeur > p.budget_max;
  if (budgetDepasse) alertes.push({ niveau: 'bloquant', message: `Prix demandé supérieur au budget maximal du profil (${p.budget_max} €).` });

  // Confiance.
  const loyerCentral = central.hypotheses[0];
  const keyFields: Resolved[] = isMurs
    ? [loyerCentral, entrees.taxe_fonciere, copro, travaux]
    : [loyerCentral, entrees.taxe_fonciere, copro, travaux];
  const confiance = confidenceOf(
    keyFields,
    isMurs ? null : dvf?.status === 'ok' ? dvf.n : 0,
    isMurs || dvf?.status === 'ok' || dvf?.status === 'insuffisant' ? undefined : dvf?.status === 'indisponible' ? 'DVF indisponible' : 'comparables DVF non disponibles',
  );

  // Verdict.
  const verdict = verdictOf({
    alertes,
    cf: prudent.indicateurs.cf_apres_credit,
    cible: p.cash_flow_cible,
    confiance: confiance.niveau,
    offre: offre.resultat,
    ecartMax: p.verdict.ecart_max_negociation,
  });

  return {
    kind: isMurs ? 'murs' : 'residentiel',
    version_moteur: ENGINE_VERSION,
    entrees,
    scenarios,
    offre,
    seuils,
    enrichissement_10ans: enrichissement,
    endettement,
    ecart_dvf,
    amortissement,
    alertes,
    confiance,
    verdict,
    header: {
      cash_flow_prudent: prudent.indicateurs.cf_apres_credit,
      prix_max: offre.indicateur,
      ecart_dvf,
      confiance: confiance.niveau,
    },
  };
}

/* ------------------------------------------------------------------ */
/* DPE                                                                 */
/* ------------------------------------------------------------------ */

export function dpeAlerts(inputs: PropertyInputs, today: string): Alert[] {
  const out: Alert[] = [];
  const classe = inputs.dpe.classe.valeur?.toUpperCase() ?? null;
  if (!classe || inputs.dpe.classe.statut === 'inconnu') {
    out.push({ niveau: 'info', message: 'DPE inconnu : les interdictions de location ne peuvent pas être vérifiées.' });
    return out;
  }
  const renovation = inputs.travaux_renovation_energetique && (inputs.travaux.valeur ?? 0) > 0;
  for (const rule of REGULATORY_PARAMS.dpe.interdiction) {
    if (rule.classe !== classe) continue;
    const enVigueur = today >= rule.date;
    if (classe === 'G') {
      out.push(
        renovation
          ? { niveau: 'alerte', message: 'DPE G : location interdite pour un nouveau bail ; travaux de rénovation saisis, à valider par un nouveau DPE.' }
          : { niveau: 'bloquant', message: 'DPE G : location interdite pour un nouveau bail (depuis le 1er janvier 2025).' },
      );
    } else if (classe === 'F') {
      out.push({
        niveau: 'alerte',
        message: `DPE F : interdiction de louer au 1er janvier 2028${enVigueur ? ' (en vigueur)' : ''} et gel des loyers.`,
      });
    } else if (classe === 'E') {
      out.push({ niveau: 'alerte', message: `DPE E : interdiction de louer au 1er janvier 2034${enVigueur ? ' (en vigueur)' : ''}.` });
    }
  }
  const date = inputs.dpe.date.valeur;
  const energie = (inputs.dpe.energie_chauffage.valeur ?? '').toLowerCase();
  if (date && date < REGULATORY_PARAMS.dpe.changement_coefficient_electricite && energie.includes('lectri')) {
    out.push({
      niveau: 'info',
      message:
        'DPE antérieur à 2026 d’un logement chauffé à l’électricité : un reclassement est possible depuis le changement de coefficient de conversion du 1er janvier 2026 (attestation sur l’observatoire DPE de l’ADEME).',
    });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Confiance et verdict                                                */
/* ------------------------------------------------------------------ */

export function confidenceOf(keyFields: Resolved[], comparables: number | null, comparablesNote?: string): { niveau: Confidence; raisons: string[] } {
  const raisons: string[] = [];
  const [loyer] = keyFields;
  const hyp = keyFields.filter((f) => f.statut === 'hypothese');
  const unknown = keyFields.filter((f) => f.statut === 'inconnu');
  const weak = keyFields.filter((f) => isWeak(f.statut));
  if (isWeak(loyer.statut)) raisons.push(`${loyer.label} : ${loyer.statut === 'inconnu' ? 'inconnu' : 'hypothèse'}`);
  if (hyp.length >= 2) raisons.push(`${hyp.length} champs clés en hypothèse (${hyp.map((h) => h.label.toLowerCase()).join(', ')})`);
  if (comparables !== null && comparables < 5) raisons.push(comparablesNote ?? `${comparables} comparable(s) DVF (moins de 5)`);
  if (isWeak(loyer.statut) || hyp.length >= 2 || (comparables !== null && comparables < 5)) return { niveau: 'C', raisons };
  if (weak.length === 0 && (comparables === null || comparables >= 8)) {
    return { niveau: 'A', raisons: ['Champs clés documentés' + (comparables === null ? '' : ` et ${comparables} comparables DVF`)] };
  }
  if (weak.length) raisons.push(`Champ(s) clé(s) non documenté(s) : ${weak.map((w) => w.label.toLowerCase()).join(', ')}`);
  if (unknown.length === 0 && comparables !== null && comparables < 8) raisons.push(`${comparables} comparables DVF (moins de 8)`);
  return { niveau: 'B', raisons };
}

export function verdictOf(x: {
  alertes: Alert[];
  cf: Indicator;
  cible: number;
  confiance: Confidence;
  offre: { atteignable: boolean; ecart?: number } | null;
  ecartMax: number;
}): { verdict: Verdict; raisons: string[] } {
  const bloquants = x.alertes.filter((a) => a.niveau === 'bloquant');
  if (bloquants.length) return { verdict: 'hors_criteres', raisons: bloquants.map((b) => b.message) };
  if (!x.cf.ok) return { verdict: 'donnees_insuffisantes', raisons: [`Cash-flow non calculable : manque ${x.cf.manquants.join(', ').toLowerCase()}`] };
  if (x.confiance === 'C') return { verdict: 'donnees_insuffisantes', raisons: ['Confiance C : hypothèses trop fragiles pour conclure'] };
  if (x.cf.valeur >= x.cible - 1e-9) return { verdict: 'a_visiter', raisons: ['Cash-flow prudent ≥ cible, aucun point bloquant'] };
  if (x.offre?.atteignable && x.offre.ecart !== undefined && x.offre.ecart >= -x.ecartMax - 1e-12)
    return { verdict: 'a_negocier', raisons: [`Cible atteinte à ${(x.offre.ecart * 100).toFixed(1)} % sous le prix demandé`] };
  return {
    verdict: 'hors_criteres',
    raisons: [
      x.offre?.atteignable
        ? `Cible atteinte seulement à ${(x.offre.ecart! * 100).toFixed(1)} % du prix demandé (au-delà de ${x.ecartMax * 100} %)`
        : 'Objectif inatteignable avec ces hypothèses',
    ],
  };
}

/* ------------------------------------------------------------------ */
/* Fonds de commerce                                                   */
/* ------------------------------------------------------------------ */

function analyzeFonds(input: AnalyzeInput): FondsAnalysis {
  const { inputs, profile: p } = input;
  const f = inputs.fonds;
  const missingAll = (m: string[]) => {
    const nc = (formule: string) => notComputable(m, formule);
    return {
      couverture: nc('(EBE retraité − maintien) / annuité'),
      tresorerie: nc('EBE retraité − maintien − annuité'),
      prix_sur_ebe: nc('Prix / EBE retraité'),
      besoin_total: nc('Prix + frais + stock non inclus + investissements + BFR'),
      point_mort: nc('CA tel que trésorerie = 0'),
    };
  };
  const prix = fromField('Prix de cession', inputs.prix);
  if (!f) {
    const m = ['Données du fonds'];
    return {
      kind: 'fonds',
      version_moteur: ENGINE_VERSION,
      entrees: { prix },
      resultat: null,
      manquants: m,
      indicateurs: missingAll(m),
      offre: { indicateur: notComputable(m, 'Prix maximal') },
      alertes: [],
      confiance: { niveau: 'C', raisons: ['Données du fonds non saisies'] },
      verdict: { verdict: 'donnees_insuffisantes', raisons: ['Données du fonds non saisies'] },
    };
  }
  const lastIdx = (arr: NumField[]) => {
    for (let i = arr.length - 1; i >= 0; i--) if (known(arr[i])) return i;
    return -1;
  };
  const caIdx = lastIdx(f.ca);
  const ebeIdx = lastIdx(f.ebe);
  const ca = caIdx >= 0 ? fromField('Chiffre d’affaires (dernier exercice)', f.ca[caIdx]) : { label: 'Chiffre d’affaires', valeur: null, statut: 'inconnu' as const };
  const caPrev = caIdx > 0 && known(f.ca[caIdx - 1]) ? f.ca[caIdx - 1].valeur : null;
  const ebe = ebeIdx >= 0 ? fromField('EBE comptable (dernier exercice)', f.ebe[ebeIdx]) : { label: 'EBE comptable', valeur: null, statut: 'inconnu' as const };
  const entrees: Record<string, Resolved> = {
    prix,
    ca,
    ebe,
    remuneration_cedant: orHypothesis('Rémunération du cédant comptabilisée', f.remuneration_cedant, 0, 'Aucune saisie (hypothèse 0)'),
    remuneration_cible: fromField('Rémunération cible du repreneur', f.remuneration_cible),
    loyer: fromField('Loyer annuel', f.loyer_annuel),
    bfr: fromField('BFR initial', f.bfr),
    stock: orHypothesis('Stock', f.stock, 0, 'Aucune saisie (hypothèse 0)'),
    honoraires: orHypothesis('Honoraires', f.honoraires, 0, 'Aucune saisie (hypothèse 0)'),
    investissements_initiaux: orHypothesis('Investissements initiaux', f.investissements_initiaux, 0, 'Aucune saisie (hypothèse 0)'),
    investissements_maintien: orHypothesis('Investissements de maintien annuels', f.investissements_maintien, 0, 'Aucune saisie (hypothèse 0)'),
    pret_montant: fromField('Montant du prêt', f.pret_montant),
    pret_taux: orHypothesis('Taux du prêt', f.pret_taux, p.taux_credit, 'Profil'),
    pret_duree: orHypothesis('Durée du prêt (mois)', f.pret_duree_mois, p.duree_credit_mois, 'Profil'),
    taux_marge_cv: orHypothesis('Taux de marge sur coûts variables', f.taux_marge_cv, p.fonds.taux_marge_cv_defaut, 'Profil'),
    apport: orHypothesis('Apport', f.apport, p.apport, 'Profil'),
  };
  const required = ['prix', 'ca', 'ebe', 'remuneration_cible', 'loyer', 'bfr'];
  // Le prêt est requis ; à défaut, il découle de l'apport.
  const manquants = required.filter((k) => entrees[k].valeur === null).map((k) => entrees[k].label);
  const keyFields = [entrees.ca, entrees.ebe, entrees.loyer, entrees.bfr];
  const confiance = (() => {
    const c = confidenceOf([entrees.ca, entrees.ebe, entrees.loyer, entrees.bfr], null);
    // Pour un fonds, CA et EBE restent « déclarés » tant que les liasses ne sont pas jointes : on le rappelle.
    if (keyFields.some((k) => k.statut === 'declare')) c.raisons.push('CA / EBE déclarés : liasses fiscales à obtenir');
    return c;
  })();
  if (manquants.length) {
    return {
      kind: 'fonds',
      version_moteur: ENGINE_VERSION,
      entrees,
      resultat: null,
      manquants,
      indicateurs: missingAll(manquants),
      offre: { indicateur: notComputable(manquants, 'Prix maximal') },
      alertes: [],
      confiance,
      verdict: { verdict: 'donnees_insuffisantes', raisons: [`Non calculable : manque ${manquants.join(', ').toLowerCase()}`] },
    };
  }
  const retraitements = f.retraitements.reduce((s, r) => s + r.montant, 0);
  const base: FondsNumbers = {
    prix: prix.valeur!,
    stock_inclus: f.stock_inclus,
    stock: entrees.stock.valeur!,
    honoraires: entrees.honoraires.valeur!,
    investissements_initiaux: entrees.investissements_initiaux.valeur!,
    bfr: entrees.bfr.valeur!,
    pret_montant: 0,
    pret_taux: entrees.pret_taux.valeur!,
    pret_duree_mois: entrees.pret_duree.valeur!,
    ca: ca.valeur!,
    ca_precedent: caPrev,
    ebe_comptable: ebe.valeur!,
    remuneration_cedant: entrees.remuneration_cedant.valeur!,
    remuneration_cible: entrees.remuneration_cible.valeur!,
    retraitements,
    loyer_annuel: entrees.loyer.valeur!,
    masse_salariale: known(f.masse_salariale) ? f.masse_salariale.valeur : null,
    investissements_maintien: entrees.investissements_maintien.valeur!,
    taux_marge_cv: entrees.taux_marge_cv.valeur!,
  };
  const besoinSansPret = computeFonds(base).besoin_total;
  const pret = entrees.pret_montant.valeur ?? Math.max(0, besoinSansPret - entrees.apport.valeur!);
  if (entrees.pret_montant.valeur === null) {
    entrees.pret_montant = { label: 'Montant du prêt', valeur: pret, statut: 'hypothese', source: 'Besoin total − apport du profil' };
  }
  const n: FondsNumbers = { ...base, pret_montant: pret };
  const r = computeFonds(n);
  const alertes: Alert[] = [];
  if (entrees.apport.valeur! + 1e-6 < r.apport_necessaire)
    alertes.push({
      niveau: 'alerte',
      message: `Financement incomplet : apport nécessaire ${Math.round(r.apport_necessaire)} € pour un apport de ${Math.round(entrees.apport.valeur!)} €.`,
    });
  if (f.ca.some((x) => known(x) && x.statut === 'declare') || f.ebe.some((x) => known(x) && x.statut === 'declare'))
    alertes.push({ niveau: 'info', message: 'CA et EBE restent « déclarés » tant que les liasses fiscales ne sont pas jointes.' });
  for (const rt of f.retraitements) {
    if (!rt.justificatif) alertes.push({ niveau: 'info', message: `Retraitement « ${rt.libelle} » sans justificatif attendu précisé.` });
  }
  if (known(f.duree_restante_bail_mois) && f.duree_restante_bail_mois.valeur < 36)
    alertes.push({ niveau: 'alerte', message: 'Moins de 3 ans de bail restant : conditions de renouvellement à négocier.' });
  const prudentScen = r.scenarios[1];
  const offreRes = maxFondsPrice(n, entrees.apport.valeur!, p.cash_flow_cible * 12, p.verdict.couverture_min_fonds);
  const termesBase: Term[] = [
    { label: 'EBE comptable', valeur: n.ebe_comptable, unite: '€/an', statut: ebe.statut },
    { label: '+ rémunération du cédant comptabilisée', valeur: n.remuneration_cedant, unite: '€/an', statut: entrees.remuneration_cedant.statut },
    { label: '− rémunération cible du repreneur', valeur: -n.remuneration_cible, unite: '€/an', statut: entrees.remuneration_cible.statut },
    { label: '± retraitements', valeur: retraitements, unite: '€/an' },
    { label: 'EBE retraité', valeur: r.ebe_retraite, unite: '€/an' },
  ];
  const indicateurs = {
    couverture: indicator(r.couverture_dette, '(EBE retraité − investissements de maintien) / annuité d’emprunt', [
      ...termesBase,
      { label: 'Investissements de maintien', valeur: n.investissements_maintien, unite: '€/an', statut: entrees.investissements_maintien.statut },
      { label: 'Annuité d’emprunt', valeur: r.annuite, unite: '€/an' },
    ]),
    tresorerie: indicator(r.tresorerie_apres_dette, 'EBE retraité − maintien − annuité (avant impôt sur les bénéfices)', [
      { label: 'EBE retraité', valeur: r.ebe_retraite, unite: '€/an' },
      { label: 'Investissements de maintien', valeur: -n.investissements_maintien, unite: '€/an' },
      { label: 'Annuité', valeur: -r.annuite, unite: '€/an' },
    ]),
    prix_sur_ebe: indicator(r.ratios.prix_sur_ebe_retraite, 'Prix de cession / EBE retraité (descriptif, aucun multiple de marché)', [
      term(prix),
      { label: 'EBE retraité', valeur: r.ebe_retraite, unite: '€/an' },
    ]),
    besoin_total: indicator(
      r.besoin_total,
      'Prix + droits + honoraires + stock non inclus + investissements initiaux + BFR',
      r.besoin_lignes.map((l) => ({ label: l.label, valeur: l.montant, unite: '€' as const })),
    ),
    point_mort: indicator(r.point_mort_ca, 'CA − trésorerie / taux de marge sur coûts variables', [
      { label: 'CA actuel', valeur: n.ca, unite: '€/an', statut: ca.statut },
      { label: 'Trésorerie après dette', valeur: r.tresorerie_apres_dette, unite: '€/an' },
      { label: 'Taux de marge sur coûts variables', valeur: n.taux_marge_cv * 100, unite: '%', statut: entrees.taux_marge_cv.statut },
    ]),
  };
  const offreInd = offreRes.atteignable
    ? indicator(offreRes.prix_max, 'Prix maximal tel que, au scénario CA −10 %, trésorerie ≥ cible × 12 et couverture de la dette ≥ minimum (apport constant)', [
        { label: 'Cible annuelle', valeur: p.cash_flow_cible * 12, unite: '€/an', statut: 'hypothese' },
        { label: 'Couverture minimale', valeur: p.verdict.couverture_min_fonds, unite: '', statut: 'hypothese' },
        { label: 'Écart au prix demandé', valeur: offreRes.ecart * 100, unite: '%' },
      ])
    : notComputable([], 'Prix maximal', 'Objectif inatteignable avec ces hypothèses.');
  // Verdict fonds : scénario prudent = CA −10 %.
  const blo = alertes.filter((a) => a.niveau === 'bloquant');
  const budgetDepasse = p.budget_max !== null && n.prix > p.budget_max;
  let verdict: FondsAnalysis['verdict'];
  if (budgetDepasse) verdict = { verdict: 'hors_criteres', raisons: [`Prix supérieur au budget maximal (${p.budget_max} €)`] };
  else if (blo.length) verdict = { verdict: 'hors_criteres', raisons: blo.map((b) => b.message) };
  else if (confiance.niveau === 'C') verdict = { verdict: 'donnees_insuffisantes', raisons: ['Confiance C : hypothèses trop fragiles pour conclure'] };
  else if (prudentScen.tresorerie >= p.cash_flow_cible * 12 && prudentScen.couverture >= p.verdict.couverture_min_fonds)
    verdict = { verdict: 'a_visiter', raisons: [`CA −10 % : trésorerie ≥ cible et couverture ≥ ${p.verdict.couverture_min_fonds}`] };
  else if (offreRes.atteignable && offreRes.ecart >= -p.verdict.ecart_max_negociation)
    verdict = { verdict: 'a_negocier', raisons: [`Cible atteinte à ${(offreRes.ecart * 100).toFixed(1)} % sous le prix demandé`] };
  else verdict = { verdict: 'hors_criteres', raisons: ['Trésorerie ou couverture insuffisantes au prix demandé'] };
  if (budgetDepasse) alertes.push({ niveau: 'bloquant', message: `Prix supérieur au budget maximal (${p.budget_max} €).` });
  return {
    kind: 'fonds',
    version_moteur: ENGINE_VERSION,
    entrees,
    resultat: r,
    manquants: [],
    indicateurs,
    offre: { indicateur: offreInd },
    alertes,
    confiance,
    verdict,
  };
}
