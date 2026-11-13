/**
 * Empêche tout zoom de la page sur mobile (le jeu se « zoomait » tout seul et on ne pouvait
 * plus revenir) :
 * - deux pouces posés à la fois (joystick + attaque) étaient pris pour un pincement par iOS Safari,
 *   qui ignore `user-scalable=no` depuis iOS 10 → on annule les gestes et les déplacements à 2 doigts ;
 * - un double appui rapide sur le jeu zoomait aussi → annulé hors des menus ;
 * - si la page est malgré tout zoomée (ancienne version, réglage d'accessibilité…), on la remet à 1.
 * Le défilement d'un doigt dans les menus reste possible.
 */
export function blockPageZoom(): void {
  const opts: AddEventListenerOptions = { passive: false };
  const stop = (e: Event) => { if (e.cancelable) e.preventDefault(); };

  // iOS Safari : événements de pincement propriétaires.
  for (const t of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(t, stop, opts);
  // Pincement à deux doigts (tous navigateurs) : pas de zoom, les pointeurs du jeu continuent.
  document.addEventListener('touchmove', (e) => { if (e.touches.length > 1) stop(e); }, opts);
  // Ctrl + molette / trackpad (ordinateur) et raccourcis Ctrl + / − / 0.
  addEventListener('wheel', (e) => { if (e.ctrlKey) stop(e); }, opts);
  addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && ['+', '-', '=', '0'].includes(e.key)) stop(e); });

  // Double appui : en jeu (hors menus) le second appui rapproché est annulé.
  let lastEnd = 0;
  document.addEventListener('touchend', (e) => {
    const now = e.timeStamp;
    const inMenu = (e.target as Element | null)?.closest?.('.sc-screen, input, textarea, select');
    if (!inMenu && now - lastEnd < 350 && e.touches.length === 0) stop(e);
    lastEnd = now;
  }, opts);
  document.addEventListener('dblclick', (e) => { if (!(e.target as Element | null)?.closest?.('.sc-screen')) stop(e); }, opts);

  // Si la page est zoomée quand même, on la ramène à l'échelle 1.
  const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  const base = meta?.content ?? '';
  const vv = window.visualViewport;
  let resetting = false;
  const reset = () => {
    if (!vv || !meta || resetting || vv.scale <= 1.01) return;
    resetting = true;
    // Réécrire la balise (avec une valeur légèrement différente) force le navigateur à la relire.
    meta.content = 'width=device-width,initial-scale=1.0,minimum-scale=1.0,maximum-scale=1.0,user-scalable=0,viewport-fit=cover';
    requestAnimationFrame(() => { meta.content = base; window.scrollTo(0, 0); resetting = false; });
  };
  vv?.addEventListener('resize', reset);
  vv?.addEventListener('scroll', () => { if (vv.scale > 1.01) reset(); });
}
