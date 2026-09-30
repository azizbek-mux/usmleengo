# -*- coding: utf-8 -*-
"""640x360 app card for BotFather, drawn to match the running app.

Rendered at 4x and downsampled, because Pillow has no antialiasing on shapes
or the wide ring stroke — supersampling is what keeps the circle edge and the
letterforms clean at final size.
"""
from PIL import Image, ImageDraw, ImageFont

W, H, S = 640, 360, 4                     # final size, supersample factor
BG      = (15, 17, 21)                    # --bg     #0f1115
ACCENT  = (70, 209, 158)                  # --accent #46d19e
MUTED   = (139, 149, 165)                 # --muted  #8b95a5

FONT = "C:/Windows/Fonts/seguibl.ttf"     # Segoe UI Black — closest to the logo
FONT_SB = "C:/Windows/Fonts/seguisb.ttf"  # Semibold, for the tagline

img = Image.new("RGB", (W * S, H * S), BG)
d = ImageDraw.Draw(img)

cx, cy = W * S // 2, int(H * S * 0.44)    # lockup sits slightly above centre
r = int(101 * S)
ring = int(6.5 * S)

# ── ring ────────────────────────────────────────────────────────────────
d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=ACCENT, width=ring)

# ── wordmark, knocked out of the ring ───────────────────────────────────
# Drawn with a fat background-coloured stroke first (stroke_fill), so the ring
# is cut away behind the letters exactly as it is in the app's SVG.
f = ImageFont.truetype(FONT, int(63 * S))
text = "usmleengo"
bbox = d.textbbox((0, 0), text, font=f)
tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
tx, ty = cx - tw // 2 - bbox[0], cy - th // 2 - bbox[1]
d.text((tx, ty), text, font=f, fill=ACCENT,
       stroke_width=int(11 * S), stroke_fill=BG)
d.text((tx, ty), text, font=f, fill=ACCENT)

# -- the doppi on the last o ---------------------------------------------
# The Uzbek skullcap: a mint dome with a band and an almond (bodom) cut out of
# it, and the same halo as the letters. The same drawing as src/components/Logo.jsx,
# in that file's units (u pixels to one of them), sat on the top of the o.
def bezier(p0, p1, p2, p3, n=24):
    return [tuple((1 - t) ** 3 * a + 3 * (1 - t) ** 2 * t * b + 3 * (1 - t) * t ** 2 * c + t ** 3 * e
                  for a, b, c, e in zip(p0, p1, p2, p3)) for t in [i / n for i in range(n + 1)]]

u = 63 * S / 52
obox = d.textbbox((tx + f.getlength("usmleeng"), ty), "o", font=f)
ocx, otop = (obox[0] + obox[2]) / 2, obox[1]
k = 0.97 * u
ox, oy = ocx, otop + 1.2 * u          # cap base centre

def place(pts, sx=1.0, sy=1.0, dx=0.0, dy=0.0):
    return [(ox + (x * sx + dx) * k, oy + (y * sy + dy) * k) for x, y in pts]

dome = ([(-16, 0)] + bezier((-16, 0), (-16.8, -7.4), (-13.2, -14.8), (-6.6, -16.8))
        + bezier((-6.6, -16.8), (-2.2, -18.0), (2.2, -18.0), (6.6, -16.8))
        + bezier((6.6, -16.8), (13.2, -14.8), (16.8, -7.4), (16, 0)))
d.polygon(place(dome), fill=BG)                                   # the seam: the cap's own halo
for a in range(0, 360, 20):                                       # thicken it all round
    import math
    d.polygon(place(dome, dx=math.cos(math.radians(a)) * 1.3, dy=math.sin(math.radians(a)) * 1.3), fill=BG)
d.polygon(place(dome), fill=ACCENT)
d.line(place([(-15, -3.9), (15, -3.9)]), fill=BG, width=max(1, int(1.5 * k)))
almond = (bezier((0, -6.4), (4, -3.6), (4.2, -0.4), (0, 1)) + bezier((0, 1), (-4.2, -0.4), (-4, -3.6), (0, -6.4)))
d.polygon(place(almond, sx=1.35, sy=1.5, dy=-6.8), fill=BG)

# ── tagline ─────────────────────────────────────────────────────────────
f2 = ImageFont.truetype(FONT_SB, int(19 * S))
tag = "6,600+ USMLE micro-quizzes"
b2 = d.textbbox((0, 0), tag, font=f2)
d.text((cx - (b2[2] - b2[0]) // 2 - b2[0], int(H * S * 0.845) - b2[1]),
       tag, font=f2, fill=MUTED)

img.resize((W, H), Image.LANCZOS).save("botfather-card.png", "PNG", optimize=True)
print("wrote botfather-card.png")
