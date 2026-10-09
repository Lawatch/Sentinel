// Sonde temporaire : affiche ce que renvoient réellement les sources publiques.
const targets = process.argv.slice(2).length ? process.argv.slice(2) : (await import('./probe-targets.mjs')).default;
for (const t of targets) {
  const url = typeof t === 'string' ? t : t.url;
  const max = (typeof t === 'object' && t.max) || 1500;
  const t0 = Date.now();
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(20000), headers: { 'user-agent': 'sentinel-probe' } });
    const buf = Buffer.from(await r.arrayBuffer());
    let text = buf.toString('utf8');
    console.log(`\n=== ${url}\nstatus=${r.status} type=${r.headers.get('content-type')} len=${buf.length} ms=${Date.now() - t0} lastmod=${r.headers.get('last-modified')}`);
    console.log(text.slice(0, max));
  } catch (e) {
    console.log(`\n=== ${url}\nERROR ${e.name}: ${e.message} ${e.cause?.code ?? ''}`);
  }
}
