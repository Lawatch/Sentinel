// Serveur simulé des API Supabase Management et Vercel (schémas OpenAPI d'octobre 2026),
// pour tester scripts/deploy/provision.mjs. Les requêtes SQL sont exécutées sur le Postgres local.
import http from 'node:http';
import pg from 'pg';

const db = new pg.Client({ connectionString: process.env.MOCK_DB_URL });
await db.connect();
const state = { orgs: [], projects: [], vproject: null, env: [], auth: { site_url: 'http://localhost:3000', uri_allow_list: '', disable_signup: false }, calls: [] };
const json = (res, code, body) => {
  res.writeHead(code, { 'content-type': 'application/json' });
  res.end(body === undefined ? '' : JSON.stringify(body));
};
const server = http.createServer(async (req, res) => {
  let raw = '';
  for await (const c of req) raw += c;
  const body = raw ? JSON.parse(raw) : undefined;
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  state.calls.push(`${req.method} ${p}`);
  if (!/^Bearer (sbp_|vc_)test/.test(req.headers.authorization ?? '')) return json(res, 401, { message: 'unauthorized' });
  // Supabase Management API
  if (req.method === 'GET' && p === '/v1/projects') return json(res, 200, state.projects);
  if (req.method === 'GET' && p === '/v1/organizations') return json(res, 200, state.orgs);
  if (req.method === 'POST' && p === '/v1/organizations') {
    if (!body?.name) return json(res, 400, { message: 'name requis' });
    const org = { id: 'sentinel-org', name: body.name };
    state.orgs.push(org);
    return json(res, 201, org);
  }
  if (req.method === 'GET' && /^\/v1\/organizations\/[\w-]+\/members$/.test(p)) return json(res, 200, [{ user_id: 'u', user_name: 'moi', email: 'autre@example.com', role_name: 'Owner', mfa_enabled: false }]);
  if (req.method === 'POST' && p === '/v1/projects') {
    const allowed = ['db_pass', 'name', 'organization_slug', 'region_selection'];
    const extra = Object.keys(body).filter((k) => !allowed.includes(k));
    if (extra.length || !body.db_pass || !body.organization_slug || body.region_selection?.type !== 'specific') return json(res, 400, { message: `corps invalide ${extra}` });
    const proj = { id: 'abcdefghijklmnopqrst', ref: 'abcdefghijklmnopqrst', name: body.name, organization_slug: body.organization_slug, region: body.region_selection.code, status: 'COMING_UP', created_at: new Date().toISOString() };
    state.projects.push(proj);
    setTimeout(() => (proj.status = 'ACTIVE_HEALTHY'), 1500);
    return json(res, 201, proj);
  }
  let m;
  if ((m = p.match(/^\/v1\/projects\/(\w+)$/)) && req.method === 'GET') return json(res, 200, state.projects.find((x) => x.ref === m[1]));
  if ((m = p.match(/^\/v1\/projects\/(\w+)\/health$/))) return json(res, 200, ['auth', 'rest', 'db'].map((name) => ({ name, healthy: true, status: 'ACTIVE_HEALTHY' })));
  if ((m = p.match(/^\/v1\/projects\/(\w+)\/database\/query$/)) && req.method === 'POST') {
    try {
      const r = await db.query(body.query);
      const last = Array.isArray(r) ? r.at(-1) : r;
      return json(res, 201, last.rows ?? []);
    } catch (e) {
      return json(res, 400, { message: e.message });
    }
  }
  if ((m = p.match(/^\/v1\/projects\/(\w+)\/api-keys$/))) {
    if (url.searchParams.get('reveal') !== 'true') return json(res, 200, [{ name: 'secret', type: 'secret', api_key: null }]);
    return json(res, 200, [
      { name: 'anon', type: 'legacy', api_key: 'legacy-anon' },
      { name: 'default', type: 'publishable', api_key: process.env.MOCK_PUBLISHABLE },
      { name: 'default', type: 'secret', api_key: process.env.MOCK_SECRET },
    ]);
  }
  if ((m = p.match(/^\/v1\/projects\/(\w+)\/config\/auth$/))) {
    // Comportement constaté sur l'offre gratuite (octobre 2026) : modèles d'e-mail non modifiables sans SMTP.
    if (req.method === 'PATCH' && body.mailer_templates_magic_link_content) {
      return json(res, 400, { message: 'Email template modification is not available for free tier projects using the default email provider.' });
    }
    if (req.method === 'PATCH') Object.assign(state.auth, body);
    return json(res, 200, state.auth);
  }
  // Vercel
  if (p === '/v2/user') return json(res, 200, { user: { id: 'user_123', username: 'moi' } });
  if ((m = p.match(/^\/v9\/projects\/([\w-]+)$/)) && req.method === 'GET') return state.vproject && (state.vproject.name === m[1] || state.vproject.id === m[1]) ? json(res, 200, state.vproject) : json(res, 404, { error: { code: 'not_found' } });
  if (p === '/v11/projects' && req.method === 'POST') {
    if (body.framework !== 'nextjs') return json(res, 400, {});
    state.vproject = { id: 'prj_test', name: body.name };
    return json(res, 200, state.vproject);
  }
  if ((m = p.match(/^\/v10\/projects\/([\w-]+)\/env$/)) && req.method === 'POST') {
    if (url.searchParams.get('upsert') !== 'true' || !Array.isArray(body) || body.some((e) => !e.key || !e.value || !e.type || !Array.isArray(e.target))) return json(res, 400, {});
    for (const e of body) state.env = [...state.env.filter((x) => x.key !== e.key), e];
    return json(res, 201, { created: body });
  }
  if ((m = p.match(/^\/v9\/projects\/([\w-]+)\/domains$/))) return json(res, 200, { domains: [{ name: process.env.MOCK_APP_HOST }] });
  if (p === '/__state') return json(res, 200, state);
  return json(res, 404, { message: `non simulé : ${req.method} ${p}` });
});
server.listen(Number(process.env.MOCK_PORT ?? 4010), () => console.log('mock prêt'));
