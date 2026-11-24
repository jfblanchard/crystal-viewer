/**
 * test_cif.mjs — tests for cif.js against real COD CIF fixtures.
 *
 * Run: node test_cif.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  parseCif, cifToStructure, parseSymop, applySymop, expandSymmetry,
  elementSymbol, num, cellVectors, toCartesian,
} from './cif.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name) => readFileSync(join(here, 'testdata', name), 'utf8');

let pass = 0, fail = 0;
const ok = (cond, msg) => {
  if (cond) { pass++; console.log(`  ok: ${msg}`); }
  else { fail++; console.log(`  FAIL: ${msg}`); }
};
const close = (a, b, tol = 1e-3) => Math.abs(a - b) <= tol;

// --- symop parsing ----------------------------------------------------------

console.log('symop parsing');
{
  const id = parseSymop('x, y, z');
  ok(id && id.M[0][0] === 1 && id.t[0] === 0, 'identity');
  const rot = parseSymop('y, -x, -z');
  ok(rot && rot.M[0][1] === 1 && rot.M[1][0] === -1 && rot.M[2][2] === -1, 'rotation matrix');
  const tr = parseSymop('x+1/2, -y, z');
  ok(tr && tr.t[0] === 0.5 && tr.M[1][1] === -1, 'translation and sign');
  const frac = parseSymop('1/2-y, 1/2-x, z');
  ok(frac && close(frac.t[0], 0.5) && frac.M[0][1] === -1, 'leading fraction');
}

// --- expansion --------------------------------------------------------------

console.log('symmetry expansion');
{
  const atoms = expandSymmetry([{ el: 'X', frac: [0, 0, 0] }], [
    parseSymop('x, y, z'), parseSymop('-x, -y, -z'),
  ]);
  ok(atoms.length === 1, 'P-1 inversion dedupes the origin atom');
  const two = expandSymmetry([{ el: 'X', frac: [0.2, 0.3, 0.4] }], [
    parseSymop('x, y, z'), parseSymop('-x, -y, -z'),
  ]);
  ok(two.length === 2, 'P-1 general position gives 2 atoms');
  ok(close(two[1].frac[0], 0.8) && close(two[1].frac[1], 0.7) && close(two[1].frac[2], 0.6), 'inversion folds into [0,1)');
}

// --- parsing helpers --------------------------------------------------------

console.log('parsing helpers');
{
  ok(close(num('0.6224(2)'), 0.6224), 'esd stripped');
  ok(close(num('1.'), 1), 'trailing dot');
  ok(elementSymbol('O2-') === 'O', 'charged symbol');
  ok(elementSymbol('Al3+') === 'Al', 'charged symbol 2');
  ok(elementSymbol('H1') === 'H', 'label with index');
  ok(elementSymbol('D') === 'D', 'deuterium kept');
}

// --- NaCl: Fm-3m ionic ------------------------------------------------------

console.log('NaCl (COD 9006378, Fm-3m)');
{
  const cif = parseCif(fixture('nacl.cif'));
  const { structure: s, error } = cifToStructure(cif, { id: 'cod-9006378', name: 'Halite' });
  ok(!error, `no error (${error || ''})`);
  if (s) {
    const atoms = s.sites.flatMap((site) => site.frac.map((f) => ({ el: site.el, frac: f })));
    ok(atoms.length === 8, `8 atoms per cell, got ${atoms.length}`);
    const na = atoms.filter((a) => a.el === 'Na').length;
    const cl = atoms.filter((a) => a.el === 'Cl').length;
    ok(na === 4 && cl === 4, `4 Na + 4 Cl, got ${na} + ${cl}`);
    ok(close(s.cell.a, 5.64, 0.05), `a = ${s.cell.a} Å`);
    ok(s.spaceGroup.includes('F m -3 m') || s.spaceGroup.includes('Fm'), `space group ${s.spaceGroup}`);
    const vecs = cellVectors(s.cell);
    const pos = atoms.map((a) => toCartesian(a.frac, vecs));
    const naCl = Math.min(...pos.flatMap((p, i) =>
      atoms[i].el === 'Na' ? pos.map((q, j) => atoms[j].el === 'Cl'
        ? Math.hypot(...p.map((x, k) => x - q[k])) : Infinity) : []));
    ok(close(naCl, 5.64 / 2, 0.05), `Na-Cl bond ${naCl.toFixed(2)} Å (expect 2.82)`);
  }
}

// --- corundum: old-style CIF, R-3c ------------------------------------------

console.log('corundum (COD 1000017, R-3c)');
{
  const cif = parseCif(fixture('corundum.cif'));
  const { structure: s, error } = cifToStructure(cif, { id: 'cod-1000017', name: 'Corundum' });
  ok(!error, `no error (${error || ''})`);
  if (s) {
    const atoms = s.sites.flatMap((site) => site.frac.map((f) => ({ el: site.el, frac: f })));
    ok(atoms.length === 30, `30 atoms per cell, got ${atoms.length}`);
    const al = atoms.filter((a) => a.el === 'Al').length;
    const o = atoms.filter((a) => a.el === 'O').length;
    ok(al === 12 && o === 18, `12 Al + 18 O, got ${al} + ${o}`);
    ok(s.spaceGroup.includes('R -3 c'), `space group ${s.spaceGroup}`);
  }
}

// --- urea: molecular, must be rejected ---------------------------------------

console.log('urea (COD 9017316, P-42-1m)');
{
  const cif = parseCif(fixture('urea.cif'));
  const { structure: s, error } = cifToStructure(cif, { id: 'cod-9017316', name: 'Urea' });
  ok(!s, 'molecular structure rejected');
  ok(error && error.includes('molecular crystal'), `friendly molecular message (${error})`);
}

// --- hand-written P-1: single atom, primitive cubic --------------------------

console.log('hand-written P-1 primitive');
{
  const cifText = `
data_test
_cell_length_a 3.0
_cell_length_b 3.0
_cell_length_c 3.0
_cell_angle_alpha 90
_cell_angle_beta 90
_cell_angle_gamma 90
_space_group_name_H-M 'P -1'
loop_
_space_group_symop_operation_xyz
'x, y, z'
'-x, -y, -z'
loop_
_atom_site_label
_atom_site_type_symbol
_atom_site_fract_x
_atom_site_fract_y
_atom_site_fract_z
X1 Fe 0 0 0
`;
  const { structure: s, error } = cifToStructure(parseCif(cifText), { id: 'test', name: 'Test' });
  ok(!error, `no error (${error || ''})`);
  if (s) {
    const atoms = s.sites.flatMap((site) => site.frac.map((f) => ({ el: site.el, frac: f })));
    ok(atoms.length === 1, `1 atom per cell, got ${atoms.length}`);
    ok(s.species.Fe.radius > 1, 'Fe radius from element table');
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
