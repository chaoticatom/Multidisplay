#!/usr/bin/env python3
"""
Generate PNG icons for the Multidisplay PWA from scratch using only
Python standard library (struct + zlib). No PIL or cairosvg needed.

Output:
  icons/icon-192.png  (192x192)
  icons/icon-512.png  (512x512)

Run from the project root:
  python3 tools/generate_icons.py
"""

import struct
import zlib
import os
import math


def make_png_bytes(width, height, pixels):
    """
    Encode a list of (r, g, b, a) tuples (row-major) as a PNG file.
    Returns bytes.
    """
    def chunk(tag, data):
        c = struct.pack('>I', len(data)) + tag + data
        return c + struct.pack('>I', zlib.crc32(tag + data) & 0xFFFFFFFF)

    # IHDR
    ihdr = struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0)
    # Image data: filter byte 0 before each row
    raw = b''
    for row in range(height):
        raw += b'\x00'
        for col in range(width):
            r, g, b, a = pixels[row * width + col]
            raw += bytes([r, g, b])
    compressed = zlib.compress(raw, 9)

    sig = b'\x89PNG\r\n\x1a\n'
    return (sig
            + chunk(b'IHDR', ihdr)
            + chunk(b'IDAT', compressed)
            + chunk(b'IEND', b''))


def lerp(a, b, t):
    return a + (b - a) * t


def render_icon(size):
    """
    Draw an isometric RGB LED cube icon at the given size.
    Returns a list of (r, g, b, a) tuples.
    """
    pixels = [(0, 3, 8, 255)] * (size * size)   # dark background

    def set_pixel(x, y, color, alpha=255):
        if 0 <= x < size and 0 <= y < size:
            r, g, b = color
            # Simple alpha blend over background
            bg = (0, 3, 8)
            a = alpha / 255.0
            fr = int(r * a + bg[0] * (1 - a))
            fg = int(g * a + bg[1] * (1 - a))
            fb = int(b * a + bg[2] * (1 - a))
            pixels[y * size + x] = (fr, fg, fb, 255)

    def fill_polygon(pts, color, alpha=255):
        """Scanline fill a convex polygon."""
        if not pts:
            return
        min_y = max(0, int(min(p[1] for p in pts)))
        max_y = min(size - 1, int(max(p[1] for p in pts)))
        for y in range(min_y, max_y + 1):
            xs = []
            n = len(pts)
            for i in range(n):
                x0, y0 = pts[i]
                x1, y1 = pts[(i + 1) % n]
                if (y0 <= y < y1) or (y1 <= y < y0):
                    if y1 != y0:
                        t = (y - y0) / (y1 - y0)
                        xs.append(x0 + t * (x1 - x0))
            if len(xs) >= 2:
                xs.sort()
                for x in range(int(xs[0]), int(xs[-1]) + 1):
                    set_pixel(x, y, color, alpha)

    def draw_line(x0, y0, x1, y1, color, thickness=1, alpha=255):
        """Bresenham line with optional thickness."""
        x0, y0, x1, y1 = int(x0), int(y0), int(x1), int(y1)
        dx = abs(x1 - x0)
        dy = abs(y1 - y0)
        sx = 1 if x0 < x1 else -1
        sy = 1 if y0 < y1 else -1
        err = dx - dy
        t = max(0, thickness // 2)
        while True:
            for ty in range(-t, t + 1):
                for tx in range(-t, t + 1):
                    set_pixel(x0 + tx, y0 + ty, color, alpha)
            if x0 == x1 and y0 == y1:
                break
            e2 = 2 * err
            if e2 > -dy:
                err -= dy
                x0 += sx
            if e2 < dx:
                err += dx
                y0 += sy

    def draw_circle(cx, cy, r, color, alpha=255):
        """Filled circle."""
        for y in range(int(cy - r) - 1, int(cy + r) + 2):
            for x in range(int(cx - r) - 1, int(cx + r) + 2):
                dist = math.sqrt((x - cx) ** 2 + (y - cy) ** 2)
                if dist <= r:
                    a = int(alpha * min(1.0, max(0.0, (r - dist + 0.5))))
                    set_pixel(x, y, color, a)

    # Scale factor
    s = size / 512.0

    # Cube vertices (isometric projection scaled to size)
    # Original design at 512x512:
    #   Top:   (256,80) (400,160) (256,240) (112,160)
    #   Left:  (112,160) (256,240) (256,400) (112,320)
    #   Right: (256,240) (400,160) (400,320) (256,400)

    def sp(x, y):
        return (x * s, y * s)

    top = [sp(256, 80), sp(400, 160), sp(256, 240), sp(112, 160)]
    left = [sp(112, 160), sp(256, 240), sp(256, 400), sp(112, 320)]
    right = [sp(256, 240), sp(400, 160), sp(400, 320), sp(256, 400)]

    # Draw faces
    fill_polygon(top, (0, 20, 40), 255)
    fill_polygon(left, (0, 10, 24), 255)
    fill_polygon(right, (0, 15, 34), 255)

    # Draw edges
    edge_color = (122, 173, 255)
    lw = max(1, int(6 * s))
    edge_pts = [
        (sp(256, 80), sp(400, 160)),
        (sp(400, 160), sp(256, 240)),
        (sp(256, 240), sp(112, 160)),
        (sp(112, 160), sp(256, 80)),
        (sp(112, 160), sp(112, 320)),
        (sp(400, 160), sp(400, 320)),
        (sp(256, 240), sp(256, 400)),
        (sp(112, 320), sp(256, 400)),
        (sp(256, 400), sp(400, 320)),
    ]
    for (x0, y0), (x1, y1) in edge_pts:
        draw_line(x0, y0, x1, y1, edge_color, lw)

    # LED dot colors
    BLUE = (122, 173, 255)
    RED = (255, 85, 119)
    GREEN = (85, 255, 153)
    ORANGE = (255, 153, 68)

    # LED dots on top face
    top_dots = [
        (200, 148, BLUE), (256, 120, RED), (312, 148, GREEN),
        (174, 163, ORANGE), (230, 135, BLUE), (286, 163, RED),
        (200, 178, GREEN), (256, 150, ORANGE), (312, 178, BLUE),
    ]
    # LED dots on left face
    left_dots = [
        (148, 220, BLUE), (184, 242, RED),
        (148, 264, GREEN), (184, 286, ORANGE),
        (148, 308, BLUE), (184, 330, RED),
    ]
    # LED dots on right face
    right_dots = [
        (328, 220, GREEN), (364, 242, BLUE),
        (328, 264, ORANGE), (364, 286, RED),
        (328, 308, BLUE), (364, 330, GREEN),
    ]

    dot_r = max(2, 9 * s)
    for dx, dy, col in top_dots + left_dots + right_dots:
        draw_circle(dx * s, dy * s, dot_r, col, 230)

    return pixels


def write_icon(size, path):
    print(f"Generating {path} ({size}x{size})...")
    pixels = render_icon(size)
    data = make_png_bytes(size, size, pixels)
    with open(path, 'wb') as f:
        f.write(data)
    print(f"  Written: {len(data)} bytes")


if __name__ == '__main__':
    # Resolve paths relative to project root (one level up from tools/)
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)
    icons_dir = os.path.join(project_root, 'icons')
    os.makedirs(icons_dir, exist_ok=True)

    write_icon(192, os.path.join(icons_dir, 'icon-192.png'))
    write_icon(512, os.path.join(icons_dir, 'icon-512.png'))
    print("Done.")
