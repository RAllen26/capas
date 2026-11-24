// Create: one flow for pasting a piece, from the map (tap a spot) or from AR (a few meters ahead of you).

const Create = (() => {
  const form = $('#drop-form'), dialog = $('#drop-dialog');
  const SAMPLE_MODEL = 'assets/coyote-totem.glb';
  const ACCEPT = { image: 'image/*', video: 'video/*', audio: 'audio/*', model: '.glb,model/gltf-binary' };
  let draft = null;

  form.layer.innerHTML = Object.entries(LAYERS).map(([k, l]) => `<option value="${k}">${l.label}</option>`).join('');
  form.capa.innerHTML = Object.entries(CAPAS).map(([k, c]) => `<option value="${k}">${c.label}</option>`).join('');
  form.style.innerHTML = STYLES.map(s => `<option>${s}</option>`).join('');
  form.anchor.innerHTML = Object.entries(ANCHORS).map(([k, a]) => `<option value="${k}">${a.label}</option>`).join('');

  // The + CREATE tab. In AR the piece lands in front of you; anywhere else you pick a spot on the map.
  function start() {
    if (App.state.view === 'ar' && ARView.started) {
      const spot = ARView.ahead();
      if (spot) return open(spot);
      return App.toast('Waiting for GPS. Try again in a moment, or create from the map.');
    }
    if (App.state.view !== 'map') App.go('map');
    MapView.pickSpot(open);
  }

  function open(spot) {
    draft = {
      lat: spot.lat, lng: spot.lng,
      palette: Math.floor(Math.random() * PALETTES.length),
      seed: Math.floor(Math.random() * 1e6),
    };
    form.reset();
    form.capa.value = 'me';
    if (!form.artist.value && Avatar.me().handle !== '@you') form.artist.value = Avatar.me().handle;
    form.style.value = STYLES[Math.floor(Math.random() * STYLES.length)];
    $('#drop-supports').innerHTML = '';
    $('#drop-where').textContent = `${spot.lat.toFixed(5)}, ${spot.lng.toFixed(5)}`;
    renderPalettes();
    drawDraft();
    dialog.showModal();
  }

  function draftPiece() {
    const f = Object.fromEntries(new FormData(form));
    const title = f.title?.trim() || 'Untitled wall';
    return {
      id: slug(title) + '-' + draft.seed.toString(36),
      title,
      artist: (f.artist?.trim() || Avatar.me().handle).replace(/^([^@])/, '@$1'),
      created: new Date().toISOString().slice(0, 10),
      layer: f.layer,
      capa: f.capa,
      location: { lat: +draft.lat.toFixed(6), lng: +draft.lng.toFixed(6), radius: +f.radius || 50 },
      anchor: { type: f.anchor },
      art: { style: f.style, glyph: f.glyph?.trim() || title, palette: PALETTES[draft.palette], seed: draft.seed },
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
      `<button type="button" data-pal="${i}" class="${i === draft.palette ? 'sel' : ''}" aria-label="Palette ${i + 1}">${pal.map(c => `<span style="background:${c}"></span>`).join('')}</button>`
    ).join('');
  }
  $('#drop-palettes').addEventListener('click', e => {
    const b = e.target.closest('[data-pal]');
    if (!b) return;
    draft.palette = +b.dataset.pal;
    renderPalettes(); drawDraft();
  });
  $('#drop-reroll').onclick = () => { draft.seed = Math.floor(Math.random() * 1e6); drawDraft(); };
  form.addEventListener('input', () => { if (draft) drawDraft(); });

  // ---------- supports editor (one piece, many media) ----------
  $('#support-add').innerHTML = ['physical', 'text', 'image', 'video', 'audio', 'model'].map(t =>
    `<button type="button" class="btn small-btn" data-add-support="${t}">+ ${SUPPORTS[t].icon} ${SUPPORTS[t].label}</button>`).join('');

  $('#support-add').addEventListener('click', e => {
    const t = e.target.closest('[data-add-support]')?.dataset.addSupport;
    if (!t) return;
    const row = document.createElement('div');
    row.className = 'srow';
    row.dataset.type = t;
    const label = SUPPORTS[t].label;
    row.innerHTML = `
      <div class="srow-head"><b>${SUPPORTS[t].icon} ${label}</b><button type="button" class="link" data-remove-support>remove</button></div>
      ${ACCEPT[t] ? `
        <input type="file" accept="${ACCEPT[t]}" class="s-file" aria-label="${label} file">
        <input class="s-url" placeholder="…or paste a link (https://…)" aria-label="${label} link">
        ${t === 'model' ? `
          <p class="small">GLB files only (Blender: File → Export → glTF 2.0, format GLB). <button type="button" class="link" data-sample>Use the sample totem</button></p>
          <div class="srow-pose">
            <label>Height above ground (m) <input type="number" class="s-alt" value="0" step="any" min="-5" max="200"></label>
            <label>Turn (° from north) <input type="number" class="s-head" value="0" step="15" min="0" max="359"></label>
            <label>Size (× the file's own) <input type="number" class="s-scale" value="1" step="any" min="0.05" max="100"></label>
          </div>` : ''}
        <input class="s-cap" maxlength="120" placeholder="Caption (optional)" aria-label="Caption">`
      : `<textarea class="s-body" rows="2" maxlength="600" placeholder="${t === 'physical' ? 'What is on the street? Stencil, sticker, object, where exactly…' : 'Poem, story, instructions…'}" aria-label="${label}"></textarea>`}
      <div class="srow-opts">
        <label><input type="checkbox" class="s-there"> Only opens on site</label>
        ${t === 'video' || t === 'audio' ? '<label><input type="checkbox" class="s-loop"> Loop</label>' : ''}
      </div>`;
    $('#drop-supports').append(row);
    row.querySelector('input, textarea').focus();
  });
  $('#drop-supports').addEventListener('click', e => {
    if (e.target.closest('[data-remove-support]')) e.target.closest('.srow').remove();
    if (e.target.closest('[data-sample]')) e.target.closest('.srow').querySelector('.s-url').value = SAMPLE_MODEL;
  });

  async function readSupports() {
    const out = [];
    for (const row of $('#drop-supports').querySelectorAll('.srow')) {
      const t = row.dataset.type, s = { type: t };
      if (ACCEPT[t]) {
        const file = row.querySelector('.s-file').files[0];
        const link = row.querySelector('.s-url').value.trim();
        if (file) s.src = await Media.save(file);
        else if (/^https?:\/\//.test(link) || link === SAMPLE_MODEL) s.src = link;
        else continue;
        const cap = row.querySelector('.s-cap').value.trim();
        if (cap) s.caption = cap;
        if (t === 'model') s.pose = {
          altitude: +row.querySelector('.s-alt').value || 0,
          heading: +row.querySelector('.s-head').value || 0,
          scale: +row.querySelector('.s-scale').value || 1,
        };
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

  // Saved on submit, not on the dialog's close event: close waits for the next drawn frame.
  form.addEventListener('submit', async e => {
    if (e.submitter?.value !== 'ok' || !draft) return;
    const p = draftPiece();
    try { p.supports = await readSupports(); }
    catch { p.supports = []; App.toast('Some files could not be saved on this device.'); }
    draft = null;
    if (!Store.add(p)) App.toast('Could not save on this device (storage is blocked).');
    App.state.layersOn.add(p.layer);
    if (App.state.capa !== 'all' && App.state.capa !== App.capaOf(p)) { App.state.capa = 'all'; $('#capa-filter').value = 'all'; }
    App.emit('filter');
    App.reload();
    if (App.state.view === 'ar') ARView.select(p.id);
    else { MapView.focus(p.id); Card.open(p.id); }
  });

  return { start };
})();
