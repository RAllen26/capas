// Local-first storage. Seed pieces + whatever you drop on this device.
// Swap this module for a real backend (Supabase/PostGIS, ActivityPub) later.

const Store = (() => {
  const KEY = 'capas.pieces.v0';

  function readLocal() {
    try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
  }

  function writeLocal(list) {
    try { localStorage.setItem(KEY, JSON.stringify(list)); return true; } catch { return false; }
  }

  return {
    all: () => [...SEED_PIECES, ...readLocal().map(p => ({ ...p, local: true }))],
    get: id => [...SEED_PIECES, ...readLocal()].find(p => p.id === id),
    add(piece) { const list = readLocal(); list.push(piece); return writeLocal(list); },
    remove(id) { return writeLocal(readLocal().filter(p => p.id !== id)); },
    exportLocal: () => JSON.stringify(readLocal(), null, 2),
  };
})();

const Geo = {
  distance(a, b) {
    const R = 6371000, toR = Math.PI / 180;
    const dLat = (b.lat - a.lat) * toR, dLng = (b.lng - a.lng) * toR;
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toR) * Math.cos(b.lat * toR) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(s));
  },
  bearing(a, b) {
    const toR = Math.PI / 180;
    const y = Math.sin((b.lng - a.lng) * toR) * Math.cos(b.lat * toR);
    const x = Math.cos(a.lat * toR) * Math.sin(b.lat * toR) -
              Math.sin(a.lat * toR) * Math.cos(b.lat * toR) * Math.cos((b.lng - a.lng) * toR);
    return (Math.atan2(y, x) / toR + 360) % 360;
  },
  // The point `meters` away from `from` in direction `bearing` (degrees from north).
  offset(from, bearing, meters) {
    const toR = Math.PI / 180, d = meters / 6371000, b = bearing * toR;
    const la = from.lat * toR, lo = from.lng * toR;
    const la2 = Math.asin(Math.sin(la) * Math.cos(d) + Math.cos(la) * Math.sin(d) * Math.cos(b));
    const lo2 = lo + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(la), Math.cos(d) - Math.sin(la) * Math.sin(la2));
    return { lat: +(la2 / toR).toFixed(7), lng: +(lo2 / toR).toFixed(7) };
  },
  fmt(m) { return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`; },
};
