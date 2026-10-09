import { expect, test, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import path from 'node:path';
import { login } from './helpers';

const email = `e2e-${Date.now()}@exemple.test`;
const VERDICTS = /À visiter|À négocier|Hors critères|Données insuffisantes/;

test.describe.serial('Parcours principal', () => {
  let propertyUrl = '';
  // Une seule connexion pour tout le parcours (comme un utilisateur réel).
  let page: Page;
  test.beforeAll(async ({ browser }, info) => {
    const ctx = await browser.newContext({ baseURL: info.project.use.baseURL, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
    page = await ctx.newPage();
  });
  test.afterAll(async () => {
    await page.context().close();
  });

  test('connexion par code à 6 chiffres', async () => {
    await login(page, email);
    await expect(page.getByText('Aucun bien pour l’instant.')).toBeVisible();
  });

  test('ajout rapide en 5 champs puis verdict enrichi', async () => {
    await page.goto('/');
    await page.getByTestId('ajout-rapide').click();
    await page.getByLabel('Type d’actif *').selectOption('appartement');
    await page.getByLabel('Prix demandé (€) *').fill('250 000');
    await page.getByLabel('Surface (m²) *').fill('40');
    await page.getByLabel('Adresse ou commune *').fill('20 avenue de Ségur, 75007 Paris');
    await page.getByLabel('URL de l’annonce *').fill('https://exemple.invalid/e2e/annonce-1?utm_source=test');
    await page.getByRole('button', { name: 'Champs optionnels' }).click();
    await page.getByLabel('Loyer mensuel HC (€)').fill('1 400');
    const t0 = Date.now();
    await page.getByRole('button', { name: 'Enregistrer et analyser' }).click();
    await page.waitForURL(/\/biens\/[0-9a-f-]{36}/);
    propertyUrl = page.url().replace(/\?.*$/, '');
    // Verdict affiché immédiatement à partir des entrées.
    await expect(page.getByTestId('verdict')).toContainText(VERDICTS);
    await expect(page.getByTestId('scenarios')).toContainText('Prudent');
    // Enrichissement automatique (sources publiques réelles quand le réseau le permet).
    await expect(page.getByText(/Données publiques mises à jour|Enrichissement impossible/)).toBeVisible({ timeout: 90_000 });
    console.log(`Saisie → verdict enrichi : ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    await page.getByRole('tab', { name: 'Marché' }).click();
    await expect(page.getByText('Comparables de vente (DVF)')).toBeVisible();
    // Une source en panne s'affiche « indisponible », jamais « 0 vente ».
    await expect(page.getByText(/0 vente\b/)).toHaveCount(0);
  });

  test('chaque chiffre propose « Comment c’est calculé »', async () => {
    await page.goto(propertyUrl);
    await page.getByRole('button', { name: /Comment c'est calculé : Cash-flow mensuel prudent/ }).first().click();
    await expect(page.getByText('(RNE − mensualités × 12 − assurance emprunteur annuelle) / 12').first()).toBeVisible();
  });

  test('baisse de prix : nouvelle observation et baisse signalée', async () => {
    await page.goto(propertyUrl);
    const prix = page.getByTestId('champ-prix');
    await prix.fill('235000');
    await page.getByTestId('enregistrer').click();
    await expect(page.getByText(/Nouveau prix ajouté à l’historique/)).toBeVisible();
    await page.getByRole('tab', { name: 'Suivi' }).click();
    await expect(page.getByTestId('baisse-prix')).toContainText('6,0 %');
  });

  test('même URL avec paramètres de suivi : un seul bien, nouvelle observation', async () => {
    await page.goto('/');
    await page.getByTestId('ajout-rapide').click();
    await page.getByLabel('Prix demandé (€) *').fill('230000');
    await page.getByLabel('Surface (m²) *').fill('40');
    await page.getByLabel('Adresse ou commune *').fill('20 avenue de Ségur, 75007 Paris');
    await page.getByLabel('URL de l’annonce *').fill('https://www.exemple.invalid/e2e/annonce-1/?fbclid=abc#photos');
    await page.getByRole('button', { name: 'Enregistrer et analyser' }).click();
    await expect(page.getByText('Cette annonce existe déjà')).toBeVisible();
    await page.getByRole('button', { name: 'Ajouter l’observation de prix' }).click();
    await page.waitForURL(propertyUrl);
    await page.getByRole('tab', { name: 'Suivi' }).click();
    await expect(page.locator('table').filter({ hasText: '230 000' })).toBeVisible();
  });

  test('import CSV : aperçu sans écriture, puis confirmation', async () => {
    await page.goto('/reglages');
    await page.getByTestId('import-fichier').setInputFiles(path.join(__dirname, '..', 'docs', 'exemple-import.csv'));
    await expect(page.getByTestId('import-apercu')).toContainText('5 ligne(s) prête(s)');
    await page.goto('/');
    await expect(page.getByTestId('liste-biens')).toContainText('1 bien affiché sur 1');
    await page.goto('/reglages');
    await page.getByTestId('import-fichier').setInputFiles(path.join(__dirname, '..', 'docs', 'exemple-import.csv'));
    await page.getByTestId('import-confirmer').click();
    await expect(page.getByTestId('import-rapport')).toContainText('5 bien(s) créé(s)');
    await page.goto('/');
    await expect(page.getByTestId('liste-biens')).toContainText('6 biens affichés sur 6');
  });

  test('enrichissement groupé des biens importés', async () => {
    await page.goto('/');
    await page.getByTestId('enrichir-tout').click();
    await expect(page.getByText(/bien\(s\) enrichi\(s\)/)).toBeVisible({ timeout: 110_000 });
  });

  test('comparateur : deux biens côte à côte', async () => {
    await page.goto('/');
    const boxes = page.getByRole('checkbox', { name: /^Comparer/ });
    await boxes.nth(0).check();
    await boxes.nth(1).check();
    await page.getByRole('link', { name: /Comparer \(2\)/ }).click();
    await expect(page.getByTestId('comparateur')).toContainText('Prix demandé');
  });

  test('T16 isolation : un autre utilisateur ne voit rien via l’API', async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const service = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const admin = createClient(url, service, { auth: { persistSession: false } });
    const emailB = `b-${Date.now()}@exemple.test`;
    await admin.auth.admin.createUser({ email: emailB, password: 'Mot-de-passe-B-123!', email_confirm: true });
    const b = createClient(url, anon, { auth: { persistSession: false } });
    const { error } = await b.auth.signInWithPassword({ email: emailB, password: 'Mot-de-passe-B-123!' });
    expect(error).toBeNull();
    const { count: total } = await admin.from('properties').select('id', { count: 'exact', head: true });
    expect(total).toBeGreaterThan(0);
    const { data, error: e2 } = await b.from('properties').select('*');
    expect(e2).toBeNull();
    expect(data).toEqual([]);
    const { data: obs } = await b.from('price_observations').select('*');
    expect(obs).toEqual([]);
  });
});
