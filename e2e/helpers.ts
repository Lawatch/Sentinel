import { expect, type Page } from '@playwright/test';

const MAILPIT = process.env.MAILPIT_URL ?? 'http://127.0.0.1:54324';

/** Récupère le code à 6 chiffres du dernier e-mail reçu par `email` dans Mailpit (Supabase local). */
export async function latestCode(email: string, after: number): Promise<string> {
  for (let i = 0; i < 40; i++) {
    const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}&limit=5`);
    if (res.ok) {
      const json = (await res.json()) as { messages: { ID: string; Created: string }[] };
      const msg = json.messages.find((m) => Date.parse(m.Created) >= after - 2000);
      if (msg) {
        const full = (await (await fetch(`${MAILPIT}/api/v1/message/${msg.ID}`)).json()) as { Text: string; HTML: string };
        const code = (full.Text || full.HTML).match(/\b(\d{6})\b/);
        if (code) return code[1];
      }
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Aucun e-mail reçu pour ${email}`);
}

export async function login(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Adresse e-mail').fill(email);
  const t0 = Date.now();
  await page.getByRole('button', { name: 'Recevoir le lien de connexion' }).click();
  await expect(page.getByLabel('Code reçu par e-mail')).toBeVisible();
  const code = await latestCode(email, t0);
  await page.getByLabel('Code reçu par e-mail').fill(code);
  await page.getByRole('button', { name: 'Se connecter avec le code' }).click();
  await expect(page.getByRole('link', { name: /Carte et liste/ })).toBeVisible();
}
