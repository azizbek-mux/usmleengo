"""Turns the captured PNGs in shots/<lang>/ into the smaller JPEGs the guide uses (img/<lang>/)."""
import glob, os
from PIL import Image

for lang in ("en", "uz"):
    os.makedirs(f"img/{lang}", exist_ok=True)
    for f in glob.glob(f"shots/{lang}/*.png"):
        im = Image.open(f).convert("RGB")
        w = 800
        h = round(im.height * w / im.width)
        im.resize((w, h), Image.LANCZOS).save(f"img/{lang}/{os.path.basename(f)[:-4]}.jpg", quality=90, optimize=True)
    print(lang, len(glob.glob(f"img/{lang}/*.jpg")))
