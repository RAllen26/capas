// Collection view: the pieces you caught by being there, the ones still out there, and the ones you made.

const CollectionView = (() => {
  const el = $('#collection');
  let active = false;

  let tab = 'caught';

  // Profile grid: square tiles edge to edge; the caption shows on the tile only where it says something new.
  function tile(p, meta, missing) {
    return `<button class="tile ${missing ? 'missing' : ''}" data-id="${p.id}" style="--c:${LAYERS[p.layer].color}" title="${esc(p.title)}">
      ${Thumbs.img(p, 260)}
      ${meta ? `<span>${meta}</span>` : ''}
    </button>`;
  }

  function render() {
    if (!active) return;
    const pieces = App.visible(), catches = Store.catches();
    const caught = pieces.filter(p => catches[p.id]).sort((a, b) => catches[b.id].at.localeCompare(catches[a.id].at));
    const missing = pieces.filter(p => !catches[p.id]);
    if (App.state.me) missing.sort((a, b) => App.distanceTo(a) - App.distanceTo(b));
    const mine = App.state.pieces.filter(p => p.local);
    const layersHit = new Set(caught.map(p => p.layer)).size;

    const bars = Object.entries(LAYERS).map(([k, l]) => {
      const all = pieces.filter(p => p.layer === k), got = all.filter(p => catches[p.id]).length;
      if (!all.length) return '';
      return `<div class="col-bar" style="--c:${l.color}"><span>${l.label}</span><i><b style="width:${(got / all.length) * 100}%"></b></i><span>${got}/${all.length}</span></div>`;
    }).join('');

    const lists = {
      caught: caught.length ? caught.map(p => tile(p, catches[p.id].how === 'scan' ? '⌗' : '')).join('')
        : '<p class="empty">Nothing caught yet. Walk inside a piece\'s radius with the app open, or scan its sticker.</p>',
      out: missing.length ? missing.map(p => { const d = App.distanceTo(p); return tile(p, d != null ? Geo.fmt(d) : '', true); }).join('')
        : '<p class="empty">You caught everything in these filters.</p>',
      made: mine.length ? mine.map(p => tile(p, p.draft ? 'DRAFT' : CAPAS[App.capaOf(p)].label)).join('')
        : '<p class="empty">None yet. Tap + CREATE to paste your first piece.</p>',
    };

    el.innerHTML = `
      <header class="profile">
        <button class="face" data-reroll="1" title="Tap for a new face">${Avatar.img(Avatar.me().handle, 'avatar big')}</button>
        <div class="profile-side">
        <form class="me-edit" id="me-edit">
          <input name="handle" value="${esc(Avatar.me().handle)}" maxlength="30" aria-label="Your handle" autocomplete="off">
          <button class="btn" type="button" data-reroll="1" title="New face">↻ FACE</button>
        </form>
        <dl>
          <div><dt>${caught.length}</dt><dd>caught</dd></div>
          <div><dt>${missing.length}</dt><dd>out there</dd></div>
          <div><dt>${mine.length}</dt><dd>made</dd></div>
          <div><dt>${layersHit}/4</dt><dd>layers</dd></div>
        </dl>
        </div>
      </header>
      <div class="col-head"><h2>COLLECTION</h2><div class="col-bars">${bars}</div></div>
      <nav class="seg" role="tablist">
        <button data-tab="caught" class="${tab === 'caught' ? 'on' : ''}">● CAUGHT</button>
        <button data-tab="out" class="${tab === 'out' ? 'on' : ''}">○ OUT THERE</button>
        <button data-tab="made" class="${tab === 'made' ? 'on' : ''}">+ MADE</button>
      </nav>
      <div class="tiles">${lists[tab]}</div>
      ${tab === 'made' && mine.length ? `<p><button class="btn" id="btn-export">EXPORT MY PIECES (.json)</button></p>
        <p class="small">Pieces you make live on this device. Export them to add them to the open repo. Uploaded files stay on the device.</p>` : ''}`;

    Thumbs.fill(el);
  }

  el.addEventListener('click', e => {
    if (e.target.closest('[data-reroll]')) { Avatar.setMe({ roll: Avatar.me().roll + 1 }); return; }
    const seg = e.target.closest('[data-tab]');
    if (seg) { tab = seg.dataset.tab; return render(); }
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
  App.on('me-profile', () => render());
  // Your handle: saved when you leave the field or press enter. It also signs the pieces you make.
  el.addEventListener('change', e => {
    if (e.target.name !== 'handle') return;
    const h = (e.target.value.trim() || '@you').replace(/^([^@])/, '@$1').slice(0, 30);
    Avatar.setMe({ handle: h });
  });
  el.addEventListener('submit', e => { e.preventDefault(); e.target.handle?.blur(); });
  App.on('me', render);
  count();

  return {
    enter() { active = true; render(); el.scrollTop = 0; },
    leave() { active = false; },
  };
})();

App.register('collection', CollectionView);
