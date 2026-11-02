// CAPAS explorer — map, layers, piece sheets, dropping pieces, QR anchors.

const $ = sel => document.querySelector(sel);
const state = {
  pieces: Store.all(),
  layersOn: new Set(Object.keys(LAYERS)),
  markers: new Map(),
  me: null,
  dropping: false,
  draft: null,
};

// ---------- map ----------
const map = L.map('map', { zoomControl: false, attributionControl: true })
  .setView([19.425, -99.15], 13);

// OSM tiles, darkened in CSS (.leaflet-tile-pane). Swap for your own tile server in production.
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
}).addTo(map);

function pinIcon(p) {
  const color = LAYERS[p.layer]?.color || '#fff';
  const rot = (Art.rng(p.id)() - 0.5) * 16;
  return L.divIcon({
    className: '',
    html: `<div class="pin" style="--c:${color};--rot:${rot}deg"><img alt="" src="${Art.toDataURL(p, 108)}"></div>`,
    iconSize: [54, 54], iconAnchor: [27, 66],
  });
}

function renderMarkers() {
  state.markers.forEach(m => m.remove());
  state.markers.clear();
  for (const p of state.pieces) {
    if (!state.layersOn.has(p.layer)) continue;
    const m = L.marker([p.location.lat, p.location.lng], { icon: pinIcon(p), title: p.title })
      .on('click', () => openSheet(p.id))
      .addTo(map);
    const circle = L.circle([p.location.lat, p.location.lng], {
      radius: p.location.radius, color: LAYERS[p.layer].color, weight: 1, dashArray: '4 4', fillOpacity: 0.06,
    }).addTo(map);
    state.markers.set(p.id, { remove: () => { m.remove(); circle.remove(); }, marker: m });
  }
  renderList();
}

// ---------- layer chips ----------
function renderLayers() {
  $('#layers').innerHTML = Object.entries(LAYERS).map(([k, l]) =>
    `<button class="chip ${state.layersOn.has(k) ? '' : 'off'}" style="--c:${l.color}" data-layer="${k}" title="${l.desc}">${l.label}</button>`
  ).join('');
}
$('#layers').addEventListener('click', e => {
  const k = e.target.dataset.layer;
  if (!k) return;
  state.layersOn.has(k) ? state.layersOn.delete(k) : state.layersOn.add(k);
  renderLayers(); renderMarkers();
});

// ---------- list ----------
function distanceTo(p) { return state.me ? Geo.distance(state.me, p.location) : null; }

function renderList() {
  const items = state.pieces.filter(p => state.layersOn.has(p.layer));
  if (state.me) items.sort((a, b) => distanceTo(a) - distanceTo(b));
  $('#list-items').innerHTML = items.map(p => {
    const d = distanceTo(p);
    return `<li data-id="${p.id}">
      <img alt="" src="${Art.toDataURL(p, 88)}">
      <div><b>${esc(p.title)}</b>
      <span class="meta">${esc(p.artist)} · ${LAYERS[p.layer].label}${d != null ? ' · ' + Geo.fmt(d) : ''}${p.local ? ' · YOURS' : ''}</span></div>
    </li>`;
  }).join('') || '<li>No pieces in these layers. Turn some on.</li>';
}
$('#list-items').addEventListener('click', e => {
  const li = e.target.closest('li[data-id]');
  if (!li) return;
  const p = state.pieces.find(x => x.id === li.dataset.id);
  map.flyTo([p.location.lat, p.location.lng], 16, { duration: 0.8 });
  if (matchMedia('(max-width: 640px)').matches) $('#list').hidden = true;
  openSheet(p.id);
});
$('#btn-list').onclick = () => { $('#list').hidden = !$('#list').hidden; };

// ---------- sheet ----------
function openSheet(id) {
  const p = state.pieces.find(x => x.id === id);
  if (!p) return;
  document.querySelectorAll('.pin.active').forEach(el => el.classList.remove('active'));
  state.markers.get(id)?.marker.getElement()?.querySelector('.pin')?.classList.add('active');
  const layer = LAYERS[p.layer], anchor = ANCHORS[p.anchor.type];
  const d = distanceTo(p);
  const inside = d != null && d <= p.location.radius;
  const sheet = $('#sheet');
  sheet.innerHTML = `
    <div class="sheet-art"><img alt="${esc(p.title)}" src="${Art.toDataURL(p, 512)}"><button class="x" data-close="sheet" aria-label="Close">×</button></div>
    <div class="sheet-body">
      <span class="tag" style="--c:${layer.color}">${layer.label}</span><span class="tag" style="--c:var(--paper)">${anchor.label}</span>
      ${p.local ? '<span class="tag" style="--c:var(--pink)">YOURS</span>' : ''}
      <h2>${esc(p.title)}</h2>
      <div>${esc(p.artist)}</div>
      ${p.note ? `<p class="note">${esc(p.note)}</p>` : ''}
      <dl class="kv">
        <dt>Anchor</dt><dd>${anchor.desc}${p.anchor.ref ? ` (${esc(p.anchor.ref)})` : ''}</dd>
        <dt>Radius</dt><dd>${p.location.radius} m</dd>
        <dt>Where</dt><dd>${p.location.lat.toFixed(5)}, ${p.location.lng.toFixed(5)}</dd>
        ${d != null ? `<dt>From you</dt><dd>${Geo.fmt(d)} ${inside ? '— <b>YOU ARE HERE. OPEN IT.</b>' : ''}</dd>` : ''}
        <dt>Pasted</dt><dd>${p.created}</dd>
        <dt>License</dt><dd>${p.license}</dd>
      </dl>
      <div class="actions">
        <a class="btn btn-ink" href="ar.html?piece=${encodeURIComponent(p.id)}">VIEW IN AR ▲</a>
        <a class="btn" target="_blank" rel="noopener" href="https://www.openstreetmap.org/directions?to=${p.location.lat},${p.location.lng}">GO THERE</a>
        <button class="btn" data-qr="${p.id}">QR ANCHOR</button>
        ${p.local ? `<button class="btn" data-del="${p.id}">PAINT OVER</button>` : ''}
      </div>
    </div>`;
  sheet.hidden = false;
}

document.addEventListener('click', e => {
  const close = e.target.closest('[data-close]');
  if (close) {
    $('#' + close.dataset.close).hidden = true;
    document.querySelectorAll('.pin.active').forEach(el => el.classList.remove('active'));
  }
  const qr = e.target.closest('[data-qr]');
  if (qr) showQR(qr.dataset.qr);
  const del = e.target.closest('[data-del]');
  if (del && confirm('Paint over this piece on this device?')) {
    Store.remove(del.dataset.del);
    state.pieces = Store.all();
    $('#sheet').hidden = true;
    renderMarkers();
  }
});

// ---------- QR anchors: the sticker you paste on the real wall ----------
function showQR(id) {
  const p = state.pieces.find(x => x.id === id);
  const url = new URL(`ar.html?piece=${encodeURIComponent(id)}`, location.href).href;
  $('#qr').innerHTML = '';
  if (window.QRCode) new QRCode($('#qr'), { text: url, width: 220, height: 220, colorDark: '#0b0b0b', colorLight: '#ffffff' });
  else $('#qr').textContent = 'QR library failed to load.';
  $('#qr-title').textContent = p.title;
  $('#qr-url').textContent = url;
  $('#qr-dialog').showModal();
}

// ---------- locate ----------
let meMarker = null;
$('#btn-locate').onclick = () => {
  if (!navigator.geolocation) return alert('No geolocation on this device.');
  $('#btn-locate').textContent = '◎ …';
  navigator.geolocation.getCurrentPosition(pos => {
    state.me = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    meMarker?.remove();
    meMarker = L.marker([state.me.lat, state.me.lng], {
      icon: L.divIcon({ className: '', html: '<div class="me-dot"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }),
      interactive: false,
    }).addTo(map);
    map.flyTo([state.me.lat, state.me.lng], 15);
    $('#btn-locate').textContent = '◎ ME';
    renderList();
  }, err => {
    $('#btn-locate').textContent = '◎ ME';
    alert('Could not get your location: ' + err.message);
  }, { enableHighAccuracy: true, timeout: 10000 });
};

// ---------- drop a piece ----------
const form = $('#drop-form');
form.layer.innerHTML = Object.entries(LAYERS).map(([k, l]) => `<option value="${k}">${l.label}</option>`).join('');
form.style.innerHTML = STYLES.map(s => `<option>${s}</option>`).join('');
form.anchor.innerHTML = Object.entries(ANCHORS).map(([k, a]) => `<option value="${k}">${a.label}</option>`).join('');

function setDropping(on) {
  state.dropping = on;
  $('#drop-hint').hidden = !on;
  $('#btn-drop').classList.toggle('on', on);
  map.getContainer().style.cursor = on ? 'crosshair' : '';
}
$('#btn-drop').onclick = () => setDropping(!state.dropping);
$('#drop-cancel').onclick = () => setDropping(false);

map.on('click', e => {
  if (!state.dropping) return;
  setDropping(false);
  state.draft = {
    lat: e.latlng.lat, lng: e.latlng.lng,
    palette: Math.floor(Math.random() * PALETTES.length),
    seed: Math.floor(Math.random() * 1e6),
  };
  form.reset();
  form.style.value = STYLES[Math.floor(Math.random() * STYLES.length)];
  renderPalettes();
  drawDraft();
  $('#drop-dialog').showModal();
});

function draftPiece() {
  const f = Object.fromEntries(new FormData(form));
  const title = f.title?.trim() || 'Untitled wall';
  return {
    id: slug(title) + '-' + state.draft.seed.toString(36),
    title,
    artist: (f.artist?.trim() || '@anon').replace(/^([^@])/, '@$1'),
    created: new Date().toISOString().slice(0, 10),
    layer: f.layer,
    location: { lat: +state.draft.lat.toFixed(6), lng: +state.draft.lng.toFixed(6), radius: +f.radius || 50 },
    anchor: { type: f.anchor },
    art: { style: f.style, glyph: f.glyph?.trim() || title, palette: PALETTES[state.draft.palette], seed: state.draft.seed },
    note: f.note?.trim() || '',
    license: f.license,
  };
}

function drawDraft() {
  const c = $('#drop-preview');
  Art.draw(c.getContext('2d', { willReadFrequently: true }), draftPiece(), c.width, c.height);
}

function renderPalettes() {
  $('#drop-palettes').innerHTML = PALETTES.map((pal, i) =>
    `<button type="button" data-pal="${i}" class="${i === state.draft.palette ? 'sel' : ''}" aria-label="Palette ${i + 1}">${pal.map(c => `<span style="background:${c}"></span>`).join('')}</button>`
  ).join('');
}
$('#drop-palettes').addEventListener('click', e => {
  const b = e.target.closest('[data-pal]');
  if (!b) return;
  state.draft.palette = +b.dataset.pal;
  renderPalettes(); drawDraft();
});
$('#drop-reroll').onclick = () => { state.draft.seed = Math.floor(Math.random() * 1e6); drawDraft(); };
form.addEventListener('input', drawDraft);

$('#drop-dialog').addEventListener('close', () => {
  if ($('#drop-dialog').returnValue !== 'ok') return;
  const p = draftPiece();
  if (!Store.add(p)) alert('Could not save on this device (storage blocked). Export won\'t include it.');
  state.pieces = Store.all();
  state.layersOn.add(p.layer);
  renderLayers(); renderMarkers();
  openSheet(p.id);
});

// ---------- export ----------
$('#btn-export').onclick = () => {
  const blob = new Blob([Store.exportLocal()], { type: 'application/json' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'capas-pieces.json' });
  a.click();
  URL.revokeObjectURL(a.href);
};

// ---------- manifesto ----------
$('#btn-manifesto').onclick = () => $('#manifesto').showModal();
try {
  if (!localStorage.getItem('capas.seen')) { $('#manifesto').showModal(); localStorage.setItem('capas.seen', '1'); }
} catch { /* storage blocked: skip first-visit manifesto */ }

// ---------- utils ----------
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function slug(s) { return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32) || 'piece'; }

// Re-render art once the display font is in, so glyphs use it.
document.fonts?.ready.then(() => { Art.clear(); renderMarkers(); });
renderLayers();
renderMarkers();
