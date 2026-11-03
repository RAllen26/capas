// Supports: render a piece's media (text, image, video, sound, physical trace)
// and keep uploaded files on this device (IndexedDB) until there's a backend.

const Media = (() => {
  // ---------- local file store ----------
  const DB_NAME = 'capas-media', STORE = 'blobs';
  let dbp = null;
  function open() {
    if (!dbp) dbp = new Promise((res, rej) => {
      const r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return dbp;
  }
  async function tx(mode, fn) {
    const db = await open();
    return new Promise((res, rej) => {
      const t = db.transaction(STORE, mode);
      const req = fn(t.objectStore(STORE));
      t.oncomplete = () => res(req?.result);
      t.onerror = () => rej(t.error);
    });
  }

  async function save(blob) {
    const key = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    await tx('readwrite', s => s.put(blob, key));
    return 'idb:' + key;
  }

  const urls = new Map();
  async function url(src) {
    if (!src || !src.startsWith('idb:')) return src;
    if (urls.has(src)) return urls.get(src);
    try {
      const blob = await tx('readonly', s => s.get(src.slice(4)));
      const u = blob ? URL.createObjectURL(blob) : null;
      urls.set(src, u);
      return u;
    } catch { return null; }
  }

  const remove = src => src?.startsWith('idb:') ? tx('readwrite', s => s.delete(src.slice(4))).catch(() => {}) : Promise.resolve();

  // ---------- helpers ----------
  const list = p => Array.isArray(p.supports) ? p.supports.filter(s => SUPPORTS[s.type]) : [];
  const types = p => [...new Set(list(p).map(s => s.type))];

  function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  // Small chips showing which media a piece lives in.
  function chips(p) {
    return types(p).map(t => `<span class="support-chip" title="${SUPPORTS[t].desc}">${SUPPORTS[t].icon} ${SUPPORTS[t].label}</span>`).join('');
  }
  const icons = p => types(p).map(t => SUPPORTS[t].icon).join(' ');

  // First image support becomes the piece's cover (map pin, AR); else generated art.
  const covers = new Map();
  function cover(p) {
    if (covers.has(p.id)) return covers.get(p.id);
    const img = list(p).find(s => s.type === 'image');
    const pr = !img ? Promise.resolve(null) : url(img.src).then(u => new Promise(res => {
      if (!u) return res(null);
      const el = new Image();
      el.onload = () => res(el);
      el.onerror = () => res(null);
      el.src = u;
    }));
    covers.set(p.id, pr);
    return pr;
  }

  // Render every support into `el`. `unlocked` = viewer is on site (or scanned the anchor).
  async function render(el, p, { unlocked = false } = {}) {
    const items = list(p);
    if (!items.length) { el.innerHTML = ''; return; }
    el.innerHTML = items.map((s, i) => {
      const meta = SUPPORTS[s.type];
      const locked = s.onlyThere && !unlocked;
      const head = `<div class="support-head"><span>${meta.icon} ${meta.label}</span>${s.onlyThere ? `<span>${locked ? '◌ OPENS ON SITE' : '● ON SITE'}</span>` : ''}</div>`;
      let body = '';
      if (locked) body = `<p class="support-locked">${meta.label.toLowerCase()} — walk inside the ${p.location.radius} m radius or scan the anchor to open it.</p>`;
      else if (s.type === 'text' || s.type === 'physical') body = `<p class="support-text">${esc(s.body)}</p>`;
      else if (s.type === 'image') body = `<img data-i="${i}" alt="${esc(s.caption || p.title)}" loading="lazy">`;
      else if (s.type === 'video') body = `<video data-i="${i}" controls playsinline ${s.loop ? 'loop' : ''} preload="metadata"></video>`;
      else if (s.type === 'audio') body = `<audio data-i="${i}" controls ${s.loop ? 'loop' : ''} preload="none"></audio>`;
      else if (s.type === 'model') body = `<p class="support-text">3D object: ${esc(s.src?.split('/').pop() || 'model')}. The 3D viewer arrives in the next step.</p>`;
      const cap = !locked && s.caption ? `<p class="support-cap">${esc(s.caption)}</p>` : '';
      return `<figure class="support ${locked ? 'is-locked' : ''}" data-type="${s.type}">${head}${body}${cap}</figure>`;
    }).join('');
    for (const m of el.querySelectorAll('[data-i]')) {
      const u = await url(items[m.dataset.i].src);
      if (u) m.src = u;
      else m.replaceWith(Object.assign(document.createElement('p'), { className: 'support-locked', textContent: 'This file is stored on another device.' }));
    }
  }

  return { save, url, remove, list, types, chips, icons, cover, render };
})();
