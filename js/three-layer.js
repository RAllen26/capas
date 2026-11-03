// 3D layer for the AR view: GLB models placed at real bearing/distance around you.
// World axes: x = east, y = up, z = south (so -z is north). You stand at the origin, eyes at 1.6 m.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const rad = d => (d * Math.PI) / 180;

export function createLayer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 5000);
  camera.rotation.order = 'YXZ';
  camera.position.set(0, 1.6, 0);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x3a2a4a, 1.4));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(4, 10, 6);
  scene.add(sun);

  const loader = new GLTFLoader();
  const items = new Map();   // id -> { group, mixer, pose, locked }
  const clock = new THREE.Clock();
  const box = new THREE.Box3(), v = new THREE.Vector3();

  function add(id, url, pose = {}) {
    return new Promise((resolve, reject) => loader.load(url, gltf => {
      const group = new THREE.Group();
      group.add(gltf.scene);
      group.scale.setScalar(pose.scale || 1);
      gltf.scene.rotation.y = -rad(pose.heading || 0);
      group.visible = false;
      const mixer = new THREE.AnimationMixer(gltf.scene);
      gltf.animations.forEach(clip => mixer.clipAction(clip).play());
      scene.add(group);
      items.set(id, { group, mixer, pose, locked: null });
      resolve();
    }, undefined, reject));
  }

  const has = id => items.has(id);

  // bearing: degrees from north; dist: meters.
  function place(id, bearing, dist, locked) {
    const it = items.get(id);
    if (!it) return;
    it.group.position.set(Math.sin(rad(bearing)) * dist, it.pose.altitude || 0, -Math.cos(rad(bearing)) * dist);
    it.group.visible = true;
    if (it.locked !== locked) {
      // Locked pieces show as a wireframe ghost until you're there.
      it.group.traverse(o => { if (o.material) { o.material.wireframe = locked; o.material.transparent = locked; o.material.opacity = locked ? 0.35 : 1; } });
      it.locked = locked;
    }
  }
  function hideAll() { items.forEach(it => { it.group.visible = false; }); }

  function setView(heading, pitch, focal, W, H) {
    camera.rotation.y = -rad(heading);
    camera.rotation.x = rad(pitch);
    camera.fov = (2 * Math.atan(H / 2 / focal) * 180) / Math.PI;
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
  }

  // Screen rectangle of a placed model, for labels and taps.
  function project(id, W, H) {
    const it = items.get(id);
    if (!it?.group.visible) return null;
    box.setFromObject(it.group);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, front = false;
    for (let i = 0; i < 8; i++) {
      v.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).project(camera);
      if (v.z < 1) front = true;
      const sx = (v.x + 1) / 2 * W, sy = (1 - v.y) / 2 * H;
      x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
    }
    return front ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
  }

  function resize(W, H) { renderer.setSize(W, H, false); }

  function render() {
    const dt = clock.getDelta();
    items.forEach(it => it.group.visible && it.mixer.update(dt));
    renderer.render(scene, camera);
  }

  return { add, has, place, hideAll, setView, project, resize, render };
}
