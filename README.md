# CAPAS / open street gallery

A geospatial street-art gallery that lives in layers above the city.
Pieces are pinned to real coordinates, woken up by real-world anchors, and seen
through your phone camera. Open source, local-first, punk.

## What's here (v0 base)

| File | What it does |
|---|---|
| `index.html` + `js/app.js` | Map explorer: pieces on a dark map, layer toggles, piece sheets, **drop a piece**, QR anchor printing, export to JSON, manifesto |
| `ar.html` + `js/ar.js` | Location-based AR in the browser: camera + GPS + compass, radar, locked/unlocked pieces, ghost mode, drag-to-look on desktop |
| `js/data.js` | Data model (layers, anchors, schema) + seed pieces in CDMX |
| `js/art.js` | Procedural artworks, so the gallery runs with zero uploaded media |
| `js/store.js` | Local-first storage + geo math. Swap this for a backend later |

No build step, no framework, no accounts. Static files.

## Run it

```bash
python3 -m http.server 8080
```

Open http://localhost:8080. Camera, GPS and compass need **HTTPS on a phone**, so to test AR on your phone either
deploy (GitHub Pages / Netlify / Cloudflare Pages, all free) or tunnel your local server (`cloudflared tunnel --url http://localhost:8080`).

## Concepts

**Layers (dimensions).** The same corner exists in several realities at once:
- `STREET`: bound to a physical wall. You have to be there.
- `DREAM`: speculative futures over the real city.
- `MEMORY`: histories and erased stories of the place.
- `SIGNAL`: sound, data, live feeds.

**Anchors (how a piece wakes up).**
- `gps`: unlocks inside its radius. Works today.
- `qr`: a printed sticker on the wall points to `ar.html?piece=ID`. Works today (button *QR ANCHOR*).
- `nfc`: same URL written to an NFC sticker; tapping the phone opens it. Works today with any NFC writer app.
- `image`: the mural itself triggers the piece via image tracking. Roadmap (MindAR.js).

**Ghost mode.** If you're far from every piece, AR projects the gallery around you so it's explorable from anywhere.
Physically present = real placement + unlocking.

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
