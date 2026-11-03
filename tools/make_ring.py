# Builds assets/kiosk-ring.glb: a floating torus (real meters) to circle a kiosk.
# "CAPAS · TLALPAN · 1872" wraps its outer side; orbiting shards; spins, wobbles, bobs (24 s loop).
# Usage: python3 tools/make_ring.py assets/kiosk-ring.glb
import json, math, struct, zlib, sys

out_path = sys.argv[1]
R = 9.0          # torus radius (center of the tube), m
TUBE = 0.55      # tube radius, m
REPS = 4         # text repeats around the ring

# ---------- texture: pixel-font text band ----------
FONT = {
    'C': '01110 10001 10000 10000 10000 10001 01110', 'A': '01110 10001 10001 11111 10001 10001 10001',
    'P': '11110 10001 10001 11110 10000 10000 10000', 'S': '01111 10000 10000 01110 00001 00001 11110',
    'T': '11111 00100 00100 00100 00100 00100 00100', 'L': '10000 10000 10000 10000 10000 10000 11111',
    'N': '10001 11001 10101 10011 10001 10001 10001', '1': '00100 01100 00100 00100 00100 00100 01110',
    '8': '01110 10001 10001 01110 10001 10001 01110', '7': '11111 00001 00010 00100 01000 01000 01000',
    '2': '01110 10001 00001 00010 00100 01000 11111', '·': '00000 00000 01110 01110 01110 00000 00000',
    ' ': '00000 00000 00000 00000 00000 00000 00000',
}
TEXT = ' CAPAS · TLALPAN · 1872 '
W, H, PX = 1024, 64, 6
INK, ACID, PINK = (11, 11, 11), (232, 255, 42), (255, 62, 165)
img = [[INK] * W for _ in range(H)]
for y in range(H):
    if y < 5 or y >= H - 5:
        img[y] = [PINK] * W
text_w = len(TEXT) * 6 * PX
x0, y0 = (W - text_w) // 2, (H - 7 * PX) // 2
for ci, ch in enumerate(TEXT):
    rows = FONT[ch].split()
    for ry, row in enumerate(rows):
        for rx, bit in enumerate(row):
            if bit == '1':
                for yy in range(PX):
                    for xx in range(PX):
                        img[y0 + ry * PX + yy][x0 + (ci * 6 + rx) * PX + xx] = ACID
raw = b''.join(b'\x00' + bytes(c for px in row for c in px) for row in img)
def chunk(t, d): return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', W, H, 8, 2, 0, 0, 0)) \
    + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b'')

# ---------- geometry ----------
def textured_torus(S=112, T=12):
    # u runs against the main angle so the text reads left-to-right from outside;
    # v = 0.5 on the tube's outer equator, so the text sits on the side facing out.
    pos, nor, uv = [], [], []
    def vert(i, k):
        a, b = 2 * math.pi * i / S, -math.pi + 2 * math.pi * k / T
        n = [math.cos(b) * math.cos(a), math.sin(b), math.cos(b) * math.sin(a)]
        p = [(R + TUBE * math.cos(b)) * math.cos(a), TUBE * math.sin(b), (R + TUBE * math.cos(b)) * math.sin(a)]
        return p, n, [(1 - i / S) * REPS, 0.5 - (b / (2 * math.pi)) * 1.6]
    for i in range(S):
        for k in range(T):
            q = [vert(i, k), vert(i, k + 1), vert(i + 1, k), vert(i + 1, k), vert(i, k + 1), vert(i + 1, k + 1)]
            for pp, nn, uu in q:
                pos += pp; nor += nn; uv += uu
    return pos, nor, uv

def octa(s):
    V = [[s, 0, 0], [-s, 0, 0], [0, s * 1.8, 0], [0, -s * 1.8, 0], [0, 0, s], [0, 0, -s]]
    F = [(0, 2, 4), (4, 2, 1), (1, 2, 5), (5, 2, 0), (4, 3, 0), (1, 3, 4), (5, 3, 1), (0, 3, 5)]
    pos, nor = [], []
    for f in F:
        a, b, c = (V[i] for i in f)
        u = [b[i] - a[i] for i in range(3)]; v = [c[i] - a[i] for i in range(3)]
        n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
        l = math.sqrt(sum(x * x for x in n)); n = [x / l for x in n]
        for p in (a, b, c):
            pos += p; nor += n
    return pos, nor

# ---------- animation ----------
def quat(axis, deg):
    h = math.radians(deg) / 2
    return [axis[0] * math.sin(h), axis[1] * math.sin(h), axis[2] * math.sin(h), math.cos(h)]
spin_t = [i * 3.0 for i in range(9)]                       # 0..24 s
spin = [v for i in range(9) for v in quat((0, 1, 0), -i * 45)]
wob_t = [0, 6, 12, 18, 24]
wob = [v for q in (quat((1, 0, 0), 0), quat((1, 0, 0), 3), quat((0, 0, 1), 3), quat((1, 0, 0), -3), quat((1, 0, 0), 0)) for v in q]
bob = [v for y in (0, .3, 0, -.3, 0) for v in (0, y, 0)]

# ---------- pack ----------
blob = bytearray(); views = []; accs = []
def add_view(data, target=None):
    while len(blob) % 4: blob.append(0)
    v = {"buffer": 0, "byteOffset": len(blob), "byteLength": len(data)}
    blob.extend(data)
    if target: v["target"] = target
    views.append(v); return len(views) - 1
def add_acc(vals, typ, comps, target=34962, minmax=False):
    a = {"bufferView": add_view(struct.pack('<%df' % len(vals), *vals), target), "componentType": 5126, "count": len(vals) // comps, "type": typ}
    if minmax:
        a["min"] = [min(vals[i::comps]) for i in range(comps)]
        a["max"] = [max(vals[i::comps]) for i in range(comps)]
    accs.append(a); return len(accs) - 1
def prim(pos, nor, mat, uv=None):
    at = {"POSITION": add_acc(pos, "VEC3", 3, minmax=True), "NORMAL": add_acc(nor, "VEC3", 3)}
    if uv: at["TEXCOORD_0"] = add_acc(uv, "VEC2", 2)
    return {"attributes": at, "material": mat}

bp, bn, bu = textured_torus()
op, on = octa(0.22)
meshes = [
    {"name": "torus", "primitives": [prim(bp, bn, 0, bu)]},
    {"name": "shard", "primitives": [prim(op, on, 2)]},
]
a_spin_t = add_acc(spin_t, "SCALAR", 1, None, True)
a_wob_t = add_acc(wob_t, "SCALAR", 1, None, True)
a_spin = add_acc(spin, "VEC4", 4, None)
a_wob = add_acc(wob, "VEC4", 4, None)
a_bob = add_acc(bob, "VEC3", 3, None)
img_view = add_view(png)

nodes = [
    {"name": "kiosk-ring", "children": [1]},
    {"name": "wobble", "children": [2]},
    {"name": "spin", "mesh": 0, "children": list(range(3, 11))},
]
for i in range(8):
    a = 2 * math.pi * (i + .5) / 8
    nodes.append({"name": f"shard-{i}", "mesh": 1, "translation": [(R + 1.3) * math.cos(a), (1.0 if i % 2 else -1.0), (R + 1.3) * math.sin(a)],
                  "rotation": quat((0, 1, 0), i * 41)})

gltf = {
    "asset": {"version": "2.0", "generator": "CAPAS make_ring.py"},
    "scene": 0, "scenes": [{"nodes": [0]}], "nodes": nodes, "meshes": meshes,
    "materials": [
        {"name": "text-torus", "pbrMetallicRoughness": {"baseColorTexture": {"index": 0}, "metallicFactor": 0, "roughnessFactor": 0.6},
         "emissiveTexture": {"index": 0}, "emissiveFactor": [0.75, 0.75, 0.75]},
        {"name": "pink", "pbrMetallicRoughness": {"baseColorFactor": [1, 0.24, 0.65, 1], "metallicFactor": 0, "roughnessFactor": 0.5}, "emissiveFactor": [0.9, 0.2, 0.5]},
        {"name": "acid", "pbrMetallicRoughness": {"baseColorFactor": [0.91, 1, 0.16, 1], "metallicFactor": 0, "roughnessFactor": 0.4}, "emissiveFactor": [0.7, 0.8, 0.05]},
    ],
    "textures": [{"source": 0, "sampler": 0}],
    "samplers": [{"magFilter": 9728, "minFilter": 9987, "wrapS": 10497, "wrapT": 33071}],
    "images": [{"bufferView": img_view, "mimeType": "image/png"}],
    "animations": [{"name": "float", "samplers": [
        {"input": a_spin_t, "output": a_spin, "interpolation": "LINEAR"},
        {"input": a_wob_t, "output": a_wob, "interpolation": "LINEAR"},
        {"input": a_wob_t, "output": a_bob, "interpolation": "LINEAR"},
    ], "channels": [
        {"sampler": 0, "target": {"node": 2, "path": "rotation"}},
        {"sampler": 1, "target": {"node": 1, "path": "rotation"}},
        {"sampler": 2, "target": {"node": 1, "path": "translation"}},
    ]}],
    "accessors": accs, "bufferViews": views,
}
while len(blob) % 4: blob.append(0)
gltf["buffers"] = [{"byteLength": len(blob)}]
js = json.dumps(gltf, separators=(',', ':')).encode()
while len(js) % 4: js += b' '
glb = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(blob))
glb += struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(blob), 0x004E4942) + bytes(blob)
open(out_path, 'wb').write(glb)
print(len(glb), 'bytes')
