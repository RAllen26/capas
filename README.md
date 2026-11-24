# CAPAS / open street gallery

A geospatial street-art gallery that lives in layers above the city.
Pieces are pinned to real coordinates, woken up by real-world anchors, and seen
through your phone camera. Open source, local-first, punk.

## What's here

One installable web app. Browse and social: **Map**, **Wall** (the feed), **AR**, **Collection** (your profile). Making: **+ Create**.

| File | What it does |
|---|---|
| `index.html` | The app shell: top bar, the three views, tab bar, piece card, dialogs |
| `js/core.js` | Shared state (pieces, filters, your location), events, catching, and the router (`#map`, `#ar/ID`, `#collection`, `#piece/ID`) |
| `js/card.js` | The piece card, shared by every view, and the printable QR anchor |
| `js/map.js` | Map view: pins, list, find me, picking a spot for a new piece |
| `js/ar.js` + `js/three-layer.js` | AR view: camera + GPS + compass, radar, live/ghost modes, GLB models at their real bearing and distance |
| `js/wall.js` | Wall view: the feed. Story circles per capa, the HERO show, one post per piece; double-tap to like |
| `js/avatar.js` | Generated avatars for every handle; yours is editable on your profile |
| `js/collection.js` | Collection view: pieces you caught, pieces still out there, pieces you made, export |
| `js/create.js` | The create flow, from the map (tap a spot) or from AR (8 m ahead of you), with supports and 3D upload |
| `js/main.js` | Boot: filters, tabs, install, first route, scanned anchors (`?scan=ID`) |
| `js/data.js` | Data model (layers, capas, anchors, supports, schema) + seed pieces |
| `js/store.js` | Local-first storage (pieces, catches) + geo math. Swap this for a backend later |
| `js/media.js` + `assets/` | Supports: renders each piece's media and keeps uploads on the device |
| `js/objects.js` | **3D graffiti**: any piece without its own model becomes a voxel tag of its glyph (block shadow, drips, spray), in four styles |
| `js/stage.js` + `js/thumbs.js` | One shared 3D renderer for object stills (feed, collection, map) and the live turntable (feed, card, create preview) |
| `js/art.js` | The old flat artworks, kept only as a fallback when a phone has no WebGL |
| `css/theme.css` + `js/theme.js` | **The whole visual identity**: palette, roles, fonts, borders, corners, shadows, map mood, brand name |
| `manifest.webmanifest` + `sw.js` | Installable app (PWA): home-screen icon, full-screen, opens on a weak signal |
| `ar.html` | Forwards old links and printed stickers (`ar.html?piece=ID`) into the app |
| `theme.html` | Live style guide of every token; add `?theme=neutral` to any page to try the alternative theme |
| `tools/` | `bump_version.py` (run before each release), 3D generators (`make_totem.py`, `make_ring.py OUT.glb "TEXT"`), icon generator |
| `IDEAS.md` | Parking lot for ideas not yet on the roadmap |

No build step, no framework, no accounts. Static files.

## Run it

```bash
python3 -m http.server 8080
```

Open http://localhost:8080. Camera, GPS and compass need **HTTPS on a phone**, so to test AR on your phone either
deploy (GitHub Pages / Netlify / Cloudflare Pages, all free) or tunnel your local server (`cloudflared tunnel --url http://localhost:8080`).

## Rebranding

Everything visual lives in `css/theme.css`, in three tiers: brand palette → roles (what each color is for) → shape & motion.
Components only read roles, so a new identity is mostly new values in Tier 1. The brand name is `BRAND` in `js/theme.js`.
Artworks keep their own palettes and font on purpose: a rebrand never repaints artists' work.
To compare looks, add a `[data-theme="name"]` block and open any page with `?theme=name`.

Themes so far: **grid** (default: hairlines, a visible grid, glass panels, and hand-made marks in one spray color),
**punk** (the first prototype look, `?theme=punk`) and **neutral** (`?theme=neutral`). `?theme=default` goes back to grid.
A theme's own shapes (grid's scribble, blob and marker stroke) live in "Tier 4" at the bottom of `css/theme.css`.

## Concepts

**Layers (dimensions).** The same corner exists in several realities at once:
- `STREET`: bound to a physical wall. You have to be there.
- `DREAM`: speculative futures over the real city.
- `MEMORY`: histories and erased stories of the place.
- `SIGNAL`: sound, data, live feeds.

**Anchors (how a piece wakes up).**
- `gps`: unlocks inside its radius. Works today.
- `qr`: a printed sticker on the wall points to `?scan=ID`. Works today (button *QR ANCHOR*).
- `nfc`: same URL written to an NFC sticker; tapping the phone opens it. Works today with any NFC writer app.
- `image`: the mural itself triggers the piece via image tracking. Roadmap (MindAR.js).

**Capas (whose it is).** `HERO` (the show on now: an exhibition, festival or brand activation), `STREET` (public),
`CREW` (your people), `ME` (private, only on this device). They're the story circles at the top of the Wall.
Today a label and a filter; with a backend they become who can see and post.

**Catching (your collection).** Walk inside a piece's radius with the app open, or scan its sticker, and you catch it.
Caught pieces stay in your collection, and their on-site-only supports stay open for you. Kept on the device for now.

**Supports (one piece, many media).** A piece lists the media it lives in: its physical trace on the street,
text, image, video, sound and 3D (GLB). Each medium shows what it can, and a support marked `onlyThere`
opens only on site (inside the radius, or by scanning the anchor).

**Ghost mode.** If you're far from every piece, AR projects the gallery around you so it's explorable from anywhere.
Physically present = real placement + unlocking.
**Steady view.** The gyroscope turns the view (smooth), the compass only corrects north slowly in the background,
and small GPS wobbles are ignored, so pieces stay put like sculptures. If a piece sits beside its building, drag sideways to align the layer.
**Walls.** Buildings from OpenStreetMap (footprint + height or floors) hide pieces behind them, invisibly; X-ray mode
leaves a faint outline of what's hidden. HUD: `WALLS` cycles X-RAY / HIDE / OFF, `EYE` sets your floor so a view from a window clears the roofs.
Only a rough ~200 m area is sent to the map server. Without a camera the same buildings show as a grey massing model.
A landmark piece (`seenFrom`, in meters) shows at its real place from farther away, like a giant ring over a building you can see from your window.

## Roadmap

1. **Real media**: images, video, audio, and 3D (`.glb` via `<model-viewer>` / three.js) alongside procedural pieces.
2. **Image anchors**: MindAR.js image targets so pointing at the actual mural triggers the overlay, pinned to the wall.
3. **Backend**: Supabase/Postgres + PostGIS for "pieces near me", uploads, moderation queue. Keep the JSON schema as the contract.
4. **Identity + social**: handles, follows, replies-as-pieces (answer a wall with another wall), routes / walks.
5. **Open network**: publish pieces as ActivityPub objects so any instance can host a city; the repo stays the source of truth.
6. **WebXR**: proper world tracking on supported devices (ARCore Chrome), falling back to the compass AR here.

## Brands & institutions (without selling out the protocol)

- **Sponsored layers**: a museum curates a `MEMORY` layer for a neighborhood; a festival runs a temporary layer for a weekend.
- **Commissioned walls**: brands pay artists for pieces on licensed walls, clearly marked as sponsored.
- **Routes & activations**: tours, scavenger walks, QR/NFC drops at venues.
- **Hosted instances**: white-label deployments for cities/universities, running the same open code.

Rule: money buys visibility on a layer, never control of the network or deletion of other people's work.

## License

Code: MIT (see `LICENSE`). Pieces: each declares its own license (CC-BY-SA-4.0 default).
