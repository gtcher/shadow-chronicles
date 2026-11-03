#!/bin/sh
# Construit la salle d'écoute autonome : tools/audio-lab/dist/salle-ecoute.html
set -e
cd "$(dirname "$0")/../.."
mkdir -p tools/audio-lab/dist
npx rolldown tools/audio-lab/entry.ts --format iife --minify -o tools/audio-lab/dist/scaudio.js >/dev/null
python3 - <<'PY'
import base64
src = open('tools/audio-lab/lab.src.html', encoding='utf8').read()
js = open('tools/audio-lab/dist/scaudio.js', encoding='utf8').read()
ogg = base64.b64encode(open('public/assets/audio/music-lyre-akar.ogg', 'rb').read()).decode()
out = src.replace('/*__BUNDLE__*/', js).replace('/*__LYRE__*/', ogg)
open('tools/audio-lab/dist/salle-ecoute.html', 'w', encoding='utf8').write(out)
print('ok', len(out) // 1024, 'Ko')
PY
