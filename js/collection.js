// Collection view: the pieces you caught by being there, the ones still out there, and the ones you made.

const CollectionView = (() => {
  const el = $('#collection');
  let active = false;

  function tile(p, meta, missing) {
    return `<button class="tile ${missing ? 'missing' : ''}" data-id="${p.id}" style="--c:${LAYERS[p.layer].color}">
      <img alt="" src="${Art.toDataURL(p, 160)}">
      <b>${esc(p.title)}</b><span>${meta}</span>
    </button>`;
  }

  function render() {
    if (!active) return;
    const pieces = App.visible(), catches = Store.catches();
    const caught = pieces.filter(p => catches[p.id]).sort((a, b) => catches[b.id].at.localeCompare(catches[a.id].at));
    const missing = pieces.filter(p => !catches[p.id]);
    if (App.state.me) missing.sort((a, b) => App.distanceTo(a) - App.distanceTo(b));
    const mine = App.state.pieces.filter(p => p.local);

    const bars = Object.entries(LAYERS).map(([k, l]) => {
      const all = pieces.filter(p => p.layer === k), got = all.filter(p => catches[p.id]).length;
      if (!all.length) return '';
      return `<div class="col-bar" style="--c:${l.color}"><span>${l.label}</span><i><b style="width:${(got / all.length) * 100}%"></b></i><span>${got}/${all.length}</span></div>`;
    }).join('');

    el.innerHTML = `
      <header class="col-head">
        <h2>COLLECTION</h2>
        <p class="col-count"><b>${caught.length}</b> of ${pieces.length} caught</p>
        <div class="col-bars">${bars}</div>
      </header>

      <h3>CAUGHT</h3>
      ${caught.length ? `<div class="tiles">${caught.map(p => tile(p, `${catches[p.id].at.slice(0, 10)} · ${catches[p.id].how === 'scan' ? 'scanned' : 'on site'}`)).join('')}</div>`
        : '<p class="empty">Nothing caught yet. Walk inside a piece\'s radius with the app open, or scan its sticker.</p>'}

      <h3>STILL OUT THERE</h3>
      ${missing.length ? `<div class="tiles">${missing.map(p => {
        const d = App.distanceTo(p);
        return tile(p, d != null ? Geo.fmt(d) + ' away' : LAYERS[p.layer].label, true);
      }).join('')}</div>` : '<p class="empty">You caught everything in these filters.</p>'}

      <h3>PIECES I MADE</h3>
      ${mine.length ? `<div class="tiles">${mine.map(p => tile(p, `${CAPAS[App.capaOf(p)].label} · ${p.created}`)).join('')}</div>
        <p><button class="btn" id="btn-export">EXPORT MY PIECES (.json)</button></p>
        <p class="small">Pieces you make live on this device. Export them to add them to the open repo. Uploaded files stay on the device.</p>`
        : '<p class="empty">None yet. Tap + CREATE to paste your first piece.</p>'}`;

    for (const p of [...caught, ...missing, ...mine]) {
      Media.cover(p).then(img => { if (img) el.querySelectorAll(`.tile[data-id="${p.id}"] img`).forEach(i => { i.src = img.src; }); });
    }
  }

  el.addEventListener('click', e => {
    const t = e.target.closest('.tile');
    if (t) return Card.open(t.dataset.id);
    if (e.target.id === 'btn-export') {
      const blob = new Blob([Store.exportLocal()], { type: 'application/json' });
      const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'capas-pieces.json' });
      a.click();
      URL.revokeObjectURL(a.href);
    }
  });

  // The tab shows how many you have, in every view.
  function count() { $('#tab-count').textContent = Object.keys(Store.catches()).filter(id => App.piece(id)).length || ''; }

  for (const evt of ['pieces', 'filter', 'catch']) App.on(evt, () => { count(); render(); });
  App.on('me', render);
  count();

  return {
    enter() { active = true; render(); el.scrollTop = 0; },
    leave() { active = false; },
  };
})();

App.register('collection', CollectionView);
