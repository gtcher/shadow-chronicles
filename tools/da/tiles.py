"""Tuiles de sol peintes, raccordables (seamless), une famille par chapitre."""
import os, sys, json
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage
from palettes import CHAPTERS, hx

N = 512


def pnoise(n, scale, rng, power=2.0):
    """Bruit périodique (tuile parfaitement) par filtrage FFT."""
    w = rng.standard_normal((n, n))
    f = np.fft.fft2(w)
    ky = np.fft.fftfreq(n)[:, None]
    kx = np.fft.fftfreq(n)[None, :]
    k = np.sqrt(kx ** 2 + ky ** 2) * n / scale
    k[0, 0] = 1
    f = f / (k ** power)
    f[0, 0] = 0
    r = np.real(np.fft.ifft2(f))
    r = (r - r.min()) / (r.max() - r.min())
    return r


def fbm(n, rng, octaves=((4, 1), (12, .5), (40, .25), (110, .12))):
    out = np.zeros((n, n))
    for s, a in octaves:
        out += pnoise(n, s, rng, 1.6) * a
    out = (out - out.min()) / (out.max() - out.min())
    return out


def voronoi(n, cells, rng, jitter=.8):
    """Voronoï périodique : renvoie id de cellule, F1, F2."""
    g = cells
    pts = []
    for j in range(g):
        for i in range(g):
            pts.append(((i + .5 + (rng.random() - .5) * jitter) / g * n,
                        (j + .5 + (rng.random() - .5) * jitter) / g * n))
    pts = np.array(pts)
    yy, xx = np.mgrid[0:n, 0:n].astype(float)
    f1 = np.full((n, n), 1e9); f2 = np.full((n, n), 1e9); cid = np.zeros((n, n), int)
    for ox in (-n, 0, n):
        for oy in (-n, 0, n):
            for idx, (px, py) in enumerate(pts):
                d = np.hypot(xx - (px + ox), yy - (py + oy))
                closer = d < f1
                f2 = np.where(closer, f1, np.minimum(f2, d))
                cid = np.where(closer, idx, cid)
                f1 = np.where(closer, d, f1)
    return cid, f1, f2


def ramp(t, cols):
    cols = np.array([hx(c) for c in cols], float)
    t = np.clip(t, 0, 1) * (len(cols) - 1)
    i = np.clip(t.astype(int), 0, len(cols) - 2)
    f = (t - i)[..., None]
    return cols[i] * (1 - f) + cols[i + 1] * f


def light(height, strength=2.2):
    """Éclairage simple venant du haut-gauche (convention du guide)."""
    gy, gx = np.gradient(height)
    l = (gx + gy) * strength
    return np.clip(l, -1, 1)


def painterly(img, size=5):
    im = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8))
    # tuile 3x3 pour garder le raccord après le filtre
    big = Image.new('RGB', (N * 3, N * 3))
    for i in range(3):
        for j in range(3):
            big.paste(im, (i * N, j * N))
    big = big.filter(ImageFilter.ModeFilter(size)).filter(ImageFilter.SMOOTH)
    return np.asarray(big.crop((N, N, 2 * N, 2 * N))).astype(float)


def flagstones(ch, rng, cells=4, wear=0.0):
    p = CHAPTERS[ch]
    cid, f1, f2 = voronoi(N, cells, rng, .55)
    edge = f2 - f1
    n1 = fbm(N, rng)
    n2 = pnoise(N, 70, rng, 1.2)
    edge = edge + (n2 - .5) * 6
    mortar = np.clip(1 - edge / 4.0, 0, 1)
    t = np.clip(edge / 40.0, 0, 1)
    bevel = t * t * (3 - 2 * t)
    tone = rng.random(cells * cells)[cid]
    h = bevel * .55 + n1 * .35 + n2 * .1
    base = ramp(.2 + tone * .3 + (n1 - .5) * .4, p["sol"])
    l = light(ndimage.gaussian_filter(h, 1.5, mode='wrap') * 40, .9)
    col = base * (1 + l[..., None] * .45)
    dark = np.array(hx(p["sol"][0]), float)
    col = col * (1 - mortar[..., None]) + dark * mortar[..., None] * (.6 + n2[..., None] * .5)
    # fissures fines
    cr = pnoise(N, 18, rng, 1.0)
    crack = np.clip(1 - np.abs(cr - .5) * 40, 0, 1) * (n1 > .55)
    col = col * (1 - crack[..., None] * .6)
    if wear > 0:
        dirt = fbm(N, rng)
        m = np.clip((dirt - (1 - wear)) * 3 + .15, 0, 1)[..., None]
        col = col * (1 - m) + dirt_layer(ch, rng) * m
    # occlusion douce
    col *= (.82 + .18 * n1[..., None])
    return painterly(col)


def dirt_layer(ch, rng):
    p = CHAPTERS[ch]
    n = fbm(N, rng)
    peb_id, f1, f2 = voronoi(N, 16, rng, .9)
    rad = (4 + rng.random(256) * 9)[peb_id] * (rng.random(256)[peb_id] > .6)
    peb = np.sqrt(np.clip(1 - (f1 / np.maximum(rad, .1)) ** 2, 0, 1))
    h = n * .6 + peb * .8
    l = light(h * 25, .8)
    base = ramp(.15 + n * .55 + peb * .25, p["sol"])
    return base * (1 + l[..., None] * .5)


def dirt(ch, rng):
    return painterly(dirt_layer(ch, rng))


def decal(ch, rng):
    """Calque RGBA spécifique au chapitre à superposer sur les dalles."""
    p = CHAPTERS[ch]
    n = fbm(N, rng)
    yy, xx = np.mgrid[0:N, 0:N]
    rgba = np.zeros((N, N, 4))
    if ch == "ch1":  # mousse et herbes
        det = pnoise(N, 90, rng, 1.1)
        m = np.clip((n * .7 + det * .3 - .6) * 6, 0, 1)
        c = ramp(det * .7 + n * .3, ["#141f16", p["vegetal"], "#5d7748"])
        rgba[..., :3] = c; rgba[..., 3] = m * 210
    elif ch == "ch2":  # braises et sang séché
        blood = np.clip((n - .6) * 6, 0, 1) * (.6 + .4 * pnoise(N, 80, rng, 1.2))
        ee = pnoise(N, 60, rng, 1.4)
        emb = np.clip((ee - .78) * 8, 0, 1) * np.clip((n - .35) * 3, 0, 1)
        c = ramp(n, ["#3a0608", "#6a0d10"]) * (1 - emb[..., None]) + np.array(hx(p["lueur"])) * emb[..., None]
        rgba[..., :3] = c; rgba[..., 3] = np.maximum(blood * 200, emb * 255)
    elif ch == "ch3":  # givre
        fr = np.clip((n - .62) * 4, 0, 1)
        vv = pnoise(N, 14, rng, 1.9)
        vein = np.clip(1 - np.abs(vv - .5) * 40, 0, 1)
        c = ramp(n, ["#9fc4e8", "#e6f4ff"])
        rgba[..., :3] = c; rgba[..., 3] = np.clip(fr * 90 + vein * fr * 180, 0, 210)
    else:  # failles du Néant
        r = pnoise(N, 5, rng, 2.2) + pnoise(N, 40, rng, 1.8) * .08
        r = (r - r.min()) / (r.max() - r.min())
        rift = np.clip(1 - np.abs(r - .5) * 40, 0, 1) ** 1.5
        glow = ndimage.gaussian_filter(rift, 4, mode='wrap')
        glow = glow / glow.max()
        c = ramp(rift, [p["lueur"], "#e9d4ff"])
        rgba[..., :3] = c; rgba[..., 3] = np.clip(rift * 255 + glow * 140, 0, 255)
    return Image.fromarray(np.clip(rgba, 0, 255).astype(np.uint8), 'RGBA')


def save(arr, path):
    Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8)).save(path, quality=92)


def main(out):
    meta = {}
    for k, ch in enumerate(CHAPTERS):
        d = os.path.join(out, 'tiles', ch)
        os.makedirs(d, exist_ok=True)
        rng = np.random.default_rng(100 + k)
        files = {}
        save(flagstones(ch, rng, 6), f'{d}/dalles_a.webp'); files['dalles_a'] = f'tiles/{ch}/dalles_a.webp'
        save(flagstones(ch, rng, 5, wear=.0), f'{d}/dalles_b.webp'); files['dalles_b'] = f'tiles/{ch}/dalles_b.webp'
        save(flagstones(ch, rng, 6, wear=.45), f'{d}/dalles_usees.webp'); files['dalles_usees'] = f'tiles/{ch}/dalles_usees.webp'
        save(dirt(ch, rng), f'{d}/terre.webp'); files['terre'] = f'tiles/{ch}/terre.webp'
        decal(ch, rng).save(f'{d}/calque.webp', quality=92, lossless=False); files['calque'] = f'tiles/{ch}/calque.webp'
        meta[ch] = files
        print('tiles', ch)
    return meta


if __name__ == '__main__':
    print(json.dumps(main(sys.argv[1]), indent=1))
