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

# ── tagline ─────────────────────────────────────────────────────────────
f2 = ImageFont.truetype(FONT_SB, int(19 * S))
tag = "5000+ USMLE micro-quizzes"
b2 = d.textbbox((0, 0), tag, font=f2)
d.text((cx - (b2[2] - b2[0]) // 2 - b2[0], int(H * S * 0.845) - b2[1]),
       tag, font=f2, fill=MUTED)

img.resize((W, H), Image.LANCZOS).save("botfather-card.png", "PNG", optimize=True)
print("wrote botfather-card.png")
