"""One-off: slice the 3 brainrot grid sheets into 36 individual character PNGs.
Each sheet is a 6x2 grid of polaroid cards. Measured directly from the sheet
(sushi_dumpling card, sheet 1): cards start at x=15, spacing=445, row1 y=290,
row2 y=900, card size ~455x510. The inner flat-color backing rectangle sits
inset from the card at left 9.9%, right 8.8%, top 17.6%, bottom 9.8% (also
measured directly). We crop that inner rectangle -- background stays as the
character's own flat backing color (like a sticker tile), no segmentation
needed since that boundary is exact, not guessed.
"""
import os
from PIL import Image

SRC_DIR = r"C:\Users\hadar\Downloads"
OUT_DIR = r"C:\Coding\wordcraft\assets\brainrots"
os.makedirs(OUT_DIR, exist_ok=True)

# measured grid geometry (pixels, sheet-relative)
GRID_X0, GRID_SPACING_X = 15, 445
GRID_Y = [290, 900]
CARD_W, CARD_H = 455, 510

# inner backing-rect inset as a fraction of the card box, measured from sushi card
INSET_L, INSET_R, INSET_T, INSET_B = 0.099, 0.088, 0.176, 0.098

SHEETS = [
    ("Gemini_Generated_Image_ryvduzryvduzryvd.png", [
        "sushi_dumpling", "toilet_paper_twins", "roblox_miner", "much_brain_doggo",
        "rainbow_mushroom_cat", "sad_avocado",
        "among_us_red", "minecraft_steve", "troll_face", "purple_blob",
        "spaghetti_cat", "boba_tea",
    ]),
    ("Gemini_Generated_Image_49jbx349jbx349jb.png", [
        "campfire_dog", "rainbow_jelly", "winged_cat", "letter_b_eyes",
        "gameboy_buddy", "mushroom_family",
        "frankenstein", "binary_ghost", "one_eye_alien", "water_drop",
        "cassette_bot", "lightbulb_head",
    ]),
    ("Gemini_Generated_Image_niyosqniyosqniyo.png", [
        "heart_eye_blob", "green_worm", "blue_bear", "many_eyed_mouth",
        "letter_a", "troll_panda",
        "many_eyed_blue", "four_eyed_cat", "red_devil", "apple_core",
        "green_alien", "spring_robot",
    ]),
    # Series 2 (unlabeled sheet — names chosen from what's shown)
    ("Gemini_Generated_Image_epk9jbepk9jbepk9.png", [
        "skibidi_singer", "red_blob", "harlequin_jester", "burger_blob",
        "huggy_blue", "creepy_baby",
        "nyan_cat", "panicked_chef", "purple_kitten", "beep_boop_kid",
        "buckle_finger", "sigma_face",
    ]),
    # Series 3 (labeled sheet — printed names)
    ("Gemini_Generated_Image_q2c4azq2c4azq2c4.png", [
        "gman_skibidi", "freddy", "caine", "ronald",
        "green_banban", "kissy_missy",
        "weg_weg_cat", "noise", "happy_happy_cat", "pico",
        "waffle_host", "yes_chad",
    ]),
]


def card_box(col, row):
    x0 = GRID_X0 + col * GRID_SPACING_X
    y0 = GRID_Y[row]
    return x0, y0, x0 + CARD_W, y0 + CARD_H


def inner_box(card_box_):
    x0, y0, x1, y1 = card_box_
    w, h = x1 - x0, y1 - y0
    return (
        x0 + int(w * INSET_L), y0 + int(h * INSET_T),
        x1 - int(w * INSET_R), y1 - int(h * INSET_B),
    )


manifest = []
for filename, names in SHEETS:
    sheet = Image.open(os.path.join(SRC_DIR, filename)).convert("RGB")
    for i, name in enumerate(names):
        col, row = i % 6, i // 6
        box = inner_box(card_box(col, row))
        char = sheet.crop(box)
        out_path = os.path.join(OUT_DIR, f"{name}.png")
        char.save(out_path)
        manifest.append((name, char.size))
        print(f"{name}: {char.size}")

print(f"\nSaved {len(manifest)} characters to {OUT_DIR}")
