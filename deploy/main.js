/**
 * main.js — Three.js scene and UI for the crystal viewer.
 *
 * structures.js holds the crystallography and builds a block of unit cells
 * (atoms in Å plus nearest-neighbor bonds). This file draws it: atoms as
 * spheres at a chosen fraction of their real radius, bonds as sticks, the
 * unit cell as a faint wireframe, and optional translucent coordination
 * polyhedra.
 *
 * Sections
 *   1. Scene      renderer, camera, lights, axes
 *   2. Crystal    atoms, sticks, cell edges, polyhedra
 *   3. UI         sidebar, info card, legend, controls, selection
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { STRUCTURES, STRUCTURES_BY_ID, GROUPS, tilings, buildBlock, neighborShells, unitCellAtoms } from './structures.js';

const STICK_RADIUS = 0.085; // Å, at the "Sticks" slider's 1×
const VIEW_DIR = [1, 0.42, 0.55];

// ============================================================================
// 1. SCENE
// ============================================================================

const viewport = document.getElementById('viewport');

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
viewport.prepend(renderer.domElement);

const labelRenderer = new CSS2DRenderer({ element: document.getElementById('labels') });

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111111);
// A soft studio reflection gives the metals their sheen.
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;

// z is "up" (the c axis of the hexagonal cells), as in the sibling viewers.
const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 1000);
camera.up.set(0, 0, 1);
camera.position.set(...VIEW_DIR).normalize().multiplyScalar(30);
scene.add(camera);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.8;

scene.add(new THREE.HemisphereLight(0xffffff, 0x303040, 0.5));
const key = new THREE.DirectionalLight(0xffffff, 1.6);
key.position.set(1, 1.5, 2);
camera.add(key);

function resize() {
  const w = viewport.clientWidth, h = viewport.clientHeight;
  renderer.setSize(w, h);
  labelRenderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// Smoothly move the camera so a sphere of radius R fills the view.
let fit = null;
function fitCamera(R, animate = true) {
  const fov = THREE.MathUtils.degToRad(camera.fov);
  const halfAngle = Math.min(fov, 2 * Math.atan(Math.tan(fov / 2) * camera.aspect)) / 2;
  const dist = (R / Math.sin(halfAngle)) * 1.3;
  const dir = camera.position.clone().sub(controls.target).normalize();
  const to = dir.multiplyScalar(dist);
  if (!animate) {
    camera.position.copy(to);
    controls.target.set(0, 0, 0);
    fit = null;
    return;
  }
  fit = { from: camera.position.clone(), to, target: controls.target.clone(), t0: performance.now() };
}

function stepFit(now) {
  if (!fit) return;
  const t = Math.min(1, (now - fit.t0) / 450);
  const e = t * t * (3 - 2 * t); // smoothstep
  const len = THREE.MathUtils.lerp(fit.from.length(), fit.to.length(), e);
  const dir = fit.from.clone().normalize().lerp(fit.to.clone().normalize(), e).normalize();
  camera.position.copy(dir.multiplyScalar(len));
  controls.target.copy(fit.target).multiplyScalar(1 - e);
  if (t === 1) fit = null;
}

// ============================================================================
// 2. CRYSTAL
// ============================================================================
//
// Sticks are opaque and drawn first. Atoms are separate meshes so three.js
// sorts them back to front, which keeps the translucent spheres blending in
// the right order as the crystal turns. Polyhedra come last, without depth
// writes, so the atoms and sticks inside show through.

const sphereGeo = new THREE.SphereGeometry(1, 40, 24);
const stickGeo = new THREE.CylinderGeometry(1, 1, 1, 14, 1);
const stickMat = new THREE.MeshStandardMaterial({ color: 0x8d939c, roughness: 0.5, metalness: 0.1 });
const cellMat = new THREE.LineBasicMaterial({ color: 0x5b9cff, transparent: true, opacity: 0.75 });
const gridMat = new THREE.LineBasicMaterial({ color: 0x8b929c, transparent: true, opacity: 0.18 });
const Y_AXIS = new THREE.Vector3(0, 1, 0);

const settings = { size: 0.4, stick: 1, opacity: 0.9 };
let atomMats = [];

function atomMaterial(sp) {
  const mat = new THREE.MeshPhysicalMaterial({
    color: sp.color,
    roughness: sp.metal ? 0.45 : 0.42,
    metalness: sp.metal ? 0.4 : 0,
    clearcoat: 0.35,
    clearcoatRoughness: 0.3,
    envMapIntensity: sp.metal ? 0.8 : 0.55,
  });
  applyOpacity(mat);
  return mat;
}

function applyOpacity(mat) {
  const t = settings.opacity < 1;
  if (mat.transparent !== t) mat.needsUpdate = true;
  mat.transparent = t;
  mat.opacity = settings.opacity;
}

/** Everything drawn for one structure at one block size. */
function buildCrystal(s, size) {
  const block = buildBlock(s, size);
  const group = new THREE.Group();
  group.position.set(...block.center).multiplyScalar(-1);

  // Atoms
  const mats = Object.fromEntries(Object.entries(s.species).map(([el, sp]) => [el, atomMaterial(sp)]));
  atomMats = Object.values(mats);
  const atoms = new THREE.Group();
  for (const a of block.atoms) {
    const m = new THREE.Mesh(sphereGeo, mats[a.el]);
    m.position.set(...a.pos);
    m.userData.radius = s.species[a.el].radius;
    m.scale.setScalar(m.userData.radius * settings.size);
    atoms.add(m);
  }
  group.add(atoms);

  // Sticks, one instanced mesh
  const sticks = new THREE.InstancedMesh(stickGeo, stickMat, Math.max(1, block.bonds.length));
  sticks.count = block.bonds.length;
  sticks.userData.ends = block.bonds.map(([i, j]) => [
    new THREE.Vector3(...block.atoms[i].pos), new THREE.Vector3(...block.atoms[j].pos),
  ]);
  group.add(sticks);

  // Cell edges: every cell faintly, the origin cell in the accent color
  const [a1, a2, a3] = block.vecs.map((v) => new THREE.Vector3(...v));
  const corner = (i, j, k) => a1.clone().multiplyScalar(i).add(a2.clone().multiplyScalar(j)).add(a3.clone().multiplyScalar(k));
  const cellEdges = (i0, j0, k0, n = [1, 1, 1]) => {
    const pts = [];
    const [nx, ny, nz] = n;
    for (let j = j0; j <= j0 + ny; j++) for (let k = k0; k <= k0 + nz; k++) pts.push(corner(i0, j, k), corner(i0 + nx, j, k));
    for (let i = i0; i <= i0 + nx; i++) for (let k = k0; k <= k0 + nz; k++) pts.push(corner(i, j0, k), corner(i, j0 + ny, k));
    for (let i = i0; i <= i0 + nx; i++) for (let j = j0; j <= j0 + ny; j++) pts.push(corner(i, j, k0), corner(i, j, k0 + nz));
    return new THREE.BufferGeometry().setFromPoints(pts);
  };
  const cell = new THREE.Group();
  const [nx, ny, nz] = size;
  if (nx * ny * nz > 1) cell.add(new THREE.LineSegments(cellEdges(0, 0, 0, size), gridMat));
  const unit = new THREE.LineSegments(cellEdges(0, 0, 0), cellMat);
  unit.renderOrder = 3;
  cell.add(unit);
  group.add(cell);

  // Coordination polyhedra around every fully coordinated atom of one species.
  // If the block holds none of the preferred species with a full shell (a
  // single NaCl cell has Na only on its surface), use the other species.
  const poly = new THREE.Group();
  const nbrs = block.atoms.map(() => []);
  for (const [i, j] of block.bonds) { nbrs[i].push(j); nbrs[j].push(i); }
  const full = (el) => block.atoms.some((a, i) => a.el === el && nbrs[i].length === s.species[el].cn);
  const center = s.polyhedra && [s.polyhedra, ...Object.keys(s.species)].find(full);
  if (center) {
    const sp = s.species[center];
    const color = new THREE.Color(sp.color);
    const face = new THREE.MeshStandardMaterial({
      color, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide, roughness: 0.6,
    });
    const edge = new THREE.LineBasicMaterial({ color: color.clone().lerp(new THREE.Color(0xffffff), 0.3), transparent: true, opacity: 0.6 });
    block.atoms.forEach((a, i) => {
      if (a.el !== center || nbrs[i].length !== sp.cn) return;
      const geo = new ConvexGeometry(nbrs[i].map((j) => new THREE.Vector3(...block.atoms[j].pos)));
      const m = new THREE.Mesh(geo, face);
      m.renderOrder = 4;
      poly.add(m, new THREE.LineSegments(new THREE.EdgesGeometry(geo, 1), edge));
    });
  }
  group.add(poly);

  group.userData = { block, atoms, sticks, cell, poly };
  return group;
}

function layoutSticks(crystal) {
  const { sticks } = crystal.userData;
  const r = STICK_RADIUS * settings.stick;
  sticks.visible = r > 0;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3();
  sticks.userData.ends.forEach(([a, b], i) => {
    const axis = b.clone().sub(a);
    const len = axis.length();
    q.setFromUnitVectors(Y_AXIS, axis.normalize());
    p.copy(a).add(b).multiplyScalar(0.5);
    sc.set(r, len, r);
    sticks.setMatrixAt(i, m.compose(p, q, sc));
  });
  sticks.instanceMatrix.needsUpdate = true;
  sticks.computeBoundingSphere();
}

function layoutAtoms(crystal) {
  crystal.userData.atoms.children.forEach((m) => m.scale.setScalar(m.userData.radius * settings.size));
}

// Radius of the sphere around the block center that holds every atom.
function extent(crystal, s) {
  const { block } = crystal.userData;
  const maxR = Math.max(...Object.values(s.species).map((sp) => sp.radius));
  const c = new THREE.Vector3(...block.center);
  return Math.max(...block.atoms.map((a) => c.distanceTo(new THREE.Vector3(...a.pos)))) + maxR * settings.size;
}

// Axes: the cell vectors a, b, c from the block's origin corner.
const axes = new THREE.Group();
const axisMat = new THREE.LineBasicMaterial({ color: 0x9aa1ab, transparent: true, opacity: 0.55 });
const axisLabels = [];
scene.add(axes);

function buildAxes(crystal) {
  axes.clear();
  axisLabels.length = 0;
  const { block } = crystal.userData;
  const origin = new THREE.Vector3(...block.center).multiplyScalar(-1);
  block.vecs.forEach((v, k) => {
    const dir = new THREE.Vector3(...v).normalize();
    const len = new THREE.Vector3(...v).length() * block.size[k] + 1.2;
    const tip = origin.clone().add(dir.clone().multiplyScalar(len));
    axes.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([origin, tip]), axisMat));
    const el = document.createElement('div');
    el.className = 'axis-label';
    el.textContent = 'abc'[k];
    const label = new CSS2DObject(el);
    label.position.copy(origin).add(dir.multiplyScalar(len + 0.45));
    axes.add(label);
    axisLabels.push(label);
  });
  showAxes($('axes').checked);
}

// CSS2D labels ignore their parent's visibility, so hide them explicitly.
function showAxes(on) {
  axes.visible = on;
  axisLabels.forEach((l) => { l.visible = on; });
}

// ============================================================================
// 3. UI
// ============================================================================

const $ = (id) => document.getElementById(id);

const buttons = new Map();
for (const [g, title] of GROUPS) {
  const section = document.createElement('section');
  section.className = 'group';
  section.innerHTML = `<h2>${title}</h2><div class="items"></div>`;
  const items = section.querySelector('.items');
  STRUCTURES.filter((s) => s.group === g).forEach((s) => {
    const b = document.createElement('button');
    b.className = 'xtal';
    b.innerHTML = `<span class="f">${s.formula}</span><span class="n">${s.name}</span>`;
    b.title = s.type;
    b.addEventListener('click', () => {
      select(s.id);
      document.body.classList.remove('menu-open');
    });
    items.append(b);
    buttons.set(s.id, b);
  });
  $('list').append(section);
}

const fmt = (x, d = 2) => x.toFixed(d);
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

function renderInfo(s) {
  $('title').innerHTML = `${s.formula} <span class="name">${s.name}</span>`;
  $('desc').textContent = s.desc;
  const { a, c, gamma } = s.cell;
  const params = gamma === 90 && a === c
    ? `a = ${fmt(a)} Å, all angles 90°`
    : `a = b = ${fmt(a)} Å, c = ${fmt(c)} Å, γ = 120°`;
  const shells = neighborShells(s);
  const els = Object.keys(s.species);
  const cn = els.map((el) => s.species[el].cn).join(' : ');
  const [p, q] = s.bond.pairs[0];
  const contact = `${s.species[p].label.replace(/[⁺⁻²]/g, '')}–${s.species[q].label.replace(/[⁺⁻²]/g, '')} ${fmt(shells[p].distance)} Å`;
  const perCell = unitCellAtoms(s).length;
  const lines = [
    `${s.type}`,
    `${s.system} · ${s.spaceGroup} · ${params}`,
    `Coordination ${cn} · ${contact} · ${plural(perCell, 'atom')} per cell`,
  ];
  if (s.id === 'graphite') lines.push(`Sheets ${fmt(c / 2)} Å apart, stacked ABAB`);
  $('facts').innerHTML = lines.join('<br>');
}

function renderLegend(s) {
  $('legend').innerHTML = Object.values(s.species).map((sp) =>
    `<div><span class="swatch" style="background:${sp.color}"></span><b>${sp.label}</b> · ${plural(sp.cn, 'neighbor')} · r = ${fmt(sp.radius)} Å</div>`,
  ).join('');
}

function renderTiling(s) {
  const t = $('tiling');
  t.innerHTML = '';
  tilings(s).forEach((size, i) => {
    const b = document.createElement('button');
    b.textContent = i === 0 ? 'Unit cell' : size.join('×');
    b.className = i === tilingIndex ? 'on' : '';
    b.addEventListener('click', () => {
      tilingIndex = i;
      select(current);
    });
    t.append(b);
  });
}

function renderValues() {
  $('size-v').textContent = `${Math.round(settings.size * 100)}%`;
  $('stick-v').textContent = settings.stick === 0 ? 'off' : `${settings.stick.toFixed(1)}×`;
  $('opacity-v').textContent = settings.opacity.toFixed(2);
}

let current = null;
let crystal = null;
let tilingIndex = 1; // expanded block by default, so the repeat pattern reads
let firstLoad = true;

function select(id) {
  const s = STRUCTURES_BY_ID[id] || STRUCTURES[0];
  current = s.id;
  buttons.forEach((b, k) => b.classList.toggle('active', k === s.id));
  if (location.hash.slice(1) !== s.id) history.replaceState(null, '', `#${s.id}`);
  renderInfo(s);
  renderLegend(s);
  renderTiling(s);

  if (crystal) scene.remove(crystal);
  crystal = buildCrystal(s, tilings(s)[tilingIndex]);
  layoutSticks(crystal);
  crystal.userData.cell.visible = $('cell').checked;
  crystal.userData.poly.visible = $('poly').checked;
  scene.add(crystal);
  buildAxes(crystal);
  $('poly').parentElement.style.display = s.polyhedra ? '' : 'none';

  fitCamera(extent(crystal, s), !firstLoad);
  firstLoad = false;
  document.body.dataset.shown = `${s.id}@${tilingIndex}`; // lets scripted checks wait for the scene
}

// Controls
function bindSlider(id, prop, apply) {
  const el = $(id);
  el.value = settings[prop];
  el.addEventListener('input', () => {
    settings[prop] = +el.value;
    renderValues();
    if (crystal) apply();
  });
}
bindSlider('size', 'size', () => layoutAtoms(crystal));
bindSlider('stick', 'stick', () => layoutSticks(crystal));
bindSlider('opacity', 'opacity', () => atomMats.forEach(applyOpacity));
renderValues();

$('spin').addEventListener('change', (e) => { controls.autoRotate = e.target.checked; });
$('axes').addEventListener('change', (e) => showAxes(e.target.checked));
$('cell').addEventListener('change', (e) => { if (crystal) crystal.userData.cell.visible = e.target.checked; });
$('poly').addEventListener('change', (e) => { if (crystal) crystal.userData.poly.visible = e.target.checked; });
$('menu').addEventListener('click', () => document.body.classList.toggle('menu-open'));
renderer.domElement.addEventListener('pointerdown', () => document.body.classList.remove('menu-open'));

// Arrow keys step through the list.
window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || !['ArrowUp', 'ArrowDown'].includes(e.key)) return;
  e.preventDefault();
  const i = STRUCTURES.findIndex((s) => s.id === current);
  const next = STRUCTURES[(i + (e.key === 'ArrowDown' ? 1 : -1) + STRUCTURES.length) % STRUCTURES.length];
  select(next.id);
});
window.addEventListener('hashchange', () => {
  const id = location.hash.slice(1);
  if (id !== current && STRUCTURES_BY_ID[id]) select(id);
});

renderer.setAnimationLoop((now) => {
  stepFit(now);
  controls.update();
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
});

select(location.hash.slice(1) || STRUCTURES[0].id);
