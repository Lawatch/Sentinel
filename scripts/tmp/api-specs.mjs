// Extrait temporaire des schémas d'API (Supabase Management, Vercel) pour écrire le déploiement.
const pick = async (url, paths) => {
  const spec = await (await fetch(url)).json();
  const resolve = (o, depth = 0) => {
    if (!o || typeof o !== 'object' || depth > 6) return o;
    if (o.$ref) return resolve(o.$ref.split('/').slice(1).reduce((x, k) => x[k], spec), depth + 1);
    if (Array.isArray(o)) return o.map((x) => resolve(x, depth + 1));
    return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, resolve(v, depth + 1)]));
  };
  for (const [p, m] of paths) {
    const op = spec.paths?.[p]?.[m];
    if (!op) { console.log(`\n#### ${m.toUpperCase()} ${p} : ABSENT`); continue; }
    const body = op.requestBody?.content?.['application/json']?.schema;
    const resp = op.responses?.['200']?.content?.['application/json']?.schema ?? op.responses?.['201']?.content?.['application/json']?.schema;
    const slim = (s) => (JSON.stringify(resolve(s), (k, v) => (['description', 'example', 'examples'].includes(k) ? undefined : v)) ?? 'aucun').slice(0, 3500);
    console.log(`\n#### ${m.toUpperCase()} ${p}\nparams: ${JSON.stringify((op.parameters ?? []).map((x) => resolve(x)).map((x) => `${x.in}:${x.name}${x.required ? '*' : ''}`))}\nbody: ${slim(body)}\nresp: ${slim(resp)}`);
  }
};
await pick('https://api.supabase.com/api/v1-json', [
  ['/v1/projects', 'get'],
  ['/v1/projects', 'post'],
  ['/v1/organizations', 'get'],
  ['/v1/projects/{ref}', 'get'],
  ['/v1/projects/{ref}/api-keys', 'get'],
  ['/v1/projects/{ref}/config/auth', 'patch'],
  ['/v1/projects/{ref}/database/query', 'post'],
  ['/v1/projects/{ref}/health', 'get'],
]);
await pick('https://openapi.vercel.sh/', [
  ['/v9/projects/{idOrName}', 'get'],
  ['/v11/projects', 'post'],
  ['/v10/projects/{idOrName}/env', 'post'],
  ['/v9/projects/{idOrName}/domains', 'get'],
  ['/v2/user', 'get'],
  ['/v13/deployments', 'post'],
  ['/v9/projects/{idOrName}', 'patch'],
]);
