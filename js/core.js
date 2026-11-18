// Core: the state every view shares (pieces, filters, your location, catches),
// a tiny event bus, and the router that switches between Map, AR and Collection.

const $ = sel => document.querySelector(sel);
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function slug(s) { return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32) || 'piece'; }

const App = (() => {
  const MAX_CATCH_ACCURACY = 75; // meters: a vaguer GPS fix than this doesn't count as being there

  const state = {
    pieces: Store.all(),
    layersOn: new Set(Object.keys(LAYERS)),
    capa: 'all',
    me: null, accuracy: null,
    view: null,
  };

  // ---------- events: 'pieces' 'filter' 'me' 'catch' 'card' 'view' ----------
  const listeners = {};
  const on = (evt, fn) => { (listeners[evt] ||= []).push(fn); };
  const emit = (evt, data) => (listeners[evt] || []).forEach(fn => fn(data));

  // ---------- pieces & filters ----------
  const capaOf = p => p.capa || 'public';
  const piece = id => state.pieces.find(p => p.id === id);
  const visible = () => state.pieces.filter(p => state.layersOn.has(p.layer) && (state.capa === 'all' || capaOf(p) === state.capa));
  function reload() { state.pieces = Store.all(); emit('pieces'); checkCatches(); }

  // ---------- where you are ----------
  const distanceTo = p => state.me ? Geo.distance(state.me, p.location) : null;
  const inside = p => { const d = distanceTo(p); return d != null && d <= p.location.radius; };
  // Open = you are there now, or you caught it before. Decides on-site-only supports and solid vs ghost.
  const isOpen = p => inside(p) || !!Store.caught(p.id);

  function setLocation(me, accuracy) {
    state.me = me; state.accuracy = accuracy;
    checkCatches();
    emit('me');
  }

  let firstFix = null;
  function locate() {
    if (firstFix) return firstFix;
    firstFix = new Promise((res, rej) => {
      if (!navigator.geolocation) { firstFix = null; return rej(new Error('No location on this device.')); }
      const id = navigator.geolocation.watchPosition(pos => {
        setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }, pos.coords.accuracy);
        res(state.me);
      }, err => {
        if (state.me) return; // a later hiccup: keep the last fix and keep watching
        navigator.geolocation.clearWatch(id);
        firstFix = null;
        rej(err);
      }, { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 });
    });
    return firstFix;
  }

  // ---------- catching ----------
  function catchPiece(p, how) {
    if (!Store.catch(p.id, how)) return false;
    toast(`● CAUGHT · ${p.title}`);
    emit('catch', p);
    return true;
  }
  function checkCatches() {
    if (!state.me || state.accuracy > MAX_CATCH_ACCURACY) return;
    for (const p of state.pieces) if (!Store.caught(p.id) && inside(p)) catchPiece(p, 'gps');
  }

  let toastTimer = 0;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 3500);
  }

  // ---------- views ----------
  const views = {};
  const register = (name, view) => { views[name] = view; };

  function go(name, arg) {
    if (!views[name]) name = 'map';
    Card.close();
    if (state.view !== name) {
      views[state.view]?.leave?.();
      document.querySelectorAll('.view').forEach(v => { v.hidden = v.id !== 'view-' + name; });
      document.querySelectorAll('.tab[data-view]').forEach(t => t.classList.toggle('on', t.dataset.view === name));
      document.body.dataset.view = name;
      state.view = name;
    }
    views[name].enter?.(arg);
    setHash(name + (arg ? '/' + arg : ''));
    emit('view', name);
  }

  function setHash(h) { if (location.hash !== '#' + h) history.replaceState(null, '', '#' + h); }

  // #map  #ar  #ar/<piece>  #collection  #piece/<piece> (map with that piece's card open)
  function route(hash) {
    const [name, arg] = String(hash || '').replace(/^#/, '').split('/');
    if (name === 'piece' && piece(arg)) {
      go('map');
      views.map.focus(arg);
      Card.open(arg);
      setHash('piece/' + arg);
    } else go(name || 'map', arg && piece(arg) ? arg : undefined);
  }

  return { state, on, emit, capaOf, piece, visible, reload, distanceTo, inside, isOpen,
    locate, setLocation, catchPiece, checkCatches, toast, register, go, route };
})();
