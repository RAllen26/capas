# Builds the app icons (three stacked layers) as PNGs, no dependencies.
# Usage: python3 tools/make_icons.py
import struct, zlib, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
INK = (11, 11, 11)
LAYERS = [(0.22, 0.20, (62, 230, 255)), (0.30, 0.30, (255, 62, 165)), (0.38, 0.40, (232, 255, 42))]

def png(path, n):
    px = [[INK] * n for _ in range(n)]
    def rect(x0, y0, x1, y1, c):
        for y in range(int(y0 * n), int(y1 * n)):
            for x in range(int(x0 * n), int(x1 * n)):
                px[y][x] = c
    b = 0.022
    for x, y, c in LAYERS:   # kept inside the central 80% so maskable crops don't cut it
        rect(x - b, y - b, x + 0.40 + b, y + 0.40 + b, INK)
        rect(x, y, x + 0.40, y + 0.40, c)
    raw = b''.join(b'\x00' + bytes(v for p in row for v in p) for row in px)
    chunk = lambda t, d: struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    path.write_bytes(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', n, n, 8, 2, 0, 0, 0))
                     + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))

png(root / 'assets/icon-192.png', 192)
png(root / 'assets/icon-512.png', 512)
