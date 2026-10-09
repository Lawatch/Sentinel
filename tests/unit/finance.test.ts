import { describe, expect, it } from 'vitest';
import { monthlyPayment } from '@/lib/finance/credit';
import { computeRental, debtRatio, type RentalNumbers } from '@/lib/finance/residential';
import { maxOfferPrice } from '@/lib/finance/offer';
import { computeFonds, registrationDuties } from '@/lib/finance/fonds';
import { analyze, type RentalAnalysis } from '@/lib/finance/analyze';
import { close, declared, inputs, profileT4 } from './helpers';

const T4: RentalNumbers = {
  prix: 200000,
  taux_notaire: 0.075,
  honoraires_agence: 0,
  honoraires_inclus: true,
  travaux: 10000,
  frais_bancaires: 3000,
  mobilier: 0,
  apport: 28000,
  taux_credit: 0.036,
  duree_mois: 240,
  assurance_taux: 0.003,
  assurance_mode: 'capital_initial',
  loyer_mensuel_hc: 1100,
  vacance: 0.05,
  taxe_fonciere: 1200,
  copro_non_recup: 600,
  pno: 150,
  gestion_taux: 0,
  entretien: 400,
  gli_taux: 0,
};

describe('Cas de test de référence (section 10)', () => {
  it('T1 Mensualité : 100 000 €, 3,6 %, 240 mois → 585,11 €', () => {
    close(monthlyPayment(100000, 0.036, 240), 585.11);
  });

  it('T2 Taux nul : 120 000 €, 0 %, 240 mois → 500,00 €', () => {
    close(monthlyPayment(120000, 0, 240), 500);
  });

  it('T3 Rendement brut : prix 200 000 €, loyer 1 000 € → 6,00 %', () => {
    const r = computeRental({ ...T4, loyer_mensuel_hc: 1000 });
    close(r.rendement_brut * 100, 6.0);
  });

  it('T4 Scénario complet', () => {
    const r = computeRental(T4);
    close(r.cout_total, 228000);
    close(r.capital, 200000);
    close(r.mensualite, 1170.22);
    close(r.assurance_annuelle / 12, 50.0);
    close(r.revenu_effectif, 12540);
    close(r.rne, 10190);
    close(r.rendement_brut * 100, 6.6);
    close(r.rendement_net * 100, 4.47);
    close(r.cf_apres_credit, -371.06);
  });

  it('T4 via l’analyse complète (scénario central)', () => {
    const a = analyze({
      type: 'appartement',
      today: '2026-10-09',
      profile: profileT4(),
      inputs: inputs({
        prix: declared(200000),
        surface: declared(40),
        loyer: declared(1100),
        taxe_fonciere: declared(1200),
        charges_copro_non_recup: declared(600),
        travaux: declared(10000),
        frais_bancaires: declared(3000),
        dpe: { classe: { valeur: 'D', statut: 'declare' } },
      }),
    }) as RentalAnalysis;
    const c = a.scenarios.central.indicateurs.cf_apres_credit;
    expect(c.ok).toBe(true);
    if (c.ok) close(c.valeur, -371.06);
    // Le scénario prudent est plus défavorable (vacance +5 pts, travaux +20 %, taux +0,5 pt).
    const p = a.scenarios.prudent.indicateurs.cf_apres_credit;
    expect(p.ok && c.ok && p.valeur < c.valeur).toBe(true);
  });

  it('T5 Prix d’offre maximal : hypothèses de T4, cible 0 €', () => {
    const o = maxOfferPrice(T4, 0);
    expect(o.atteignable).toBe(true);
    if (!o.atteignable) return;
    close(o.prix_max, 143425.32);
    close(o.capital, 139182.22);
    close(o.ecart * 100, -28.3, 0.05);
  });

  it('T6 Endettement : revenus 5 000 €, aucun crédit, loyers à 70 % → 21,15 %', () => {
    const r = computeRental(T4);
    const ratio = debtRatio({
      revenus_mensuels: 5000,
      mensualites_existantes: 0,
      nouvelle_mensualite_assurance_comprise: r.mensualite + r.assurance_annuelle / 12,
      loyer_mensuel: 1100,
      ponderation_loyers: 0.7,
    });
    close(ratio * 100, 21.15);
  });

  it('T7 Fonds de commerce', () => {
    close(registrationDuties(150000), 3810);
    const r = computeFonds({
      prix: 150000,
      stock_inclus: false,
      stock: 15000,
      honoraires: 6000,
      investissements_initiaux: 20000,
      bfr: 10000,
      pret_montant: 150000,
      pret_taux: 0.045,
      pret_duree_mois: 84,
      ca: 400000,
      ca_precedent: null,
      ebe_comptable: 70000,
      remuneration_cedant: 30000,
      remuneration_cible: 45000,
      retraitements: 0,
      loyer_annuel: 24000,
      masse_salariale: null,
      investissements_maintien: 5000,
      taux_marge_cv: 0.6,
    });
    close(r.droits, 3810);
    close(r.besoin_total, 204810);
    close(r.apport_necessaire, 54810);
    close(r.mensualite, 2085.02);
    close(r.ebe_retraite, 55000);
    close(r.couverture_dette, 2.0);
    close(r.tresorerie_apres_dette, 24979.71);
    close(r.ratios.loyer_sur_ca * 100, 6.0);
    close(r.ratios.prix_sur_ebe_retraite, 2.73);
  });

  it('T8 Données manquantes : sans loyer ni indicateur de marché', () => {
    const a = analyze({
      type: 'appartement',
      today: '2026-10-09',
      profile: profileT4(),
      inputs: inputs({ prix: declared(200000), surface: declared(40) }),
    }) as RentalAnalysis;
    const cf = a.header.cash_flow_prudent;
    expect(cf.ok).toBe(false);
    if (!cf.ok) expect(cf.manquants).toContain('Loyer (déclaré ou de marché)');
    expect(a.verdict.verdict).toBe('donnees_insuffisantes');
  });

  it('T14 DPE G sans travaux → « Hors critères » avec le motif bloquant', () => {
    const a = analyze({
      type: 'appartement',
      today: '2026-10-09',
      profile: profileT4(),
      inputs: inputs({
        prix: declared(200000),
        surface: declared(40),
        loyer: declared(1100),
        dpe: { classe: { valeur: 'G', statut: 'declare' } },
      }),
    }) as RentalAnalysis;
    expect(a.verdict.verdict).toBe('hors_criteres');
    expect(a.verdict.raisons.join(' ')).toMatch(/DPE G : location interdite/);
    expect(a.alertes.some((x) => x.niveau === 'bloquant' && /DPE G/.test(x.message))).toBe(true);
  });

  it('T17 Reproductibilité : mêmes entrées calculées deux fois', () => {
    const run = () =>
      analyze({
        type: 'appartement',
        today: '2026-10-09',
        profile: profileT4({ regime_fiscal: 'lmnp_reel', tmi: 0.3, revenus_foyer_mensuels: 5000 }),
        inputs: inputs({ prix: declared(200000), surface: declared(40), loyer: declared(1100), meuble: true }),
        market: {
          loyer: { status: 'ok', source: 'ANIL', loypredm2: 25, lwr_m2: 20, upr_m2: 30, typpred: 'commune' },
          dvf: { status: 'ok', source: 'DVF', n: 12, mediane_m2: 5000, p25_m2: 4500, p75_m2: 5600 },
        },
      });
    expect(JSON.stringify(run())).toBe(JSON.stringify(run()));
  });
});

describe('Règles complémentaires', () => {
  const base = {
    type: 'appartement' as const,
    today: '2026-10-09',
    profile: profileT4(),
    inputs: inputs({ prix: declared(200000), surface: declared(40), loyer: declared(1100), dpe: { classe: { valeur: 'D', statut: 'declare' } } }),
  };
  const enc = (millesime: string) => ({ status: 'ok' as const, applicable: true, source: 'Encadrement', millesime, ref_majore_m2: 20 });

  it('loyer au-dessus d’un plafond récent : bloquant', () => {
    const a = analyze({ ...base, market: { encadrement: enc('2025') } }) as RentalAnalysis;
    expect(a.alertes.some((x) => x.niveau === 'bloquant' && /plafond d’encadrement/.test(x.message))).toBe(true);
    expect(a.verdict.verdict).toBe('hors_criteres');
  });

  it('loyer au-dessus d’un plafond issu de données anciennes : alerte, pas de blocage', () => {
    const a = analyze({ ...base, market: { encadrement: enc('2023') } }) as RentalAnalysis;
    expect(a.alertes.some((x) => x.niveau === 'bloquant')).toBe(false);
    expect(a.alertes.some((x) => x.niveau === 'alerte' && /données 2023/.test(x.message))).toBe(true);
  });

  it('plafond saisi par l’utilisateur : bloquant quelle que soit la date', () => {
    const a = analyze({ ...base, inputs: { ...base.inputs, loyer_reference_majore: { valeur: 20, statut: 'verifie' } } }) as RentalAnalysis;
    expect(a.alertes.some((x) => x.niveau === 'bloquant' && /plafond/.test(x.message))).toBe(true);
  });

  it('fonds : le prix maximal respecte aussi la couverture minimale de la dette', async () => {
    const { maxFondsPrice, computeFonds } = await import('@/lib/finance/fonds');
    const n = {
      prix: 150000, stock_inclus: false, stock: 15000, honoraires: 6000, investissements_initiaux: 20000, bfr: 10000,
      pret_montant: 150000, pret_taux: 0.045, pret_duree_mois: 84, ca: 400000, ca_precedent: null, ebe_comptable: 70000,
      remuneration_cedant: 30000, remuneration_cible: 45000, retraitements: 0, loyer_annuel: 24000, masse_salariale: null,
      investissements_maintien: 5000, taux_marge_cv: 0.6,
    };
    const sansCouverture = maxFondsPrice(n, 54810, 0, 0);
    const avecCouverture = maxFondsPrice(n, 54810, 0, 1.25);
    expect(sansCouverture.atteignable && avecCouverture.atteignable).toBe(true);
    if (!sansCouverture.atteignable || !avecCouverture.atteignable) return;
    expect(avecCouverture.prix_max).toBeLessThan(sansCouverture.prix_max);
    // Au prix trouvé, la couverture du scénario CA −10 % vaut le minimum.
    const besoin = computeFonds({ ...n, prix: avecCouverture.prix_max, pret_montant: 0 }).besoin_total;
    const r = computeFonds({ ...n, prix: avecCouverture.prix_max, pret_montant: besoin - 54810 });
    close(r.scenarios[1].couverture, 1.25, 0.001);
  });
});
