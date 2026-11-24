// Avatars: a generated face for every handle, no uploads needed. Same handle → same face, everywhere.
// A mirrored 5×5 tag on a layer color, with one spray dot that breaks the grid. Yours can be rerolled.

const Avatar = (() => {
  const KEY = 'capas.me.v0';
  const cache = new Map();

  function hash(str) {
    let h = 2166136261;
    for (const c of String(str)) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function rng(seed) {
    let a = seed || 1;
    return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  // key: a handle, or a handle plus your reroll number.
  function url(key) {
    if (cache.has(key)) return cache.get(key);
    const r = rng(hash(key));
    const colors = Object.values(LAYERS).map(l => l.color);
    const bg = colors[Math.floor(r() * colors.length)];
    const ink = '#111';
    let cells = '';
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 3; x++) {
        if (r() < 0.5) continue;
        for (const xx of new Set([x, 4 - x])) cells += `<rect x="${10 + xx * 16}" y="${10 + y * 16}" width="16" height="16"/>`;
      }
    }
    const dx = 20 + r() * 60, dy = 20 + r() * 60, dr = 7 + r() * 8;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <rect width="100" height="100" fill="${bg}"/>
      <g fill="${ink}">${cells}</g>
      <circle cx="${dx.toFixed(1)}" cy="${dy.toFixed(1)}" r="${dr.toFixed(1)}" fill="#4a3aff" opacity=".9"/>
    </svg>`;
    const u = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    cache.set(key, u);
    return u;
  }

  function me() {
    try { return { handle: '@you', roll: 0, ...JSON.parse(localStorage.getItem(KEY)) }; } catch { return { handle: '@you', roll: 0 }; }
  }
  function setMe(patch) {
    const next = { ...me(), ...patch };
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* storage blocked: lasts this visit */ }
    App.emit('me-profile');
    return next;
  }
  const keyOf = handle => {
    const m = me();
    return handle === m.handle ? `${handle}#${m.roll}` : handle;
  };

  // <img> for a handle; yours wears your reroll.
  const img = (handle, cls = 'avatar') => `<img class="${cls}" alt="" src="${url(keyOf(handle || '?'))}">`;

  return { url, img, me, setMe };
})();
