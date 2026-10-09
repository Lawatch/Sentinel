// Sonde : affiche ce que renvoient réellement les sources publiques.
const targets = (await import('./probe-targets.mjs')).default;
for (const t of targets) {
  const t0 = Date.now();
  try {
    const r = await fetch(t.url, { signal: AbortSignal.timeout(30000), headers: { 'user-agent': 'sentinel-probe' } });
    const buf = Buffer.from(await r.arrayBuffer());
    console.log(`\n=== ${t.url}\nstatus=${r.status} type=${r.headers.get('content-type')} len=${buf.length} ms=${Date.now() - t0} lastmod=${r.headers.get('last-modified')}`);
    const out = t.fn ? await t.fn(buf, r) : buf.toString('utf8').slice(0, t.max ?? 1500);
    console.log(typeof out === 'string' ? out : JSON.stringify(out, null, 1));
  } catch (e) {
    console.log(`\n=== ${t.url}\nERROR ${e.name}: ${e.message} ${e.cause?.code ?? ''} ms=${Date.now() - t0}`);
  }
}
