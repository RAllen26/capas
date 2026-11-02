// Theme bridge: lets canvas code (art, AR, radar) read css/theme.css tokens,
// picks the active theme from ?theme=, and fills in the brand name.
// Load in <head> so the theme is set before first paint.

const BRAND = {
  name: 'CAPAS',
  tagline: 'open street gallery',
};

const Theme = (() => {
  const root = document.documentElement;
  const KEY = 'capas.theme';

  // ?theme=neutral switches (and remembers); ?theme=default resets.
  let name = new URLSearchParams(location.search).get('theme');
  try {
    if (name === 'default') localStorage.removeItem(KEY);
    else if (name) localStorage.setItem(KEY, name);
    else name = localStorage.getItem(KEY);
  } catch { /* storage blocked: theme only lasts for this URL */ }
  if (name && name !== 'default') root.dataset.theme = name;

  const style = getComputedStyle(root); // live: always reflects the current theme
  function css(token) { return style.getPropertyValue(token).trim(); }

  // Canvas can't read var() or color-mix(), so resolve hex + alpha by hand.
  function alpha(token, a) {
    const c = css(token);
    const m = c.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (!m) return c;
    const h = m[1].length === 3 ? [...m[1]].map(x => x + x).join('') : m[1];
    const [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
    return `rgba(${r},${g},${b},${a})`;
  }

  return {
    name: name || 'default',
    css,
    num: token => parseFloat(css(token)) || 0,
    alpha,
  };
})();

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-brand]').forEach(el => { el.textContent = BRAND.name; });
  document.title = document.title.replace('CAPAS', BRAND.name);
});
