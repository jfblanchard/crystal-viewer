/**
 * cif.js — CIF parsing and structure conversion for the crystal viewer.
 *
 * Turns a Crystallographic Information File (the standard format from the
 * Crystallography Open Database and every crystallography journal) into the
 * STRUCTURES format used by structures.js, so any atomic or ionic crystal can
 * be rendered with the existing machinery.
 *
 * Pipeline: parse CIF -> expand the asymmetric unit by the space-group
 * symmetry operations (the CIF carries them) -> fold into the unit cell ->
 * detect bonds from nearest-neighbor distances -> classify atomic/ionic vs
 * molecular by periodic connectivity.
 */

// ---------------------------------------------------------------------------
// Element tables: CPK colors and covalent radii (Cordero et al., 2008, Å).
// Radii drive bond detection (sum x 1.15) and the display size.
// ---------------------------------------------------------------------------

export const ELEMENTS = {
  H:  { color: '#ffffff', radius: 0.31 }, He: { color: '#d9ffff', radius: 0.28 },
  Li: { color: '#cc80ff', radius: 1.28 }, Be: { color: '#c2ff00', radius: 0.96 },
  B:  { color: '#ffb5b5', radius: 0.84 }, C:  { color: '#909090', radius: 0.76 },
  N:  { color: '#3050f8', radius: 0.71 }, O:  { color: '#ff0d0d', radius: 0.66 },
  F:  { color: '#90e050', radius: 0.57 }, Ne: { color: '#b3e3f5', radius: 0.58 },
  Na: { color: '#ab5cf2', radius: 1.66 }, Mg: { color: '#8aff00', radius: 1.41 },
  Al: { color: '#bfa6a6', radius: 1.21 }, Si: { color: '#f0c8a0', radius: 1.11 },
  P:  { color: '#ff8000', radius: 1.07 }, S:  { color: '#ffff30', radius: 1.05 },
  Cl: { color: '#1ff01f', radius: 1.02 }, Ar: { color: '#80d1e3', radius: 1.06 },
  K:  { color: '#30f040', radius: 2.03 }, Ca: { color: '#3dff00', radius: 1.76 },
  Sc: { color: '#e6e6e6', radius: 1.70 }, Ti: { color: '#bfc2c7', radius: 1.60 },
  V:  { color: '#a6a6ab', radius: 1.53 }, Cr: { color: '#8a99c7', radius: 1.39 },
  Mn: { color: '#9c7ac7', radius: 1.39 }, Fe: { color: '#e06633', radius: 1.32 },
  Co: { color: '#f090a0', radius: 1.26 }, Ni: { color: '#50d050', radius: 1.24 },
  Cu: { color: '#c88033', radius: 1.32 }, Zn: { color: '#7d80b0', radius: 1.22 },
  Ga: { color: '#c28f8f', radius: 1.22 }, Ge: { color: '#668f8f', radius: 1.20 },
  As: { color: '#bd80e3', radius: 1.19 }, Se: { color: '#ffa100', radius: 1.20 },
  Br: { color: '#a62929', radius: 1.20 }, Kr: { color: '#5cb8d1', radius: 1.16 },
  Rb: { color: '#702eb0', radius: 2.20 }, Sr: { color: '#00ff00', radius: 1.95 },
  Y:  { color: '#94ffff', radius: 1.90 }, Zr: { color: '#94e0e0', radius: 1.75 },
  Nb: { color: '#73c2c9', radius: 1.64 }, Mo: { color: '#54b5b5', radius: 1.54 },
  Tc: { color: '#3b9e9e', radius: 1.47 }, Ru: { color: '#248f8f', radius: 1.46 },
  Rh: { color: '#0a7d8c', radius: 1.42 }, Pd: { color: '#006985', radius: 1.39 },
  Ag: { color: '#c0c0c0', radius: 1.45 }, Cd: { color: '#ffd98f', radius: 1.44 },
  In: { color: '#a67573', radius: 1.42 }, Sn: { color: '#668080', radius: 1.39 },
  Sb: { color: '#9e63b5', radius: 1.39 }, Te: { color: '#d47a00', radius: 1.38 },
  I:  { color: '#940094', radius: 1.39 }, Xe: { color: '#429eb0', radius: 1.40 },
  Cs: { color: '#57178f', radius: 2.44 }, Ba: { color: '#00a900', radius: 2.15 },
  La: { color: '#70d4ff', radius: 2.07 }, Ce: { color: '#ffffc7', radius: 2.04 },
  Pr: { color: '#d9ffc7', radius: 2.03 }, Nd: { color: '#c7ffc7', radius: 2.01 },
  Sm: { color: '#b3ffc7', radius: 1.98 }, Eu: { color: '#94ffc7', radius: 1.98 },
  Gd: { color: '#73ffc7', radius: 1.96 }, Tb: { color: '#5affc7', radius: 1.94 },
  Dy: { color: '#36ffc7', radius: 1.92 }, Ho: { color: '#10ffc7', radius: 1.92 },
  Er: { color: '#00ffc1', radius: 1.89 }, Tm: { color: '#00ffb3', radius: 1.90 },
  Yb: { color: '#00ffa6', radius: 1.87 }, Lu: { color: '#00ff99', radius: 1.87 },
  Hf: { color: '#4dc2ff', radius: 1.75 }, Ta: { color: '#4da6ff', radius: 1.70 },
  W:  { color: '#2194d6', radius: 1.62 }, Re: { color: '#267dab', radius: 1.51 },
  Os: { color: '#266696', radius: 1.44 }, Ir: { color: '#175487', radius: 1.41 },
  Pt: { color: '#d0d0e0', radius: 1.36 }, Au: { color: '#ffd123', radius: 1.36 },
  Hg: { color: '#b8b8d0', radius: 1.32 }, Tl: { color: '#a6544d', radius: 1.45 },
  Pb: { color: '#575961', radius: 1.46 }, Bi: { color: '#9e4fb5', radius: 1.51 },
  Th: { color: '#007a00', radius: 2.06 }, U:  { color: '#008fff', radius: 1.96 },
};

const UNKNOWN = { color: '#c0c0c0', radius: 1.5 };

export const element = (sym) => ELEMENTS[sym] || UNKNOWN;

/** Strip a charge or isotope suffix from an atom-site type symbol. */
export function elementSymbol(sym) {
  if (!sym) return null;
  const m = sym.match(/[A-Z][a-z]?/);
  return m ? m[0] : null;
}

// ---------------------------------------------------------------------------
// CIF tokenizer
// ---------------------------------------------------------------------------

/**
 * Split CIF text into tokens: tags, values, loop_ markers. Handles quoted
 * strings, semicolon text blocks, and # comments. Returns an array of
 * { tag, value } pairs plus loop boundaries.
 */
export function tokenizeCif(text) {
  const tokens = [];
  const lines = text.split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    let line = lines[i];
    i++;
    const c = line.indexOf('#');
    if (c >= 0) line = line.slice(0, c);
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed === 'loop_') { tokens.push({ loop: true }); continue; }
    // Semicolon text block: value continues until a line starting with ';'
    if (trimmed.startsWith(';')) {
      let block = trimmed.slice(1) + '\n';
      while (i < lines.length && !lines[i].trimStart().startsWith(';')) {
        block += lines[i] + '\n';
        i++;
      }
      if (i < lines.length) block += lines[i].slice(1);
      i++;
      tokens.push({ value: block.trim() });
      continue;
    }
    // Quoted or plain tokens on the line
    const parts = [];
    let rest = trimmed;
    while (rest) {
      if (rest.startsWith("'") || rest.startsWith('"')) {
        const q = rest[0];
        const end = rest.indexOf(q, 1);
        if (end < 0) { parts.push(rest.slice(1)); rest = ''; }
        else { parts.push(rest.slice(1, end)); rest = rest.slice(end + 1).trim(); }
      } else {
        const sp = rest.search(/\s/);
        if (sp < 0) { parts.push(rest); rest = ''; }
        else { parts.push(rest.slice(0, sp)); rest = rest.slice(sp).trim(); }
      }
    }
    for (const p of parts) tokens.push({ value: p });
  }
  return tokens;
}

/** Parse a CIF into a plain object of tags and loops. */
export function parseCif(text) {
  const tokens = tokenizeCif(text);
  const data = { tags: {}, loops: [] };
  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i];
    if (t.loop) {
      i++;
      const headers = [];
      while (i < tokens.length && tokens[i].value && tokens[i].value.startsWith('_')) {
        headers.push(tokens[i].value);
        i++;
      }
      const rows = [];
      while (i < tokens.length && tokens[i].value && !tokens[i].value.startsWith('_') && !tokens[i].loop) {
        const row = {};
        for (let k = 0; k < headers.length; k++) row[headers[k]] = tokens[i + k] ? tokens[i + k].value : '';
        rows.push(row);
        i += headers.length;
      }
      data.loops.push({ headers, rows });
    } else if (t.value && t.value.startsWith('_')) {
      const tag = t.value;
      i++;
      const v = i < tokens.length && tokens[i].value && !tokens[i].loop ? tokens[i].value : '';
      if (v) i++;
      data.tags[tag] = v;
    } else {
      i++;
    }
  }
  return data;
}

/** First loop whose headers include every name in `need`. */
export function findLoop(data, need) {
  for (const loop of data.loops) {
    if (need.every((n) => loop.headers.includes(n))) return loop;
  }
  return null;
}

export const num = (s) => {
  if (s == null) return null;
  const clean = String(s).replace(/\([^)]*\)/g, '').trim();
  const v = parseFloat(clean);
  return Number.isFinite(v) ? v : null;
};

// ---------------------------------------------------------------------------
// Symmetry operations
// ---------------------------------------------------------------------------

/**
 * Parse one symmetry operation string like 'y, -x, -z' or 'x+1/2, -y, z'
 * into a 3x3 matrix (rows) and a translation vector.
 */
export function parseSymop(str) {
  const parts = str.replace(/\s+/g, '').split(',');
  if (parts.length !== 3) return null;
  const M = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  const t = [0, 0, 0];
  for (let r = 0; r < 3; r++) {
    const terms = parts[r].match(/[+-]?[^+-]+/g) || [];
    for (const term of terms) {
      const m = term.match(/^([+-]?)(\d*)(?:\/(\d+))?([xyz])?$/);
      if (!m) return null;
      const sign = m[1] === '-' ? -1 : 1;
      const numPart = m[2] === '' ? 1 : parseInt(m[2], 10);
      const den = m[3] ? parseInt(m[3], 10) : 1;
      const val = (sign * numPart) / den;
      if (m[4]) M[r][m[4].charCodeAt(0) - 120] = val;
      else t[r] += val;
    }
  }
  return { M, t };
}

/** Apply a symmetry operation to fractional coordinates, folded into [0, 1). */
export function applySymop(op, f) {
  const g = [0, 0, 0];
  for (let r = 0; r < 3; r++) {
    g[r] = op.M[r][0] * f[0] + op.M[r][1] * f[1] + op.M[r][2] * f[2] + op.t[r];
    g[r] = ((g[r] % 1) + 1) % 1;
  }
  return g;
}

/**
 * Expand the asymmetric unit by the symmetry operations. Returns atoms with
 * fractional coordinates in [0, 1), deduplicated (same element within eps).
 */
export function expandSymmetry(atoms, symops) {
  const eps = 1e-4;
  const out = [];
  const seen = new Set();
  for (const a of atoms) {
    for (const op of symops) {
      const f = applySymop(op, a.frac);
      const key = `${a.el}|${f.map((x) => x.toFixed(4)).join(',')}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ el: a.el, frac: f });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Structure conversion
// ---------------------------------------------------------------------------

/**
 * Build the STRUCTURES-format object from parsed CIF data. Returns null with
 * a reason string when the CIF cannot be rendered.
 */
export function cifToStructure(cif, meta = {}) {
  const cell = {
    a: num(cif.tags._cell_length_a),
    b: num(cif.tags._cell_length_b),
    c: num(cif.tags._cell_length_c),
    alpha: num(cif.tags._cell_angle_alpha),
    beta: num(cif.tags._cell_angle_beta),
    gamma: num(cif.tags._cell_angle_gamma),
  };
  if (!cell.a || !cell.b || !cell.c) return { error: 'This CIF has no cell lengths.' };

  // Symmetry operations: modern and legacy tag names.
  const symopLoop = findLoop(cif, ['_space_group_symop_operation_xyz'])
    || findLoop(cif, ['_symmetry_equiv_pos_as_xyz']);
  const symops = symopLoop
    ? symopLoop.rows.map((r) => r._space_group_symop_operation_xyz || r._symmetry_equiv_pos_as_xyz)
        .map(parseSymop).filter(Boolean)
    : [];
  if (!symops.length) return { error: 'This CIF has no symmetry operations, so the full cell cannot be generated.' };

  // Atom sites: map columns by header name (layouts vary between CIF dialects).
  const siteLoop = findLoop(cif, ['_atom_site_fract_x', '_atom_site_fract_y', '_atom_site_fract_z']);
  if (!siteLoop) return { error: 'This CIF has no atom sites.' };
  const h = (row, name) => row[name];
  const asym = [];
  for (const row of siteLoop.rows) {
    const sym = elementSymbol(h(row, '_atom_site_type_symbol') || h(row, '_atom_site_label'));
    const x = num(h(row, '_atom_site_fract_x'));
    const y = num(h(row, '_atom_site_fract_y'));
    const z = num(h(row, '_atom_site_fract_z'));
    if (!sym || x == null || y == null || z == null) continue;
    const occ = num(h(row, '_atom_site_occupancy'));
    if (occ != null && occ < 0.5) continue; // skip minor disorder sites
    asym.push({ el: sym, frac: [x, y, z] });
  }
  if (!asym.length) return { error: 'This CIF has no readable atom sites.' };

  const atoms = expandSymmetry(asym, symops);
  const formula = cif.tags._chemical_formula_sum || cif.tags._chemical_formula_moiety || '';
  const spaceGroup = cif.tags['_space_group_name_H-M'] || cif.tags['_space_group_name_H-M_alt']
    || cif.tags['_symmetry_space_group_name_H-M'] || '';

  // Species: one entry per element present.
  const els = [...new Set(atoms.map((a) => a.el))];
  const species = {};
  for (const el of els) {
    const e = element(el);
    species[el] = { label: el, color: e.color, radius: e.radius, cn: 0 };
  }

  // Bonds: covalent-radius cutoff per element pair (sum x 1.2). Different
  // elements always bond when within cutoff; same-element pairs bond only in
  // single-element structures (metals, diamond, graphite). This keeps ionic
  // compounds clean (no spurious cation-cation sticks) and separates
  // molecular crystals, whose molecules never bond across the cell.
  const cutoff = {};
  const pairs = [];
  for (let p = 0; p < els.length; p++) {
    for (let q = p; q < els.length; q++) {
      if (p === q && els.length > 1) continue;
      const r = element(els[p]).radius + element(els[q]).radius;
      cutoff[`${els[p]}|${els[q]}`] = r * 1.2;
      pairs.push([els[p], els[q]]);
    }
  }
  const bond = { cutoff, pairs };

  const s = {
    id: meta.id || `cif-${Date.now()}`,
    group: 'custom',
    formula: formula.replace(/\s+/g, ' ').trim(),
    name: meta.name || 'Custom structure',
    type: 'From Crystallography Open Database',
    system: cif.tags._space_group_crystal_system || cif.tags._symmetry_cell_setting || '',
    spaceGroup: spaceGroup.replace(/^['"]|['"]$/g, ''),
    cell,
    species,
    sites: els.map((el) => ({ el, wyckoff: '', frac: atoms.filter((a) => a.el === el).map((a) => a.frac) })),
    polyhedra: null,
    bond,
    tiling: [[1, 1, 1], [2, 2, 2], [3, 3, 3]],
    desc: meta.desc || `${formula.replace(/\s+/g, ' ').trim()} from the Crystallography Open Database.`,
    source: meta.source || null,
  };

  // Classification: molecular crystals have discrete molecules that do not
  // bond across the cell boundary; atomic and ionic crystals form one
  // connected network. Check by periodic connectivity.
  const molecular = isMolecular(s);
  if (molecular) {
    return { error: 'This looks like a molecular crystal (discrete molecules held by weak forces). This viewer shows atomic and ionic crystals. Try sapphire, table salt, or diamond.' };
  }
  return { structure: s };
}

// ---------------------------------------------------------------------------
// Geometry helpers (mirror structures.js so cif.js stays standalone)
// ---------------------------------------------------------------------------

export function cellVectors({ a, b, c, alpha, beta, gamma }) {
  const r = Math.PI / 180;
  const [ca, cb, cg, sg] = [Math.cos(alpha * r), Math.cos(beta * r), Math.cos(gamma * r), Math.sin(gamma * r)];
  const cx = cb;
  const cy = (ca - cb * cg) / sg;
  const cz = Math.sqrt(1 - cx * cx - cy * cy);
  const clean = (v) => v.map((x) => (Math.abs(x) < 1e-12 ? 0 : x));
  return [clean([a, 0, 0]), clean([b * cg, b * sg, 0]), clean([c * cx, c * cy, c * cz])];
}

export function toCartesian(frac, vecs) {
  return [0, 1, 2].map((k) => frac[0] * vecs[0][k] + frac[1] * vecs[1][k] + frac[2] * vecs[2][k]);
}

const dist = (a, b) => Math.sqrt(a.reduce((s, x, i) => s + (x - b[i]) ** 2, 0));
const shiftPos = (p, vecs, [i, j, k]) => [
  p[0] + i * vecs[0][0] + j * vecs[1][0] + k * vecs[2][0],
  p[1] + i * vecs[0][1] + j * vecs[1][1] + k * vecs[2][1],
  p[2] + i * vecs[0][2] + j * vecs[1][2] + k * vecs[2][2],
];

/**
 * True when the structure is molecular: no atom bonds to its own periodic
 * image, so every component is a finite molecule. Atomic and ionic crystals
 * (metals, salts, covalent networks, layered solids) always wrap around the
 * cell in at least one direction.
 */
export function isMolecular(s) {
  const vecs = cellVectors(s.cell);
  const atoms = s.sites.flatMap((site) => site.frac.map((f) => ({ el: site.el, frac: f })));
  if (atoms.length < 2) return false;
  const pos = atoms.map((a) => toCartesian(a.frac, vecs));
  const { cutoff, pairs } = s.bond;
  const allowed = new Set(pairs.flatMap(([p, q]) => [`${p}|${q}`, `${q}|${p}`]));
  const maxD = (a, b) => cutoff[`${a}|${b}`] ?? cutoff[`${b}|${a}`] ?? 0;
  const n = atoms.length;
  const parent = Array.from({ length: n * 27 }, (_, k) => k);
  const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  const union = (a, b) => { parent[find(a)] = find(b); };
  const idx = (i, di, dj, dk) => i + n * ((di + 1) + 3 * (dj + 1) + 9 * (dk + 1));

  // Full covering graph on the 3x3x3 block of cell copies: every bond is
  // replicated at every copy, so wrapping paths are found exactly.
  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      if (!allowed.has(`${atoms[i].el}|${atoms[j].el}`)) continue;
      const cut = maxD(atoms[i].el, atoms[j].el);
      for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) for (let dk = -1; dk <= 1; dk++) {
        if (i === j && di === 0 && dj === 0 && dk === 0) continue;
        const d = dist(pos[i], shiftPos(pos[j], vecs, [di, dj, dk]));
        if (d > cut) continue;
        for (let ti = -1; ti <= 1; ti++) for (let tj = -1; tj <= 1; tj++) for (let tk = -1; tk <= 1; tk++) {
          const ui = ti + di, uj = tj + dj, uk = tk + dk;
          if (ui < -1 || ui > 1 || uj < -1 || uj > 1 || uk < -1 || uk > 1) continue;
          union(idx(i, ti, tj, tk), idx(j, ui, uj, uk));
        }
      }
    }
  }

  // Molecular iff no atom connects to its periodic image in any direction.
  for (let i = 0; i < n; i++) {
    for (const [di, dj, dk] of [[1, 0, 0], [0, 1, 0], [0, 0, 1]]) {
      if (find(idx(i, 0, 0, 0)) === find(idx(i, di, dj, dk))) return false;
    }
  }
  return true;
}
