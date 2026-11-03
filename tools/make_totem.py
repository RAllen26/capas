# Builds assets/coyote-totem.glb: a textured, animated sample 3D piece (pure Python, no deps).
# Usage: python3 tools/make_totem.py assets/coyote-totem.glb
import json, math, struct, zlib, random, sys

out_path = sys.argv[1]
random.seed(23)

# ---------- texture: 256x256 PNG, glitch stripes in CAPAS colors ----------
W = H = 256
pal = [(232, 255, 42), (255, 62, 165), (11, 11, 11), (62, 230, 255), (242, 239, 230)]
rows = []
bands = []
x = 0
while x < W:
    w = random.choice([6, 10, 16, 24, 40])
    bands.append((x, x + w, random.choice(pal)))
    x += w
for y in range(H):
    shift = random.randint(-30, 30) if random.random() < 0.08 else 0
    row = bytearray([0])
    for x in range(W):
        xx = (x + shift) % W
        c = next(b[2] for b in bands if b[0] <= xx < b[1])
        if (y // 16 + x // 16) % 7 == 0:
            c = (11, 11, 11)
        n = random.randint(-18, 18)
        row += bytes(max(0, min(255, v + n)) for v in c)
    rows.append(bytes(row))
def chunk(t, d): return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', W, H, 8, 2, 0, 0, 0)) \
    + chunk(b'IDAT', zlib.compress(b''.join(rows), 9)) + chunk(b'IEND', b'')

# ---------- geometry helpers (flat-shaded, non-indexed) ----------
def norm(v):
    l = math.sqrt(sum(c * c for c in v)) or 1
    return [c / l for c in v]
def sub(a, b): return [a[i] - b[i] for i in range(3)]
def cross(a, b): return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]

def tri_mesh(tris):  # tris: list of ((p,uv),(p,uv),(p,uv))
    pos, nor, uv = [], [], []
    for t in tris:
        n = norm(cross(sub(t[1][0], t[0][0]), sub(t[2][0], t[0][0])))
        for p, u in t:
            pos += p; nor += n; uv += u
    return pos, nor, uv

# crystal: 7-sided bipyramid, a little twisted
N = 7
top, bot = [0, 2.7, 0], [0, 0.15, 0]
ring_lo = [[0.62 * math.cos(2*math.pi*i/N), 1.05, 0.62 * math.sin(2*math.pi*i/N)] for i in range(N)]
ring_hi = [[0.48 * math.cos(2*math.pi*(i+.5)/N), 1.75, 0.48 * math.sin(2*math.pi*(i+.5)/N)] for i in range(N)]
tris = []
for i in range(N):
    j = (i + 1) % N
    u0, u1 = i / N, (i + 1) / N
    um = (i + .5) / N
    tris.append(((bot, [um, 1.0]), (ring_lo[j], [u1, .62]), (ring_lo[i], [u0, .62])))
    tris.append(((ring_lo[i], [u0, .62]), (ring_lo[j], [u1, .62]), (ring_hi[i], [um, .35])))
    tris.append(((ring_hi[i], [um, .35]), (ring_lo[j], [u1, .62]), (ring_hi[j], [um + 1/N, .35])))
    tris.append(((ring_hi[i], [um, .35]), (ring_hi[j], [um + 1/N, .35]), (top, [um + .5/N, 0.0])))
crystal = tri_mesh(tris)

# ring: low-poly torus
R, r, S, T = 1.05, 0.05, 40, 6
def tp(a, b): return [(R + r*math.cos(b)) * math.cos(a), r * math.sin(b), (R + r*math.cos(b)) * math.sin(a)]
tris = []
for i in range(S):
    for k in range(T):
        a0, a1 = 2*math.pi*i/S, 2*math.pi*(i+1)/S
        b0, b1 = 2*math.pi*k/T, 2*math.pi*(k+1)/T
        p00, p10, p01, p11 = tp(a0, b0), tp(a1, b0), tp(a0, b1), tp(a1, b1)
        tris.append(((p00, [0, 0]), (p01, [0, 1]), (p10, [1, 0])))
        tris.append(((p10, [1, 0]), (p01, [0, 1]), (p11, [1, 1])))
ring = tri_mesh(tris)

# shard: small octahedron
s = 0.14
V = [[s,0,0],[-s,0,0],[0,s*1.6,0],[0,-s*1.6,0],[0,0,s],[0,0,-s]]
F = [(0,2,4),(4,2,1),(1,2,5),(5,2,0),(4,3,0),(1,3,4),(5,3,1),(0,3,5)]
shard = tri_mesh([tuple((V[i], [0, 0]) for i in f) for f in F])

# ---------- animation (6 s loop) ----------
def qy(deg):
    h = math.radians(deg) / 2
    return [0, math.sin(h), 0, math.cos(h)]
keys = [i * 0.75 for i in range(9)]               # 0 .. 6 s
spin = [v for i in range(9) for v in qy(i * 45)]   # ring: +360
counter = [v for i in range(9) for v in qy(-i * 22.5)]  # crystal: -180 (slow)
bob_t = [0, 1.5, 3, 4.5, 6]
bob = [v for y in (0, .18, 0, .18, 0) for v in (0, y, 0)]

# ---------- pack buffers ----------
blob = bytearray(); views = []; accs = []
def add_view(data, target=None):
    while len(blob) % 4: blob.append(0)
    off = len(blob); blob.extend(data)
    v = {"buffer": 0, "byteOffset": off, "byteLength": len(data)}
    if target: v["target"] = target
    views.append(v); return len(views) - 1
def add_acc(vals, typ, comps, target=34962, minmax=False):
    data = struct.pack('<%df' % len(vals), *vals)
    a = {"bufferView": add_view(data, target), "componentType": 5126, "count": len(vals) // comps, "type": typ}
    if minmax:
        a["min"] = [min(vals[i::comps]) for i in range(comps)]
        a["max"] = [max(vals[i::comps]) for i in range(comps)]
    accs.append(a); return len(accs) - 1
def mesh_prims(m, mat, with_uv=True):
    pos, nor, uv = m
    at = {"POSITION": add_acc(pos, "VEC3", 3, minmax=True), "NORMAL": add_acc(nor, "VEC3", 3)}
    if with_uv: at["TEXCOORD_0"] = add_acc(uv, "VEC2", 2)
    return [{"attributes": at, "material": mat}]

meshes = [
    {"name": "crystal", "primitives": mesh_prims(crystal, 0)},
    {"name": "ring", "primitives": mesh_prims(ring, 1, False)},
    {"name": "shard", "primitives": mesh_prims(shard, 2, False)},
]
t_keys = add_acc(keys, "SCALAR", 1, None, True)
t_bob = add_acc(bob_t, "SCALAR", 1, None, True)
a_spin = add_acc(spin, "VEC4", 4, None)
a_counter = add_acc(counter, "VEC4", 4, None)
a_bob = add_acc(bob, "VEC3", 3, None)
img_view = add_view(png)

shards = []
for i in range(5):
    a = 2 * math.pi * i / 5
    shards.append({"name": f"shard-{i}", "mesh": 2, "translation": [R * math.cos(a), 0, R * math.sin(a)], "rotation": qy(i * 37)})
nodes = [
    {"name": "coyote-totem", "children": [1, 2]},
    {"name": "crystal", "mesh": 0},
    {"name": "ring-tilt", "translation": [0, 1.35, 0], "rotation": [math.sin(math.radians(9)), 0, 0, math.cos(math.radians(9))], "children": [3]},
    {"name": "ring-spin", "mesh": 1, "children": list(range(4, 9))},
] + shards

gltf = {
    "asset": {"version": "2.0", "generator": "CAPAS make_totem.py"},
    "scene": 0, "scenes": [{"nodes": [0]}], "nodes": nodes, "meshes": meshes,
    "materials": [
        {"name": "glitch", "pbrMetallicRoughness": {"baseColorTexture": {"index": 0}, "metallicFactor": 0.2, "roughnessFactor": 0.45},
         "emissiveTexture": {"index": 0}, "emissiveFactor": [0.55, 0.55, 0.55]},
        {"name": "pink", "pbrMetallicRoughness": {"baseColorFactor": [1, 0.24, 0.65, 1], "metallicFactor": 0, "roughnessFactor": 0.5}, "emissiveFactor": [0.8, 0.15, 0.45]},
        {"name": "acid", "pbrMetallicRoughness": {"baseColorFactor": [0.91, 1, 0.16, 1], "metallicFactor": 0, "roughnessFactor": 0.4}, "emissiveFactor": [0.6, 0.7, 0.05]},
    ],
    "textures": [{"source": 0, "sampler": 0}],
    "samplers": [{"magFilter": 9728, "minFilter": 9728, "wrapS": 10497, "wrapT": 33071}],
    "images": [{"bufferView": img_view, "mimeType": "image/png"}],
    "animations": [{"name": "idle", "samplers": [
        {"input": t_keys, "output": a_spin, "interpolation": "LINEAR"},
        {"input": t_keys, "output": a_counter, "interpolation": "LINEAR"},
        {"input": t_bob, "output": a_bob, "interpolation": "LINEAR"},
    ], "channels": [
        {"sampler": 0, "target": {"node": 3, "path": "rotation"}},
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
