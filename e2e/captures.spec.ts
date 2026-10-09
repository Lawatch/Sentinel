import { test, type Page } from '@playwright/test';
import { login } from './helpers';

/**
 * Captures d'écran de contrôle visuel (CAPTURES=1) : imprimées en base64 dans la sortie
 * pour relecture, sans dépendre d'un stockage d'artefacts.
 */
test.skip(!process.env.CAPTURES, 'Captures désactivées');

const dump = async (page: Page, name: string) => {
  await page.waitForTimeout(800);
  const buf = await page.screenshot({ type: 'jpeg', quality: 50, fullPage: false });
  if (process.env.CAPTURES_DIR) {
    (await import('node:fs')).writeFileSync(`${process.env.CAPTURES_DIR}/${name}.jpg`, buf);
    return;
  }
  const b64 = buf.toString('base64');
  for (let i = 0; i < b64.length; i += 60000) console.log(`CAPTURE ${name} ${i / 60000} ${b64.slice(i, i + 60000)}`);
};

test('captures desktop et mobile', async ({ page, browser }) => {
  test.setTimeout(240_000);
  const email = `captures-${Date.now()}@exemple.test`;
  await page.setViewportSize({ width: 1366, height: 860 });
  await login(page, email);
  await page.goto('/reglages');
  await page.getByTestId('demo-charger').click();
  await page.getByText(/bien\(s\) de démonstration chargé/).waitFor();
  await dump(page, 'reglages');
  await page.goto('/');
  await page.getByTestId('liste-biens').waitFor();
  await dump(page, 'accueil');
  await page.getByRole('link', { name: /Appartement 48 m² — Montreuil/ }).click();
  await page.waitForURL(/\/biens\//);
  await page.getByText(/Données publiques mises à jour|Enrichissement impossible/).waitFor({ timeout: 90_000 });
  await page.waitForTimeout(1500);
  await dump(page, 'fiche-entete');
  await page.mouse.wheel(0, 1400);
  await dump(page, 'fiche-analyse');
  await page.mouse.wheel(0, 1600);
  await dump(page, 'fiche-scenarios');
  await page.getByRole('tab', { name: 'Marché' }).click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await dump(page, 'fiche-marche');
  await page.mouse.wheel(0, 900);
  await dump(page, 'fiche-marche-2');
  await page.getByRole('tab', { name: 'Vérifications' }).click();
  await dump(page, 'fiche-verifications');
  await page.getByRole('tab', { name: 'Suivi' }).click();
  await dump(page, 'fiche-suivi');
  const fiche = page.url();
  await page.goto(fiche + '/imprimer');
  await dump(page, 'imprimable');
  await page.goto('/');
  const boxes = page.getByRole('checkbox', { name: /^Comparer/ });
  await boxes.nth(0).check();
  await boxes.nth(1).check();
  await boxes.nth(2).check();
  await page.getByRole('link', { name: /Comparer \(3\)/ }).click();
  await page.getByTestId('comparateur').waitFor();
  await dump(page, 'comparateur');
  await page.goto('/');
  await page.getByRole('tab', { name: 'Marché' }).click();
  await dump(page, 'accueil-marche');

  const mobile = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, locale: 'fr-FR' });
  const m = await mobile.newPage();
  await login(m, email);
  await dump(m, 'mobile-accueil');
  await m.goto(fiche);
  await m.getByTestId('verdict').waitFor();
  await dump(m, 'mobile-fiche');
  await m.mouse.wheel(0, 1200);
  await dump(m, 'mobile-fiche-2');
  await m.getByTestId('ajout-rapide').click();
  await dump(m, 'mobile-ajout');
  await mobile.close();
});
