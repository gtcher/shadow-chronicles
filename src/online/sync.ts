/**
 * Sauvegarde cloud : garde la progression de l'appareil et celle du compte en accord.
 *  - à la connexion (et au lancement si une session existe) : decideSync (rules.ts) ;
 *  - ensuite : envoi groupé ~20 s après un changement, à la fin de chaque run et quand l'onglet se cache ;
 *  - si deux appareils ont avancé chacun de leur côté, le joueur choisit (rien n'est écrasé sans lui).
 */
import type { SaveManager } from '../save';
import { migrate } from '../save';
import type { OnlineService } from './client';
import { decideSync, profileSummary, type CloudSave, type SyncState } from './rules';

const STATE_KEY = 'sc-cloud-sync-v1';
const DEVICE_KEY = 'sc-device-v1';
const PUSH_DELAY_MS = 20_000;

export type SyncStatus = 'off' | 'syncing' | 'ok' | 'conflict' | 'error';

export interface ConflictInfo {
  local: ReturnType<typeof profileSummary>;
  cloud: ReturnType<typeof profileSummary> & { at: string; device: string | null };
  keepLocal: () => Promise<void>;
  takeCloud: () => Promise<void>;
}

function readState(): SyncState | null { try { return JSON.parse(localStorage.getItem(STATE_KEY) ?? 'null') as SyncState | null; } catch { return null; } }
function writeState(s: SyncState | null): void { try { if (s) localStorage.setItem(STATE_KEY, JSON.stringify(s)); else localStorage.removeItem(STATE_KEY); } catch { /* */ } }

/** Nom court de l'appareil (« Android · Chrome »), pour reconnaître d'où vient une sauvegarde. */
export function deviceLabel(): string {
  try {
    const saved = localStorage.getItem(DEVICE_KEY);
    if (saved) return saved;
    const ua = navigator.userAgent;
    const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iPhone/iPad' : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : 'Appareil';
    const br = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Navigateur';
    const label = `${os} · ${br}`;
    localStorage.setItem(DEVICE_KEY, label);
    return label;
  } catch { return 'Appareil'; }
}

export class CloudSync {
  status: SyncStatus = 'off';
  message = '';
  conflict: ConflictInfo | null = null;
  lastSyncAt: number | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private busy: Promise<void> | null = null;
  private listeners = new Set<() => void>();
  private userSeen: string | null = null;

  constructor(private readonly save: SaveManager, private readonly online: OnlineService, private readonly hooks: { onConflict?: (c: ConflictInfo) => void; onPulled?: () => void } = {}) {
    online.onChange(() => {
      const u = online.user?.id ?? null;
      if (u === this.userSeen) return;
      this.userSeen = u;
      if (u) void this.check(); else { this.set('off', ''); writeState(null); }
    });
    save.on('change', (c) => { if (!c.external && this.online.user && this.status !== 'conflict') this.schedule(); });
    if (typeof window !== 'undefined') {
      const now = () => { if (this.timer) { clearTimeout(this.timer); this.timer = null; void this.push(); } };
      window.addEventListener('pagehide', now);
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') now(); });
    }
  }

  onChange(fn: () => void): () => void { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  private set(s: SyncStatus, msg: string): void { this.status = s; this.message = msg; for (const fn of [...this.listeners]) fn(); }

  private schedule(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => { this.timer = null; void this.push(); }, PUSH_DELAY_MS);
  }

  /** Fin de run : envoi sans attendre. */
  pushNow(): void { if (this.timer) { clearTimeout(this.timer); this.timer = null; } void this.push(); }

  private run(job: () => Promise<void>): Promise<void> {
    const p = (this.busy ?? Promise.resolve()).then(job, job);
    this.busy = p.finally(() => { if (this.busy === p) this.busy = null; });
    return p;
  }

  /** Compare l'appareil et le cloud, puis envoie / reprend / demande. */
  check(): Promise<void> {
    return this.run(async () => {
      const user = this.online.user?.id;
      if (!user) return;
      this.set('syncing', 'Synchronisation…');
      try {
        await this.save.flush();
        const cloud = await this.online.fetchSave();
        const d = decideSync(this.save.profile, cloud, readState(), user);
        if (d.action === 'push') await this.doPush(cloud?.rev ?? null, user);
        else if (d.action === 'pull' && cloud) await this.doPull(cloud, user);
        else if (d.action === 'ask' && cloud) this.ask(cloud, user);
        else this.done();
      } catch (e) { this.set('error', e instanceof Error ? e.message : 'Synchronisation impossible'); }
    });
  }

  private push(): Promise<void> {
    return this.run(async () => {
      const user = this.online.user?.id;
      if (!user || this.status === 'conflict') return;
      const st = readState();
      try {
        await this.save.flush(); // l'écriture locale fait monter profile.rev
        if (!st || st.user !== user) { await this.checkInline(user); return; }
        if (st.localRev === this.save.profile.rev) return;
        await this.doPush(st.cloudRev, user);
      } catch (e) { this.set('error', e instanceof Error ? e.message : 'Envoi impossible'); }
    });
  }

  private async checkInline(user: string): Promise<void> {
    const cloud = await this.online.fetchSave();
    const d = decideSync(this.save.profile, cloud, readState(), user);
    if (d.action === 'push') await this.doPush(cloud?.rev ?? null, user);
    else if (d.action === 'ask' && cloud) this.ask(cloud, user);
  }

  private async doPush(expected: number | null, user: string): Promise<void> {
    this.set('syncing', 'Envoi de la sauvegarde…');
    const rev = this.save.profile.rev;
    const res = await this.online.pushSave(this.save.profile, this.save.settings, expected, deviceLabel());
    if (res === 'conflict') {
      // Un autre appareil a écrit entre-temps : on recompare.
      const cloud = await this.online.fetchSave();
      const d = decideSync(this.save.profile, cloud, readState(), user);
      if (cloud && d.action !== 'push') { if (d.action === 'pull') await this.doPull(cloud, user); else this.ask(cloud, user); return; }
      if (cloud) { const again = await this.online.pushSave(this.save.profile, this.save.settings, cloud.rev, deviceLabel()); if (again !== 'conflict') writeState({ user, cloudRev: again, localRev: rev }); }
      this.done();
      return;
    }
    writeState({ user, cloudRev: res, localRev: rev });
    this.done();
  }

  private async doPull(cloud: CloudSave, user: string): Promise<void> {
    const profile = migrate('profile', cloud.profile);
    // Les réglages (volume, qualité…) restent ceux de l'appareil : seule la progression voyage.
    await this.save.replaceFromCloud(profile);
    writeState({ user, cloudRev: cloud.rev, localRev: this.save.profile.rev });
    this.done();
    this.hooks.onPulled?.();
  }

  private ask(cloud: CloudSave, user: string): void {
    const info: ConflictInfo = {
      local: profileSummary(this.save.profile),
      cloud: { ...profileSummary(migrate('profile', cloud.profile)), at: cloud.updated_at, device: cloud.device },
      keepLocal: () => this.run(async () => {
        this.conflict = null;
        try { await this.doPush(cloud.rev, user); } catch (e) { this.set('error', e instanceof Error ? e.message : 'Envoi impossible'); }
      }),
      takeCloud: () => this.run(async () => {
        this.conflict = null;
        try { await this.doPull(cloud, user); } catch (e) { this.set('error', e instanceof Error ? e.message : 'Reprise impossible'); }
      }),
    };
    this.conflict = info;
    this.set('conflict', 'Deux sauvegardes différentes : choisis laquelle garder.');
    this.hooks.onConflict?.(info);
  }

  private done(): void {
    this.lastSyncAt = Date.now();
    this.set('ok', 'Progression sauvegardée dans le cloud');
  }
}
