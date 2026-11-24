// Bridge from the plain scripts to the 3D stage (an ES module, loaded on first use).
// <img data-obj="ID" data-size="240"> gets a snapshot of that piece's object; live() runs a turntable.

const Thumbs = (() => {
  let mod = null;
  const stage = () => (mod ||= import('./stage.js?v=202611241357'));
  const BLANK = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';

  function fill(root) {
    root.querySelectorAll('img[data-obj]').forEach(img => {
      const p = App.piece(img.dataset.obj);
      if (!p || img.dataset.done) return;
      img.dataset.done = '1';
      stage().then(s => s.snapshot(p, +img.dataset.size || 240)).then(u => { if (u) img.src = u; }).catch(() => {});
    });
  }
  const img = (p, size, attrs = '') => `<img alt="${esc(p.title)}" src="${BLANK}" data-obj="${p.id}" data-size="${size}" ${attrs}>`;

  // Turntable into a canvas you own. Returns a handle with stop().
  function live(canvas, p) {
    const h = { stop() { h.stopped = true; h.inner?.stop(); } };
    stage().then(s => { if (!h.stopped) h.inner = s.live(canvas, p); }).catch(() => {});
    return h;
  }
  const forget = id => stage().then(s => s.forget(id));

  return { fill, img, live, forget, BLANK };
})();
