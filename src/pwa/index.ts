/**
 * PWA côté page : enregistre le service worker (build de production uniquement),
 * propose la mise à jour quand une nouvelle version est prête, et expose l'installation.
 *
 *   import { pwa } from './pwa';   pwa.canInstall → bool ; await pwa.install() ; pwa.onChange(fn)
 *
 * L'UI peut afficher son propre bouton « Installer » : `pwa.ownInstallButton = true` désactive le
 * petit bandeau par défaut.
 */
interface BeforeInstallPromptEvent extends Event { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> }

const DISMISS_KEY = 'sc-pwa-install-dismissed';
let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((f) => f());

export const pwa = {
  get canInstall(): boolean { return !!deferred; },
  get installed(): boolean { return matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true; },
  /** iPhone/iPad : pas d'invite automatique, il faut « Partager → Sur l'écran d'accueil ». */
  get isIos(): boolean { return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); },
  ownInstallButton: false,
  updateReady: false,
  async install(): Promise<boolean> {
    if (!deferred) return false;
    const d = deferred; deferred = null; emit();
    await d.prompt();
    return (await d.userChoice).outcome === 'accepted';
  },
  applyUpdate(): void { waiting?.postMessage('skip-waiting'); },
  onChange(fn: () => void): () => void { listeners.add(fn); return () => listeners.delete(fn); },
};

let waiting: ServiceWorker | null = null;

function toast(html: string, actions: [string, () => void][], ttl = 0): void {
  document.getElementById('sc-pwa-toast')?.remove();
  const el = document.createElement('div');
  el.id = 'sc-pwa-toast';
  el.setAttribute('role', 'status');
  el.style.cssText = 'position:fixed;left:50%;bottom:calc(16px + env(safe-area-inset-bottom));transform:translateX(-50%);z-index:9999;'
    + 'display:flex;gap:10px;align-items:center;max-width:calc(100vw - 32px);padding:10px 12px 10px 16px;border-radius:12px;'
    + 'background:rgba(7,17,31,.94);border:1px solid #937444;color:#f1e5ca;font:500 14px/1.3 Georgia,serif;box-shadow:0 8px 30px #000a;';
  el.innerHTML = `<span style="flex:1">${html}</span>`;
  for (const [label, fn] of actions) {
    const b = document.createElement('button');
    b.textContent = label;
    b.style.cssText = 'flex:none;padding:7px 12px;border-radius:8px;border:1px solid #937444;cursor:pointer;font:600 13px Georgia,serif;'
      + (label === '×' ? 'background:none;color:#cbb88f;' : 'background:linear-gradient(#d5b77e,#937444);color:#1a1206;');
    b.onclick = () => { el.remove(); fn(); };
    el.append(b);
  }
  document.body.append(el);
  if (ttl) setTimeout(() => el.remove(), ttl);
}

function dismissed(): boolean { try { return localStorage.getItem(DISMISS_KEY) === '1'; } catch { return false; } }
function dismiss(): void { try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* navigation privée */ } }

export function initPwa(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator) || !isSecureContext) return;

  addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent; emit();
    if (!pwa.ownInstallButton && !dismissed()) {
      setTimeout(() => deferred && !pwa.ownInstallButton && toast('Installer <b>Shadow Chronicles</b> : plein écran et jeu hors ligne.',
        [['Installer', () => void pwa.install()], ['×', dismiss]], 15000), 4000);
    }
  });
  addEventListener('appinstalled', () => { deferred = null; emit(); });

  // Sauvegardes (IndexedDB) protégées du nettoyage automatique du navigateur.
  void navigator.storage?.persist?.().catch(() => {});

  navigator.serviceWorker.register('./sw.js', { scope: './' }).then((reg) => {
    const onWaiting = (sw: ServiceWorker) => {
      waiting = sw; pwa.updateReady = true; emit();
      toast('Une nouvelle version du jeu est prête.', [['Recharger', () => pwa.applyUpdate()], ['×', () => {}]]);
    };
    if (reg.waiting && navigator.serviceWorker.controller) onWaiting(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const sw = reg.installing;
      sw?.addEventListener('statechange', () => {
        if (sw.state !== 'installed') return;
        if (navigator.serviceWorker.controller) onWaiting(sw);
        else toast('Jeu disponible hors ligne.', [], 3500);
      });
    });
    // Vérifie les mises à jour au retour sur l'onglet (au plus toutes les 30 min).
    let last = Date.now();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && Date.now() - last > 30 * 60e3) { last = Date.now(); void reg.update(); }
    });
  }).catch((err) => console.warn('[pwa] service worker non enregistré', err));

  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (pwa.updateReady && !reloading) { reloading = true; location.reload(); }
  });
  (window as unknown as { pwa: unknown }).pwa = pwa;
}
