// AR view — location-based AR in plain web tech: camera + GPS + compass.
// No app install, no SDK. Pieces float at their real bearing and distance.
//
// LIVE mode:  you're within RANGE of pieces → they sit where they really are.
//             A piece is a locked ghost until you're inside its radius or have caught it.
// GHOST mode: nothing nearby (or no GPS) → pieces are projected around you,
//             so the gallery is explorable from anywhere.

const ARView = (() => {
  const RANGE = 2000;           // meters: beyond this we switch to ghost mode
  const H_FOV = 60, V_FOV = 80; // rough phone camera field of view (portrait)
  const AHEAD = 8;              // meters in front of you where a new piece lands

  const cam = $('#ar-cam');
  const view = $('#ar-canvas'), ctx = view.getContext('2d');
  const bg = $('#ar-bg'), bctx = bg.getContext('2d');
  const radar = $('#radar-c'), rctx = radar.getContext('2d');

  const s = {
    started: false, running: false,
    heading: 0, pitch: 0, targetHeading: 0, targetPitch: 0,
    sensors: false, camera: false,
    mode: 'ghost', canLive: false, forceGhost: false, layoutKey: '',
    focusId: null, focusBearing: null,
    placements: [], hits: [], selected: null,
  };
  let raf = 0, stream = null;

  const wrap = d => ((d + 540) % 360) - 180;
  const rad = d => (d * Math.PI) / 180;

  // ---------- 3D: pieces with a model support load into a three.js layer under the labels ----------
  // If WebGL or the library is unavailable they stay flat images, like the rest.
  const modelOf = p => Media.list(p).find(x => x.type === 'model');
  let three = null, threeLoading = false;
  const loading = new Set();
  const status3d = msg => { const el = $('#hud-3d'); el.hidden = false; el.textContent = '3D · ' + msg; };

  function ensureThree() {
    if (three) return loadModels();
    if (threeLoading || !App.state.pieces.some(modelOf)) return;
    threeLoading = true;
    status3d('LOADING');
    import('./three-layer.js?v=202611181738').then(m => {
      three = m.createLayer($('#ar-gl'));
      resize();
      loadModels();
    }).catch(e => status3d('OFF · ' + String(e?.message || e).slice(0, 60).toUpperCase()));
  }

  function loadModels() {
    const jobs = App.state.pieces.filter(p => modelOf(p) && !three.has(p.id) && !loading.has(p.id)).map(p => {
      const md = modelOf(p);
      loading.add(p.id);
      return Media.url(md.src).then(u => three.add(p.id, u, md.pose)).finally(() => loading.delete(p.id));
    });
    if (!jobs.length) return;
    Promise.allSettled(jobs).then(r => {
      const bad = r.filter(x => x.status === 'rejected').length;
      status3d(bad ? `${bad} MODEL${bad > 1 ? 'S' : ''} COULD NOT LOAD` : 'READY');
    });
  }

  // Image supports replace the generated art floating in space once loaded.
  const covers = new Map();
  function ensureCover(p) {
    if (covers.has(p.id)) return;
    covers.set(p.id, null);
    Media.cover(p).then(img => img && covers.set(p.id, img));
  }

  // ---------- start / stop ----------
  function enter(focusId) {
    s.focusId = focusId || null;
    s.focusBearing = null;
    s.layoutKey = '';
    if (focusId) s.selected = focusId;
    const focus = focusId && App.piece(focusId);
    $('#gate-focus').innerHTML = focus ? `Opening <b>${esc(focus.title)}</b> by ${esc(focus.artist)}` : '';
    $('#gate').hidden = s.started;
    if (s.started) run();
  }

  // Needs a user gesture: iOS only grants motion sensors from a tap.
  $('#ar-start').onclick = async () => {
    s.started = true;
    $('#gate').hidden = true;
    if (typeof DeviceOrientationEvent !== 'undefined' && DeviceOrientationEvent.requestPermission) {
      try { await DeviceOrientationEvent.requestPermission(); } catch { /* denied: drag fallback */ }
    }
    addEventListener('deviceorientationabsolute', onOrient);
    addEventListener('deviceorientation', onOrient);
    App.locate().catch(() => {});
    run();
  };

  async function run() {
    place();
    if (s.running) return;
    s.running = true;
    resize();
    ensureThree();
    raf = requestAnimationFrame(frame);
    try {
      const st = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      if (!s.running) { st.getTracks().forEach(t => t.stop()); return; }
      stream = st;
      cam.srcObject = st;
      s.camera = true;
    } catch { s.camera = false; }
  }

  // Leaving the view frees the camera and stops drawing.
  function leave() {
    s.running = false;
    cancelAnimationFrame(raf);
    stream?.getTracks().forEach(t => t.stop());
    stream = null;
    cam.srcObject = null;
    s.camera = false;
  }

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
    const me = App.state.me;
    const focus = s.focusId ? App.piece(s.focusId) : null;
    const pieces = App.visible();
    if (focus && !pieces.includes(focus)) pieces.unshift(focus); // the piece you opened shows even if filtered out
    pieces.forEach(ensureCover);

    // A landmark piece (seenFrom, meters) stays in the live view from farther away than RANGE.
    const reach = p => Math.max(RANGE, p.seenFrom || 0);
    s.canLive = !!me && pieces.some(p => Geo.distance(me, p.location) <= reach(p));
    s.mode = s.canLive && !s.forceGhost ? 'live' : 'ghost';

    if (s.mode === 'live') {
      s.layoutKey = '';
      s.placements = pieces.map(p => {
        const dist = Geo.distance(me, p.location);
        if (p === focus && dist > reach(p)) {
          // The piece you opened is far away: project it ahead of you instead of dropping it.
          s.focusBearing ??= s.heading;
          return { p, ghost: true, unlocked: true, bearing: s.focusBearing, dist: 9, far: dist };
        }
        return { p, dist, bearing: Geo.bearing(me, p.location), unlocked: App.isOpen(p) };
      }).filter(x => x.ghost || x.dist <= reach(x.p));
      return;
    }

    // Ghost ring: spread pieces around you, the one you opened straight ahead. Rebuilt only when the set changes.
    const key = 'ghost:' + pieces.map(p => p.id).join();
    if (key === s.layoutKey) return;
    s.layoutKey = key;
    const others = pieces.filter(p => p !== focus);
    s.placements = others.map((p, i) => ({
      p, ghost: true, unlocked: true,
      bearing: (s.heading + 40 + (i * 320) / others.length) % 360,
      dist: 14 + (Art.rng(p.id)() * 40),
    }));
    if (focus) s.placements.unshift({ p: focus, ghost: true, unlocked: true, bearing: s.heading, dist: 9 });
  }

  $('#hud-mode').addEventListener('click', () => { s.forceGhost = !s.forceGhost; place(); });

  // ---------- drag to look (desktop / no sensors), tap to open ----------
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
    if (hit) Card.open(hit.pl.p.id, { autoplay: true }); else Card.close();
  }

  // ---------- render loop ----------
  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    for (const c of [view, bg]) { c.width = innerWidth * dpr; c.height = innerHeight * dpr; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    three?.resize(innerWidth, innerHeight);
  }
  addEventListener('resize', () => { if (s.running) resize(); });

  function frame(t) {
    if (!s.running) return;
    s.heading = (s.heading + wrap(s.targetHeading - s.heading) * 0.18 + 360) % 360;
    s.pitch += (s.targetPitch - s.pitch) * 0.18;

    const W = innerWidth, H = innerHeight;
    // One pinhole camera for everything (2D pieces, grid, 3D): focal length from the horizontal FOV.
    const f = (W / 2) / Math.tan(rad(H_FOV / 2));
    const horizon = H / 2 + f * Math.tan(rad(s.pitch));
    ctx.clearRect(0, 0, W, H);
    bctx.clearRect(0, 0, W, H);
    if (!s.camera) drawVoid(bctx, W, H, f, horizon);
    three?.setView(s.heading, s.pitch, f, W, H);
    three?.hideAll();

    s.hits = [];
    const sorted = [...s.placements].sort((a, b) => b.dist - a.dist);
    let offscreenFocus = null;

    sorted.forEach((pl, i) => {
      const rel = wrap(pl.bearing - s.heading);
      if (Math.abs(rel) > H_FOV / 2 + 15) {
        if (pl.p.id === s.selected) offscreenFocus = rel;
        return;
      }
      if (three?.has(pl.p.id)) {
        three.place(pl.p.id, pl.bearing, pl.dist, !pl.unlocked && !pl.p.seenFrom);
        const r = three.project(pl.p.id, W, H);
        if (r) { drawLabel(pl, r.x, r.y + r.h, r.w); s.hits.push({ pl, x: r.x, y: r.y, w: r.w, h: r.h + 30 }); }
        return;
      }
      const size = Math.max(40, Math.min(H * 0.45, (H * 3.5) / Math.max(pl.dist, 4)));
      const x = W / 2 + f * Math.tan(rad(rel)) - size / 2;
      const y = horizon - size / 2 + Math.sin(t / 900 + i) * 5;
      drawPiece(pl, x, y, size, t);
      s.hits.push({ pl, x, y, w: size, h: size + 30 });
    });
    three?.render();

    if (offscreenFocus != null) drawTurnArrow(offscreenFocus, W, H);
    drawRadar();
    updateHud();
    raf = requestAnimationFrame(frame);
  }

  function drawPiece(pl, x, y, size, t) {
    const { p } = pl, color = LAYERS[p.layer].color;
    const selected = p.id === s.selected;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,.45)';
    ctx.fillRect(x + size * 0.06, y + size * 0.06, size, size);
    ctx.drawImage(covers.get(p.id) || Art.toCanvas(p, 256), x, y, size, size);
    if (!pl.unlocked) {
      ctx.fillStyle = Theme.alpha('--color-bg', 0.72);
      ctx.fillRect(x, y, size, size);
      ctx.fillStyle = color;
      ctx.font = `${Math.max(14, size * 0.28)}px ${Theme.css('--font-display')}`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('◌', x + size / 2, y + size / 2);
    }
    ctx.lineWidth = selected ? 5 : 3;
    ctx.strokeStyle = selected ? Theme.css('--color-select') : color;
    if (selected) { ctx.setLineDash([10, 6]); ctx.lineDashOffset = -t / 40; }
    ctx.strokeRect(x, y, size, size);
    ctx.setLineDash([]);
    ctx.restore();
    drawLabel(pl, x, y + size, size);
  }

  function drawLabel(pl, x, yTop, w) {
    const { p } = pl, color = LAYERS[p.layer].color;
    ctx.save();
    const label = `${Store.caught(p.id) ? '● ' : ''}${p.title.toUpperCase()} · ${pl.ghost ? 'GHOST' : Geo.fmt(pl.dist)} ${Media.icons(p)}`;
    ctx.font = `700 11px ${Theme.css('--font-body')}`;
    const lw = Math.min(ctx.measureText(label).width + 12, Math.max(w, 140));
    ctx.fillStyle = color;
    ctx.fillRect(x, yTop + 6, lw, 20);
    ctx.fillStyle = Theme.css('--brand-dark');
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(label, x + 6, yTop + 16, lw - 12);
    ctx.restore();
  }

  function drawVoid(c, W, H, f, horizon) {
    // No camera: a grid world so desktop still feels spatial.
    c.fillStyle = Theme.css('--color-bg'); c.fillRect(0, 0, W, H);
    const g = c.createLinearGradient(0, horizon - H * 0.5, 0, horizon);
    g.addColorStop(0, Theme.css('--color-bg')); g.addColorStop(1, Theme.css('--color-sky'));
    c.fillStyle = g; c.fillRect(0, 0, W, Math.max(0, horizon));
    c.strokeStyle = Theme.alpha('--color-primary', 0.25); c.lineWidth = 1;
    // ground lines ahead, seen from eye height 1.6 m
    for (let d = 2; d < 200; d *= 1.35) {
      const y = H / 2 + f * Math.tan(rad(s.pitch) + Math.atan(1.6 / d));
      if (y > H || y < 0) continue;
      c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke();
    }
    // lines running away from you every 15°
    const step = 15, off = s.heading % step;
    for (let k = -5; k <= 5; k++) {
      const a = k * step - off;
      if (Math.abs(a) > 80) continue;
      const x0 = W / 2 + f * Math.tan(rad(a));
      c.beginPath(); c.moveTo(x0, horizon); c.lineTo(W / 2 + (x0 - W / 2) * 8, horizon + H * 4); c.stroke();
    }
    c.strokeStyle = Theme.alpha('--color-accent', 0.6);
    c.beginPath(); c.moveTo(0, horizon); c.lineTo(W, horizon); c.stroke();
  }

  function drawTurnArrow(rel, W, H) {
    const left = rel < 0;
    ctx.save();
    ctx.fillStyle = Theme.css('--color-primary'); ctx.strokeStyle = Theme.css('--color-line'); ctx.lineWidth = 3;
    const x = left ? 24 : W - 24, y = H / 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (left ? 34 : -34), y - 26);
    ctx.lineTo(x + (left ? 34 : -34), y + 26);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.font = `700 12px ${Theme.css('--font-body')}`;
    ctx.textAlign = left ? 'left' : 'right';
    ctx.fillText(`TURN ${Math.round(Math.abs(rel))}°`, x + (left ? 4 : -4), y + 44);
    ctx.restore();
  }

  function drawRadar() {
    const R = 80, c = R;
    rctx.clearRect(0, 0, 160, 160);
    rctx.fillStyle = Theme.alpha('--color-bg', 0.75);
    rctx.beginPath(); rctx.arc(c, c, R - 2, 0, Math.PI * 2); rctx.fill();
    rctx.strokeStyle = Theme.css('--color-primary'); rctx.lineWidth = 2; rctx.stroke();
    // field of view cone (always pointing up = where you look)
    rctx.fillStyle = Theme.alpha('--color-primary', 0.18);
    rctx.beginPath(); rctx.moveTo(c, c);
    rctx.arc(c, c, R - 4, -Math.PI / 2 - rad(H_FOV / 2), -Math.PI / 2 + rad(H_FOV / 2));
    rctx.closePath(); rctx.fill();
    const max = Math.max(60, ...s.placements.map(p => p.dist));
    for (const pl of s.placements) {
      const a = rad(wrap(pl.bearing - s.heading) - 90);
      const r = Math.sqrt(pl.dist / max) * (R - 10);
      rctx.fillStyle = LAYERS[pl.p.layer].color;
      rctx.beginPath(); rctx.arc(c + Math.cos(a) * r, c + Math.sin(a) * r, pl.p.id === s.selected ? 6 : 4, 0, Math.PI * 2); rctx.fill();
    }
    rctx.fillStyle = Theme.css('--color-me');
    rctx.beginPath(); rctx.arc(c, c, 4, 0, Math.PI * 2); rctx.fill();
  }

  const DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  function updateHud() {
    const open = s.placements.filter(p => p.unlocked).length;
    $('#hud-mode').textContent = s.mode === 'live'
      ? `LIVE · ${s.placements.length} NEAR · ${open} OPEN · TAP FOR GHOST`
      : `GHOST · PROJECTED AROUND YOU${s.canLive ? ' · TAP FOR LIVE' : ''}`;
    $('#hud-heading').textContent = `${DIRS[Math.round(s.heading / 45) % 8]} ${Math.round(s.heading)}° ${s.sensors ? '' : '· DRAG TO LOOK'}`;
    $('#hud-gps').textContent = App.state.me ? `GPS ±${Math.round(App.state.accuracy)} m` : 'NO GPS';
  }

  const refresh = () => { if (s.running) place(); };
  App.on('me', refresh);
  App.on('filter', refresh);
  App.on('catch', refresh);
  App.on('pieces', () => { if (s.running) { ensureThree(); place(); } });
  App.on('card', id => { if (id) s.selected = id; });
  Art.ready.then(() => Art.clear());

  return {
    enter, leave,
    // The spot a few meters in front of you, where a piece created in AR lands. Null without GPS.
    ahead: () => App.state.me ? Geo.offset(App.state.me, s.heading, AHEAD) : null,
    select(id) { s.selected = id; s.forceGhost = false; place(); },
    get started() { return s.started; },
  };
})();

App.register('ar', ARView);
