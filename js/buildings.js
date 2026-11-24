// Buildings from OpenStreetMap (footprints + heights) around a point, for AR walls and the studio's massing model.
// Only the point you pass leaves the phone; callers round it to a ~200 m grid first. Results are cached per point.

const Buildings = (() => {
  const rad = d => (d * Math.PI) / 180;
  const local = (c, p) => [(p.lng - c.lng) * Math.cos(rad(c.lat)) * 111320, (p.lat - c.lat) * 110540];
  function heightOf(t) {
    const h = parseFloat(t.height);
    if (h > 0) return h;
    const lv = parseFloat(t['building:levels']);
    if (lv > 0) return lv * 3.2 + (parseFloat(t['roof:levels']) || 0) * 2;
    return t.building === 'house' || t.building === 'garage' || t.building === 'shed' ? 6 : 9;
  }

  async function fetch_(center, R) {
    const q = `[out:json][timeout:20];way["building"](around:${R},${center.lat},${center.lng});out tags geom qt;`;
    const hosts = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];
    for (const host of [...hosts, hosts[0]]) {   // the main server often says "busy": try it again at the end
      try {
        const r = await fetch(host, { method: 'POST', body: new URLSearchParams({ data: q }), signal: AbortSignal.timeout(20000) });
        if (!r.ok) continue;
        const els = (await r.json()).elements || [];
        return els.filter(e => e.geometry?.length > 3).map(e => ({
          pts: e.geometry.slice(0, -1).map(g => local(center, { lat: g.lat, lng: g.lon })),
          h: heightOf(e.tags || {}),
        }));
      } catch { /* try the next server */ }
    }
    throw new Error('no map server');
  }

  const cache = new Map();
  function around(center, R = 500) {
    const k = `${center.lat.toFixed(4)},${center.lng.toFixed(4)},${R}`;
    if (!cache.has(k)) cache.set(k, fetch_(center, R).catch(e => { cache.delete(k); throw e; }));
    return cache.get(k);
  }
  // A point rounded to the ~200 m grid.
  const cell = (p, CELL = 0.002) => ({ lat: Math.round(p.lat / CELL) * CELL, lng: Math.round(p.lng / CELL) * CELL });

  return { around, local, cell };
})();
