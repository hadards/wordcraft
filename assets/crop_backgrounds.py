"""One-off: crop the polaroid/stamp frame off 6 zone background illustrations,
leaving just the wide scene art to use as real map backgrounds.
Frame inset measured directly on the meadow sheet: scene starts ~185px in
(6.7%) from left/right and ~195px (12.7%) from top/bottom on a 2752x1536 sheet.
"""
import os
from PIL import Image

SRC_DIR = r"C:\Users\hadar\Downloads"
OUT_DIR = r"C:\Coding\wordcraft\assets\backgrounds"
os.makedirs(OUT_DIR, exist_ok=True)

INSET_X, INSET_Y = 0.068, 0.128

FILES = {
    "ocean": "Gemini_Generated_Image_ldu7mzldu7mzldu7.png",
    "meadow": "Gemini_Generated_Image_axf82raxf82raxf8.png",
    "arcade": "Gemini_Generated_Image_8f8adt8f8adt8f8a.png",
    "biome": "Gemini_Generated_Image_pneogkpneogkpneo.png",
    "stadium": "Gemini_Generated_Image_9zxsuq9zxsuq9zxs.png",
    "brainrot": "Gemini_Generated_Image_3ylh0u3ylh0u3ylh.png",
}

for zone_id, filename in FILES.items():
    im = Image.open(os.path.join(SRC_DIR, filename)).convert("RGB")
    w, h = im.size
    box = (int(w * INSET_X), int(h * INSET_Y), int(w * (1 - INSET_X)), int(h * (1 - INSET_Y)))
    cropped = im.crop(box)
    out_path = os.path.join(OUT_DIR, f"{zone_id}.jpg")
    cropped.save(out_path, quality=88)
    print(f"{zone_id}: {cropped.size} -> {out_path}")
