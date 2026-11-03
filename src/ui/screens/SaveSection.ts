import { h, fmt } from '../dom';
import type { SaveTools } from '../saveBridge';

/** Bloc « Sauvegarde » des réglages : état, export fichier, import en deux étapes (aperçu puis confirmation). */
export function saveSection(t: SaveTools): HTMLElement {
  const msg = h('small', { style: { display: 'block', color: 'var(--mute)' } }, t.status());
  const body = h('div', { style: { display: 'grid', gap: '10px' } });
  const file = h('input', { type: 'file', accept: '.json,application/json', hidden: true,
    onchange: async () => {
      const f = file.files?.[0]; file.value = '';
      if (!f) return;
      try { confirmStep(await t.preview(f)); } catch (e) { msg.textContent = (e as Error).message; msg.style.color = 'var(--blood-hi)'; }
    } }) as HTMLInputElement;
  const base = () => body.replaceChildren(
    h('div', { class: 'sc-row', style: { justifyContent: 'flex-start' } },
      h('button', { class: 'sc-btn', onclick: () => void t.exportFile() }, '⭳ Exporter'),
      h('button', { class: 'sc-btn', onclick: () => file.click() }, '⭱ Importer')),
    msg, file);
  const confirmStep = (p: Awaited<ReturnType<SaveTools['preview']>>) => {
    const s = p.summary;
    body.replaceChildren(h('div', { class: 'sc-next', style: { margin: 0 } }, h('i', {}, '⚠'),
      h('div', {}, h('b', {}, p.source === 'prototype' ? 'Sauvegarde du prototype' : 'Remplacer ta sauvegarde ?'),
        h('div', { style: { fontSize: '0.88em', color: 'var(--mute)' } },
          `${fmt(s.eclats)} ✦ · ${fmt(s.poussiere)} ✧ · ${s.sceaux} ♛ · record vague ${s.bestWave} · ${s.runs} runs · ${s.achievements} succès${s.hasRun ? ' · expédition en cours' : ''}`),
        ...p.warnings.map((w) => h('div', { style: { fontSize: '0.8em', color: '#ffb07a' } }, w)),
        h('div', { style: { fontSize: '0.8em', color: 'var(--mute)' } }, 'Une copie de secours de ta sauvegarde actuelle est faite avant.'))),
    h('div', { class: 'sc-row', style: { justifyContent: 'flex-start' } },
      h('button', { class: 'sc-btn sc-primary', onclick: async () => { if (!(await t.apply(p))) { msg.textContent = 'Import impossible.'; base(); } } }, 'Importer'),
      h('button', { class: 'sc-btn sc-ghost', onclick: base }, 'Annuler')));
  };
  base();
  return h('fieldset', {}, h('legend', {}, 'Sauvegarde'), body);
}
