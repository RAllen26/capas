// Wall view: the feed. Story circles for each capa (HERO, STREET, CREW, ME) on top, then one post per piece,
// nearest first when we know where you are. Likes stay on this device until there's a backend.

const WallView = (() => {
  const el = $('#wall');
  const LIKES = 'capas.likes.v0';
  let active = false;

  const likes = () => { try { return JSON.parse(localStorage.getItem(LIKES)) || {}; } catch { return {}; } };
  function toggleLike(id, force) {
    const l = likes();
    const on = force ?? !l[id];
    if (on) l[id] = new Date().toISOString(); else delete l[id];
    try { localStorage.setItem(LIKES, JSON.stringify(l)); } catch { /* storage blocked */ }
    return on;
  }

  // Pieces in the layers you have on, whatever capa: the stories pick the capa.
  const inLayers = () => App.state.pieces.filter(p => App.state.layersOn.has(p.layer));
  const ago = d => {
    const days = Math.round((Date.now() - new Date(d)) / 864e5);
    return days < 1 ? 'TODAY' : days < 7 ? `${days}D` : days < 60 ? `${Math.round(days / 7)}W` : d;
  };

  function stories(all) {
    const cur = App.state.capa;
    return `<nav class="stories" aria-label="Capas">
      ${Object.entries(CAPAS).map(([k, c]) => {
        const ps = all.filter(p => App.capaOf(p) === k).sort((a, b) => String(b.created).localeCompare(String(a.created)));
        const face = ps[0];
        return `<button class="story ${cur === k ? 'on' : ''} ${ps.length ? '' : 'none'}" data-capa="${k}" title="${esc(c.desc)}">
          <span class="story-ring">${face ? Thumbs.img(face, 140) : '<i>+</i>'}</span>
          <b>${c.label}</b><small>${ps.length}</small>
        </button>`;
      }).join('')}
    </nav>`;
  }

  function hero(all) {
    const ps = all.filter(p => App.capaOf(p) === 'hero');
    if (!ps.length || (App.state.capa !== 'all' && App.state.capa !== 'hero')) return '';
    const near = App.state.me ? Math.min(...ps.map(p => App.distanceTo(p))) : null;
    const caught = ps.filter(p => Store.caught(p.id)).length;
    return `<section class="hero-card">
      <p class="tag">HERO · NOW SHOWING</p>
      <h2>CAPAS FIELD TEST</h2>
      <p>${ps.length} pieces across the city${near != null ? ` · nearest ${Geo.fmt(near)}` : ''} · ${caught} caught</p>
      <div class="hero-strip">${ps.slice(0, 8).map(p => Thumbs.img(p, 160, `data-open="${p.id}"`)).join('')}</div>
    </section>`;
  }

  function post(p, liked) {
    const l = LAYERS[p.layer], capa = CAPAS[App.capaOf(p)];
    const d = App.distanceTo(p), caught = Store.caught(p.id);
    const where = d != null ? (App.inside(p) ? ' · YOU ARE HERE' : ` · ${Geo.fmt(d)} AWAY`) : '';
    const sup = Media.list(p).map(x => SUPPORTS[x.type]?.icon).filter(Boolean).join(' ');
    return `<article class="post" data-id="${p.id}" style="--c:${l.color}">
      <header>
        ${Avatar.img(p.artist)}
        <div><b>${esc(p.artist)}</b><small>${l.label}${where}</small></div>
        <span class="tag">${capa.label}</span>
      </header>
      <div class="post-art" data-act="art">
        ${Thumbs.img(p, 560)}
        <canvas class="live" width="560" height="560" hidden></canvas>
        ${sup ? `<span class="post-sup">${sup}</span>` : ''}
        <span class="burst" aria-hidden="true">♥</span>
      </div>
      <div class="post-actions">
        <button data-act="like" class="${liked ? 'on' : ''}" aria-label="Like">${liked ? '♥' : '♡'}</button>
        <button data-act="ar" aria-label="See in AR">▲</button>
        <button data-act="map" aria-label="Show on map">▦</button>
        <button data-act="share" aria-label="Share">↗</button>
        <span class="post-status ${caught ? 'caught' : ''}">${caught ? '● CAUGHT' : '○ NOT YET'}</span>
      </div>
      <p class="post-caption"><b>${esc(p.title)}</b> ${esc(p.note || '')}</p>
      <p class="post-date">${ago(p.created)} · ${esc(p.license || '')}</p>
    </article>`;
  }

  function render() {
    if (!active) return;
    const all = inLayers();
    let feed = App.visible();
    if (App.state.me) feed.sort((a, b) => App.distanceTo(a) - App.distanceTo(b));
    else feed.sort((a, b) => String(b.created).localeCompare(String(a.created)));
    const l = likes();
    el.innerHTML = stories(all) + hero(all) + (feed.length
      ? feed.map(p => post(p, !!l[p.id])).join('')
      : `<p class="empty">Nothing on the wall here. ${App.state.capa === 'me' ? 'Tap + CREATE to paste your first piece.' : 'Turn a layer back on or pick another capa.'}</p>`);
    Thumbs.fill(el);
    el.querySelectorAll('.post-art').forEach(a => seen.observe(a));
  }

  // The post most in view turns slowly; the rest are stills.
  let spinning = null;
  const ratios = new Map();
  const seen = new IntersectionObserver(entries => {
    entries.forEach(e => ratios.set(e.target, e.intersectionRatio));
    let best = null, top = 0.55;
    ratios.forEach((r, a) => { if (r > top && a.isConnected) { best = a; top = r; } });
    if (best === spinning?.art) return;
    stopSpin();
    if (!best || !active) return;
    const c = best.querySelector('canvas.live');
    c.hidden = false;
    spinning = { art: best, h: Thumbs.live(c, App.piece(best.closest('.post').dataset.id)) };
  }, { threshold: [0, 0.3, 0.55, 0.75, 1] });
  function stopSpin() {
    if (!spinning) return;
    spinning.h.stop();
    const c = spinning.art.querySelector('canvas.live');
    if (c) c.hidden = true;
    spinning = null;
  }

  function setLike(art, on) {
    const btn = art.querySelector('[data-act="like"]');
    btn.classList.toggle('on', on);
    btn.textContent = on ? '♥' : '♡';
  }

  let lastTap = { id: null, t: 0 };
  el.addEventListener('click', async e => {
    const story = e.target.closest('.story');
    if (story) {
      const k = story.dataset.capa;
      App.state.capa = App.state.capa === k ? 'all' : k;
      $('#capa-filter').value = App.state.capa;
      App.emit('filter');
      return;
    }
    const open = e.target.closest('[data-open]');
    if (open) return Card.open(open.dataset.open);
    const art = e.target.closest('.post');
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!art || !act) return;
    const id = art.dataset.id;
    if (act === 'art') {
      // Double tap = like, like you'd expect. Single tap opens the piece.
      const now = Date.now();
      if (lastTap.id === id && now - lastTap.t < 350) {
        clearTimeout(lastTap.timer);
        setLike(art, toggleLike(id, true));
        art.classList.remove('pop'); void art.offsetWidth; art.classList.add('pop');
        lastTap = { id: null, t: 0 };
      } else {
        lastTap = { id, t: now, timer: setTimeout(() => Card.open(id), 360) };
      }
    }
    if (act === 'like') setLike(art, toggleLike(id));
    if (act === 'ar') App.go('ar', id);
    if (act === 'map') App.route('#piece/' + id);
    if (act === 'share') {
      const url = new URL('./#piece/' + id, location.href).href, p = App.piece(id);
      try {
        if (navigator.share) await navigator.share({ title: p.title, text: `${p.title} by ${p.artist} on CAPAS`, url });
        else { await navigator.clipboard.writeText(url); App.toast('Link copied'); }
      } catch { /* share cancelled */ }
    }
  });

  for (const evt of ['pieces', 'filter', 'catch', 'me-profile']) App.on(evt, render);
  App.on('me', () => { if (active) render(); });

  return {
    enter() { active = true; render(); $('#view-wall').scrollTop = 0; },
    leave() { active = false; stopSpin(); },
  };
})();

App.register('wall', WallView);
