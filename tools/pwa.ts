/**
 * Plugin Vite « PWA maison » (sans dépendance) : après le build, liste tous les fichiers de dist/,
 * calcule une empreinte par fichier et écrit dist/sw.js à partir de src/pwa/sw-template.js.
 * Une mise à jour ne retélécharge que les fichiers dont l'empreinte a changé.
 */
import type { Plugin } from 'vite';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/** Fichiers jamais mis en cache hors ligne (outils, cartes de sources). */
const SKIP = [/\.map$/, /^sw\.js$/, /^ui-preview\.html$/, /(^|\/)\.DS_Store$/];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

export function pwa(opts: { template: string }): Plugin {
  let outDir = 'dist';
  return {
    name: 'sc-pwa',
    apply: 'build',
    configResolved(c) { outDir = c.build.outDir; },
    closeBundle() {
      const files = walk(outDir)
        .map((p) => relative(outDir, p).split(sep).join('/'))
        .filter((f) => !SKIP.some((r) => r.test(f)))
        .sort();
      const all = createHash('sha256').update(readFileSync(opts.template));
      const entries = files.map((f) => {
        const buf = readFileSync(join(outDir, f));
        const rev = createHash('sha256').update(buf).digest('hex').slice(0, 10);
        all.update(f + rev);
        return [f === 'index.html' ? './' : f, rev, buf.length] as const;
      });
      const version = all.digest('hex').slice(0, 12);
      const bytes = entries.reduce((s, e) => s + e[2], 0);
      const sw = readFileSync(opts.template, 'utf8')
        .replace('__SC_VERSION__', JSON.stringify(version))
        .replace('__SC_PRECACHE__', JSON.stringify(entries.map(([u, r]) => [u, r])));
      writeFileSync(join(outDir, 'sw.js'), sw);
      writeFileSync(join(outDir, 'version.json'), JSON.stringify({ version, files: entries.length, bytes, built: new Date().toISOString() }));
      console.log(`\n[pwa] sw.js : ${entries.length} fichiers, ${(bytes / 1048576).toFixed(1)} Mo, version ${version}`);
    },
  };
}
