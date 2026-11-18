// Boot: filters, tabs, the info dialog, install, and the first route.

(() => {
  // ---------- layer chips ----------
  function renderLayers() {
    $('#layers').innerHTML = Object.entries(LAYERS).map(([k, l]) =>
      `<button class="chip ${App.state.layersOn.has(k) ? '' : 'off'}" style="--c:${l.color}" data-layer="${k}" title="${l.desc}">${l.label}</button>`
    ).join('');
  }
  $('#layers').addEventListener('click', e => {
    const k = e.target.dataset.layer;
    if (!k) return;
    const on = App.state.layersOn;
    on.has(k) ? on.delete(k) : on.add(k);
    App.emit('filter');
  });
  App.on('filter', renderLayers);
  renderLayers();

  // ---------- capa filter ----------
  const capa = $('#capa-filter');
  capa.innerHTML = '<option value="all">ALL CAPAS</option>' +
    Object.entries(CAPAS).map(([k, c]) => `<option value="${k}">${c.label}</option>`).join('');
  capa.addEventListener('change', () => { App.state.capa = capa.value; App.emit('filter'); });

  // ---------- tabs ----------
  document.querySelector('.tabbar').addEventListener('click', e => {
    const tab = e.target.closest('.tab');
    if (!tab) return;
    if (tab.dataset.view) App.go(tab.dataset.view);
    else Create.start();
  });

  // ---------- info / manifesto ----------
  $('#btn-info').onclick = () => $('#manifesto').showModal();
  let seen = true;
  try { seen = !!localStorage.getItem('capas.seen'); localStorage.setItem('capas.seen', '1'); } catch { /* storage blocked: skip first-visit manifesto */ }

  // ---------- install as an app ----------
  let installEvent = null;
  addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    installEvent = e;
    $('#btn-install').hidden = false;
  });
  $('#btn-install').onclick = async () => {
    if (!installEvent) return;
    installEvent.prompt();
    await installEvent.userChoice;
    installEvent = null;
    $('#btn-install').hidden = true;
  };
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

  // ---------- first route ----------
  // A scanned anchor (QR / NFC) arrives as ?scan=<piece>: that counts as being there.
  const params = new URLSearchParams(location.search);
  const scanned = App.piece(params.get('scan') || params.get('piece'));
  if (scanned) {
    history.replaceState(null, '', location.pathname);
    App.catchPiece(scanned, 'scan');
    App.go('ar', scanned.id);
  } else {
    App.route(location.hash);
    if (!seen) $('#manifesto').showModal();
  }
  addEventListener('hashchange', () => App.route(location.hash));
})();
