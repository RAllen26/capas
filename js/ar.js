// CAPAS AR — location-based AR in plain web tech: camera + GPS + compass.
// No app install, no SDK. Pieces float at their real bearing and distance.
//
// LIVE mode:  you're within RANGE of pieces → they sit where they really are.
//             GPS-anchored pieces stay LOCKED until you're inside their radius.
// GHOST mode: nothing nearby (or no GPS) → pieces are projected around you,
//             so the gallery is explorable from anywhere.
// Scanning a QR / NFC anchor opens ar.html?piece=ID, which unlocks that piece.

const $ = s => document.querySelector(s);
const RANGE = 2000;          // meters: beyond this we switch to ghost mode
const H_FOV = 60, V_FOV = 80; // rough phone camera field of view (portrait)

const params = new URLSearchParams(location.search);
const focusId = params.get('piece');
const pieces = Store.all();
const focus = pieces.find(p => p.id === focusId);

const view = $('#view'), ctx = view.getContext('2d');
const radar = $('#radar-c'), rctx = radar.getContext('2d');

const s = {
  heading: 0, pitch: 0, targetHeading: 0, targetPitch: 0,
  sensors: false, camera: false,
  me: null, accuracy: null,
  mode: 'ghost',
  placements: [],
  hits: [],
  selected: null,
};

if (focus) {
  $('#gate-focus').innerHTML = `Anchor found: <b>${focus.title}</b> by ${focus.artist}`;
}

// ---------- start (needs a user gesture for iOS permissions) ----------
$('#start').onclick = async () => {
  $('#gate').hidden = true;

  if (typeof DeviceOrientationEvent !== 'undefined' && DeviceOrientationEvent.requestPermission) {
    try { await DeviceOrientationEvent.requestPermission(); } catch { /* denied: drag fallback */ }
  }
  addEventListener('deviceorientationabsolute', onOrient);
  addEventListener('deviceorientation', onOrient);

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    $('#cam').srcObject = stream;
    s.camera = true;
  } catch { s.camera = false; }

  if (navigator.geolocation) {
    navigator.geolocation.watchPosition(pos => {
      s.me = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      s.accuracy = pos.coords.accuracy;
      place();
    }, () => place(), { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 });
  }
  place();
};

function onOrient(e) {
  let h = null;
  if (typeof e.webkitCompassHeading === 'number') h = e.webkitCompassHeading;   // iOS
  else if (e.absolute && e.alpha != null) h = 360 - e.alpha;                    // Android
  if (h == null) return;
  s.sensors = true;
  s.targetHeading = (h + (screen.orientation?.angle || 0) + 360) % 360;
  if (e.beta != null) s.targetPitch = Math.max(-80, Math.min(80, e.beta - 90));
}

// ---------- placement: where each piece lives relative to you ----------
function place() {
  const nearest = s.me ? Math.min(...pieces.map(p => Geo.distance(s.me, p.location))) : Infinity;
  s.mode = nearest <= RANGE ? 'live' : 'ghost';

  if (s.mode === 'live') {
    s.placements = pieces.map(p => {
      const dist = Geo.distance(s.me, p.location);
      return { p, dist, bearing: Geo.bearing(s.me, p.location), unlocked: dist <= p.location.radius || p.id === focusId };
    }).filter(x => x.dist <= RANGE);
  } else if (!s.placements.length || s.placements[0].ghost !== true) {
    // ghost ring: spread pieces around you, focused piece straight ahead
    const others = pieces.filter(p => p !== focus);
    s.placements = others.map((p, i) => ({
      p, ghost: true, unlocked: true,
      bearing: (s.heading + 40 + (i * 320) / others.length) % 360,
      dist: 14 + (Art.rng(p.id)() * 40),
    }));
    if (focus) s.placements.unshift({ p: focus, ghost: true, unlocked: true, bearing: s.heading, dist: 9 });
  }
  if (focus && !s.selected) s.selected = focus.id;
}

// ---------- drag to look (desktop / no sensors) ----------
let drag = null;
view.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, moved: 0 }; view.setPointerCapture(e.pointerId); });
view.addEventListener('pointermove', e => {
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  drag.moved += Math.abs(dx) + Math.abs(dy);
  drag.x = e.clientX; drag.y = e.clientY;
  if (s.sensors) return;
  s.targetHeading = (s.targetHeading - dx * (H_FOV / innerWidth) + 360) % 360;
  s.targetPitch = Math.max(-60, Math.min(60, s.targetPitch + dy * (V_FOV / innerHeight)));
});
view.addEventListener('pointerup', e => {
  if (drag && drag.moved < 8) tap(e.clientX, e.clientY);
  drag = null;
});

function tap(x, y) {
  const hit = [...s.hits].reverse().find(h => x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h);
  if (hit) showCard(hit.pl); else $('#card').hidden = true;
}

function showCard(pl) {
  const { p } = pl, layer = LAYERS[p.layer];
  s.selected = p.id;
  const card = $('#card');
  card.innerHTML = `
    <img alt="" src="${Art.toDataURL(p, 176)}">
    <div>
      <span class="tag" style="--c:${layer.color}">${layer.label}</span>
      <h2>${escapeHtml(p.title)}</h2>
      <p>${escapeHtml(p.artist)} · ${pl.ghost ? 'ghost projection' : Geo.fmt(pl.dist)}</p>
      <p>${pl.unlocked ? escapeHtml(p.note) : `LOCKED. Walk inside its ${p.location.radius} m radius or scan its ${ANCHORS[p.anchor.type].label}.`}</p>
    </div>
    <button class="x" aria-label="Close" onclick="this.parentElement.hidden=true">×</button>`;
  card.hidden = false;
}

// ---------- render loop ----------
function resize() {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  view.width = innerWidth * dpr; view.height = innerHeight * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
addEventListener('resize', resize);
resize();

const wrap = d => ((d + 540) % 360) - 180;

function frame(t) {
  s.heading = (s.heading + wrap(s.targetHeading - s.heading) * 0.18 + 360) % 360;
  s.pitch += (s.targetPitch - s.pitch) * 0.18;

  const W = innerWidth, H = innerHeight;
  ctx.clearRect(0, 0, W, H);
  if (!s.camera) drawVoid(W, H);

  s.hits = [];
  const sorted = [...s.placements].sort((a, b) => b.dist - a.dist);
  let offscreenFocus = null;

  sorted.forEach((pl, i) => {
    const rel = wrap(pl.bearing - s.heading);
    if (Math.abs(rel) > H_FOV / 2 + 15) {
      if (pl.p.id === s.selected) offscreenFocus = rel;
      return;
    }
    const size = Math.max(40, Math.min(H * 0.45, (H * 3.5) / Math.max(pl.dist, 4)));
    const x = W / 2 + (rel / (H_FOV / 2)) * (W / 2) - size / 2;
    const y = H / 2 + (s.pitch / (V_FOV / 2)) * (H / 2) - size / 2 + Math.sin(t / 900 + i) * 5;
    drawPiece(pl, x, y, size, t);
    s.hits.push({ pl, x, y, w: size, h: size + 30 });
  });

  if (offscreenFocus != null) drawTurnArrow(offscreenFocus, W, H);
  drawRadar();
  updateHud();
  requestAnimationFrame(frame);
}

function drawPiece(pl, x, y, size, t) {
  const { p } = pl, color = LAYERS[p.layer].color;
  const selected = p.id === s.selected;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,.45)';
  ctx.fillRect(x + size * 0.06, y + size * 0.06, size, size);
  ctx.drawImage(Art.toCanvas(p, 256), x, y, size, size);
  if (!pl.unlocked) {
    ctx.fillStyle = 'rgba(11,11,11,.72)';
    ctx.fillRect(x, y, size, size);
    ctx.fillStyle = color;
    ctx.font = `${Math.max(14, size * 0.28)}px "Rubik Mono One", sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('◌', x + size / 2, y + size / 2);
  }
  ctx.lineWidth = selected ? 5 : 3;
  ctx.strokeStyle = selected ? '#ffffff' : color;
  if (selected) ctx.setLineDash([10, 6]), (ctx.lineDashOffset = -t / 40);
  ctx.strokeRect(x, y, size, size);
  ctx.setLineDash([]);

  // label
  const label = `${p.title.toUpperCase()} · ${pl.ghost ? 'GHOST' : Geo.fmt(pl.dist)}`;
  ctx.font = '700 11px "Space Mono", monospace';
  const lw = Math.min(ctx.measureText(label).width + 12, Math.max(size, 140));
  ctx.fillStyle = color;
  ctx.fillRect(x, y + size + 6, lw, 20);
  ctx.fillStyle = '#0b0b0b';
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(label, x + 6, y + size + 16, lw - 12);
  ctx.restore();
}

function drawVoid(W, H) {
  // No camera: a scrolling grid world so desktop still feels spatial.
  const horizon = H / 2 + (s.pitch / (V_FOV / 2)) * (H / 2);
  ctx.fillStyle = '#0b0b0b'; ctx.fillRect(0, 0, W, H);
  const g = ctx.createLinearGradient(0, horizon - H * 0.5, 0, horizon);
  g.addColorStop(0, '#0b0b0b'); g.addColorStop(1, '#1a0b2e');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, horizon);
  ctx.strokeStyle = 'rgba(232,255,42,.25)'; ctx.lineWidth = 1;
  for (let i = 1; i < 14; i++) {
    const y = horizon + (i * i) * 3;
    if (y > H) break;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }
  const step = 15, off = (s.heading % step) / step;
  for (let k = -8; k <= 8; k++) {
    const x0 = W / 2 + ((k - off) * step / (H_FOV / 2)) * (W / 2);
    ctx.beginPath(); ctx.moveTo(x0, horizon); ctx.lineTo(W / 2 + (x0 - W / 2) * 6, H * 2); ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(255,62,165,.6)';
  ctx.beginPath(); ctx.moveTo(0, horizon); ctx.lineTo(W, horizon); ctx.stroke();
}

function drawTurnArrow(rel, W, H) {
  const left = rel < 0;
  ctx.save();
  ctx.fillStyle = '#e8ff2a'; ctx.strokeStyle = '#0b0b0b'; ctx.lineWidth = 3;
  const x = left ? 24 : W - 24, y = H / 2;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + (left ? 34 : -34), y - 26);
  ctx.lineTo(x + (left ? 34 : -34), y + 26);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.font = '700 12px "Space Mono", monospace';
  ctx.textAlign = left ? 'left' : 'right';
  ctx.fillText(`TURN ${Math.round(Math.abs(rel))}°`, x + (left ? 4 : -4), y + 44);
  ctx.restore();
}

function drawRadar() {
  const R = 80, c = R;
  rctx.clearRect(0, 0, 160, 160);
  rctx.fillStyle = 'rgba(11,11,11,.75)';
  rctx.beginPath(); rctx.arc(c, c, R - 2, 0, Math.PI * 2); rctx.fill();
  rctx.strokeStyle = '#e8ff2a'; rctx.lineWidth = 2; rctx.stroke();
  // field of view cone (always pointing up = where you look)
  rctx.fillStyle = 'rgba(232,255,42,.18)';
  rctx.beginPath(); rctx.moveTo(c, c);
  rctx.arc(c, c, R - 4, -Math.PI / 2 - (H_FOV / 2) * Math.PI / 180, -Math.PI / 2 + (H_FOV / 2) * Math.PI / 180);
  rctx.closePath(); rctx.fill();
  const max = Math.max(60, ...s.placements.map(p => p.dist));
  for (const pl of s.placements) {
    const a = (wrap(pl.bearing - s.heading) - 90) * Math.PI / 180;
    const r = Math.sqrt(pl.dist / max) * (R - 10);
    rctx.fillStyle = LAYERS[pl.p.layer].color;
    rctx.beginPath(); rctx.arc(c + Math.cos(a) * r, c + Math.sin(a) * r, pl.p.id === s.selected ? 6 : 4, 0, Math.PI * 2); rctx.fill();
  }
  rctx.fillStyle = '#3ee6ff';
  rctx.beginPath(); rctx.arc(c, c, 4, 0, Math.PI * 2); rctx.fill();
}

const DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
function updateHud() {
  const near = s.placements.filter(p => p.unlocked).length;
  $('#hud-mode').textContent = s.mode === 'live'
    ? `LIVE · ${s.placements.length} NEAR · ${near} OPEN`
    : 'GHOST MODE · PROJECTED AROUND YOU';
  $('#hud-heading').textContent = `${DIRS[Math.round(s.heading / 45) % 8]} ${Math.round(s.heading)}° ${s.sensors ? '' : '· DRAG TO LOOK'}`;
  $('#hud-gps').textContent = s.me ? `GPS ±${Math.round(s.accuracy)} m` : 'NO GPS';
}

function escapeHtml(str) { return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

document.fonts?.ready.then(() => Art.clear());
requestAnimationFrame(frame);
