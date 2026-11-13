/**
 * Service en ligne : session du joueur, pseudo, envoi des scores, lecture du classement, sauvegarde cloud.
 * Le client Supabase est chargé à la demande (import dynamique) : l'écran titre n'attend pas le réseau
 * et le jeu reste entièrement jouable hors ligne ou sans compte.
 */
import type { SupabaseClient, User } from '@supabase/supabase-js';
import type { Profile, Settings } from '../save';
import { ONLINE, onlineConfigured, sessionStorageKey, type OAuthProvider } from './config';
import { plausibleDaily, plausibleRun, validPseudo, type CloudSave, type DailySubmission, type RunSubmission } from './rules';

export interface Player { id: string; pseudo: string; best_wave: number; wins: number; runs: number; best_time: number | null; chests: number; streak_max: number }
export type BoardKind = 'progress' | 'daily' | 'missions';
export interface BoardRow {
  rank: number; player_id: string; pseudo: string;
  best_wave?: number; wins?: number; best_time?: number | null; runs?: number;
  score?: number; wave?: number; won?: boolean; hero?: string;
  chests?: number; streak_max?: number;
}
export interface MyRanks { progress: number | null; daily: number | null; missions: number | null; players: number }

type Queued = { kind: 'run'; data: RunSubmission & { chests?: number; streakMax?: number } } | { kind: 'daily'; data: DailySubmission };
const QUEUE_KEY = 'sc-online-queue-v1';
const MAX_QUEUE = 20;

/** Message joueur à partir d'une erreur Supabase / réseau. */
export function friendlyError(e: unknown): string {
  const m = (e as { message?: string })?.message ?? String(e);
  if (/Failed to fetch|NetworkError|Load failed|fetch/i.test(m)) return 'Pas de connexion au serveur. Réessaie plus tard.';
  if (/rate limit|too many|security purposes/i.test(m)) return 'Trop de tentatives : attends une minute avant de réessayer.';
  if (/Token has expired|otp.*(expired|invalid)|invalid.*token/i.test(m)) return 'Code invalide ou expiré. Demande un nouveau code.';
  if (/Signups not allowed|signup.*disabled/i.test(m)) return 'Les inscriptions sont fermées pour le moment.';
  if (/Unsupported provider|provider is not enabled/i.test(m)) return 'Ce mode de connexion n\'est pas encore activé.';
  if (/relation .* does not exist|function .* does not exist|Could not find the function|schema cache/i.test(m)) return 'Le classement n\'est pas encore installé sur le serveur.';
  // Messages déjà rédigés en français par la base (schema.sql).
  return m.length < 120 ? m : 'Erreur du serveur.';
}

export class OnlineService {
  private static inst: OnlineService | null = null;
  /** null si le jeu n'a pas de configuration en ligne. */
  static get(): OnlineService | null {
    if (!onlineConfigured()) return null;
    return (OnlineService.inst ??= new OnlineService());
  }

  private sb: SupabaseClient | null = null;
  private loading: Promise<SupabaseClient> | null = null;
  user: User | null = null;
  player: Player | null = null;
  /** Dernière erreur réseau (affichée discrètement dans l'écran Compte). */
  lastError: string | null = null;
  private listeners = new Set<() => void>();
  /** Appelé quand le joueur choisit son tout premier pseudo (pour envoyer son meilleur record local). */
  onFirstPseudo: (() => void) | null = null;

  /** Session enregistrée sur cet appareil ou retour d'un lien de connexion : charger le client tout de suite. */
  hasPendingSession(): boolean {
    try {
      if (/access_token=|error_description=/.test(location.hash)) return true;
      return !!localStorage.getItem(sessionStorageKey());
    } catch { return false; }
  }

  onChange(fn: () => void): () => void { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  private emit(): void { for (const fn of [...this.listeners]) { try { fn(); } catch (e) { console.error('[online]', e); } } }

  /** Charge le client, lit la session et le profil joueur. Ne lève jamais : le jeu continue hors ligne. */
  ready(): Promise<SupabaseClient> {
    return (this.loading ??= (async () => {
      const { createClient } = await import('@supabase/supabase-js');
      const sb = createClient(ONLINE.url, ONLINE.key, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit' },
      });
      this.sb = sb;
      sb.auth.onAuthStateChange((_ev, session) => {
        const was = this.user?.id;
        this.user = session?.user ?? null;
        if (this.user?.id !== was) {
          this.player = null;
          // Hors du callback : Supabase interdit d'appeler l'API depuis onAuthStateChange.
          setTimeout(() => { void this.loadPlayer().then(() => this.flushQueue()); }, 0);
        }
        this.emit();
      });
      try {
        const { data } = await sb.auth.getSession();
        this.user = data.session?.user ?? null;
        // Lien de connexion consommé : on nettoie l'adresse.
        if (/access_token=|error_description=/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search);
        await this.loadPlayer();
        void this.flushQueue();
      } catch (e) { this.lastError = friendlyError(e); }
      this.emit();
      return sb;
    })());
  }

  private async loadPlayer(): Promise<void> {
    if (!this.sb || !this.user) { this.player = null; return; }
    const { data, error } = await this.sb.from('players').select('*').eq('id', this.user.id).maybeSingle();
    if (error) { this.lastError = friendlyError(error); return; }
    this.player = (data as Player | null) ?? null;
    this.emit();
  }

  // ─── connexion ────────────────────────────────────────────────────────────

  /** Adresse de retour du lien de connexion : la page du jeu elle-même. */
  private redirect(): string { return location.origin + location.pathname; }

  /** Envoie un e-mail avec un code à 6 chiffres (et un lien). Crée le compte si besoin. */
  async signInEmail(email: string): Promise<void> {
    const sb = await this.ready();
    const { error } = await sb.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: this.redirect(), shouldCreateUser: true } });
    if (error) throw new Error(friendlyError(error));
  }

  async verifyCode(email: string, code: string): Promise<void> {
    const sb = await this.ready();
    const { error } = await sb.auth.verifyOtp({ email: email.trim(), token: code.replace(/\s/g, ''), type: 'email' });
    if (error) throw new Error(friendlyError(error));
    await this.loadPlayer();
  }

  async signInOAuth(provider: OAuthProvider): Promise<void> {
    const sb = await this.ready();
    const { error } = await sb.auth.signInWithOAuth({ provider, options: { redirectTo: this.redirect() } });
    if (error) throw new Error(friendlyError(error));
  }

  async signOut(): Promise<void> {
    const sb = await this.ready();
    await sb.auth.signOut({ scope: 'local' }).catch(() => {});
    this.user = null;
    this.player = null;
    try { localStorage.removeItem(QUEUE_KEY); } catch { /* */ }
    this.emit();
  }

  async setPseudo(pseudo: string): Promise<Player> {
    if (!validPseudo(pseudo)) throw new Error('Pseudo : 3 à 16 lettres, chiffres, espaces, . _ -');
    const sb = await this.ready();
    const first = !this.player;
    const { data, error } = await sb.rpc('set_pseudo', { p_pseudo: pseudo.trim() });
    if (error) throw new Error(friendlyError(error));
    this.player = data as Player;
    this.emit();
    if (first) { try { this.onFirstPseudo?.(); } catch (e) { console.error('[online]', e); } }
    return this.player;
  }

  // ─── scores (file d'attente : rien n'est perdu hors ligne) ───────────────

  private readQueue(): Queued[] { try { return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '[]') as Queued[]; } catch { return []; } }
  private writeQueue(q: Queued[]): void { try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q.slice(-MAX_QUEUE))); } catch { /* */ } }

  /** Run terminée : envoyée tout de suite si possible, sinon gardée pour plus tard. Ignorée sans compte. */
  submitRun(r: RunSubmission, extra: { chests?: number; streakMax?: number } = {}): void {
    if (!this.user || !plausibleRun(r)) return;
    this.writeQueue([...this.readQueue(), { kind: 'run', data: { ...r, ...extra } }]);
    void this.flushQueue();
  }

  submitDaily(d: DailySubmission): void {
    if (!this.user || !plausibleDaily(d)) return;
    this.writeQueue([...this.readQueue(), { kind: 'daily', data: d }]);
    void this.flushQueue();
  }

  private flushing = false;
  async flushQueue(): Promise<void> {
    if (this.flushing || !this.sb || !this.user || !this.player) return;
    this.flushing = true;
    try {
      let q = this.readQueue();
      while (q.length) {
        const it = q[0];
        const { error } = it.kind === 'run'
          ? await this.sb.rpc('submit_run', {
            p_hero: it.data.hero, p_mode: it.data.mode, p_wave: Math.round(it.data.wave), p_won: it.data.won, p_time_sec: Math.round(it.data.timeSec),
            p_kills: Math.round(it.data.kills), p_pact: Math.round(it.data.pact), p_discovery: it.data.discovery,
            p_chests: it.data.chests ?? null, p_streak_max: it.data.streakMax ?? null,
          })
          : await this.sb.rpc('submit_daily', {
            p_day: it.data.day, p_hero: it.data.hero, p_score: Math.round(it.data.score), p_wave: Math.round(it.data.wave), p_won: it.data.won,
            p_time_sec: Math.round(it.data.timeSec), p_kills: Math.round(it.data.kills),
          });
        if (error) {
          const msg = error.message ?? '';
          // Réseau ou anti-rafale : on réessaiera ; refus définitif (invraisemblable, défi fini) : on jette.
          if (/fetch|network|Trop de runs|54000/i.test(msg) || error.code === '54000') { if (error.code === '54000') setTimeout(() => void this.flushQueue(), 21_000); break; }
          console.warn('[online] score refusé', msg);
        }
        q = this.readQueue().slice(1);
        this.writeQueue(q);
      }
      await this.loadPlayer();
    } catch (e) {
      this.lastError = friendlyError(e);
    } finally {
      this.flushing = false;
    }
  }

  // ─── classement ───────────────────────────────────────────────────────────

  async leaderboard(kind: BoardKind, day?: string): Promise<BoardRow[]> {
    const sb = await this.ready();
    const fn = kind === 'progress' ? 'leaderboard_progress' : kind === 'daily' ? 'leaderboard_daily' : 'leaderboard_missions';
    const args = kind === 'daily' ? { p_day: day ?? null, p_limit: 50 } : { p_limit: 50 };
    const { data, error } = await sb.rpc(fn, args);
    if (error) throw new Error(friendlyError(error));
    return (data ?? []) as BoardRow[];
  }

  async myRanks(day?: string): Promise<MyRanks | null> {
    const sb = await this.ready();
    if (!this.user) return null;
    const { data, error } = await sb.rpc('my_ranks', { p_day: day ?? null });
    if (error) return null;
    return (data as MyRanks | null) ?? null;
  }

  // ─── sauvegarde cloud ─────────────────────────────────────────────────────

  async fetchSave(): Promise<CloudSave | null> {
    const sb = await this.ready();
    if (!this.user) return null;
    const { data, error } = await sb.from('cloud_saves').select('profile, settings, rev, device, updated_at').eq('player_id', this.user.id).maybeSingle();
    if (error) throw new Error(friendlyError(error));
    return (data as CloudSave | null) ?? null;
  }

  /**
   * Envoie la sauvegarde. `expectedRev` = version cloud connue (null = aucune) : si un autre appareil
   * a écrit entre-temps, rien n'est écrasé et la réponse est 'conflict'.
   */
  async pushSave(profile: Profile, settings: Settings, expectedRev: number | null, device: string): Promise<number | 'conflict'> {
    const sb = await this.ready();
    if (!this.user) throw new Error('Connexion requise');
    const row = { profile, settings, device, updated_at: new Date().toISOString() };
    if (expectedRev === null) {
      const { error } = await sb.from('cloud_saves').insert({ player_id: this.user.id, ...row, rev: 1 });
      if (error) { if (error.code === '23505') return 'conflict'; throw new Error(friendlyError(error)); }
      return 1;
    }
    const { data, error } = await sb.from('cloud_saves').update({ ...row, rev: expectedRev + 1 }).eq('player_id', this.user.id).eq('rev', expectedRev).select('rev');
    if (error) throw new Error(friendlyError(error));
    return data?.length ? expectedRev + 1 : 'conflict';
  }
}
