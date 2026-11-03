"""Décors peints procéduraux par chapitre : pilier brisé, stèle, brasero animé,
cristal, gravats, arche. Volume obtenu par carte de hauteur + lumière haut-gauche,
même convention que les tuiles."""
import os, sys, json
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage
from palettes import CHAPTERS, hx

OUT = sys.argv[1]
rng = np.random.default_rng(7)


def noise(h, w, s):
    n = ndimage.gaussian_filter(rng.random((h, w)), s)
    return (n - n.min()) / (n.max() - n.min() + 1e-9)


def ramp(t, cols):
    cols = np.array([hx(c) for c in cols], float)
    t = np.clip(t, 0, 1) * (len(cols) - 1)
    i = np.clip(t.astype(int), 0, len(cols) - 2)
    f = (t - i)[..., None]
    return cols[i] * (1 - f) + cols[i + 1] * f


def shade(mask, cols, rimcol, bump=1.0, rough=1.0):
    """Transforme un masque en volume peint."""
    h, w = mask.shape
    d = ndimage.distance_transform_edt(mask)
    hgt = np.sqrt(np.clip(d / 18, 0, 1)) + (noise(h, w, 2) - .5) * .35 * rough + (noise(h, w, 7) - .5) * .4 * rough
    hgt = ndimage.gaussian_filter(hgt, 1.2) * bump
    gy, gx = np.gradient(hgt)
    l = np.clip((gx + gy) * 9, -1, 1)
    tone = .45 + l * .35 + (noise(h, w, 4) - .5) * .25
    # occlusion vers le bas (posé au sol)
    yy = np.linspace(0, 1, h)[:, None]
    tone = tone - np.clip(yy - .75, 0, 1) * 1.2
    col = ramp(tone, cols)
    # liseré d'ambiance (contre-jour) sur le bord droit/haut
    edge = mask & (d < 3)
    rimm = edge & (ndimage.shift(mask.astype(float), (0, -3), order=0) < .5)
    col[rimm] = col[rimm] * .4 + np.array(hx(rimcol)) * .6
    rgba = np.zeros((h, w, 4))
    rgba[..., :3] = col
    rgba[..., 3] = ndimage.gaussian_filter(mask.astype(float), .7) * 255
    return rgba


def to_img(rgba):
    return Image.fromarray(np.clip(rgba, 0, 255).astype(np.uint8), 'RGBA')


def poly_mask(w, h, polys):
    im = Image.new('L', (w, h), 0)
    d = ImageDraw.Draw(im)
    for p in polys:
        d.polygon(p, fill=255)
    return np.asarray(im) > 127


def stone_cols(p):
    s = p["sol"]
    return [p["ombre"], s[0], s[1], s[2], s[3], "#9aa4ae" if p is CHAPTERS["ch1"] else s[3]]


def pillar(p):
    w, h = 200, 380
    top = [(60, 80), (75, 60), (100, 72), (118, 50), (140, 78), (140, 330), (60, 330)]
    base = [(40, 330), (160, 330), (165, 372), (35, 372)]
    cap = [(50, 300), (150, 300), (150, 330), (50, 330)]
    m = poly_mask(w, h, [top, base, cap])
    rgba = shade(m, stone_cols(p), p["brume"])
    # cannelures
    for x in (78, 100, 122):
        rgba[85:300, x - 1:x + 2, :3] *= .7
    return to_img(rgba)


def stele(p):
    w, h = 180, 260
    im = Image.new('L', (w, h), 0)
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((40, 40, 140, 240), 40, fill=255)
    d.rectangle((40, 100, 140, 240), fill=255)
    d.rectangle((25, 225, 155, 255), fill=255)
    m = np.asarray(im) > 127
    m &= ~poly_mask(w, h, [[(120, 40), (145, 40), (145, 90), (128, 70)]])  # coin brisé
    rgba = shade(m, stone_cols(p), p["brume"])
    # rune lumineuse
    g = Image.new('L', (w, h), 0)
    gd = ImageDraw.Draw(g)
    gd.ellipse((70, 95, 110, 135), outline=255, width=3)
    gd.line((90, 85, 90, 175), fill=255, width=3)
    gd.line((72, 150, 108, 150), fill=255, width=3)
    gm = np.asarray(g.filter(ImageFilter.GaussianBlur(1))) / 255
    glow = np.asarray(g.filter(ImageFilter.GaussianBlur(6))) / 255 * 1.6
    c = np.array(hx(p["lueur"]), float)
    a = np.clip(gm + glow * .5, 0, 1)[..., None]
    rgba[..., :3] = rgba[..., :3] * (1 - a) + c * a
    return to_img(rgba)


def rubble(p):
    w, h = 260, 150
    polys = []
    for _ in range(9):
        cx, cy = rng.uniform(40, 220), rng.uniform(70, 130)
        r = rng.uniform(14, 38)
        n = 7
        polys.append([(cx + np.cos(a) * r * rng.uniform(.7, 1.1), cy + np.sin(a) * r * .7 * rng.uniform(.7, 1.1))
                      for a in np.linspace(0, 2 * np.pi, n, endpoint=False)])
    m = poly_mask(w, h, polys)
    return to_img(shade(m, stone_cols(p), p["brume"], rough=1.4))


def arch(p):
    w, h = 420, 400
    im = Image.new('L', (w, h), 0)
    d = ImageDraw.Draw(im)
    d.rectangle((40, 120, 110, 380), fill=255)
    d.rectangle((310, 200, 380, 380), fill=255)
    d.pieslice((40, 30, 380, 330), 180, 360, fill=255)
    d.rectangle((310, 180, 380, 380), fill=255)
    d.rectangle((25, 360, 125, 395), fill=255)
    d.rectangle((295, 360, 395, 395), fill=255)
    m = np.asarray(im) > 127
    inner = Image.new('L', (w, h), 0)
    ImageDraw.Draw(inner).ellipse((110, 100, 310, 400), fill=255)
    m &= ~(np.asarray(inner) > 127)
    # brisure de l'arche à droite
    m &= ~poly_mask(w, h, [[(285, 0), (420, 0), (420, 150), (345, 140), (315, 95), (300, 60)]])
    return to_img(shade(m, stone_cols(p), p["brume"]))


def crystal(p):
    w, h = 200, 300
    polys = [[(100, 20), (130, 120), (110, 280), (82, 280), (70, 120)],
             [(55, 120), (75, 170), (70, 285), (45, 285), (38, 180)],
             [(150, 100), (165, 190), (150, 285), (125, 285), (128, 170)]]
    m = poly_mask(w, h, polys)
    lu = p["lueur"]
    cols = [p["ombre"], p["sol"][2], lu, "#ffffff"]
    rgba = shade(m, cols, "#ffffff", bump=1.6, rough=.4)
    # facettes : bandes claires
    yy, xx = np.mgrid[0:h, 0:w]
    fac = (np.sin((xx * .9 + yy * .35) / 9) > .75) & m
    rgba[fac, :3] = rgba[fac, :3] * .5 + np.array(hx("#ffffff")) * .5
    # halo
    glow = ndimage.gaussian_filter(m.astype(float), 14) * 1.3
    out = np.zeros_like(rgba)
    c = np.array(hx(lu), float)
    a_h = np.clip(glow * .7, 0, .6)
    a_c = rgba[..., 3] / 255
    out[..., :3] = rgba[..., :3] * a_c[..., None] + c * (a_h * (1 - a_c))[..., None]
    tot = a_c + a_h * (1 - a_c)
    out[..., :3] /= np.maximum(tot, 1e-6)[..., None]
    out[..., 3] = tot * 255
    return to_img(out)


def brazier_frames(p, n=8):
    """Brasero + flamme animée (8 images, boucle)."""
    w, h = 200, 300
    bowl = Image.new('L', (w, h), 0)
    d = ImageDraw.Draw(bowl)
    d.pieslice((40, 130, 160, 220), 0, 180, fill=255)
    d.rectangle((40, 170, 160, 178), fill=255)
    d.polygon([(90, 210), (110, 210), (120, 280), (80, 280)], fill=255)
    d.rectangle((65, 278, 135, 292), fill=255)
    m = np.asarray(bowl) > 127
    metal = shade(m, [p["ombre"], "#120e0b", "#2a2018", "#5a4228", "#9a7a48"], p["lueur"], rough=.6)
    frames = []
    yy, xx = np.mgrid[0:h, 0:w].astype(float)
    base_n = rng.random((h // 4 + 8, w // 4))
    lu = np.array(hx(p["lueur"]), float)
    for i in range(n):
        ph = i / n * 2 * np.pi
        # flamme : silhouette en goutte déformée par bruit défilant
        nn = ndimage.zoom(np.roll(base_n, -i * 2, axis=0), 4, order=1)[:h, :w]
        nn = ndimage.gaussian_filter(nn, 4)
        nn = (nn - nn.min()) / (nn.max() - nn.min())
        cx = 100 + np.sin(ph + yy / 30) * 6 * (1 - yy / 175)
        ty = np.clip((175 - yy) / 140, 0, 1)    # 0 au bol, 1 en haut
        width = 52 * (1 - ty) ** .8 * (1 + .15 * np.sin(ph * 2))
        f = 1 - np.abs(xx - cx) / np.maximum(width, 1e-3)
        f = f + (nn - .5) * .9 - ty * .25
        f = np.where(yy < 178, f, 0)
        core = np.clip(f * 2.2, 0, 1)
        fl = np.zeros((h, w, 4))
        mid = {"ch3": "#e6f6ff", "ch4": "#e2c4ff"}.get(next(k for k, v in CHAPTERS.items() if v is p), "#ffd27a")
        col = ramp(core, ["#000000", p["lueur"], mid, "#fff6ee"])
        fl[..., :3] = col
        fl[..., 3] = np.clip(f * 3, 0, 1) * 255
        glow = ndimage.gaussian_filter(fl[..., 3] / 255, 16) * .8
        img = np.zeros((h, w, 4))
        img[..., :3] = lu
        img[..., 3] = np.clip(glow, 0, .55) * 255
        base = to_img(img)
        base.alpha_composite(to_img(fl))
        mt = metal.copy()
        # lumière de la flamme sur le bol
        mt[..., :3] = mt[..., :3] * .8 + lu * .10 * (1 + .2 * np.sin(ph))
        base.alpha_composite(to_img(mt))
        frames.append(base)
    return frames


def main():
    meta = {}
    for ch, p in CHAPTERS.items():
        d = os.path.join(OUT, 'decor', ch)
        os.makedirs(d, exist_ok=True)
        items = {}
        for name, fn in (("pilier", pillar), ("stele", stele), ("gravats", rubble), ("arche", arch), ("cristal", crystal)):
            im = fn(p)
            im.save(f"{d}/{name}.webp", quality=92)
            items[name] = {"image": f"decor/{ch}/{name}.webp", "w": im.width, "h": im.height, "ancre": [.5, .95]}
        fr = brazier_frames(p)
        S = Image.new('RGBA', (fr[0].width * len(fr), fr[0].height))
        for i, f in enumerate(fr):
            S.alpha_composite(f, (i * f.width, 0))
        S.save(f"{d}/brasero.webp", quality=90)
        items["brasero"] = {"image": f"decor/{ch}/brasero.webp", "frames": len(fr), "w": fr[0].width,
                            "h": fr[0].height, "fps": 12, "ancre": [.5, .97], "lumiere": p["lueur"]}
        meta[ch] = items
        print("decor", ch)
    json.dump(meta, open(os.path.join(OUT, 'decor', 'decor.json'), 'w'), ensure_ascii=False, indent=1)


if __name__ == '__main__':
    main()
