"""Palettes officielles de la direction artistique Shadow Chronicles."""

def hx(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))

# Socle commun : nuit bleutée, or patiné, crème. Tout le jeu repose dessus.
BASE = {
    "nuit": "#07101c", "nuit2": "#0f1d2e", "ardoise": "#22344a", "brume": "#4d6380",
    "or": "#d5b77e", "or_sombre": "#937444", "creme": "#f1e5ca", "encre": "#03060c",
}

HEROES = {
    "taro": {"signature": "#e0303c", "secondaire": "#3a0d12", "lumiere": "#ff7a5c", "role": "Lame écarlate (mêlée)"},
    "mei":  {"signature": "#ff3fb4", "secondaire": "#2a0a24", "lumiere": "#ff9be0", "role": "Danseuse d'ombre (assassin)"},
    "sena": {"signature": "#4f8dff", "secondaire": "#0d1a44", "lumiere": "#cfe4ff", "role": "Prêtresse lunaire (magie)"},
    "ren":  {"signature": "#e8b64a", "secondaire": "#101a33", "lumiere": "#7fe0ff", "role": "Archer d'or (distance)"},
}

# 4 chapitres = 4 régions du prototype (regionOf : 1-3, 4-7, 8-10, 11+)
CHAPTERS = {
    "ch1": {
        "nom": "La Cour des Veilleurs", "vagues": "1-3", "ui": "#d9ab74",
        "ambiance": "Ruines d'Akar sous la brume, mousse, torches mourantes, lune voilée.",
        "sol": ["#1b2430", "#2b3644", "#3d4a58", "#56626e"],
        "accent": "#d9ab74", "lueur": "#ffb35c", "vegetal": "#3f5a3a", "brume": "#8aa0b8",
        "ombre": "#05080d",
    },
    "ch2": {
        "nom": "Les Remparts écarlates", "vagues": "4-7", "ui": "#ea7683",
        "ambiance": "Remparts en feu, braises, bannières déchirées du Culte, sang séché.",
        "sol": ["#1d1013", "#33191b", "#4a2723", "#6a3a2c"],
        "accent": "#ea7683", "lueur": "#ff7a2a", "vegetal": "#2a1a14", "brume": "#b25a48",
        "ombre": "#080304",
    },
    "ch3": {
        "nom": "La Nécropole lunaire", "vagues": "8-10", "ui": "#9ccaff",
        "ambiance": "Tombeaux de marbre, givre, cristaux lunaires, reflets d'eau noire.",
        "sol": ["#0e1626", "#1a2940", "#2c4260", "#4f6c8e"],
        "accent": "#9ccaff", "lueur": "#bfe6ff", "vegetal": "#25384a", "brume": "#a9c8ee",
        "ombre": "#03060e",
    },
    "ch4": {
        "nom": "La Porte de l'Éclipse", "vagues": "11-20+", "ui": "#c69dff",
        "ambiance": "Obsidienne fracturée, failles du Néant, éclipse, poussière d'étoiles.",
        "sol": ["#0d0a17", "#1b1430", "#2c2148", "#45346a"],
        "accent": "#c69dff", "lueur": "#b46bff", "vegetal": "#1c1430", "brume": "#7d5cc0",
        "ombre": "#040208",
    },
}

BOSSES = {
    "juge":      {"nom": "Le Juge Pourpre", "chapitre": "ch3", "couleur": "#e0303c", "source": "enemy-shadeElite"},
    "cendrefer": {"nom": "Le Capitaine Cendrefer", "chapitre": "ch2", "couleur": "#ef955a", "source": "enemy-raider"},
    "matriarche": {"nom": "La Matriarche lunaire", "chapitre": "ch3", "couleur": "#86cfff", "source": "enemy-shade"},
    "arbitre":   {"nom": "L'Arbitre de l'Éclipse", "chapitre": "ch4", "couleur": "#cd91ef", "source": "enemy-shadeElite"},
    "souverain": {"nom": "Le Souverain des Ruines", "chapitre": "ch4", "couleur": "#ffc878", "source": "enemy-brute"},
}
