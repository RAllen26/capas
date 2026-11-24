// Stage: one shared WebGL renderer that shows pieces as objects outside AR.
// - snapshot(piece, size): a still image of the object (feed, collection, map pins), cached.
// - live(canvas, piece): a slow turntable drawn into a 2D canvas you own; returns stop().
// GLB models load from their support; everything else is 3D graffiti (objects.js).

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { tagObject } from './objects.js?v=202611241322';

const fontReady = document.fonts ? document.fonts.load('40px "Rubik Mono One"').catch(() => {}) : Promise.resolve();
const canvas = document.createElement('canvas');
const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setPixelRatio(1);
const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8a96, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 1.8);
sun.position.set(-4, 8, 10);
scene.add(sun);
const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 2000);
const loader = new GLTFLoader();

const objects = new Map();   // id -> Promise<{ group, update, radius, center }>
const shots = new Map();     // id:size -> Promise<dataURL>

function frame(group) {
  const box = new THREE.Box3().setFromObject(group);
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  return { center: sphere.center, radius: Math.max(sphere.radius, 0.01) };
}

function build(p) {
  if (objects.has(p.id)) return objects.get(p.id);
  const job = (async () => {
    const model = Media.list(p).find(x => x.type === 'model');
    if (model) {
      const url = await Media.url(model.src);
      if (url) {
        try {
          const gltf = await loader.loadAsync(url);
          const group = new THREE.Group();
          group.add(gltf.scene);
          const mixer = new THREE.AnimationMixer(gltf.scene);
          gltf.animations.forEach(c => mixer.clipAction(c).play());
          return { group, update: dt => mixer.update(dt), ...frame(group) };
        } catch { /* fall through to a tag */ }
      }
    }
    await fontReady;
    const o = tagObject(p);
    // Instanced voxels don't report their full bounds, so frame the tag by its known size.
    const { w, h } = o.group.userData.size;
    return { ...o, center: new THREE.Vector3(0, h / 2, 0), radius: Math.hypot(w, h) / 2 * 0.92 };
  })();
  objects.set(p.id, job);
  return job;
}

function shoot(o, size, yaw) {
  renderer.setSize(size, size, false);
  scene.add(o.group);
  const d = o.radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2)) * 1.02;
  const a = THREE.MathUtils.degToRad(yaw);
  camera.position.set(o.center.x + Math.sin(a) * d, o.center.y + d * 0.18, o.center.z + Math.cos(a) * d);
  camera.lookAt(o.center);
  camera.aspect = 1;
  camera.updateProjectionMatrix();
  renderer.clear();
  renderer.render(scene, camera);
  scene.remove(o.group);
}

export function snapshot(p, size = 320) {
  const key = p.id + ':' + size;
  if (!shots.has(key)) {
    shots.set(key, build(p).then(o => {
      o.update(0.5);
      shoot(o, size, -22);
      return canvas.toDataURL('image/png');
    }).catch(() => null));
  }
  return shots.get(key);
}

// One live turntable at a time keeps phones cool: starting a new one stops the last.
let current = null;
export function live(target, p) {
  current?.stop();
  let raf = 0, stopped = false, yaw = -22, last = performance.now();
  const ctx = target.getContext('2d');
  const me = { stop() { stopped = true; cancelAnimationFrame(raf); if (current === me) current = null; } };
  current = me;
  build(p).then(o => {
    const tick = now => {
      if (stopped || !target.isConnected || !target.getClientRects().length) return me.stop();   // gone or hidden
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      yaw += dt * 14;
      o.update(dt);
      const size = target.width;
      shoot(o, size, yaw);
      ctx.clearRect(0, 0, size, size);
      ctx.drawImage(canvas, 0, 0, size, size);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  });
  return me;
}

export function forget(id) {
  objects.delete(id);
  for (const k of [...shots.keys()]) if (k.startsWith(id + ':')) shots.delete(k);
}
