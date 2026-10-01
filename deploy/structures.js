/**
 * structures.js — crystallographic data and lattice geometry.
 *
 * Each structure gives its conventional unit cell (a, b, c in Å; α, β, γ in
 * degrees), the space group, and every atom in the cell as fractional
 * coordinates grouped by Wyckoff site. Nothing here depends on three.js, so
 * the same code drives the viewer and the Node tests.
 *
 * Bonds are nearest-neighbor contacts: pairs of the listed species whose
 * distance matches `bond.length` within `bond.tol` (relative). For hcp Mg the
 * two slightly different 6 + 6 neighbor shells (3.197 and 3.209 Å) both fall
 * inside the tolerance, as they should: together they are the 12 contacts.
 *
 * Display radii are real radii (metallic, covalent, or Shannon ionic for the
 * coordination shown). At 100% ball size, touching atoms touch.
 *
 * Sources: lattice constants at room temperature from the CRC Handbook and
 * Wyckoff, "Crystal Structures"; ionic radii from Shannon (1976).
 */

const SQ3 = Math.sqrt(3);
const SQ2 = Math.sqrt(2);

// Centering translations and the sites they generate.
const FCC = [[0, 0, 0], [0.5, 0.5, 0], [0.5, 0, 0.5], [0, 0.5, 0.5]];
const shift = (pts, d) => pts.map((p) => p.map((x, i) => (x + d[i]) % 1));

const cubic = (a) => ({ a, b: a, c: a, alpha: 90, beta: 90, gamma: 90 });
const hexagonal = (a, c) => ({ a, b: a, c, alpha: 90, beta: 90, gamma: 120 });

export const GROUPS = [
  ['metals', 'Metals'],
  ['ionic', 'Ionic'],
  ['covalent', 'Covalent network'],
  ['layered', 'Layered'],
];

export const STRUCTURES = [
  {
    id: 'na',
    group: 'metals',
    formula: 'Na',
    name: 'Sodium metal',
    type: 'Body-centered cubic (bcc)',
    system: 'Cubic',
    spaceGroup: 'Im3̄m',
    cell: cubic(4.29),
    species: {
      Na: { label: 'Na', color: '#c3c9d4', radius: 1.86, metal: true, cn: 8 },
    },
    sites: [{ el: 'Na', wyckoff: '2a', frac: [[0, 0, 0], [0.5, 0.5, 0.5]] }],
    polyhedra: 'Na',
    bond: { length: (4.29 * SQ3) / 2, tol: 0.02, pairs: [['Na', 'Na']] },
    desc: 'One atom at each cube corner and one in the center. Each atom touches 8 neighbors along the body diagonals; 68% of the space is filled.',
  },
  {
    id: 'cu',
    group: 'metals',
    formula: 'Cu',
    name: 'Copper',
    type: 'Face-centered cubic (fcc, cubic close-packed)',
    system: 'Cubic',
    spaceGroup: 'Fm3̄m',
    cell: cubic(3.615),
    species: {
      Cu: { label: 'Cu', color: '#d98a5c', radius: 1.28, metal: true, cn: 12 },
    },
    sites: [{ el: 'Cu', wyckoff: '4a', frac: FCC }],
    polyhedra: 'Cu',
    bond: { length: 3.615 / SQ2, tol: 0.02, pairs: [['Cu', 'Cu']] },
    desc: 'Atoms at the corners and the face centers. Each atom touches 12 neighbors, the densest packing of equal spheres: 74% of the space is filled.',
  },
  {
    id: 'mg',
    group: 'metals',
    formula: 'Mg',
    name: 'Magnesium',
    type: 'Hexagonal close-packed (hcp)',
    system: 'Hexagonal',
    spaceGroup: 'P6₃/mmc',
    cell: hexagonal(3.209, 5.211),
    species: {
      Mg: { label: 'Mg', color: '#b9c4b0', radius: 1.6, metal: true, cn: 12 },
    },
    sites: [{ el: 'Mg', wyckoff: '2c', frac: [[1 / 3, 2 / 3, 0.25], [2 / 3, 1 / 3, 0.75]] }],
    polyhedra: 'Mg',
    bond: { length: 3.209, tol: 0.02, pairs: [['Mg', 'Mg']] },
    tiling: [[1, 1, 1], [2, 2, 2], [3, 3, 2]],
    desc: 'Close-packed layers stacked ABAB. Like copper, each atom touches 12 neighbors and 74% of the space is filled; only the stacking of the layers differs.',
  },
  {
    id: 'nacl',
    group: 'ionic',
    formula: 'NaCl',
    name: 'Sodium chloride (rock salt)',
    type: 'Rock salt: two interpenetrating fcc lattices',
    system: 'Cubic',
    spaceGroup: 'Fm3̄m',
    cell: cubic(5.64),
    species: {
      Na: { label: 'Na⁺', color: '#8e8cf0', radius: 1.02, cn: 6 },
      Cl: { label: 'Cl⁻', color: '#45c95a', radius: 1.81, cn: 6 },
    },
    sites: [
      { el: 'Na', wyckoff: '4a', frac: FCC },
      { el: 'Cl', wyckoff: '4b', frac: shift(FCC, [0.5, 0, 0]) },
    ],
    polyhedra: 'Na',
    bond: { length: 5.64 / 2, tol: 0.02, pairs: [['Na', 'Cl']] },
    desc: 'Na⁺ and Cl⁻ alternate along every cube edge. Each ion sits at the center of an octahedron of 6 ions of the other kind; 4 NaCl units per cell.',
  },
  {
    id: 'cscl',
    group: 'ionic',
    formula: 'CsCl',
    name: 'Cesium chloride',
    type: 'Simple cubic, two-atom basis',
    system: 'Cubic',
    spaceGroup: 'Pm3̄m',
    cell: cubic(4.123),
    species: {
      Cs: { label: 'Cs⁺', color: '#e0b43c', radius: 1.74, cn: 8 },
      Cl: { label: 'Cl⁻', color: '#45c95a', radius: 1.81, cn: 8 },
    },
    sites: [
      { el: 'Cl', wyckoff: '1a', frac: [[0, 0, 0]] },
      { el: 'Cs', wyckoff: '1b', frac: [[0.5, 0.5, 0.5]] },
    ],
    polyhedra: 'Cs',
    bond: { length: (4.123 * SQ3) / 2, tol: 0.02, pairs: [['Cs', 'Cl']] },
    desc: 'Cl⁻ at the corners, Cs⁺ in the center. The large Cs⁺ ion has room for 8 Cl⁻ neighbors. It looks like bcc, but it is not: corner and center are different ions.',
  },
  {
    id: 'zns',
    group: 'ionic',
    formula: 'ZnS',
    name: 'Zinc blende (sphalerite)',
    type: 'Zinc blende: fcc with half the tetrahedral holes filled',
    system: 'Cubic',
    spaceGroup: 'F4̄3m',
    cell: cubic(5.409),
    species: {
      Zn: { label: 'Zn²⁺', color: '#8f93c8', radius: 0.6, cn: 4 },
      S: { label: 'S²⁻', color: '#f0cf3a', radius: 1.84, cn: 4 },
    },
    sites: [
      { el: 'Zn', wyckoff: '4a', frac: FCC },
      { el: 'S', wyckoff: '4c', frac: shift(FCC, [0.25, 0.25, 0.25]) },
    ],
    polyhedra: 'Zn',
    bond: { length: (5.409 * SQ3) / 4, tol: 0.02, pairs: [['Zn', 'S']] },
    desc: 'The diamond structure with two alternating elements. Zn²⁺ forms an fcc lattice and S²⁻ fills half of its tetrahedral holes, so every ion has 4 neighbors of the other kind.',
  },
  {
    id: 'caf2',
    group: 'ionic',
    formula: 'CaF₂',
    name: 'Fluorite',
    type: 'Fluorite: fcc with every tetrahedral hole filled',
    system: 'Cubic',
    spaceGroup: 'Fm3̄m',
    cell: cubic(5.463),
    species: {
      Ca: { label: 'Ca²⁺', color: '#e9e2d0', radius: 1.12, cn: 8 },
      F: { label: 'F⁻', color: '#8fd95a', radius: 1.31, cn: 4 },
    },
    sites: [
      { el: 'Ca', wyckoff: '4a', frac: FCC },
      { el: 'F', wyckoff: '8c', frac: [...shift(FCC, [0.25, 0.25, 0.25]), ...shift(FCC, [0.75, 0.75, 0.75])] },
    ],
    polyhedra: 'Ca',
    bond: { length: (5.463 * SQ3) / 4, tol: 0.02, pairs: [['Ca', 'F']] },
    desc: 'Ca²⁺ on an fcc lattice with F⁻ in all 8 tetrahedral holes, a simple cube of F⁻ inside. Each Ca²⁺ has 8 F⁻ neighbors; each F⁻ has 4 Ca²⁺.',
  },
  {
    id: 'diamond',
    group: 'covalent',
    formula: 'C',
    name: 'Diamond',
    type: 'Diamond cubic: two fcc lattices offset by ¼ of the body diagonal',
    system: 'Cubic',
    spaceGroup: 'Fd3̄m',
    cell: cubic(3.567),
    species: {
      C: { label: 'C', color: '#7c8591', radius: 0.77, cn: 4 },
    },
    sites: [{ el: 'C', wyckoff: '8a', frac: [...FCC, ...shift(FCC, [0.25, 0.25, 0.25])] }],
    polyhedra: 'C',
    bond: { length: (3.567 * SQ3) / 4, tol: 0.02, pairs: [['C', 'C']] },
    desc: 'Every carbon is sp³, bonded to 4 others at 109.5°. The whole crystal is one covalent network, which is why diamond is so hard.',
  },
  {
    id: 'graphite',
    group: 'layered',
    formula: 'C',
    name: 'Graphite',
    type: 'Hexagonal sheets stacked ABAB',
    system: 'Hexagonal',
    spaceGroup: 'P6₃/mmc',
    cell: hexagonal(2.464, 6.711),
    species: {
      C: { label: 'C', color: '#7c8591', radius: 0.71, cn: 3 },
    },
    sites: [
      { el: 'C', wyckoff: '2b', frac: [[0, 0, 0.25], [0, 0, 0.75]] },
      { el: 'C', wyckoff: '2c', frac: [[1 / 3, 2 / 3, 0.25], [2 / 3, 1 / 3, 0.75]] },
    ],
    bond: { length: 2.464 / SQ3, tol: 0.02, pairs: [['C', 'C']] },
    tiling: [[1, 1, 1], [4, 4, 1], [6, 6, 1]],
    desc: 'Flat sheets of sp² carbon hexagons, 1.42 Å bonds at 120°. The sheets are 3.36 Å apart, held only by weak van der Waals forces, so they slide past each other.',
  },
];

export const STRUCTURES_BY_ID = Object.fromEntries(STRUCTURES.map((s) => [s.id, s]));

/** Block sizes for the three view modes: unit cell, expanded, large. */
export const tilings = (s) => s.tiling || [[1, 1, 1], [2, 2, 2], [3, 3, 3]];

// --- vector helpers ----------------------------------------------------------

export const sub = (a, b) => a.map((x, i) => x - b[i]);
export const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
export const norm = (a) => Math.sqrt(dot(a, a));
export const angleDeg = (u, v) => (Math.acos(Math.max(-1, Math.min(1, dot(u, v) / (norm(u) * norm(v))))) * 180) / Math.PI;

/**
 * Cartesian cell vectors [a1, a2, a3] for any cell: a1 along x, a2 in the
 * xy plane, a3 completing the frame. Hexagonal cells get c along z.
 */
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

/** All atoms of the conventional cell, fractional coordinates in [0, 1). */
export function unitCellAtoms(s) {
  return s.sites.flatMap((site) => site.frac.map((f) => ({ el: site.el, wyckoff: site.wyckoff, frac: f })));
}

/**
 * An nx × ny × nz block of cells, including the atoms on its far faces,
 * edges, and corners, so a single cell shows all 8 corners the way textbook
 * figures do. Bonds connect nearest-neighbor pairs inside the block.
 */
export function buildBlock(s, [nx, ny, nz] = [1, 1, 1]) {
  const vecs = cellVectors(s.cell);
  const eps = 1e-6;
  const atoms = [];
  for (const { el, frac } of unitCellAtoms(s)) {
    for (let i = 0; i <= nx; i++) for (let j = 0; j <= ny; j++) for (let k = 0; k <= nz; k++) {
      const f = [frac[0] + i, frac[1] + j, frac[2] + k];
      if (f[0] > nx + eps || f[1] > ny + eps || f[2] > nz + eps) continue;
      atoms.push({ el, frac: f, pos: toCartesian(f, vecs) });
    }
  }
  const { length, tol, pairs } = s.bond;
  const allowed = new Set(pairs.flatMap(([p, q]) => [`${p}|${q}`, `${q}|${p}`]));
  const bonds = [];
  for (let i = 0; i < atoms.length; i++) {
    for (let j = i + 1; j < atoms.length; j++) {
      if (!allowed.has(`${atoms[i].el}|${atoms[j].el}`)) continue;
      const d = norm(sub(atoms[i].pos, atoms[j].pos));
      if (Math.abs(d - length) <= tol * length) bonds.push([i, j]);
    }
  }
  const center = toCartesian([nx / 2, ny / 2, nz / 2], vecs);
  return { atoms, bonds, vecs, size: [nx, ny, nz], center };
}

/**
 * Nearest-neighbor shell of each species, found by brute force over the
 * periodic lattice (independent of the bond rule): the shortest distance to
 * any atom, and how many atoms sit within `tol` of it.
 */
export function neighborShells(s, tol = 0.02) {
  const vecs = cellVectors(s.cell);
  const cell = unitCellAtoms(s);
  const out = {};
  for (const center of cell) {
    if (out[center.el]) continue;
    const p = toCartesian(center.frac, vecs);
    const ds = [];
    for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) for (let k = -2; k <= 2; k++) {
      for (const other of cell) {
        const q = toCartesian([other.frac[0] + i, other.frac[1] + j, other.frac[2] + k], vecs);
        const d = norm(sub(p, q));
        if (d > 1e-6) ds.push({ d, el: other.el });
      }
    }
    const min = Math.min(...ds.map((x) => x.d));
    const shell = ds.filter((x) => x.d <= min * (1 + tol));
    out[center.el] = { distance: min, count: shell.length, neighbors: [...new Set(shell.map((x) => x.el))] };
  }
  return out;
}
