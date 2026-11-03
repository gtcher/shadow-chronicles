"""Planches de sprites animés (format PixiJS) dérivées des illustrations peintes.

Chaque personnage reçoit : idle(8) course(8) attaque(6) touche(3) mort(8).
Les animations sont obtenues par déformation peinte (respiration, appui,
cisaillement de fente, ondulation des capes, dissolution) ancrée aux pieds,
pour rester fidèle aux illustrations d'origine.
"""
import os, sys, json, colorsys
import numpy as np
from PIL import Image, ImageFilter, ImageChops
from scipy import ndimage
from palettes import HEROES, BOSSES, hx

EXT = sys.argv[1]   # dossier des images extraites
OUT = sys.argv[2]

SRC = {
    "taro": "img33.png", "mei": "img2.png", "sena": "img19.png", "ren": "img23.png",
    "raider": "img8.png", "brute": "img11.png", "shadeElite": "img13.png",
    "wolf": "img15.png", "shade": "img18.png",
}
ENEMY_COL = {"raider": "#c8323c", "brute": "#e04a2a", "shadeElite": "#e0303c",
             "wolf": "#e03a30", "shade": "#9a5cff"}

ANIMS = [("idle", 8), ("course", 8), ("attaque", 6), ("touche", 3), ("mort", 8)]


def load(name):
    im = Image.open(os.path.join(EXT, SRC[name])).convert('RGBA')
    if name == "shadeElite":  # retire le titre incrusté « THE CRIMSON JUDGE »
        a = np.asarray(im).copy()
        h = a.shape[0]
        a[int(h * .86):, :, 3] = 0
        im = Image.fromarray(a)
    a = np.asarray(im).copy()
    # nettoie le halo semi-transparent des détourages
    a[..., 3] = np.where(a[..., 3] < 24, 0, a[..., 3])
    im = Image.fromarray(a)
    return im.crop(im.getbbox())


def hue_shift(im, target_hex, strength=1.0, sat_min=.25):
    """Recolore les zones saturées (accents) vers une teinte cible."""
    a = np.asarray(im).astype(float) / 255
    rgb = a[..., :3]
    mx = rgb.max(-1); mn = rgb.min(-1)
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
    tr, tg, tb = [c / 255 for c in hx(target_hex)]
    th, ts, tv = colorsys.rgb_to_hsv(tr, tg, tb)
    # recolorisation : conserve la valeur, impose teinte cible
    import matplotlib.colors as mc
    hsv = mc.rgb_to_hsv(rgb)
    m = np.clip((sat - sat_min) * 3, 0, 1) * strength
    hsv2 = hsv.copy()
    hsv2[..., 0] = th
    hsv2[..., 1] = np.clip(hsv[..., 1] * .7 + ts * .4, 0, 1)
    out = mc.hsv_to_rgb(hsv2)
    rgb = rgb * (1 - m[..., None]) + out * m[..., None]
    a[..., :3] = rgb
    return Image.fromarray((a * 255).astype(np.uint8))


def rim(im, col_hex, width=3, alpha=.85):
    """Liseré lumineux de lecture : sépare le personnage du sol sombre."""
    a = np.asarray(im).astype(float)
    al = a[..., 3] / 255
    dil = ndimage.grey_dilation(al, size=(width * 2 + 1, width * 2 + 1))
    glow = ndimage.gaussian_filter(dil, width * .8)
    ring = np.clip(glow - al, 0, 1) * alpha
    col = np.array(hx(col_hex), float)
    out = np.zeros_like(a)
    tot = al + ring * (1 - al)
    out[..., :3] = (a[..., :3] * al[..., None] + col * ring[..., None] * (1 - al[..., None])) / np.maximum(tot, 1e-6)[..., None]
    out[..., 3] = tot * 255
    # lumière de contre-jour sur le bord haut-droit intérieur
    inner = np.clip(al - ndimage.gaussian_filter(al, 2.5), 0, 1)
    gy, gx = np.gradient(ndimage.gaussian_filter(al, 3))
    facing = np.clip(-gx * 0 + -gy * 1.0 + gx * -.6, 0, None)
    facing = np.clip(facing * 6, 0, 1) * inner * 2.5
    out[..., :3] = out[..., :3] * (1 - facing[..., None] * .6) + col * facing[..., None] * .6
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8))


def fit(im, frame, fill=.86):
    w, h = im.size
    s = min(frame * fill / h, frame * .92 / w)
    return im.resize((max(1, int(w * s)), max(1, int(h * s))), Image.LANCZOS)


def warp(base, frame, sx=1, sy=1, shear=0, dx=0, dy=0, rot=0, wave=0, wave_ph=0):
    """Déforme le sprite autour du point d'ancrage (pieds, centre bas)."""
    w, h = base.size
    a = np.asarray(base).astype(float)
    if wave:
        # ondulation horizontale croissante vers le haut (capes, cheveux)
        rows = np.arange(h)
        amp = wave * ((1 - rows / h) ** 2)
        shift = amp * np.sin(rows / h * 6.0 + wave_ph)
        yy, xx = np.mgrid[0:h, 0:w].astype(float)
        a = np.stack([ndimage.map_coordinates(a[..., c], [yy, xx - shift[:, None]], order=1, mode='constant')
                      for c in range(4)], -1)
    im = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))
    canvas = Image.new('RGBA', (frame, frame), (0, 0, 0, 0))
    ax, ay = frame / 2, frame * .95       # ancrage pieds
    # matrice inverse : pixel sortie -> pixel source
    c, s = np.cos(rot), np.sin(rot)
    M = np.array([[sx * c, -sy * s + shear * sx, 0], [sx * s, sy * c, 0], [0, 0, 1]])
    Mi = np.linalg.inv(M)
    T1 = np.array([[1, 0, -(ax + dx)], [0, 1, -(ay + dy)], [0, 0, 1]])
    T2 = np.array([[1, 0, w / 2], [0, 1, h], [0, 0, 1]])
    A = T2 @ Mi @ T1
    out = im.transform((frame, frame), Image.AFFINE, tuple(A[:2].ravel()), Image.BICUBIC)
    canvas.alpha_composite(out)
    return canvas


def tint(im, col_hex, amt):
    a = np.asarray(im).astype(float)
    col = np.array(hx(col_hex), float)
    a[..., :3] = a[..., :3] * (1 - amt) + col * amt
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))


def dissolve(im, t, col_hex, seed=3):
    a = np.asarray(im).astype(float)
    h, w = a.shape[:2]
    rng = np.random.default_rng(seed)
    n = ndimage.gaussian_filter(rng.random((h, w)), 3)
    n = (n - n.min()) / (n.max() - n.min())
    yy = np.linspace(0, 1, h)[:, None]
    field = n * .7 + (1 - yy) * .3       # se dissout du haut vers le bas
    edge = np.clip(1 - np.abs(field - t) * 14, 0, 1)
    keep = field > t
    col = np.array(hx(col_hex), float)
    a[..., :3] = a[..., :3] * (1 - edge[..., None]) + col * edge[..., None]
    a[..., 3] = np.where(keep, a[..., 3], a[..., 3] * edge)
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))


def smear(frames_imgs, col_hex):
    """Traînée de mouvement : copies fantômes teintées derrière la frappe."""
    base = Image.new('RGBA', frames_imgs[0].size, (0, 0, 0, 0))
    n = len(frames_imgs)
    for i, f in enumerate(frames_imgs[:-1]):
        g = tint(f, col_hex, .85)
        arr = np.asarray(g).astype(float)
        arr[..., 3] *= .28 * (i + 1) / n
        base.alpha_composite(Image.fromarray(arr.astype(np.uint8)))
    base.alpha_composite(frames_imgs[-1])
    return base


def build(name, base, frame, col, heavy=False):
    k = .6 if heavy else 1.0
    seq = {}
    # idle : respiration + ondulation douce
    seq["idle"] = [warp(base, frame, sx=1 - .012 * np.sin(t), sy=1 + .022 * np.sin(t),
                        shear=.015 * np.sin(t + .7) * k, wave=2.2 * k, wave_ph=t)
                   for t in np.linspace(0, 2 * np.pi, 8, endpoint=False)]
    # course : rebond, appui, inclinaison vers l'avant (vers la droite)
    run = []
    for t in np.linspace(0, 2 * np.pi, 8, endpoint=False):
        b = abs(np.sin(t))
        run.append(warp(base, frame, sx=1 + .03 * (1 - b), sy=1 - .04 * (1 - b) + .02 * b,
                        shear=-.10 * k, dy=-frame * .035 * b * k, rot=.03 * np.sin(t) * k,
                        wave=4 * k, wave_ph=t * 2))
    seq["course"] = run
    # attaque : anticipation, fente, impact (flash), retour
    keys = [dict(sx=.97, sy=.96, shear=.10, dx=-frame * .03),
            dict(sx=.95, sy=.93, shear=.16, dx=-frame * .05),
            dict(sx=1.08, sy=1.0, shear=-.24, dx=frame * .07),
            dict(sx=1.06, sy=1.02, shear=-.20, dx=frame * .06),
            dict(sx=1.02, sy=1.0, shear=-.08, dx=frame * .02),
            dict(sx=1.0, sy=1.0, shear=0, dx=0)]
    att = []
    for i, kk in enumerate(keys):
        kk = {a: v * (k if a in ('shear', 'dx') else 1) if a != 'sx' and a != 'sy' else v for a, v in kk.items()}
        f = warp(base, frame, **kk)
        if i == 2:
            ghosts = [warp(base, frame, **keys[1]), warp(base, frame, **keys[2])]
            f = smear(ghosts + [tint(f, '#ffffff', .12)], col)
        if i == 3:
            f = tint(f, col, .12)
        att.append(f)
    seq["attaque"] = att
    # touché : recul + flash blanc puis teinte
    seq["touche"] = [tint(warp(base, frame, shear=.12, dx=-frame * .03, sy=.97), '#ffffff', .65),
                     tint(warp(base, frame, shear=.08, dx=-frame * .02), '#ff4040', .30),
                     warp(base, frame, shear=.03)]
    # mort : bascule, affaissement et dissolution dans la couleur signature
    dead = []
    for i, t in enumerate(np.linspace(0, 1, 8)):
        f = warp(base, frame, rot=-.35 * t, sy=1 - .25 * t, sx=1 + .05 * t, dx=-frame * .04 * t)
        dead.append(dissolve(f, t * 1.05, col))
    seq["mort"] = dead
    return seq


def sheet(name, seq, frame, kind, out_dir):
    cols = max(len(v) for v in seq.values())
    rows = len(seq)
    S = Image.new('RGBA', (cols * frame, rows * frame), (0, 0, 0, 0))
    frames, anims = {}, {}
    for r, (an, fl) in enumerate(seq.items()):
        anims[an] = []
        for c, f in enumerate(fl):
            S.alpha_composite(f, (c * frame, r * frame))
            key = f"{name}_{an}_{c}"
            frames[key] = {"frame": {"x": c * frame, "y": r * frame, "w": frame, "h": frame},
                           "sourceSize": {"w": frame, "h": frame},
                           "spriteSourceSize": {"x": 0, "y": 0, "w": frame, "h": frame},
                           "anchor": {"x": .5, "y": .95}}
            anims[an].append(key)
    os.makedirs(out_dir, exist_ok=True)
    png = f"{name}.webp"
    S.save(os.path.join(out_dir, png), lossless=False, quality=90, method=6)
    meta = {"frames": frames, "animations": anims,
            "meta": {"image": png, "format": "RGBA8888", "size": {"w": S.width, "h": S.height}, "scale": "1",
                     "fps": {"idle": 8, "course": 12, "attaque": 16, "touche": 14, "mort": 10},
                     "orientation": "droite", "type": kind}}
    json.dump(meta, open(os.path.join(out_dir, f"{name}.json"), 'w'), ensure_ascii=False, indent=1)
    return S


def facing_right(im, name):
    # les illustrations regardant à gauche sont retournées : convention = droite
    return im.transpose(Image.FLIP_LEFT_RIGHT) if name in ("taro", "mei", "raider") else im


def main():
    previews = {}
    for name in ("taro", "mei", "sena", "ren"):
        col = HEROES[name]["signature"]
        base = fit(facing_right(load(name), name), 256)
        base = rim(base, HEROES[name]["lumiere"], 2, .75)
        previews[name] = sheet(name, build(name, base, 256, col), 256, "heros", os.path.join(OUT, "sprites/heros"))
        print("hero", name)
    for name in ("raider", "brute", "wolf", "shade", "shadeElite"):
        col = ENEMY_COL[name]
        base = fit(facing_right(load(name), name), 224)
        base = rim(base, col, 2, .55)
        previews[name] = sheet(name, build(name, base, 224, col, heavy=name == "brute"), 224, "ennemi",
                               os.path.join(OUT, "sprites/ennemis"))
        print("enemy", name)
    for bid, b in BOSSES.items():
        src = {"enemy-shadeElite": "shadeElite", "enemy-raider": "raider", "enemy-shade": "shade",
               "enemy-brute": "brute"}[b["source"]]
        im = facing_right(load(src), src)
        if bid != "juge":
            im = hue_shift(im, b["couleur"])
        base = fit(im, 384, .9)
        base = rim(base, b["couleur"], 3, .6)
        previews["boss_" + bid] = sheet("boss_" + bid, build(bid, base, 384, b["couleur"], heavy=True), 384, "boss",
                                        os.path.join(OUT, "sprites/boss"))
        print("boss", bid)


if __name__ == '__main__':
    main()
