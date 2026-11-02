// CAPAS — data model + seed pieces.
// Every piece is plain JSON so the whole gallery can live in a git repo,
// be forked, mirrored, or federated later. No lock-in.

// Layer colors live in css/theme.css (--layer-<key>); `color` resolves the current theme's value.
const defineLayer = (key, label, desc) => ({ label, desc, get color() { return Theme.css('--layer-' + key); } });

const LAYERS = {
  street: defineLayer('street', 'STREET', 'Bound to a physical wall, corner or object. You have to be there.'),
  dream: defineLayer('dream',  'DREAM',  'Speculative futures and impossible architecture over the real city.'),
  memory: defineLayer('memory', 'MEMORY', 'Histories, ghosts and erased stories of the place, restored.'),
  signal: defineLayer('signal', 'SIGNAL', 'Sound, data, live feeds. Pieces that change while you watch.'),
};

const ANCHORS = {
  gps:   { label: 'GPS radius',   desc: 'Unlocks when you walk inside the radius.' },
  qr:    { label: 'QR sticker',   desc: 'A printed tag on the wall opens the piece.' },
  nfc:   { label: 'NFC tag',      desc: 'Tap your phone on a sticker to open it.' },
  image: { label: 'Image marker', desc: 'Point the camera at a mural to trigger it (roadmap).' },
};

const STYLES = ['stencil', 'rings', 'glitch', 'signal'];

// Artwork palettes belong to the pieces, not the brand: a rebrand must not repaint artists' work.
const PALETTES = [
  ['#0b0b0b', '#e8ff2a', '#ff3ea5'],
  ['#f2efe6', '#0b0b0b', '#ff3a1a'],
  ['#1a0b2e', '#3ee6ff', '#ff3ea5'],
  ['#ff3ea5', '#0b0b0b', '#e8ff2a'],
  ['#0d2b1f', '#ff7a1a', '#f2efe6'],
  ['#e8ff2a', '#1a0b2e', '#3ee6ff'],
];

/*
Piece schema (v0):
{
  id:       string, unique slug
  title:    string
  artist:   string (handle, no accounts yet)
  created:  ISO date
  layer:    key of LAYERS
  location: { lat, lng, radius }   radius in meters = activation zone
  anchor:   { type: key of ANCHORS, ref?: string }
  art:      { style: one of STYLES, glyph: short text, palette: [bg, fg, accent], seed }
  note:     string, artist statement
  license:  SPDX-ish string, default CC-BY-SA-4.0
}
Later: art.kind = 'image' | 'video' | 'glb' | 'audio' alongside procedural.
*/

const SEED_PIECES = [
  { id: 'ojo-del-zocalo', title: 'Ojo del Zócalo', artist: '@tinta_rota', created: '2026-09-14', layer: 'memory',
    location: { lat: 19.4326, lng: -99.1332, radius: 80 }, anchor: { type: 'gps' },
    art: { style: 'rings', glyph: 'OJO', palette: PALETTES[2], seed: 11 },
    note: 'The lake under the plaza is still looking up at us.', license: 'CC-BY-SA-4.0' },
  { id: 'no-se-vende', title: 'NO SE VENDE', artist: '@colectivo_grieta', created: '2026-08-02', layer: 'street',
    location: { lat: 19.4194, lng: -99.1617, radius: 40 }, anchor: { type: 'qr', ref: 'sticker #001' },
    art: { style: 'stencil', glyph: 'NO SE VENDE', palette: PALETTES[1], seed: 3 },
    note: 'Pasted on the shutter of the last bakery on the block.', license: 'CC-BY-SA-4.0' },
  { id: 'jardin-flotante', title: 'Jardín flotante 2080', artist: '@chinampa.exe', created: '2026-10-01', layer: 'dream',
    location: { lat: 19.4119, lng: -99.1700, radius: 120 }, anchor: { type: 'gps' },
    art: { style: 'signal', glyph: '2080', palette: PALETTES[4], seed: 42 },
    note: 'Parque México if the water came back.', license: 'CC0-1.0' },
  { id: 'ruido-tepito', title: 'Ruido Blanco Tepito', artist: '@barrio_bravo_fm', created: '2026-07-21', layer: 'signal',
    location: { lat: 19.4446, lng: -99.1258, radius: 60 }, anchor: { type: 'nfc', ref: 'tag under the bridge' },
    art: { style: 'glitch', glyph: 'FM', palette: PALETTES[0], seed: 7 },
    note: 'Live frequency of the market, rendered as noise.', license: 'CC-BY-SA-4.0' },
  { id: 'kiosco-morisco', title: 'Kiosco que respira', artist: '@morisca', created: '2026-06-11', layer: 'memory',
    location: { lat: 19.4510, lng: -99.1580, radius: 70 }, anchor: { type: 'image', ref: 'kiosk facade' },
    art: { style: 'rings', glyph: '1884', palette: PALETTES[5], seed: 19 },
    note: 'Built for a world fair, landed here. Still breathing.', license: 'CC-BY-4.0' },
  { id: 'coyote-digital', title: 'Coyote Digital', artist: '@nahual_404', created: '2026-09-30', layer: 'dream',
    location: { lat: 19.3500, lng: -99.1626, radius: 90 }, anchor: { type: 'gps' },
    art: { style: 'stencil', glyph: 'COYO TL', palette: PALETTES[3], seed: 23 },
    note: 'The place of coyotes, re-wilded in the layer above.', license: 'CC-BY-SA-4.0' },
  { id: 'alarma-sismica', title: 'Alarma Sísmica', artist: '@19S', created: '2026-09-19', layer: 'signal',
    location: { lat: 19.4150, lng: -99.1560, radius: 100 }, anchor: { type: 'gps' },
    art: { style: 'signal', glyph: '19.09', palette: PALETTES[1], seed: 1909 },
    note: 'Seismograph traces from both Septembers, layered on the corner.', license: 'CC-BY-SA-4.0' },
  { id: 'muro-de-voces', title: 'Muro de voces', artist: '@abuelas_tags', created: '2026-05-03', layer: 'street',
    location: { lat: 19.4270, lng: -99.1450, radius: 50 }, anchor: { type: 'qr', ref: 'sticker #014' },
    art: { style: 'glitch', glyph: 'VOZ', palette: PALETTES[2], seed: 88 },
    note: 'Open wall. Anyone can add a line. Nobody can delete one.', license: 'CC0-1.0' },
];
