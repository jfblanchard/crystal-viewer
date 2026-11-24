/**
 * cod.js — Cloudflare Pages Function proxy for the Crystallography Open
 * Database. COD does not send CORS headers, so the browser cannot call it
 * directly; this function runs on the same origin as the viewer.
 *
 * Routes:
 *   /cod?search=QUERY   -> COD search results (JSON, ranked)
 *   /cod?id=NNNNNNN     -> the CIF file for entry NNNNNNN
 *
 * Search merges a text query with a formula query when the query names a
 * common mineral (COD's text search matches titles, not mineral names, so
 * "sapphire" alone would miss corundum). Formula strings are verified
 * against COD's element-order-sensitive formula search.
 */

const MINERALS = {
  sapphire: 'Al2 O3', ruby: 'Al2 O3', corundum: 'Al2 O3',
  quartz: 'O2 Si', halite: 'Cl Na', salt: 'Cl Na',
  calcite: 'C Ca O3', pyrite: 'Fe S2', fluorite: 'Ca F2',
  galena: 'Pb S', hematite: 'Fe2 O3', magnetite: 'Fe3 O4',
  rutile: 'O2 Ti', anatase: 'O2 Ti', ice: 'H2 O',
  diamond: 'C', graphite: 'C',
  // Amorphous materials: no crystal structure of their own; show the
  // crystalline relatives instead.
  opal: 'O2 Si', glass: 'O2 Si', obsidian: 'O2 Si',
};

export async function onRequest(context) {
  // Free edition: lookup is off unless the COD_LOOKUP environment variable is
  // set to "on" in the Cloudflare Pages project. A paid edition would check
  // the visitor's access here before going further.
  if (context.env.COD_LOOKUP !== 'on') {
    return new Response('Not found', { status: 404 });
  }
  const url = new URL(context.request.url);
  const search = url.searchParams.get('search');
  const id = url.searchParams.get('id');

  if (id) {
    const r = await fetch(`https://www.crystallography.net/cod/${id}.cif`);
    return new Response(await r.text(), { headers: { 'content-type': 'text/plain; charset=utf-8' } });
  }

  if (search) {
    const q = search.trim();
    const queries = [`text=${encodeURIComponent(q)}`];
    const formula = MINERALS[q.toLowerCase()];
    if (formula) queries.push(`formula=${encodeURIComponent(formula)}`);

    const seen = new Map();
    for (const query of queries) {
      try {
        const r = await fetch(`https://www.crystallography.net/cod/result.php?format=json&${query}&limit=12`);
        const rows = await r.json();
        for (const row of rows) if (!seen.has(row.file)) seen.set(row.file, { ...row, _formula: query.startsWith('formula') });
      } catch { /* one query failing should not kill the other */ }
    }
    const rows = [...seen.values()];
    // Rank: exact formula matches first (a mineral name was given), then
    // minerals, then inorganic formulas, then organic. The structural check
    // on load is the real gate; this just orders the list.
    const hasCarbon = (f) => /(^|\s)C\d/.test(f || '');
    const rank = (x) => (x._formula ? 0 : 1) + (x.mineral ? 0 : 1) + (hasCarbon(x.formula) ? 2 : 0);
    rows.sort((a, b) => rank(a) - rank(b));
    return new Response(JSON.stringify(rows.slice(0, 8)), { headers: { 'content-type': 'application/json' } });
  }

  return new Response('bad request', { status: 400 });
}
