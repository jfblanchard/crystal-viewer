// Crystallographic checks for the crystal viewer.
// Run from deploy/:  node --test test_structures.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  STRUCTURES, STRUCTURES_BY_ID as S, tilings, cellVectors, unitCellAtoms, buildBlock, neighborShells,
  sub, norm, dot, angleDeg,
} from './structures.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} (±${tol})`);
const SQ2 = Math.sqrt(2), SQ3 = Math.sqrt(3);
const FCC = [[0, 0, 0], [0.5, 0.5, 0], [0.5, 0, 0.5], [0, 0.5, 0.5]];
const TETRA = (Math.acos(-1 / 3) * 180) / Math.PI;

// Room-temperature lattice constants (Å), independent of structures.js.
const REFERENCE = {
  na: { a: 4.29, c: 4.29, gamma: 90 },
  cu: { a: 3.615, c: 3.615, gamma: 90 },
  mg: { a: 3.209, c: 5.211, gamma: 120 },
  nacl: { a: 5.64, c: 5.64, gamma: 90 },
  cscl: { a: 4.123, c: 4.123, gamma: 90 },
  zns: { a: 5.409, c: 5.409, gamma: 90 },
  caf2: { a: 5.463, c: 5.463, gamma: 90 },
  diamond: { a: 3.567, c: 3.567, gamma: 90 },
  graphite: { a: 2.464, c: 6.711, gamma: 120 },
};

// Nearest-neighbor distance and coordination number of each species.
const NN = {
  na: { d: (4.29 * SQ3) / 2, cn: { Na: 8 } },
  cu: { d: 3.615 / SQ2, cn: { Cu: 12 } },
  mg: { d: Math.sqrt(3.209 ** 2 / 3 + 5.211 ** 2 / 4), cn: { Mg: 12 } }, // the shorter of the two 6-shells
  nacl: { d: 5.64 / 2, cn: { Na: 6, Cl: 6 } },
  cscl: { d: (4.123 * SQ3) / 2, cn: { Cs: 8, Cl: 8 } },
  zns: { d: (5.409 * SQ3) / 4, cn: { Zn: 4, S: 4 } },
  caf2: { d: (5.463 * SQ3) / 4, cn: { Ca: 8, F: 4 } },
  diamond: { d: (3.567 * SQ3) / 4, cn: { C: 4 } },
  graphite: { d: 2.464 / SQ3, cn: { C: 3 } },
};

// Atoms per conventional cell, by species.
const CONTENTS = {
  na: { Na: 2 }, cu: { Cu: 4 }, mg: { Mg: 2 },
  nacl: { Na: 4, Cl: 4 }, cscl: { Cs: 1, Cl: 1 }, zns: { Zn: 4, S: 4 }, caf2: { Ca: 4, F: 8 },
  diamond: { C: 8 }, graphite: { C: 4 },
};

const key = (f) => f.map((x) => x.toFixed(6)).join(',');
const sameSites = (got, want, msg) => assert.deepEqual(new Set(got.map(key)), new Set(want.map(key)), msg);
const count = (atoms) => atoms.reduce((m, a) => ({ ...m, [a.el]: (m[a.el] || 0) + 1 }), {});

// --- cells ---------------------------------------------------------------

test('every structure in the spec is present', () => {
  for (const id of ['na', 'nacl', 'cscl', 'diamond', 'graphite', 'cu']) assert.ok(S[id], id);
  assert.equal(STRUCTURES[0].id, 'na', 'sodium metal is the default');
});

test('lattice constants and angles are the real values', () => {
  for (const s of STRUCTURES) {
    const r = REFERENCE[s.id];
    near(s.cell.a, r.a, 1e-9, `${s.id} a`);
    near(s.cell.b, r.a, 1e-9, `${s.id} b`);
    near(s.cell.c, r.c, 1e-9, `${s.id} c`);
    assert.equal(s.cell.alpha, 90, `${s.id} α`);
    assert.equal(s.cell.beta, 90, `${s.id} β`);
    assert.equal(s.cell.gamma, r.gamma, `${s.id} γ`);
  }
  // the values given in the spec, to its precision
  near(S.na.cell.a, 4.29, 0.005, 'Na');
  near(S.nacl.cell.a, 5.64, 0.005, 'NaCl');
  near(S.cscl.cell.a, 4.12, 0.005, 'CsCl');
  near(S.diamond.cell.a, 3.57, 0.005, 'diamond');
  near(S.graphite.cell.a, 2.46, 0.005, 'graphite a');
  near(S.graphite.cell.c, 6.71, 0.005, 'graphite c');
  near(S.cu.cell.a, 3.61, 0.006, 'Cu');
});

test('cell vectors reproduce the cell parameters', () => {
  for (const s of STRUCTURES) {
    const [a1, a2, a3] = cellVectors(s.cell);
    near(norm(a1), s.cell.a, 1e-9, `${s.id} |a|`);
    near(norm(a2), s.cell.b, 1e-9, `${s.id} |b|`);
    near(norm(a3), s.cell.c, 1e-9, `${s.id} |c|`);
    near(angleDeg(a2, a3), s.cell.alpha, 1e-9, `${s.id} α`);
    near(angleDeg(a1, a3), s.cell.beta, 1e-9, `${s.id} β`);
    near(angleDeg(a1, a2), s.cell.gamma, 1e-9, `${s.id} γ`);
  }
});

// --- Wyckoff sites ------------------------------------------------------

test('atomic positions follow the space-group Wyckoff sites', () => {
  const at = (id, el) => unitCellAtoms(S[id]).filter((a) => a.el === el).map((a) => a.frac);
  const plus = (pts, d) => pts.map((p) => p.map((x, i) => (x + d[i]) % 1));

  sameSites(at('na', 'Na'), [[0, 0, 0], [0.5, 0.5, 0.5]], 'Na bcc 2a');
  sameSites(at('cu', 'Cu'), FCC, 'Cu fcc 4a');
  sameSites(at('mg', 'Mg'), [[1 / 3, 2 / 3, 1 / 4], [2 / 3, 1 / 3, 3 / 4]], 'Mg hcp 2c');
  sameSites(at('nacl', 'Na'), FCC, 'NaCl Na 4a');
  sameSites(at('nacl', 'Cl'), plus(FCC, [0.5, 0.5, 0.5]), 'NaCl Cl 4b');
  sameSites(at('cscl', 'Cl'), [[0, 0, 0]], 'CsCl Cl 1a');
  sameSites(at('cscl', 'Cs'), [[0.5, 0.5, 0.5]], 'CsCl Cs 1b');
  sameSites(at('zns', 'Zn'), FCC, 'ZnS Zn 4a');
  sameSites(at('zns', 'S'), plus(FCC, [0.25, 0.25, 0.25]), 'ZnS S 4c');
  sameSites(at('caf2', 'Ca'), FCC, 'CaF2 Ca 4a');
  sameSites(at('caf2', 'F'), [...plus(FCC, [0.25, 0.25, 0.25]), ...plus(FCC, [0.75, 0.75, 0.75])], 'CaF2 F 8c');
  sameSites(at('diamond', 'C'), [...FCC, ...plus(FCC, [0.25, 0.25, 0.25])], 'diamond 8a');
  sameSites(at('graphite', 'C'), [[0, 0, 1 / 4], [0, 0, 3 / 4], [1 / 3, 2 / 3, 1 / 4], [2 / 3, 1 / 3, 3 / 4]], 'graphite 2b + 2c');
});

test('cell contents and stoichiometry', () => {
  for (const s of STRUCTURES) {
    const atoms = unitCellAtoms(s);
    assert.deepEqual(count(atoms), CONTENTS[s.id], s.id);
    for (const a of atoms) assert.ok(a.frac.every((x) => x >= 0 && x < 1), `${s.id} ${a.frac} inside [0,1)`);
    assert.equal(new Set(atoms.map((a) => key(a.frac))).size, atoms.length, `${s.id} no duplicate sites`);
  }
});

// --- neighbors ------------------------------------------------------------

test('nearest-neighbor distance and coordination number (periodic search)', () => {
  for (const s of STRUCTURES) {
    const shells = neighborShells(s);
    for (const [el, cn] of Object.entries(NN[s.id].cn)) {
      near(shells[el].distance, NN[s.id].d, 1e-9, `${s.id} ${el} nearest distance`);
      assert.equal(shells[el].count, cn, `${s.id} ${el} coordination`);
      assert.equal(s.species[el].cn, cn, `${s.id} ${el} declared coordination`);
    }
  }
});

test('bcc Na: 8 neighbors at a√3/2 along the body diagonals', () => {
  const a = S.na.cell.a;
  const { atoms, bonds } = buildBlock(S.na, [2, 2, 2]);
  const c = atoms.findIndex((x) => key(x.frac) === key([1, 1, 1]));
  const mine = bonds.filter((b) => b.includes(c));
  assert.equal(mine.length, 8);
  for (const [i, j] of mine) {
    const v = sub(atoms[i].pos, atoms[j].pos);
    near(norm(v), (a * SQ3) / 2, 1e-9, 'Na–Na');
    for (const x of v) near(Math.abs(x), a / 2, 1e-9, 'along a body diagonal');
  }
  // nothing closer than the bonded shell, and the next shell (a) is not bonded
  for (let j = 0; j < atoms.length; j++) {
    if (j === c) continue;
    assert.ok(norm(sub(atoms[j].pos, atoms[c].pos)) >= (a * SQ3) / 2 - 1e-9);
  }
});

test('bonds join only nearest neighbors of the right kinds', () => {
  for (const s of STRUCTURES) {
    const { atoms, bonds } = buildBlock(s, tilings(s)[2]);
    const allowed = new Set(s.bond.pairs.flatMap(([p, q]) => [`${p}|${q}`, `${q}|${p}`]));
    const shell = neighborShells(s);
    for (const [i, j] of bonds) {
      assert.ok(allowed.has(`${atoms[i].el}|${atoms[j].el}`), `${s.id} bond kind`);
      const d = norm(sub(atoms[i].pos, atoms[j].pos));
      near(d, shell[atoms[i].el].distance, 0.02 * d, `${s.id} bond length`);
    }
  }
});

test('interior atoms of a large block have full coordination', () => {
  for (const s of STRUCTURES) {
    const { atoms, bonds, size } = buildBlock(s, tilings(s)[2]);
    const degree = new Array(atoms.length).fill(0);
    for (const [i, j] of bonds) { degree[i]++; degree[j]++; }
    // Far enough from every face that the whole neighbor shell is inside.
    // Neighbors lie within one cell in x, y; in the hexagonal cells within
    // half a cell along c (graphite's bonds never leave the sheet).
    const margin = (k) => (k < 2 || s.cell.gamma === 90 ? 1 : s.id === 'graphite' ? 0 : 0.5);
    const interior = atoms.map((a, i) => i).filter((i) => atoms[i].frac.every((f, k) =>
      f >= margin(k) - 1e-9 && f <= size[k] - margin(k) + 1e-9));
    assert.ok(interior.length > 0, `${s.id} has interior atoms`);
    for (const i of interior) assert.equal(degree[i], s.species[atoms[i].el].cn, `${s.id} ${atoms[i].el} at ${atoms[i].frac}`);
  }
});

test('tetrahedral and trigonal bond angles', () => {
  const angles = (s, size) => {
    const { atoms, bonds } = buildBlock(s, size);
    const out = [];
    atoms.forEach((a, c) => {
      const nb = bonds.filter((b) => b.includes(c)).map(([i, j]) => (i === c ? j : i));
      if (nb.length < s.species[a.el].cn) return;
      for (let x = 0; x < nb.length; x++) for (let y = x + 1; y < nb.length; y++) {
        out.push(angleDeg(sub(atoms[nb[x]].pos, a.pos), sub(atoms[nb[y]].pos, a.pos)));
      }
    });
    return out;
  };
  const d = angles(S.diamond, [2, 2, 2]);
  assert.ok(d.length > 0);
  for (const x of d) near(x, TETRA, 1e-9, 'diamond C–C–C');
  for (const x of angles(S.zns, [2, 2, 2])) near(x, TETRA, 1e-9, 'ZnS tetrahedral');
  const g = angles(S.graphite, [4, 4, 1]);
  assert.ok(g.length > 0);
  for (const x of g) near(x, 120, 1e-9, 'graphite C–C–C');
});

test('graphite: planar sheets, 1.42 Å bonds, 3.36 Å apart', () => {
  const { atoms, bonds } = buildBlock(S.graphite, [4, 4, 1]);
  for (const [i, j] of bonds) {
    near(atoms[i].pos[2], atoms[j].pos[2], 1e-9, 'bonds stay in their sheet');
    near(norm(sub(atoms[i].pos, atoms[j].pos)), 1.4226, 0.001, 'C–C');
  }
  const layers = [...new Set(atoms.map((a) => a.pos[2].toFixed(6)))].map(Number).sort((a, b) => a - b);
  assert.equal(layers.length, 2);
  near(layers[1] - layers[0], 6.711 / 2, 1e-9, 'interlayer spacing');
});

// --- tiled blocks ------------------------------------------------------------

test('tiled blocks contain the right number of atoms', () => {
  // Blocks include the atoms on their far faces, so a single cell shows all corners.
  const bcc = (n) => (n + 1) ** 3 + n ** 3;
  const fcc = (n) => (n + 1) ** 3 + 3 * n * n * (n + 1);
  const sc = (n) => (n + 1) ** 3;
  const cases = [
    ['na', [1, 1, 1], { Na: 9 }],
    ['na', [2, 2, 2], { Na: bcc(2) }],
    ['na', [3, 3, 3], { Na: bcc(3) }],
    ['cu', [1, 1, 1], { Cu: 14 }],
    ['cu', [2, 2, 2], { Cu: fcc(2) }],
    ['nacl', [1, 1, 1], { Na: 14, Cl: 13 }],
    ['nacl', [2, 2, 2], { Na: fcc(2), Cl: 5 ** 3 - fcc(2) }],
    ['nacl', [3, 3, 3], { Na: fcc(3), Cl: 7 ** 3 - fcc(3) }],
    ['cscl', [1, 1, 1], { Cl: 8, Cs: 1 }],
    ['cscl', [2, 2, 2], { Cl: sc(2), Cs: 8 }],
    ['zns', [1, 1, 1], { Zn: 14, S: 4 }],
    ['caf2', [1, 1, 1], { Ca: 14, F: 8 }],
    ['diamond', [1, 1, 1], { C: 18 }],
    ['diamond', [2, 2, 2], { C: fcc(2) + 32 }],
    ['mg', [1, 1, 1], { Mg: 2 }],
    ['graphite', [1, 1, 1], { C: 10 }],
  ];
  for (const [id, size, want] of cases) assert.deepEqual(count(buildBlock(S[id], size).atoms), want, `${id} ${size}`);
});

test('single NaCl cell is the classic 3×3×3 alternating cube', () => {
  const { atoms, bonds } = buildBlock(S.nacl, [1, 1, 1]);
  const a = S.nacl.cell.a;
  for (const at of atoms) {
    const idx = at.frac.map((f) => Math.round(f * 2));
    const parity = (idx[0] + idx[1] + idx[2]) % 2;
    assert.equal(at.el, parity === 0 ? 'Na' : 'Cl', `${at.frac}`);
  }
  assert.equal(bonds.length, 3 * 9 * 2); // 3 directions × 9 lines × 2 edges each
  for (const [i, j] of bonds) near(norm(sub(atoms[i].pos, atoms[j].pos)), a / 2, 1e-9, 'Na–Cl');
});

test('block center is the middle of the block', () => {
  for (const s of STRUCTURES) {
    for (const size of tilings(s)) {
      const { vecs, center } = buildBlock(s, size);
      const far = [0, 1, 2].map((k) => size[0] * vecs[0][k] + size[1] * vecs[1][k] + size[2] * vecs[2][k]);
      for (let k = 0; k < 3; k++) near(center[k], far[k] / 2, 1e-9, `${s.id} center`);
      assert.ok(dot(far, far) > 0);
    }
  }
});
