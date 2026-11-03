/** Mini-aide DOM (pas de framework : l'UI reste légère pour le mobile). */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, unknown> = {}, ...kids: Array<Node | string | null | undefined | false>): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = String(v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'html') el.innerHTML = String(v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    else if (k.startsWith('--')) el.style.setProperty(k, String(v));
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of kids) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

export function fmt(n: number): string { return Math.round(n).toLocaleString('fr-FR'); }

/** Compteur animé (écran de fin). */
export function countUp(el: HTMLElement, to: number, ms = 900, prefix = ''): void {
  const t0 = performance.now();
  const step = (t: number) => {
    const k = Math.min(1, (t - t0) / ms);
    el.textContent = prefix + fmt(to * (1 - Math.pow(1 - k, 3)));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/** Navigation clavier/manette dans un écran : flèches + Entrée, focus piégé. */
export function focusTrap(root: HTMLElement): () => void {
  const items = () => [...root.querySelectorAll<HTMLElement>('button:not([disabled]), select, input, [tabindex="0"]')];
  const onKey = (e: KeyboardEvent) => {
    const list = items();
    if (!list.length) return;
    const i = list.indexOf(document.activeElement as HTMLElement);
    if (['ArrowDown', 'ArrowRight'].includes(e.key) && !(document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLSelectElement)) {
      e.preventDefault(); list[(i + 1) % list.length].focus();
    } else if (['ArrowUp', 'ArrowLeft'].includes(e.key) && !(document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLSelectElement)) {
      e.preventDefault(); list[(i - 1 + list.length) % list.length].focus();
    } else if (e.key === 'Tab') {
      e.preventDefault(); list[(i + (e.shiftKey ? -1 : 1) + list.length) % list.length].focus();
    }
  };
  window.addEventListener('keydown', onKey, true);
  return () => window.removeEventListener('keydown', onKey, true);
}
