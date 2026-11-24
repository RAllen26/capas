// Studio: making a piece is its own experience, apart from browsing.
// SPOT (map) → OBJECT (3D graffiti or your GLB) → PLACE (3D view with the real buildings) → DETAILS → PUBLISH.
// Pieces you make can be saved as drafts, edited later, and adjusted on site in AR.

const Studio = (() => {
  const root = $('#studio'), form = $('#st-form');
  const STEPS = ['spot', 'object', 'place', 'details', 'publish'];
  const SAMPLE_MODEL = 'assets/coyote-totem.glb';
  const ACCEPT = { image: 'image/*', video: 'video/*', audio: 'audio/*' };
  const sizeOf = v => +(0.1 * Math.pow(400, v / 100)).toFixed(2);     // slider 0..100 → 0.1..40 ×
  const sliderOf = s => Math.round(Math.log(s / 0.1) / Math.log(400) * 100);
  let d = null, step = 'spot', placer = null, placerJob = null, map = null, pin = null, turn = null, floor = 5;

  // ---------- fixed choices ----------
  const chips = (el, entries, name) => {
    el.innerHTML = entries.map(([k, label, color]) =>
      `<button type="button" class="chip" data-${name}="${k}" ${color ? `style="--c:${color}"` : ''}>${label}</button>`).join('');
  };
  chips($('#st-styles'), STYLES.map(s => [s, s.toUpperCase()]), 'style');
  chips($('#st-layers'), Object.entries(LAYERS).map(([k, l]) => [k, l.label, l.color]), 'layer');
  chips($('#st-capas'), Object.entries(CAPAS).map(([k, c]) => [k, c.label]), 'capa');
  form.anchor.innerHTML = Object.entries(ANCHORS).map(([k, a]) => `<option value="${k}">${a.label}</option>`).join('');

  // ---------- open / close ----------
  function fresh(spot) {
    return {
      id: null, spot, kind: 'tag', model: null, file: null, previewUrl: null,
      art: { style: STYLES[Math.floor(Math.random() * STYLES.length)], palette: Math.floor(Math.random() * PALETTES.length), seed: Math.floor(Math.random() * 1e6) },
      pose: { e: 0, n: 0, altitude: 0.4, heading: 0, scale: 1 },
      layer: 'street', capa: 'me', created: new Date().toISOString().slice(0, 10), supports: [],
    };
  }

  // The + CREATE tab. In AR the spot starts a few meters ahead of you; otherwise where you are, if we know.
  function start() {
    const spot = App.state.view === 'ar' && ARView.started ? ARView.ahead() : App.state.me;
    open(fresh(spot ? { lat: spot.lat, lng: spot.lng } : null));
    go(spot ? 'object' : 'spot');
  }

  // Edit one of your pieces (published or draft).
  function edit(id) {
    const p = App.piece(id);
    if (!p?.local) return;
    const md = Media.list(p).find(x => x.type === 'model');
    const x = fresh({ lat: p.location.lat, lng: p.location.lng });
    Object.assign(x, {
      id: p.id, kind: md ? 'model' : 'tag', model: md ? { src: md.src } : null,
      art: { style: p.art.style, palette: Math.max(0, PALETTES.findIndex(pl => pl.join() === p.art.palette.join())), seed: p.art.seed, glyph: p.art.glyph },
      pose: { e: 0, n: 0, altitude: 0.4, heading: 0, scale: 1, ...(md?.pose || {}), ...(p.pose || {}) },
      layer: p.layer, capa: App.capaOf(p), created: p.created,
      supports: (p.supports || []).filter(s => s.type !== 'model'),
    });
    open(x, p);
    go('place');
  }

  function open(x, p) {
    d = x;
    form.reset();
    form.glyph.value = d.art.glyph || '';
    form.title.value = p?.title || '';
    form.artist.value = p?.artist || (Avatar.me().handle !== '@you' ? Avatar.me().handle : '');
    form.radius.value = p?.location.radius || 50;
    form.seen.value = p?.seenFrom || 0;
    form.anchor.value = p?.anchor.type || 'gps';
    form.note.value = p?.note || '';
    form.license.value = p?.license || 'CC-BY-SA-4.0';
    $('#st-url').value = d.model && !String(d.model.src).startsWith('idb:') ? d.model.src : '';
    $('#drop-supports').innerHTML = '';
    d.supports.forEach(s => addSupportRow(s.type, s));
    Card.close();
    root.hidden = false;
    document.body.classList.add('in-studio');
    renderAll();
  }

  function close() {
    root.hidden = true;
    document.body.classList.remove('in-studio');
    placer?.stop();
    turn?.stop();
    if (d?.previewUrl) URL.revokeObjectURL(d.previewUrl);
    d = null;
  }
  $('#st-close').onclick = close;

  // ---------- steps ----------
  function go(next) {
    if (next !== 'spot' && !d.spot) { App.toast('Pick a spot first.'); next = 'spot'; }
    step = next;
    root.dataset.step = step;
    root.querySelectorAll('.st-step').forEach(el => { el.hidden = el.dataset.step !== step; });
    $('#st-steps').querySelectorAll('li').forEach(li => {
      li.classList.toggle('on', li.dataset.step === step);
      li.classList.toggle('done', STEPS.indexOf(li.dataset.step) < STEPS.indexOf(step));
    });
    $('#st-back').hidden = step === 'spot';
    $('#st-next').hidden = step === 'publish';
    form.scrollTop = 0;

    const stage = step === 'spot' ? 'map' : step === 'publish' ? 'turn' : 'gl';
    $('#st-map').hidden = stage !== 'map';
    $('#st-gl').hidden = $('#st-viewbar').hidden = stage !== 'gl';
    $('#st-turn').hidden = stage !== 'turn';
    turn?.stop(); turn = null;

    if (stage === 'map') showMap();
    if (stage === 'gl') ensurePlacer().then(pl => { pl.start(); if (step === 'place') pl.setMode(mode); else pl.setMode('orbit'); });
    else placer?.stop();
    if (stage === 'turn') {
      renderSummary();
      Thumbs.forget('__draft').then(() => { turn = Thumbs.live($('#st-turn'), { ...piece(), id: '__draft' }); });
    }
  }
  $('#st-steps').addEventListener('click', e => { const s = e.target.closest('li')?.dataset.step; if (s) go(s); });
  $('#st-next').onclick = () => go(STEPS[STEPS.indexOf(step) + 1]);
  $('#st-back').onclick = () => go(STEPS[STEPS.indexOf(step) - 1]);

  // ---------- SPOT: a map of its own ----------
  function showMap() {
    if (!map) {
      map = L.map('st-map', { zoomControl: false, attributionControl: true }).setView([19.4326, -99.1332], 15);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 20, maxNativeZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
      map.on('click', e => setSpot({ lat: e.latlng.lat, lng: e.latlng.lng }));
    }
    setTimeout(() => {
      map.invalidateSize();
      const c = d.spot || App.state.me;
      if (c) map.setView([c.lat, c.lng], 18);
      drawPin();
    }, 30);
  }
  function drawPin() {
    pin?.remove(); pin = null;
    if (!d.spot || !map) return;
    pin = L.circleMarker([d.spot.lat, d.spot.lng], { radius: 9, color: '#111', weight: 2, fillColor: '#4a3aff', fillOpacity: 1 }).addTo(map);
  }
  function setSpot(s) {
    d.spot = s;
    d.pose.e = d.pose.n = 0;
    $('#st-where').textContent = `${s.lat.toFixed(5)}, ${s.lng.toFixed(5)}`;
    drawPin();
    if (placer) { placer.setPose(d.pose); loadCity(); }
  }
  $('#st-here').onclick = () => (App.state.me ? Promise.resolve(App.state.me) : App.locate())
    .then(me => { setSpot({ lat: me.lat, lng: me.lng }); map?.setView([me.lat, me.lng], 19); })
    .catch(() => App.toast('No location on this device. Tap the map instead.'));

  // ---------- the 3D view ----------
  let mode = 'move';
  function ensurePlacer() {
    if (placerJob) return placerJob;
    placerJob = import('./placer.js?v=202611241357').then(m => {
      placer = m.createPlacer($('#st-gl'), pose => { Object.assign(d.pose, { e: pose.e, n: pose.n }); renderMoved(); });
      loadCity();
      refreshObject();
      placer.setPose(d.pose);
      placer.setRadius(+form.radius.value);
      placer.view('orbit');
      return placer;
    }).catch(e => { App.toast('3D is not available on this device.'); throw e; });
    return placerJob;
  }

  function loadCity() {
    if (!placer || !d.spot) return;
    const me = App.state.me;
    if (me) { const [e, n] = Buildings.local(d.spot, me); placer.setMe(e, n); } else placer.setMe(null);
    const c = Buildings.cell(d.spot);
    const spot = d.spot;
    $('#st-city').textContent = 'LOADING BUILDINGS…';
    Buildings.around(c, 500).then(list => {
      if (d?.spot !== spot) return;
      placer.setCity(list);
      const [e, n] = Buildings.local(spot, c);
      placer.setCityOffset(e, n);
      $('#st-city').textContent = list.length ? `${list.length} BUILDINGS` : 'NO BUILDINGS MAPPED HERE';
    }).catch(() => { $('#st-city').textContent = 'MAP SERVER BUSY · NO BUILDINGS'; });
  }

  let objTimer = 0;
  function refreshObject() {
    clearTimeout(objTimer);
    objTimer = setTimeout(async () => {
      if (!placer || !d) return;
      if (d.kind === 'model') {
        const url = d.previewUrl || (d.model && await Media.url(d.model.src));
        if (url) return placer.setModel(url).catch(() => App.toast('That 3D file could not load.'));
      }
      placer.setTag(piece());
    }, 150);
  }

  $('#st-viewbar').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b || !placer) return;
    if (b.dataset.mode) {
      mode = b.dataset.mode;
      placer.setMode(mode);
      $('#st-viewbar').querySelectorAll('[data-mode]').forEach(x => x.classList.toggle('on', x === b));
    }
    if (b.dataset.view === 'fit') placer.view('orbit');
    if (b.dataset.view === 'street') { placer.view('street'); setOrbit(); }
    if (b.dataset.view === 'window') {
      if (b.classList.contains('was')) floor = floor >= 20 ? 1 : floor + 2;
      b.classList.add('was');
      $('#st-floor').textContent = floor;
      placer.view('window', floor); setOrbit();
    }
  });
  // Looking from street or window means looking around, not moving the piece.
  function setOrbit() {
    mode = 'orbit'; placer.setMode('orbit');
    $('#st-viewbar').querySelectorAll('[data-mode]').forEach(x => x.classList.toggle('on', x.dataset.mode === 'orbit'));
  }

  // ---------- OBJECT ----------
  $('#st-kind').addEventListener('click', e => {
    const k = e.target.closest('[data-kind]')?.dataset.kind;
    if (!k) return;
    d.kind = k; renderAll(); refreshObject();
  });
  $('#st-styles').addEventListener('click', e => { const s = e.target.closest('[data-style]')?.dataset.style; if (s) { d.art.style = s; renderAll(); refreshObject(); } });
  $('#st-palettes').addEventListener('click', e => { const b = e.target.closest('[data-pal]'); if (b) { d.art.palette = +b.dataset.pal; renderAll(); refreshObject(); } });
  $('#st-reroll').onclick = () => { d.art.seed = Math.floor(Math.random() * 1e6); refreshObject(); };
  $('#st-file').addEventListener('change', e => {
    const f = e.target.files[0];
    if (!f) return;
    if (d.previewUrl) URL.revokeObjectURL(d.previewUrl);
    d.file = f; d.previewUrl = URL.createObjectURL(f); d.model = null;
    refreshObject();
  });
  $('#st-url').addEventListener('change', e => {
    const u = e.target.value.trim();
    if (!u) return;
    d.file = null; d.previewUrl = null; d.model = { src: u };
    refreshObject();
  });
  $('#st-sample').onclick = () => { $('#st-url').value = SAMPLE_MODEL; d.file = null; d.previewUrl = null; d.model = { src: SAMPLE_MODEL }; refreshObject(); };

  // ---------- PLACE ----------
  function renderMoved() {
    const m = Math.hypot(d.pose.e, d.pose.n);
    if (m < 0.5) return void ($('#st-moved').textContent = '');
    const DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const b = (Math.atan2(d.pose.e, d.pose.n) * 180 / Math.PI + 360) % 360;
    $('#st-moved').textContent = `Moved ${Geo.fmt(m)} ${DIRS[Math.round(b / 45) % 8]} of the spot.`;
  }

  form.addEventListener('input', e => {
    if (!d) return;
    const n = e.target.name;
    if (n === 'alt') d.pose.altitude = +e.target.value;
    if (n === 'head') d.pose.heading = +e.target.value;
    if (n === 'size') d.pose.scale = sizeOf(+e.target.value);
    if (n === 'radius') placer?.setRadius(+e.target.value);
    if (['alt', 'head', 'size'].includes(n)) placer?.setPose(d.pose);
    if (n === 'glyph' || n === 'title') refreshObject();
    renderOutputs();
  });
  form.addEventListener('submit', e => e.preventDefault());
  // Letting go of the size slider frames the piece again, so you're never stuck inside it.
  form.addEventListener('change', e => { if (e.target.name === 'size') placer?.view('orbit'); });

  // ---------- DETAILS ----------
  $('#st-layers').addEventListener('click', e => { const k = e.target.closest('[data-layer]')?.dataset.layer; if (k) { d.layer = k; renderAll(); } });
  $('#st-capas').addEventListener('click', e => { const k = e.target.closest('[data-capa]')?.dataset.capa; if (k) { d.capa = k; renderAll(); } });

  // ---------- render ----------
  function renderOutputs() {
    form.alt.value = d.pose.altitude; form.head.value = d.pose.heading; form.size.value = sliderOf(d.pose.scale);
    $('#o-alt').textContent = d.pose.altitude + ' m';
    $('#o-head').textContent = d.pose.heading + '°';
    $('#o-size').textContent = d.pose.scale + '×';
    $('#o-radius').textContent = form.radius.value + ' m';
    $('#o-seen').textContent = +form.seen.value ? Geo.fmt(+form.seen.value) : 'NORMAL (2 km)';
  }
  function renderAll() {
    $('#st-kind').querySelectorAll('[data-kind]').forEach(b => b.classList.toggle('on', b.dataset.kind === d.kind));
    root.querySelectorAll('[data-kind-panel]').forEach(p => { p.hidden = p.dataset.kindPanel !== d.kind; });
    $('#st-styles').querySelectorAll('[data-style]').forEach(b => b.classList.toggle('on', b.dataset.style === d.art.style));
    $('#st-layers').querySelectorAll('[data-layer]').forEach(b => b.classList.toggle('on', b.dataset.layer === d.layer));
    $('#st-capas').querySelectorAll('[data-capa]').forEach(b => b.classList.toggle('on', b.dataset.capa === d.capa));
    $('#st-palettes').innerHTML = PALETTES.map((pal, i) =>
      `<button type="button" data-pal="${i}" class="${i === d.art.palette ? 'sel' : ''}" aria-label="Colors ${i + 1}">${pal.map(c => `<span style="background:${c}"></span>`).join('')}</button>`).join('');
    $('#st-where').textContent = d.spot ? `${d.spot.lat.toFixed(5)}, ${d.spot.lng.toFixed(5)}` : 'No spot yet.';
    renderOutputs();
    renderMoved();
  }

  // ---------- the piece as it stands ----------
  function piece() {
    const f = Object.fromEntries(new FormData(form));
    const title = f.title?.trim() || f.glyph?.trim() || 'Untitled';
    const { e, n } = d.pose;
    const lat = d.spot.lat + n / 110540, lng = d.spot.lng + e / (111320 * Math.cos(d.spot.lat * Math.PI / 180));
    const p = {
      id: d.id || slug(title) + '-' + d.art.seed.toString(36),
      capa: d.capa, title,
      artist: (f.artist?.trim() || Avatar.me().handle).replace(/^([^@])/, '@$1'),
      created: d.created, layer: d.layer,
      location: { lat: +lat.toFixed(6), lng: +lng.toFixed(6), radius: +f.radius || 50 },
      anchor: { type: f.anchor || 'gps' },
      art: { style: d.art.style, glyph: f.glyph?.trim() || title, palette: PALETTES[d.art.palette], seed: d.art.seed },
      pose: { altitude: d.pose.altitude, heading: d.pose.heading, scale: d.pose.scale },
      note: f.note?.trim() || '', license: f.license || 'CC-BY-SA-4.0',
      supports: [],
    };
    if (+f.seen) p.seenFrom = +f.seen;
    if (d.kind === 'model' && (d.model || d.previewUrl)) p.supports.push({ type: 'model', src: d.model?.src || d.previewUrl, pose: p.pose });
    return p;
  }

  function renderSummary() {
    const p = piece();
    $('#st-summary').innerHTML = `
      <dt>Piece</dt><dd>${esc(p.title)} · ${esc(p.artist)}</dd>
      <dt>Object</dt><dd>${d.kind === 'model' ? (d.file ? esc(d.file.name) : esc(d.model?.src || 'no file yet')) : `3D graffiti “${esc(p.art.glyph)}” · ${p.art.style}`}</dd>
      <dt>Where</dt><dd>${p.location.lat}, ${p.location.lng} · ${p.pose.altitude} m up · ${p.pose.scale}×</dd>
      <dt>Layer</dt><dd>${LAYERS[p.layer].label}</dd>
      <dt>Who sees it</dt><dd>${CAPAS[p.capa].label}: ${CAPAS[p.capa].desc}</dd>
      <dt>Opens</dt><dd>within ${p.location.radius} m${p.seenFrom ? ` · seen from ${Geo.fmt(p.seenFrom)}` : ''}</dd>`;
  }

  // ---------- save ----------
  async function save({ draft, onsite }) {
    if (d.kind === 'model' && !d.file && !d.model) { App.toast('Add a GLB file, or switch to 3D graffiti.'); return go('object'); }
    const p = piece();
    try {
      if (d.kind === 'model' && d.file) {
        const src = await Media.save(d.file);
        p.supports[0].src = src; d.model = { src }; d.file = null;
      }
      p.supports.push(...await readSupports());
    } catch { App.toast('Some files could not be saved on this device.'); }
    if (draft) p.draft = true;
    if (!Store.put(p)) return App.toast('Could not save on this device (storage is blocked).');
    Thumbs.forget(p.id);
    ARView.forget(p.id);
    App.state.layersOn.add(p.layer);
    if (!draft && App.state.capa !== 'all' && App.state.capa !== p.capa) { App.state.capa = 'all'; $('#capa-filter').value = 'all'; }
    App.emit('filter');
    App.reload();
    close();
    if (draft) { App.toast('Draft saved. It\'s in your profile under MADE.'); return App.go('collection'); }
    if (onsite) { App.go('ar', p.id); return ARView.adjust(p.id); }
    App.toast('Published on this device.');
    App.go('wall');
  }
  $('#st-draft').onclick = () => save({ draft: true });
  $('#st-publish').onclick = () => save({});
  $('#st-onsite').onclick = () => save({ onsite: true });

  // ---------- more supports (text, image, video, sound, the physical trace) ----------
  $('#support-add').innerHTML = ['physical', 'text', 'image', 'video', 'audio'].map(t =>
    `<button type="button" class="btn small-btn" data-add-support="${t}">+ ${SUPPORTS[t].icon} ${SUPPORTS[t].label}</button>`).join('');
  $('#support-add').addEventListener('click', e => {
    const t = e.target.closest('[data-add-support]')?.dataset.addSupport;
    if (t) addSupportRow(t).querySelector('input, textarea').focus();
  });

  function addSupportRow(t, existing) {
    const row = document.createElement('div');
    row.className = 'srow';
    row.dataset.type = t;
    if (existing) row.dataset.keep = JSON.stringify(existing);
    const label = SUPPORTS[t].label;
    row.innerHTML = `
      <div class="srow-head"><b>${SUPPORTS[t].icon} ${label}</b><button type="button" class="link" data-remove-support>remove</button></div>
      ${ACCEPT[t] ? `
        <input type="file" accept="${ACCEPT[t]}" class="s-file" aria-label="${label} file">
        <input class="s-url" placeholder="${existing?.src?.startsWith('idb:') ? 'Keeping the file you added' : '…or paste a link (https://…)'}" value="${existing?.src && !existing.src.startsWith('idb:') ? esc(existing.src) : ''}" aria-label="${label} link">
        <input class="s-cap" maxlength="120" placeholder="Caption (optional)" value="${esc(existing?.caption || '')}" aria-label="Caption">`
      : `<textarea class="s-body" rows="2" maxlength="600" placeholder="${t === 'physical' ? 'What is on the street? Stencil, sticker, object, where exactly…' : 'Poem, story, instructions…'}" aria-label="${label}">${esc(existing?.body || '')}</textarea>`}
      <div class="srow-opts">
        <label><input type="checkbox" class="s-there" ${existing?.onlyThere ? 'checked' : ''}> Only opens on site</label>
        ${t === 'video' || t === 'audio' ? `<label><input type="checkbox" class="s-loop" ${existing?.loop ? 'checked' : ''}> Loop</label>` : ''}
      </div>`;
    $('#drop-supports').append(row);
    return row;
  }
  $('#drop-supports').addEventListener('click', e => {
    if (e.target.closest('[data-remove-support]')) e.target.closest('.srow').remove();
  });

  async function readSupports() {
    const out = [];
    for (const row of $('#drop-supports').querySelectorAll('.srow')) {
      const t = row.dataset.type, keep = row.dataset.keep ? JSON.parse(row.dataset.keep) : null, s = { type: t };
      if (ACCEPT[t]) {
        const file = row.querySelector('.s-file').files[0];
        const link = row.querySelector('.s-url').value.trim();
        if (file) s.src = await Media.save(file);
        else if (/^https?:\/\//.test(link)) s.src = link;
        else if (keep?.src) s.src = keep.src;
        else continue;
        const cap = row.querySelector('.s-cap').value.trim();
        if (cap) s.caption = cap;
      } else {
        s.body = row.querySelector('.s-body').value.trim();
        if (!s.body) continue;
      }
      if (row.querySelector('.s-there')?.checked) s.onlyThere = true;
      if (row.querySelector('.s-loop')?.checked) s.loop = true;
      out.push(s);
    }
    return out;
  }

  return { start, edit, close };
})();

// The tab bar and older code call it Create.
const Create = Studio;
