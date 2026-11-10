"""Draws the app icons with no dependencies (pure Python PNG writer).
Run:  python3 tools/make_icons.py
"""
import math
import os
import struct
import zlib

OUT = os.path.join(os.path.dirname(__file__), "..", "icons")


def hexc(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))


def mix(a, b, t):
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


def over(dst, src, alpha):
    return mix(dst, src, max(0.0, min(1.0, alpha)))


def smooth(edge0, edge1, x):
    t = max(0.0, min(1.0, (x - edge0) / (edge1 - edge0)))
    return t * t * (3 - 2 * t)


BG_TOP = hexc("#ffa3b8")
BG_BOT = hexc("#e85a80")
SKIN = hexc("#ffd9c2")
SKIN_SHADE = hexc("#f2b196")
INK = hexc("#4a2430")
BLUSH = hexc("#ff8fa0")
RED = hexc("#e2434c")
BUMP_HI = hexc("#ffc9c0")
BUMP = hexc("#ee6f6a")
HEAD = hexc("#fff6cf")
HEAD_RIM = hexc("#f0cf6a")
POP = hexc("#fff3b0")


def seg(u, v, ax, ay, bx, by):
    """Distance from (u, v) to segment a-b."""
    dx, dy = bx - ax, by - ay
    t = max(0.0, min(1.0, ((u - ax) * dx + (v - ay) * dy) / (dx * dx + dy * dy)))
    return math.hypot(u - ax - dx * t, v - ay - dy * t)


def disc(d, r, px):
    return smooth(r + px, r - px, d)


def pixel(u, v, px):
    """A happy little face with one big zit on its forehead, mid-pop."""
    c = mix(BG_TOP, BG_BOT, v)

    # face
    fx, fy, fr = 0.5, 0.57, 0.40
    d = math.hypot(u - fx, v - fy)
    c = over(c, (0.5, 0.12, 0.25), 0.22 * disc(math.hypot(u - fx, v - fy - 0.025), fr + 0.01, px * 8))
    face = mix(SKIN, SKIN_SHADE, smooth(0.1, 0.5, math.hypot(u - 0.4, v - 0.42)))
    fa = disc(d, fr, px)
    c = over(c, face, fa)

    # blush
    for bx in (0.27, 0.73):
        c = over(c, BLUSH, 0.6 * fa * (1 - smooth(0.0, 0.085, math.hypot(u - bx, (v - 0.70) * 1.3))))

    # happy closed eyes (upward arcs) and smile (downward arc)
    for ex in (0.35, 0.65):
        de = abs(math.hypot(u - ex, v - 0.635) - 0.05)
        if v < 0.635:
            c = over(c, INK, disc(de, 0.016, px))
        for sx in (-0.05, 0.05):
            c = over(c, INK, disc(math.hypot(u - ex - sx, v - 0.635), 0.016, px))
    dm = abs(math.hypot(u - 0.5, v - 0.70) - 0.055)
    if v > 0.70:
        c = over(c, INK, disc(dm, 0.015, px))
    for sx in (-0.055, 0.055):
        c = over(c, INK, disc(math.hypot(u - 0.5 - sx, v - 0.70), 0.015, px))

    # the zit, on the forehead
    zx, zy = 0.60, 0.38
    dz = math.hypot(u - zx, v - zy)
    c = over(c, RED, 0.5 * fa * (1 - smooth(0.0, 0.13, dz)))
    if dz < 0.08:
        hi = math.hypot(u - zx + 0.02, v - zy + 0.025)
        c = over(c, mix(BUMP_HI, BUMP, smooth(0.0, 0.08, hi)), disc(dz, 0.068, px))
        c = over(c, mix(HEAD, HEAD_RIM, smooth(0.015, 0.036, dz)), disc(dz, 0.034, px))
        c = over(c, (1, 1, 1), 0.9 * disc(math.hypot(u - zx + 0.011, v - zy + 0.013), 0.009, px))

    # comic "pop!" lines bursting off the zit
    for ang, r0, r1, w in ((-1.05, 0.105, 0.20, 0.017), (-0.45, 0.11, 0.18, 0.015),
                           (-1.65, 0.11, 0.18, 0.015), (0.15, 0.115, 0.165, 0.013)):
        ca, sa = math.cos(ang), math.sin(ang)
        ds = seg(u, v, zx + ca * r0, zy + sa * r0, zx + ca * r1, zy + sa * r1)
        c = over(c, INK, 0.35 * disc(ds, w + 0.008, px))
        c = over(c, POP, disc(ds, w, px))
    return c


def render(size):
    rows = []
    px = 1.0 / size
    for y in range(size):
        row = bytearray([0])
        for x in range(size):
            r, g, b = pixel((x + 0.5) / size, (y + 0.5) / size, px)
            row += bytes((int(r * 255 + 0.5), int(g * 255 + 0.5), int(b * 255 + 0.5)))
        rows.append(bytes(row))
    raw = b"".join(rows)

    def chunk(t, data):
        c = struct.pack(">I", len(data)) + t + data
        return c + struct.pack(">I", zlib.crc32(t + data) & 0xFFFFFFFF)

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw, 9))
    png += chunk(b"IEND", b"")
    return png


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    for s in (180, 192, 512):
        with open(os.path.join(OUT, f"icon-{s}.png"), "wb") as f:
            f.write(render(s))
        print("wrote", s)
