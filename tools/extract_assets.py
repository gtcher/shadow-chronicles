#!/usr/bin/env python3
"""Extrait les assets base64 du prototype (index.html) vers des fichiers.

Usage : python3 tools/extract_assets.py <prototype.html> <dossier_sortie>
Produit aussi <dossier_sortie>/manifest.json : { "cle": "assets/dossier/fichier.ext" }.
L'extension suit le vrai type MIME (certaines cles du prototype disent .webp mais sont des PNG).
Quand une cle est definie plusieurs fois (correctifs empiles), la derniere version gagne.
"""
import base64, json, os, re, sys

FOLDERS = [("hero-", "heroes"), ("enemy-", "enemies"), ("portrait-", "portraits"),
           ("skill-", "skills"), ("item-", "items"), ("music", "audio"), ("ui-", "ui")]

def folder(name: str) -> str:
    for prefix, f in FOLDERS:
        if name.startswith(prefix):
            return f
    return "environment"

def main(src: str, out_dir: str) -> None:
    s = open(src, encoding="utf-8").read()
    found = {}
    for m in re.finditer(r'"([a-zA-Z0-9_.-]+)":"data:(?:image|audio)/([a-z0-9]+);base64,([A-Za-z0-9+/=]+)"', s):
        found[m.group(1).rsplit(".", 1)[0]] = (m.group(2), m.group(3))
    m = re.search(r'url\("data:image/(webp|png);base64,([A-Za-z0-9+/=]+)', s)
    if m:
        found["ui-modal-bg"] = (m.group(1), m.group(2))
    m = re.search(r"musicTrack\.src='data:audio/(ogg);base64,([A-Za-z0-9+/=]+)", s)
    if m:
        found["music-lyre-akar"] = (m.group(1), m.group(2))
    manifest = {}
    for key, (ext, b64) in sorted(found.items()):
        rel = f"{folder(key)}/{key}.{ext}"
        os.makedirs(os.path.join(out_dir, folder(key)), exist_ok=True)
        with open(os.path.join(out_dir, rel), "wb") as fh:
            fh.write(base64.b64decode(b64))
        manifest[key] = "assets/" + rel
    with open(os.path.join(out_dir, "manifest.json"), "w") as fh:
        json.dump(manifest, fh, indent=2)
    print(f"{len(manifest)} assets extraits dans {out_dir}")

if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
