import { expect, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

/**
 * E-mail par défaut de Supabase (offre gratuite) : lien seul, session dans le fragment d'URL.
 * Le lien est ouvert dans un navigateur neuf, sans aucun cookie de la demande (cas de la messagerie du téléphone).
 */
test('lien magique de l’e-mail par défaut, ouvert dans un autre navigateur', async ({ page, baseURL }) => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const service = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const admin = createClient(url, service, { auth: { persistSession: false } });
  const email = `lien-${Date.now()}@exemple.test`;
  await admin.auth.admin.createUser({ email, email_confirm: true });
  const { data, error } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: { redirectTo: `${baseURL}/auth/callback?next=${encodeURIComponent('/reglages')}` },
  });
  expect(error).toBeNull();
  await page.goto(data.properties!.action_link);
  await expect(page).toHaveURL(/\/reglages$/);
  await expect(page.getByRole('link', { name: /Carte et liste/ })).toBeVisible();

  // Le même lien, rejoué, est refusé avec un message clair.
  await page.context().clearCookies();
  await page.goto(data.properties!.action_link);
  await expect(page).toHaveURL(/\/login/);
  await expect(page.locator('p[role=alert]')).toContainText(/expiré|déjà utilisé|invalid/i);
});
