// The piece card: one sheet shared by Map, AR and Collection, plus the printable QR anchor.

const Card = (() => {
  const sheet = $('#sheet');
  let current = null;

  function statusLine(p, d) {
    const c = Store.caught(p.id);
    if (c) return `<p class="status caught">● CAUGHT ${c.at.slice(0, 10)} · ${c.how === 'scan' ? 'you scanned its anchor' : 'you were there'}</p>`;
    if (App.inside(p)) return '<p class="status">◌ YOU ARE INSIDE ITS RADIUS · waiting for a sharper GPS fix to catch it</p>';
    return `<p class="status">◌ NOT CAUGHT YET · walk inside its ${p.location.radius} m radius or scan its anchor${d != null ? ` (${Geo.fmt(d)} away)` : ''}</p>`;
  }

  function open(id, { autoplay = false } = {}) {
    const p = App.piece(id);
    if (!p) return;
    current = id;
    const layer = LAYERS[p.layer], anchor = ANCHORS[p.anchor.type], capa = CAPAS[App.capaOf(p)];
    const d = App.distanceTo(p), isOpen = App.isOpen(p), inAR = App.state.view === 'ar';
    sheet.innerHTML = `
      <div class="sheet-art"><img alt="${esc(p.title)}" src="${Art.toDataURL(p, 512)}"><button class="x" data-act="close" aria-label="Close">×</button></div>
      <div class="sheet-body">
        <span class="tag" style="--c:${layer.color}" title="${layer.desc}">${layer.label}</span><span class="tag" title="${capa.desc}">${capa.label}</span><span class="tag">${anchor.label}</span>
        <h2>${esc(p.title)}</h2>
        <div>${esc(p.artist)}</div>
        ${statusLine(p, d)}
        <div class="support-chips">${Media.chips(p)}</div>
        ${p.note ? `<p class="note">${esc(p.note)}</p>` : ''}
        <div class="supports" id="sheet-supports"></div>
        <dl class="kv">
          <dt>Anchor</dt><dd>${anchor.desc}${p.anchor.ref ? ` (${esc(p.anchor.ref)})` : ''}</dd>
          <dt>Capa</dt><dd>${capa.desc}</dd>
          <dt>Where</dt><dd>${p.location.lat.toFixed(5)}, ${p.location.lng.toFixed(5)} · radius ${p.location.radius} m</dd>
          <dt>Pasted</dt><dd>${p.created}</dd>
          <dt>License</dt><dd>${p.license}</dd>
        </dl>
        <div class="actions">
          ${inAR ? '<button class="btn btn-accent" data-act="map">SHOW ON MAP</button>' : '<button class="btn btn-accent" data-act="ar">VIEW IN AR ▲</button>'}
          <a class="btn" target="_blank" rel="noopener" href="https://www.openstreetmap.org/directions?to=${p.location.lat},${p.location.lng}">GO THERE</a>
          <button class="btn" data-act="qr">QR ANCHOR</button>
          ${p.local ? '<button class="btn" data-act="delete">PAINT OVER</button>' : ''}
        </div>
      </div>`;
    sheet.hidden = false;
    sheet.scrollTop = 0;
    Media.cover(p).then(img => { if (img && current === id) sheet.querySelector('.sheet-art img').src = img.src; });
    // The tap that opened the card counts as a gesture, so on-site sound can start right away.
    Media.render($('#sheet-supports'), p, { unlocked: isOpen }).then(() => {
      if (autoplay && isOpen && current === id) sheet.querySelector('audio')?.play().catch(() => {});
    });
    App.emit('card', id);
  }

  function close() {
    if (sheet.hidden) return;
    sheet.querySelectorAll('audio, video').forEach(m => m.pause());
    sheet.hidden = true;
    current = null;
    App.emit('card', null);
  }

  sheet.addEventListener('click', e => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    const id = current;
    if (!act || !id) return;
    if (act === 'close') close();
    if (act === 'ar') App.go('ar', id);
    if (act === 'map') App.route('#piece/' + id);
    if (act === 'qr') showQR(id);
    if (act === 'delete') {
      const btn = e.target.closest('button');
      if (!btn.dataset.armed) { btn.dataset.armed = '1'; btn.textContent = 'SURE? TAP AGAIN'; return; }
      Media.list(App.piece(id)).forEach(s => Media.remove(s.src));
      Store.remove(id);
      close();
      App.reload();
    }
  });

  // A catch can land while its card is open (you walked in): refresh it.
  App.on('catch', p => { if (p.id === current) open(current); });

  // ---------- QR anchor: the sticker you paste on the real wall ----------
  function showQR(id) {
    const p = App.piece(id);
    const url = new URL('./?scan=' + encodeURIComponent(id), location.href).href;
    $('#qr').innerHTML = '';
    if (window.QRCode) new QRCode($('#qr'), { text: url, width: 220, height: 220, colorDark: '#0b0b0b', colorLight: '#ffffff' });
    else $('#qr').textContent = 'QR library failed to load.';
    $('#qr-title').textContent = p.title;
    $('#qr-url').textContent = url;
    $('#qr-dialog').showModal();
  }

  return { open, close, get current() { return current; } };
})();
