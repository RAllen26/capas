// Studio 3D view: your object on its spot, with the real buildings around it as a massing model.
// Drag on the ground to move it; switch to ORBIT to look around; STREET and WINDOW show it from a person's eye.
// Units are meters around the spot: x east, y up, -z north.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { tagObject, massingGeometry } from './objects.js?v=202611241357';

const rad = d => (d * Math.PI) / 180;

export function createPlacer(canvas, onChange) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x9a9aa4, 1.5));
  const sun = new THREE.DirectionalLight(0xffffff, 1.7);
  sun.position.set(-60, 120, 80);
  scene.add(sun);

  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 6000);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI * 0.495;

  // Ground: a fine grid around the spot, the activation radius, and a pin where the spot is.
  const grid = new THREE.GridHelper(1000, 100, 0x111111, 0x111111);
  grid.material.transparent = true; grid.material.opacity = 0.12;
  scene.add(grid);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x4a3aff, transparent: true, opacity: 0.5, side: THREE.DoubleSide });
  let ring = new THREE.Mesh(new THREE.RingGeometry(49, 50, 96), ringMat);
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05;
  scene.add(ring);
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(1, 40), new THREE.MeshBasicMaterial({ color: 0x4a3aff, transparent: true, opacity: 0.25 }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.06;
  scene.add(shadow);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1, 6), new THREE.MeshBasicMaterial({ color: 0x4a3aff }));
  scene.add(stem);

  // Buildings.
  const massMat = new THREE.MeshLambertMaterial({ color: 0xf4f4f0, emissive: 0x8c8c88, transparent: true, opacity: 0.85 });
  const edgeMat = new THREE.LineBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.5 });
  const city = new THREE.Group();
  scene.add(city);

  // The object.
  const holder = new THREE.Group();
  scene.add(holder);
  let obj = null, update = () => {}, objSize = 6;
  const pose = { e: 0, n: 0, altitude: 0.4, heading: 0, scale: 1 };
  let me = null;   // where you are, in meters around the spot, if known

  function applyPose() {
    holder.position.set(pose.e, pose.altitude, -pose.n);
    holder.rotation.y = -rad(pose.heading);
    holder.scale.setScalar(pose.scale);
    const s = Math.max(1, objSize * pose.scale * 0.45);
    shadow.position.set(pose.e, 0.06, -pose.n); shadow.scale.setScalar(s);
    stem.visible = pose.altitude > 0.8;
    stem.scale.y = Math.max(0.01, pose.altitude); stem.position.set(pose.e, pose.altitude / 2, -pose.n);
  }

  async function setTag(piece) {
    if (document.fonts) await document.fonts.load('40px "Rubik Mono One"').catch(() => {});
    const o = tagObject(piece);
    swap(o.group, o.update, Math.max(o.group.userData.size.w, o.group.userData.size.h));
  }
  const loader = new GLTFLoader();
  async function setModel(url) {
    const gltf = await loader.loadAsync(url);
    const mixer = new THREE.AnimationMixer(gltf.scene);
    gltf.animations.forEach(c => mixer.clipAction(c).play());
    const box = new THREE.Box3().setFromObject(gltf.scene);
    const size = box.getSize(new THREE.Vector3());
    swap(gltf.scene, dt => mixer.update(dt), Math.max(size.x, size.y, size.z));
  }
  function swap(group, upd, size) {
    if (obj) holder.remove(obj);
    obj = group; update = upd; objSize = size || 6;
    holder.add(obj);
    applyPose();
    if (!framed) { framed = true; view('orbit'); }   // first object: frame it
  }
  let framed = false;

  function setPose(p) { Object.assign(pose, p); applyPose(); }
  function setRadius(m) {
    ring.geometry.dispose();
    ring.geometry = new THREE.RingGeometry(Math.max(1, m - Math.max(0.6, m / 80)), m, 128);
  }
  function setCity(footprints) {
    city.children.forEach(c => c.geometry.dispose());
    city.clear();
    const g = massingGeometry(footprints);
    if (!g) return;
    city.add(new THREE.Mesh(g, massMat), new THREE.LineSegments(new THREE.EdgesGeometry(g, 30), edgeMat));
  }
  // Buildings were fetched around another point: shift them so they line up with the spot.
  function setCityOffset(e, n) { city.position.set(e, 0, -n); }
  function setMe(e, n) { me = e == null ? null : { e, n }; }

  // ---------- views ----------
  let mode = 'move';
  const target = () => new THREE.Vector3(pose.e, pose.altitude + objSize * pose.scale * 0.4, -pose.n);
  function view(kind, floor = 0) {
    const t = target();
    const reach = Math.max(9, objSize * pose.scale * 1.9);
    if (kind === 'orbit') {
      camera.position.set(t.x + reach * 0.7, t.y + reach * 0.8, t.z + reach);
    } else {
      // From a person: where you are if you're close, otherwise a little way south of it.
      const eye = floor * 3 + 1.6;
      const from = me && Math.hypot(me.e - pose.e, me.n - pose.n) < 1500 ? me : { e: pose.e, n: pose.n - reach * 1.4 };
      camera.position.set(from.e, eye, -from.n);
    }
    controls.target.copy(t);
    controls.update();
  }
  function setMode(m) { mode = m; controls.enableRotate = m !== 'move'; }

  // ---------- drag to move on the ground ----------
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3();
  let dragging = false;
  function ground(e) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    return ray.ray.intersectPlane(plane, hit);
  }
  canvas.addEventListener('pointerdown', e => {
    if (mode !== 'move' || !e.isPrimary) return;
    if (!ground(e)) return;
    dragging = true;
    canvas.setPointerCapture(e.pointerId);
    pose.e = hit.x; pose.n = -hit.z; applyPose(); onChange?.({ ...pose });
  });
  canvas.addEventListener('pointermove', e => {
    if (!dragging || !ground(e)) return;
    pose.e = hit.x; pose.n = -hit.z; applyPose(); onChange?.({ ...pose });
  });
  canvas.addEventListener('pointerup', () => { dragging = false; });

  // ---------- loop ----------
  const clock = new THREE.Clock();
  let raf = 0, running = false;
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  function tick() {
    if (!running) return;
    resize();
    update(clock.getDelta());
    controls.update();
    renderer.render(scene, camera);
    raf = requestAnimationFrame(tick);
  }
  function start() { if (!running) { running = true; clock.getDelta(); raf = requestAnimationFrame(tick); } }
  function stop() { running = false; cancelAnimationFrame(raf); }

  applyPose();
  view('orbit');
  return { setTag, setModel, setPose, setRadius, setCity, setCityOffset, setMe, view, setMode, start, stop, pose };
}
