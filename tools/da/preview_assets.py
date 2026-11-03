"""Copie réduite (½) des assets pour la planche de présentation."""
import os, sys, glob, shutil
from PIL import Image
OUT, EXT, DST = sys.argv[1], sys.argv[2], sys.argv[3]

def half(src, dst, q=86):
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    im = Image.open(src)
    im = im.resize((im.width // 2, im.height // 2), Image.LANCZOS)
    im.save(dst, quality=q, method=6)

for f in glob.glob(f"{OUT}/sprites/*/*.webp"):
    half(f, f.replace(OUT, DST + "/assets"), 84)
for f in glob.glob(f"{OUT}/decor/*/*.webp"):
    half(f, f.replace(OUT, DST + "/assets"))
for f in glob.glob(f"{OUT}/tiles/*/*.webp"):
    half(f, f.replace(OUT, DST + "/assets"))
av = DST + "/assets/avant"
os.makedirs(av, exist_ok=True)
shutil.copy(f"{EXT}/img25.webp", f"{av}/stone-ground.webp")
for name, src in {"hero-taro": "img33.png", "hero-mei": "img2.png", "hero-sena": "img19.png", "hero-ren": "img23.png",
                  "enemy-raider": "img8.png", "enemy-brute": "img11.png", "enemy-shadeElite": "img13.png",
                  "enemy-wolf": "img15.png", "enemy-shade": "img18.png"}.items():
    im = Image.open(f"{EXT}/{src}")
    im.thumbnail((220, 220))
    im.save(f"{av}/{name}.png", optimize=True)
print("ok")
