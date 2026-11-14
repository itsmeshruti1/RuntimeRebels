const IMPORT_MAP = { three: 'js/vendor/three/three.module.min.js' };

function get(url) {
  return fetch(url, { priority: 'low' })
    .then((r) => (r.ok ? r.text() : ''))
    .catch(() => '');
}

function resolve(spec, base) {
  if (IMPORT_MAP[spec]) return new URL(IMPORT_MAP[spec], location.href).href;
  if (/^\.{0,2}\//.test(spec)) return new URL(spec, base).href;
  return null;
}

export async function prefetchPage(page) {
  const seen = new Set();
  const html = await get(page);
  const base = new URL(page, location.href).href;
  const queue = [];
  html.replace(/(?:href|src)="([^"#]+\.(?:css|js|woff2))"/g, (m, url) => queue.push(new URL(url, base).href));
  html.replace(/"([^"]+\.js)"/g, (m, url) => (url.includes('vendor') ? queue.push(new URL(url, base).href) : m));

  while (queue.length) {
    const url = queue.shift();
    if (seen.has(url)) continue;
    seen.add(url);
    const text = await get(url);
    if (!url.endsWith('.js')) continue;
    text.replace(/(?:import|export)[^'"]*?from\s*['"]([^'"]+)['"]|import\s*['"]([^'"]+)['"]/g, (m, a, b) => {
      const next = resolve(a || b, url);
      if (next && !seen.has(next)) queue.push(next);
      return m;
    });
    text.replace(/['"](media\/[^'"]+\.(?:jpe?g|png|webp))['"]/g, (m, src) => {
      const next = new URL(src, location.href).href;
      if (!seen.has(next)) {
        seen.add(next);
        fetch(next, { priority: 'low' })
          .then((r) => r.blob())
          .catch(() => {});
      }
      return m;
    });
  }
}
