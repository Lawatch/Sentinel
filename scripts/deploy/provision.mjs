#!/usr/bin/env node
/**
 * Provisionnement et déploiement automatiques (exécuté par .github/workflows/deploy.yml).
 *
 * 1. Supabase : retrouve ou crée le projet « sentinel » (région Paris), attend qu'il soit prêt,
 *    applique les migrations SQL manquantes, récupère les clés d'API.
 * 2. Vercel : retrouve ou crée le projet « sentinel », définit les variables d'environnement,
 *    déploie en production avec la CLI Vercel.
 * 3. Supabase Auth : URL du site, URL de redirection, modèle d'e-mail (lien + code),
 *    création du compte du propriétaire puis fermeture des inscriptions.
 * 4. Vérifie que l'application et la base répondent, et écrit l'URL dans le résumé du workflow.
 *
 * Secrets requis : SUPABASE_ACCESS_TOKEN, VERCEL_TOKEN, APP_OWNER_EMAIL.
 * Optionnels : VERCEL_TEAM_ID, SUPABASE_PROJECT_REF, SUPABASE_ORG_SLUG, SUPABASE_REGION, PROJECT_NAME.
 */
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { appendFileSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const env = process.env;
const NAME = env.PROJECT_NAME || 'sentinel';
const REGION = env.SUPABASE_REGION || 'eu-west-3';
// Surcharges réservées aux tests du script (serveur d'API simulé, Supabase local).
const SB = env.SUPABASE_API_URL || 'https://api.supabase.com';
const VC = env.VERCEL_API_URL || 'https://api.vercel.com';
const projectUrl = (ref) => env.SUPABASE_PROJECT_URL || `https://${ref}.supabase.co`;
const VERCEL_CLI = env.VERCEL_CLI ? env.VERCEL_CLI.split(' ') : ['npx', '--yes', 'vercel@59.26.0'];
const APP_SCHEME = env.APP_URL_SCHEME || 'https';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const summary = (line) => {
  console.log(line);
  if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, line + '\n');
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const die = (msg) => {
  summary(`\n❌ ${msg}`);
  process.exit(1);
};

for (const k of ['SUPABASE_ACCESS_TOKEN', 'VERCEL_TOKEN', 'APP_OWNER_EMAIL']) if (!env[k]) die(`Secret manquant : ${k} (voir le README, section Déploiement).`);
const owner = env.APP_OWNER_EMAIL.trim().toLowerCase();

async function api(base, token, method, url, body, { ok404 = false } = {}) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(base + url, {
      method,
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (ok404 && res.status === 404) return null;
    const text = await res.text();
    if (res.ok) return text ? JSON.parse(text) : null;
    if ((res.status === 429 || res.status >= 500) && attempt < 6) {
      await sleep(2000 * attempt);
      continue;
    }
    throw new Error(`${method} ${url} → HTTP ${res.status} : ${text.slice(0, 600)}`);
  }
}
const sb = (m, u, b, o) => api(SB, env.SUPABASE_ACCESS_TOKEN, m, u, b, o);
const team = env.VERCEL_TEAM_ID ? `teamId=${encodeURIComponent(env.VERCEL_TEAM_ID)}` : '';
const vq = (u) => (team ? `${u}${u.includes('?') ? '&' : '?'}${team}` : u);
const vc = (m, u, b, o) => api(VC, env.VERCEL_TOKEN, m, vq(u), b, o);

/* ------------------------------------------------------------------ */
/* 1. Supabase                                                         */
/* ------------------------------------------------------------------ */
summary('## Déploiement de Sentinel\n');

// Contrôle préalable des deux jetons, pour signaler tous les problèmes en une seule exécution.
const SCOPED_HINT =
  'Le jeton Supabase n’a pas accès à vos organisations (jeton « à portée limitée »). Sur supabase.com → Account preferences → ' +
  'Access Tokens, créez un nouveau jeton donnant accès à toutes les organisations et à tous les projets (accès complet), ' +
  'puis remplacez le secret SUPABASE_ACCESS_TOKEN dans GitHub et relancez.';
const vercelUser = await vc('GET', '/v2/user').catch((e) => {
  summary(`- ❌ Jeton Vercel refusé : ${e.message}`);
  return null;
});
if (vercelUser) summary('- Jeton Vercel valide.');
const projects = await sb('GET', '/v1/projects').catch((e) => die(`Jeton Supabase refusé : ${e.message}`));
if (!vercelUser) die('Remplacez le secret VERCEL_TOKEN (Vercel → Account Settings → Tokens, portée Full Account), puis relancez.');
summary('- Jeton Supabase valide.');

let project = env.SUPABASE_PROJECT_REF ? projects.find((p) => p.ref === env.SUPABASE_PROJECT_REF) : projects.find((p) => p.name === NAME);
if (!project) {
  const orgs = await sb('GET', '/v1/organizations');
  const slugOf = (o) => o.slug ?? o.id;
  let org = env.SUPABASE_ORG_SLUG ? orgs.find((o) => slugOf(o) === env.SUPABASE_ORG_SLUG) : orgs[0];
  if (!org && env.SUPABASE_ORG_SLUG) die(`Organisation Supabase « ${env.SUPABASE_ORG_SLUG} » introuvable.`);
  if (!org) {
    summary('- Aucune organisation Supabase visible : création de l’organisation « Sentinel » (offre gratuite)…');
    try {
      org = await sb('POST', '/v1/organizations', { name: 'Sentinel' });
    } catch (e) {
      // L'organisation existe mais le jeton ne la voit pas : jeton à portée limitée.
      if (/already a member/i.test(e.message)) die(SCOPED_HINT);
      die(`Création de l’organisation Supabase refusée : ${e.message}\nCréez-en une sur supabase.com (offre Free), puis relancez.`);
    }
  }
  summary(`- Création du projet Supabase « ${NAME} » (région ${REGION}, organisation ${org.name})…`);
  try {
    project = await sb('POST', '/v1/projects', {
      name: NAME,
      organization_slug: slugOf(org),
      db_pass: randomBytes(24).toString('base64url'),
      region_selection: { type: 'specific', code: REGION },
    });
  } catch (e) {
    if (/HTTP 403/.test(e.message)) die(`${SCOPED_HINT}\n(${e.message})`);
    die(`Création du projet Supabase refusée : ${e.message}\nL’offre gratuite est limitée à 2 projets actifs : supprimez ou mettez en pause un projet inutilisé, puis relancez.`);
  }
} else {
  summary(`- Projet Supabase existant : ${project.name} (${project.ref}).`);
}
const ref = project.ref;
for (let i = 0; ; i++) {
  const p = await sb('GET', `/v1/projects/${ref}`);
  if (p.status === 'ACTIVE_HEALTHY') break;
  if (p.status === 'INACTIVE' || p.status === 'PAUSING') {
    die(`Le projet Supabase est en pause (${p.status}). Réactivez-le depuis supabase.com (Project → Restore), puis relancez ce workflow.`);
  }
  if (i > 80) die(`Le projet Supabase n’est pas prêt après 13 minutes (statut ${p.status}).`);
  if (i % 6 === 0) console.log(`  attente du projet Supabase : ${p.status}…`);
  await sleep(10000);
}
for (let i = 0; i < 30; i++) {
  const h = await sb('GET', `/v1/projects/${ref}/health?services=auth,rest,db`).catch(() => []);
  if (Array.isArray(h) && h.length && h.every((s) => s.status === 'ACTIVE_HEALTHY')) break;
  await sleep(5000);
}
summary(`- Supabase prêt : ${projectUrl(ref)}`);

// Le service d'e-mail gratuit de Supabase n'écrit qu'aux membres de l'organisation : on le signale si besoin.
let mailWarning = '';
const orgSlug = project.organization_slug ?? project.organization_id;
if (orgSlug) {
  const members = await sb('GET', `/v1/organizations/${orgSlug}/members`).catch(() => null);
  if (Array.isArray(members) && members.length && !members.some((m) => (m.email ?? '').toLowerCase() === owner)) {
    mailWarning = `⚠️ ${owner} n’est pas membre de l’organisation Supabase : l’e-mail de connexion risque de ne pas arriver. Invitez cette adresse (Organization → Team) ou configurez un SMTP.`;
    summary(`- ${mailWarning}`);
  }
}

// Migrations : suivies dans supabase_migrations.schema_migrations (compatible avec la CLI Supabase).
const sql = (query) => sb('POST', `/v1/projects/${ref}/database/query`, { query });
await sql(
  `create schema if not exists supabase_migrations; create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text);`,
);
const applied = new Set((await sql('select version from supabase_migrations.schema_migrations')).map((r) => r.version));
const dir = path.join(ROOT, 'supabase/migrations');
for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) {
  const version = f.split('_')[0];
  if (applied.has(version)) continue;
  summary(`- Migration ${f}…`);
  await sql(readFileSync(path.join(dir, f), 'utf8'));
  await sql(`insert into supabase_migrations.schema_migrations (version, name) values ('${version}', '${f.replace(/'/g, "''")}')`);
}
summary(`- Migrations à jour (${readdirSync(dir).length} fichier(s)).`);

const keys = await sb('GET', `/v1/projects/${ref}/api-keys?reveal=true`);
const pick = (type, legacyName) => keys.find((k) => k.type === type)?.api_key ?? keys.find((k) => k.name === legacyName)?.api_key;
const publicKey = pick('publishable', 'anon');
const secretKey = pick('secret', 'service_role');
if (!publicKey || !secretKey) die('Clés d’API Supabase introuvables.');
const supabaseUrl = projectUrl(ref);

/* ------------------------------------------------------------------ */
/* 2. Vercel                                                           */
/* ------------------------------------------------------------------ */
const user = vercelUser;
const orgId = env.VERCEL_TEAM_ID || user.user?.id || user.user?.uid;
let vproject = await vc('GET', `/v9/projects/${NAME}`, undefined, { ok404: true });
if (!vproject) {
  summary(`- Création du projet Vercel « ${NAME} »…`);
  vproject = await vc('POST', '/v11/projects', { name: NAME, framework: 'nextjs' });
} else {
  summary(`- Projet Vercel existant : ${vproject.name}.`);
}
await vc('POST', `/v10/projects/${vproject.id}/env?upsert=true`, [
  { key: 'NEXT_PUBLIC_SUPABASE_URL', value: supabaseUrl, type: 'plain', target: ['production', 'preview'] },
  { key: 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', value: publicKey, type: 'plain', target: ['production', 'preview'] },
  { key: 'SUPABASE_SECRET_KEY', value: secretKey, type: 'encrypted', target: ['production', 'preview'] },
  { key: 'APP_OWNER_EMAILS', value: owner, type: 'plain', target: ['production', 'preview'] },
]);
summary('- Variables d’environnement Vercel à jour.');

summary('- Déploiement en production (build sur Vercel)…');
let deployUrl;
try {
  const out = execFileSync(VERCEL_CLI[0], [...VERCEL_CLI.slice(1), 'deploy', '--prod', '--yes', `--token=${env.VERCEL_TOKEN}`], {
    cwd: ROOT,
    env: { ...env, VERCEL_ORG_ID: orgId, VERCEL_PROJECT_ID: vproject.id, VERCEL_TELEMETRY_DISABLED: '1' },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
    maxBuffer: 64 * 1024 * 1024,
  });
  deployUrl = out.trim().split('\n').filter((l) => l.startsWith('https://')).at(-1);
} catch (e) {
  die(`Échec du déploiement Vercel : ${e.message}`);
}
const domains = await vc('GET', `/v9/projects/${vproject.id}/domains?production=true`).catch(() => ({ domains: [] }));
const prodDomain = domains.domains?.find((d) => d.name.endsWith('.vercel.app'))?.name ?? domains.domains?.[0]?.name;
const appUrl = prodDomain ? `${APP_SCHEME}://${prodDomain}` : deployUrl;
if (!appUrl) die('URL de production introuvable.');

/* ------------------------------------------------------------------ */
/* 3. Supabase Auth                                                    */
/* ------------------------------------------------------------------ */
await sb('PATCH', `/v1/projects/${ref}/config/auth`, { site_url: appUrl, uri_allow_list: `${appUrl}/**` });
// Modèle d'e-mail en français (lien + code) : refusé sur l'offre gratuite sans SMTP personnel. L'e-mail par défaut
// de Supabase (lien seul) fonctionne avec /auth/callback.
const template = readFileSync(path.join(ROOT, 'supabase/templates/magic_link.html'), 'utf8');
await sb('PATCH', `/v1/projects/${ref}/config/auth`, {
  mailer_subjects_magic_link: 'Votre lien de connexion à Sentinel',
  mailer_templates_magic_link_content: template,
}).then(
  () => summary('- E-mail de connexion personnalisé (lien + code à 6 chiffres).'),
  (e) => {
    if (!/HTTP 400/.test(e.message)) throw e;
    summary('- E-mail de connexion : modèle par défaut de Supabase (lien seul ; personnalisation réservée aux offres payantes ou à un SMTP personnel).');
  },
);
const admin = createClient(supabaseUrl, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: list, error: listErr } = await admin.auth.admin.listUsers({ perPage: 1000 });
if (listErr) die(`Lecture des utilisateurs impossible : ${listErr.message}`);
if (!list.users.some((u) => u.email?.toLowerCase() === owner)) {
  const { error } = await admin.auth.admin.createUser({ email: owner, email_confirm: true });
  if (error) die(`Création du compte ${owner} impossible : ${error.message}`);
  summary(`- Compte créé pour ${owner}.`);
} else summary(`- Compte ${owner} déjà présent.`);
// Outil personnel : plus aucune inscription possible une fois le propriétaire créé.
await sb('PATCH', `/v1/projects/${ref}/config/auth`, { disable_signup: true });
const auth = await sb('GET', `/v1/projects/${ref}/config/auth`);
summary(`- Auth : site ${auth.site_url}, redirections « ${auth.uri_allow_list} », inscriptions ${auth.disable_signup ? 'fermées' : 'ouvertes'}.`);

/* ------------------------------------------------------------------ */
/* 4. Vérifications                                                    */
/* ------------------------------------------------------------------ */
let appOk = false;
for (let i = 0; i < 12 && !appOk; i++) {
  const res = await fetch(`${appUrl}/login`).catch(() => null);
  const html = res && res.ok ? await res.text() : '';
  appOk = html.includes('Sentinel');
  if (!appOk) await sleep(5000);
}
const db = await admin.from('profiles').select('id', { count: 'exact', head: true });
summary(`- Vérification de l’application (${appUrl}/login) : ${appOk ? 'OK' : 'ÉCHEC'}`);
summary(`- Vérification de la base (table profiles) : ${db.error ? `ÉCHEC (${db.error.message})` : 'OK'}`);
if (!appOk || db.error) die('Vérifications finales en échec.');
summary(`\n### ✅ Application en ligne : ${appUrl}\n\nConnectez-vous avec ${owner} : vous recevrez un lien et un code à 6 chiffres.${mailWarning ? `\n\n${mailWarning}` : ''}`);
if (env.GITHUB_OUTPUT) appendFileSync(env.GITHUB_OUTPUT, `url=${appUrl}\n`);
