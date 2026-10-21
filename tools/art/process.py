#!/usr/bin/env python3
"""Turn art/raw/<id>.png into assets/images/art/<id>.webp for the app.
Trims the white margin Seedream leaves, keeps the white background (the art
sits on white cards), and resizes so the bundle stays small."""
import os, sys
from PIL import Image, ImageChops

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
RAW = os.path.join(ROOT, "art", "raw")
CUT = os.path.join(ROOT, "art", "cut")  # rembg cutouts (RGBA) win over raw when present
OUT = os.path.join(ROOT, "assets", "images", "art")
SIZES = {"hero": 720, "tile": 320, "banner": 320}


def trim(im, pad=0.04):
    bg = Image.new("RGB", im.size, (255, 255, 255))
    diff = ImageChops.difference(im.convert("RGB"), bg).convert("L").point(lambda v: 255 if v > 18 else 0)
    box = diff.getbbox()
    if not box:
        return im
    w, h = im.size
    px = int(w * pad)
    l, t, r, b = box
    box = (max(0, l - px), max(0, t - px), min(w, r + px), min(h, b + px))
    im = im.crop(box)
    # square it up on white so every asset keeps the same aspect
    side = max(im.size)
    canvas = Image.new("RGB", (side, side), (255, 255, 255))
    canvas.paste(im, ((side - im.size[0]) // 2, (side - im.size[1]) // 2))
    return canvas


def main():
    os.makedirs(OUT, exist_ok=True)
    only = set(sys.argv[1:])
    for name in sorted(os.listdir(RAW)):
        if not name.endswith(".png"):
            continue
        job = name[:-4]
        if only and job not in only:
            continue
        cut = os.path.join(CUT, name)
        if os.path.exists(cut):
            im = Image.open(cut).convert("RGBA")
            box = im.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox()
            if box:
                w, h = im.size; px = int(w * 0.03)
                im = im.crop((max(0, box[0]-px), max(0, box[1]-px), min(w, box[2]+px), min(h, box[3]+px)))
            side = max(im.size)
            canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
            canvas.paste(im, ((side - im.size[0]) // 2, (side - im.size[1]) // 2))
            im = canvas
        else:
            im = Image.open(os.path.join(RAW, name)).convert("RGB")
            im = trim(im)
        target = SIZES.get(job.split("-")[0], 320)
        im.thumbnail((target, target), Image.LANCZOS)
        dst = os.path.join(OUT, job + ".webp")
        im.save(dst, "WEBP", quality=86, method=6)
        print(f"{job}: {im.size[0]}x{im.size[1]} {os.path.getsize(dst)//1024} KB")


if __name__ == "__main__":
    main()
