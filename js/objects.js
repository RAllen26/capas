// 3D graffiti: every piece is an object. A piece without its own model becomes a voxel tag of its glyph,
// in its own palette: a lit face, a block shadow behind it (the classic 3D letter), drips, spray specks.
// Styles: stencil (plain block tag), glitch (rows slip and flicker), rings (the tag wraps into a ring and turns),
// signal (the tag with pulsing bars above it). Real-world size: about 6 m wide, standing on the ground.

import * as THREE from 'three';

const FONT = '"Rubik Mono One", "Arial Black", sans-serif';

function rng(seed) {
  let a = seed | 0 || 1;
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function hash(str) {
  let h = 2166136261;
  for (const c of String(str)) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
const lum = hex => { const c = new THREE.Color(hex); return 0.3 * c.r + 0.59 * c.g + 0.11 * c.b; };

// Text → filled cells on a coarse grid (one cell = one voxel). Any character the font has works.
function cells(text, rowsPerLine = 13) {
  const lines = String(text || 'CAPAS').toUpperCase().split(/\s+/).filter(Boolean).slice(0, 3);
  const px = 8, lineH = rowsPerLine * px;
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.font = `${lineH * 0.92}px ${FONT}`;
  const w = Math.ceil(Math.max(...lines.map(l => ctx.measureText(l).width))) + px * 2;
  c.width = w; c.height = lineH * lines.length + px * 2;
  ctx.font = `${lineH * 0.92}px ${FONT}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#000';
  lines.forEach((l, i) => ctx.fillText(l, w / 2, px + lineH * (i + 0.5)));
  const data = ctx.getImageData(0, 0, c.width, c.height).data;
  const cols = Math.floor(c.width / px), rows = Math.floor(c.height / px);
  const on = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = ((y * px + px / 2) * c.width + (x * px + px / 2)) * 4 + 3;
      if (data[i] > 110) on.push([x, rows - 1 - y]);   // y up
    }
  }
  return { on, cols, rows };
}

// piece → { group, update(dt) }
export function tagObject(piece, width = 6) {
  const art = piece.art || {};
  const r = rng(art.seed ?? hash(piece.id));
  const pal = (art.palette || ['#111111', '#e8ff2a', '#ff3ea5']).slice();
  const byLum = [...pal].sort((a, b) => lum(a) - lum(b));
  const shadow = new THREE.Color(byLum[0]).lerp(new THREE.Color('#111111'), 0.5);
  const face = new THREE.Color(byLum[2]);
  const pop = new THREE.Color(byLum[1] === byLum[0] ? pal[2] : byLum[1]);
  if (lum(byLum[1]) < 0.18) pop.set(pal.find(c => lum(c) > 0.3 && c !== byLum[2]) || '#ff3ea5');

  const { on, cols, rows } = cells(art.glyph || piece.title);
  const v = width / Math.max(cols, 18);           // voxel size in meters
  const set = new Set(on.map(([x, y]) => x + ',' + y));
  const style = art.style || 'stencil';

  const root = new THREE.Group();
  const tag = new THREE.Group();
  root.add(tag);

  const cube = new THREE.BoxGeometry(v, v, v * 1.4);
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.05 });
  const shadowMat = new THREE.MeshStandardMaterial({ color: shadow, roughness: 0.8 });
  const m4 = new THREE.Matrix4(), col = new THREE.Color();

  // Face: gradient from face color (top) into the pop color (bottom), like a fade on a fill.
  const faceMesh = new THREE.InstancedMesh(cube, mat, on.length);
  const back = new THREE.InstancedMesh(cube, shadowMat, on.length);
  const x0 = cols / 2, rowShift = [];
  for (let y = 0; y < rows; y++) rowShift[y] = style === 'glitch' && r() < 0.35 ? Math.round((r() - 0.5) * 6) : 0;
  on.forEach(([x, y], i) => {
    const px = (x - x0 + rowShift[y]) * v, py = y * v + v / 2;
    const pz = style === 'glitch' && r() < 0.06 ? v * (1 + r() * 3) : 0;
    m4.makeTranslation(px, py, pz);
    faceMesh.setMatrixAt(i, m4);
    col.copy(face).lerp(pop, Math.max(0, 1 - y / rows) * 0.85);
    faceMesh.setColorAt(i, col);
    m4.makeTranslation(px + v * 0.55, py - v * 0.55, pz - v * 1.1);   // block shadow, down-right and behind
    back.setMatrixAt(i, m4);
  });
  tag.add(back, faceMesh);

  // Drips: from cells with nothing under them, thin runs of paint.
  const drips = [];
  for (const [x, y] of on) {
    if (set.has(x + ',' + (y - 1)) || r() > 0.16) continue;
    const len = 2 + Math.floor(r() * 6);
    for (let k = 1; k <= len; k++) drips.push([(x - x0 + rowShift[y]) * v, y * v + v / 2 - k * v * 0.8, k === len ? 0.75 : 0.45]);
  }
  if (drips.length) {
    const dm = new THREE.InstancedMesh(new THREE.BoxGeometry(v, v * 0.8, v), new THREE.MeshStandardMaterial({ color: pop, roughness: 0.3 }), drips.length);
    drips.forEach(([x, y, s], i) => { m4.makeScale(s, 1, s).setPosition(x, y, v * 0.1); dm.setMatrixAt(i, m4); });
    tag.add(dm);
  }

  // Spray: specks floating around the tag.
  const specks = new THREE.InstancedMesh(new THREE.OctahedronGeometry(v * 0.35), new THREE.MeshStandardMaterial({ color: pop, emissive: pop, emissiveIntensity: 0.4 }), 26);
  const speckPos = [];
  for (let i = 0; i < 26; i++) {
    const p = [(r() - 0.5) * cols * v * 1.25, r() * rows * v * 1.3, (r() - 0.5) * v * 8];
    speckPos.push(p);
    m4.makeTranslation(...p); specks.setMatrixAt(i, m4);
  }
  tag.add(specks);

  // Lift it so drips don't sink into the ground.
  const lift = drips.length ? Math.max(0, -Math.min(...drips.map(d => d[1]))) + v : v;
  tag.position.y = lift;

  let t = 0, glitchT = 0;
  let extra = null;
  if (style === 'rings') {
    // Bend the tag around a vertical ring: each voxel goes to an angle by its x.
    const R = (cols * v) / (2 * Math.PI) * 1.15;
    for (const mesh of [faceMesh, back]) {
      const p = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
      for (let i = 0; i < mesh.count; i++) {
        mesh.getMatrixAt(i, m4); m4.decompose(p, q, sc);
        const a = (p.x / (cols * v)) * Math.PI * 2, rr = R + p.z;
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a);
        m4.compose(new THREE.Vector3(Math.sin(a) * rr, p.y, Math.cos(a) * rr), q, sc);
        mesh.setMatrixAt(i, m4);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
    tag.children.filter(c => c !== faceMesh && c !== back).forEach(c => { c.visible = c === specks; });
  }
  if (style === 'signal') {
    // Three bars of cubes above the tag that pulse like a signal.
    extra = new THREE.Group();
    for (let k = 0; k < 3; k++) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(cols * v * (0.35 + k * 0.22), v * 0.6, v), new THREE.MeshStandardMaterial({ color: k % 2 ? pop : face, emissive: k % 2 ? pop : face, emissiveIntensity: 0.3 }));
      bar.position.y = rows * v + v * (2 + k * 1.6);
      extra.add(bar);
    }
    tag.add(extra);
  }

  function update(dt) {
    t += dt;
    if (style === 'rings') tag.rotation.y = -t * (Math.PI * 2 / 30);
    if (style === 'signal' && extra) extra.children.forEach((b, k) => b.scale.x = 0.6 + 0.4 * Math.abs(Math.sin(t * 2 - k * 0.7)));
    if (style === 'glitch') {
      glitchT += dt;
      tag.position.x = glitchT % 3 < 0.12 ? (Math.random() - 0.5) * v * 3 : 0;
    }
    // Specks drift.
    for (let i = 0; i < speckPos.length; i++) {
      const [x, y, z] = speckPos[i];
      m4.makeRotationY(t + i).setPosition(x, y + Math.sin(t * 0.8 + i) * v * 0.6, z);
      specks.setMatrixAt(i, m4);
    }
    specks.instanceMatrix.needsUpdate = true;
  }

  faceMesh.instanceColor.needsUpdate = true;
  root.userData.size = { w: cols * v, h: rows * v + lift };
  return { group: root, update };
}
