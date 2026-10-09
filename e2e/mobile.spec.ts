import { expect, test } from '@playwright/test';
import { login } from './helpers';

test('mobile : connexion, ajout rapide et verdict sur téléphone', async ({ page }) => {
  await login(page, `mobile-${Date.now()}@exemple.test`);
  await page.getByTestId('ajout-rapide').click();
  await page.getByLabel('Prix demandé (€) *').fill('180000');
  await page.getByLabel('Surface (m²) *').fill('30');
  await page.getByLabel('Adresse ou commune *').fill('Montreuil');
  await page.getByLabel('URL de l’annonce *').fill(`https://exemple.invalid/mobile/${Date.now()}`);
  await page.getByRole('button', { name: 'Enregistrer et analyser' }).click();
  await page.waitForURL(/\/biens\//);
  await expect(page.getByTestId('verdict')).toBeVisible();
  // Pas de défilement horizontal de la page.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
