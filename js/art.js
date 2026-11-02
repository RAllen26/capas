// Procedural artworks: every seed piece renders from its JSON, so the
// gallery works with zero uploaded assets. Real media plugs in later.

const Art = (() => {
  // The art font is part of the artworks, not the brand theme, so it stays fixed.
  const FONT = '"Rubik Mono One", "Arial Black", sans-serif';
  const ready = document.fonts ? document.fonts.load('40px "Rubik Mono One"').catch(() => {}) : Promise.resolve();

  function hash(str) {
    let h = 2166136261;
    for (const c of String(str)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  function rng(seed) {
    let a = typeof seed === 'number' ? seed : hash(seed);
    return () => {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function speckle(ctx, w, h, r, color, n) {
    ctx.fillStyle = color;
    for (let i = 0; i < n; i++) ctx.fillRect(r() * w, r() * h, r() * 2 + 0.5, r() * 2 + 0.5);
  }

  function glyphText(ctx, text, w, h, color, maxSize) {
    const lines = String(text || '').toUpperCase().split(' ').filter(Boolean);
    if (!lines.length) return;
    const longest = Math.max(...lines.map(l => l.length));
    const size = Math.min(maxSize, (w * 0.86) / (longest * 0.82), (h * 0.8) / (lines.length * 1.05));
    ctx.font = `${size}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    const top = h / 2 - ((lines.length - 1) * size * 1.05) / 2;
    lines.forEach((l, i) => ctx.fillText(l, w / 2, top + i * size * 1.05));
    return { size, bottom: top + (lines.length - 1) * size * 1.05 + size / 2 };
  }

  const styles = {
    stencil(ctx, w, h, r, [bg, fg, ac], glyph) {
      ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
      speckle(ctx, w, h, r, ac, 260);
      const m = glyphText(ctx, glyph, w, h, fg, w * 0.34);
      if (!m) return;
      // drips
      ctx.fillStyle = fg;
      for (let i = 0; i < 9; i++) {
        const x = w * 0.12 + r() * w * 0.76, len = r() * h * 0.28;
        const dw = 1.5 + r() * w * 0.012;
        ctx.fillRect(x, m.bottom - m.size * 0.2, dw, len);
        ctx.beginPath(); ctx.arc(x + dw / 2, m.bottom - m.size * 0.2 + len, dw * 0.9, 0, Math.PI * 2); ctx.fill();
      }
    },
    rings(ctx, w, h, r, [bg, fg, ac], glyph) {
      ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
      const cx = w * (0.35 + r() * 0.3), cy = h * (0.35 + r() * 0.3);
      const n = 6 + Math.floor(r() * 6);
      for (let i = n; i > 0; i--) {
        ctx.beginPath();
        ctx.arc(cx, cy, (i / n) * w * 0.7, 0, Math.PI * 2);
        ctx.fillStyle = i % 2 ? fg : (i % 3 ? bg : ac);
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'difference';
      glyphText(ctx, glyph, w, h, '#ffffff', w * 0.3);
      ctx.globalCompositeOperation = 'source-over';
    },
    glitch(ctx, w, h, r, [bg, fg, ac], glyph) {
      ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
      glyphText(ctx, glyph, w, h, fg, w * 0.42);
      for (let i = 0; i < 22; i++) {
        const y = r() * h, bh = 2 + r() * h * 0.06, shift = (r() - 0.5) * w * 0.25;
        const slice = ctx.getImageData(0, y, w, bh);
        ctx.putImageData(slice, shift, y);
        if (r() > 0.7) { ctx.fillStyle = r() > 0.5 ? ac : fg; ctx.fillRect(r() * w, y, r() * w * 0.4, bh * 0.5); }
      }
      speckle(ctx, w, h, r, fg, 120);
    },
    signal(ctx, w, h, r, [bg, fg, ac], glyph) {
      ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
      const lines = 18 + Math.floor(r() * 10);
      ctx.lineWidth = Math.max(1, w / 200);
      for (let i = 0; i < lines; i++) {
        const y0 = (i + 1) * (h / (lines + 1));
        const f = 0.01 + r() * 0.05, amp = r() * h * 0.05 * (1 - Math.abs(i / lines - 0.5) * 1.6);
        ctx.strokeStyle = i % 5 === 0 ? ac : fg;
        ctx.beginPath();
        for (let x = 0; x <= w; x += 2) {
          const spike = Math.abs(x - w / 2) < w * 0.15 ? Math.sin(x * 0.3 + i) * amp * 2 : 0;
          ctx.lineTo(x, y0 + Math.sin(x * f + i) * amp + spike);
        }
        ctx.stroke();
      }
      ctx.fillStyle = bg; ctx.fillRect(w * 0.1, h * 0.78, w * 0.8, h * 0.14);
      ctx.save(); ctx.translate(0, h * 0.35); glyphText(ctx, glyph, w, h * 0.3, ac, w * 0.14); ctx.restore();
    },
  };

  function draw(ctx, piece, w, h) {
    const a = piece.art || {};
    const r = rng(a.seed ?? piece.id);
    const fn = styles[a.style] || styles.stencil;
    ctx.save();
    fn(ctx, w, h, r, a.palette || PALETTES[0], a.glyph || piece.title);
    ctx.restore();
  }

  const cache = new Map();
  function toCanvas(piece, size = 256) {
    const key = piece.id + ':' + size + ':' + JSON.stringify(piece.art);
    if (cache.has(key)) return cache.get(key);
    const c = document.createElement('canvas');
    c.width = c.height = size;
    draw(c.getContext('2d', { willReadFrequently: true }), piece, size, size);
    cache.set(key, c);
    return c;
  }

  const toDataURL = (piece, size) => toCanvas(piece, size).toDataURL();

  // `ready` resolves once the art font is in; clear the cache then so pieces redraw with it.
  return { draw, toCanvas, toDataURL, rng, hash, ready, clear: () => cache.clear() };
})();
