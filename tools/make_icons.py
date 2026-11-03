"""Génère les icônes PWA depuis le portrait de Taro (rejouable) : python3 tools/make_icons.py"""
from PIL import Image, ImageDraw, ImageFilter, ImageEnhance
import os
SRC = 'public/assets/portraits/portrait-taro.webp'
OUT = 'public/icons'
os.makedirs(OUT, exist_ok=True)
BG = (7, 17, 31, 255)
GOLD = (213, 183, 126, 255)
GOLD_D = (147, 116, 68, 255)

def face(size):
    im = Image.open(SRC).convert('RGBA')
    crop = im.crop((120, 0, 340, 220)).resize((size, size), Image.LANCZOS)
    crop = ImageEnhance.Contrast(crop).enhance(1.12).filter(ImageFilter.UnsharpMask(2, 60, 2))
    # vignette
    v = Image.new('L', (size, size), 0); d = ImageDraw.Draw(v)
    for i in range(40):
        r = size * (0.75 - i * 0.006)
        d.ellipse((size/2-r, size/2-r, size/2+r, size/2+r), fill=int(255 * i / 40))
    v = v.filter(ImageFilter.GaussianBlur(size / 20))
    dark = Image.new('RGBA', (size, size), BG)
    return Image.composite(crop, dark, v)

def framed(S, inner_ratio, rounded):
    canvas = Image.new('RGBA', (S, S), BG)
    n = int(S * inner_ratio)
    f = face(n)
    mask = Image.new('L', (n, n), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, n - 1, n - 1), fill=255)
    off = (S - n) // 2
    canvas.paste(f, (off, off), mask)
    d = ImageDraw.Draw(canvas)
    w = max(2, S // 64)
    d.ellipse((off - w, off - w, off + n + w, off + n + w), outline=GOLD_D, width=w * 2)
    d.ellipse((off - w // 2, off - w // 2, off + n + w // 2, off + n + w // 2), outline=GOLD, width=w)
    if rounded:  # coins arrondis pour l'icône « any »
        m = Image.new('L', (S, S), 0)
        ImageDraw.Draw(m).rounded_rectangle((0, 0, S - 1, S - 1), radius=S // 5, fill=255)
        out = Image.new('RGBA', (S, S), (0, 0, 0, 0)); out.paste(canvas, (0, 0), m); return out
    return canvas

for s in (192, 512):
    framed(s, 0.86, True).save(f'{OUT}/icon-{s}.png', optimize=True)
    framed(s, 0.66, False).save(f'{OUT}/icon-maskable-{s}.png', optimize=True)  # zone sûre 80 %
framed(180, 0.80, False).save(f'{OUT}/apple-touch-icon.png', optimize=True)
framed(64, 0.92, True).save(f'{OUT}/favicon-64.png', optimize=True)
print('ok')
