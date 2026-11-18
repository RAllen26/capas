// Map view: pieces on a dark map, the list drawer, "find me", and picking a spot for a new piece.

const MapView = (() => {
  let map = null, meMarker = null, onPick = null;
  const markers = new Map();

  function init() {
    map = L.map('map', { zoomControl: false, attributionControl: true }).setView([19.425, -99.15], 13);
    // OSM tiles, darkened in CSS (.leaflet-tile-pane). Swap for your own tile server in production.
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);
    map.on('click', e => {
      if (!onPick) return;
      const cb = onPick;
      stopPicking();
      cb({ lat: e.latlng.lat, lng: e.latlng.lng });
    });
    render();
    Art.ready.then(() => { Art.clear(); render(); });
  }

  function pinIcon(p) {
    const color = LAYERS[p.layer]?.color || '#fff';
    const rot = (Art.rng(p.id)() - 0.5) * Theme.num('--pin-tilt');
    return L.divIcon({
      className: '',
      html: `<div class="pin ${Store.caught(p.id) ? 'caught' : ''}" style="--c:${color};--rot:${rot}deg"><img alt="" src="${Art.toDataURL(p, 108)}"></div>`,
      iconSize: [54, 54], iconAnchor: [27, 66],
    });
  }

  // Generated art shows first; a piece's image support replaces it once loaded.
  function useCover(p, getImg) {
    Media.cover(p).then(img => { const el = img && getImg(); if (el) el.src = img.src; });
  }

  function render() {
    if (!map) return;
    markers.forEach(m => m.remove());
    markers.clear();
    for (const p of App.visible()) {
      const m = L.marker([p.location.lat, p.location.lng], { icon: pinIcon(p), title: p.title })
        .on('click', () => { if (!onPick) Card.open(p.id); })
        .addTo(map);
      const circle = L.circle([p.location.lat, p.location.lng], {
        radius: p.location.radius, color: LAYERS[p.layer].color, weight: 1, dashArray: '4 4', fillOpacity: 0.06, interactive: false,
      }).addTo(map);
      markers.set(p.id, { remove: () => { m.remove(); circle.remove(); }, marker: m });
      useCover(p, () => m.getElement()?.querySelector('.pin img'));
    }
    highlight(Card.current);
    renderList();
  }

  function highlight(id) {
    document.querySelectorAll('.pin.active').forEach(el => el.classList.remove('active'));
    if (id) markers.get(id)?.marker.getElement()?.querySelector('.pin')?.classList.add('active');
  }

  // ---------- list drawer ----------
  function renderList() {
    if ($('#list').hidden) return;
    const items = App.visible();
    if (App.state.me) items.sort((a, b) => App.distanceTo(a) - App.distanceTo(b));
    $('#list-items').innerHTML = items.map(p => {
      const d = App.distanceTo(p);
      return `<li data-id="${p.id}">
        <img alt="" src="${Art.toDataURL(p, 88)}">
        <div><b>${esc(p.title)}</b>
        <span class="meta">${esc(p.artist)} · ${LAYERS[p.layer].label}${d != null ? ' · ' + Geo.fmt(d) : ''}${Store.caught(p.id) ? ' · ● CAUGHT' : ''}</span>
        <span class="meta">${Media.icons(p)}</span></div>
      </li>`;
    }).join('') || '<li>No pieces match these filters. Turn a layer back on or pick another capa.</li>';
    items.forEach(p => useCover(p, () => $(`#list-items li[data-id="${p.id}"] img`)));
  }
  $('#list-items').addEventListener('click', e => {
    const li = e.target.closest('li[data-id]');
    if (!li) return;
    if (matchMedia('(max-width: 640px)').matches) $('#list').hidden = true;
    focus(li.dataset.id);
    Card.open(li.dataset.id);
  });
  $('#btn-list').onclick = () => { $('#list').hidden = !$('#list').hidden; renderList(); };
  $('#list-close').onclick = () => { $('#list').hidden = true; };

  function focus(id) {
    const p = App.piece(id);
    if (p && map) map.flyTo([p.location.lat, p.location.lng], Math.max(map.getZoom(), 16), { duration: 0.8 });
  }

  // ---------- find me ----------
  function showMe() {
    if (!map || !App.state.me) return;
    const { lat, lng } = App.state.me;
    if (!meMarker) {
      meMarker = L.marker([lat, lng], {
        icon: L.divIcon({ className: '', html: '<div class="me-dot"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }),
        interactive: false,
      }).addTo(map);
    } else meMarker.setLatLng([lat, lng]);
  }
  $('#btn-locate').onclick = () => {
    $('#btn-locate').classList.add('on');
    App.locate()
      .then(me => map.flyTo([me.lat, me.lng], 16))
      .catch(err => App.toast('Could not get your location: ' + err.message))
      .finally(() => $('#btn-locate').classList.remove('on'));
  };

  // ---------- pick a spot for a new piece ----------
  function pickSpot(cb) {
    onPick = cb;
    $('#drop-hint').hidden = false;
    map.getContainer().style.cursor = 'crosshair';
  }
  function stopPicking() {
    onPick = null;
    $('#drop-hint').hidden = true;
    if (map) map.getContainer().style.cursor = '';
  }
  $('#drop-cancel').onclick = stopPicking;
  $('#drop-here').onclick = () => {
    const cb = onPick;
    // Use the fix we already have; only ask the phone when there is none yet.
    (App.state.me ? Promise.resolve(App.state.me) : App.locate())
      .then(me => { if (onPick === cb && cb) { stopPicking(); cb({ ...me }); } })
      .catch(err => App.toast('Could not get your location: ' + err.message));
  };

  App.on('pieces', render);
  App.on('filter', render);
  App.on('catch', render);
  App.on('card', highlight);
  App.on('me', () => { showMe(); renderList(); });

  return {
    enter() {
      if (!map) init();
      // The map was hidden while another view was open: let Leaflet re-measure.
      setTimeout(() => map.invalidateSize(), 0);
      showMe();
    },
    leave() { stopPicking(); $('#list').hidden = true; },
    focus, pickSpot,
  };
})();

App.register('map', MapView);
