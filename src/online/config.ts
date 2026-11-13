/**
 * Connexion au service en ligne (Supabase) : comptes, sauvegarde cloud, classement.
 * L'URL et la clé « publishable » sont publiques par nature (elles sont dans tout client web) :
 * la sécurité repose sur les règles de la base (supabase/schema.sql). Ne JAMAIS mettre ici la clé secrète.
 *
 * Variables Vite facultatives pour pointer ailleurs (tests, autre projet) :
 *   VITE_SUPABASE_URL, VITE_SUPABASE_KEY (vide = mode hors ligne), VITE_SUPABASE_OAUTH="google,discord"
 */
const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};

export const ONLINE = {
  url: env.VITE_SUPABASE_URL ?? 'https://dmekimsahjdnvkusblrm.supabase.co',
  key: env.VITE_SUPABASE_KEY ?? 'sb_publishable_zQ-725ns3akFM9BET82zcg_9aiT9XGn',
  /** Fournisseurs de connexion activés dans Supabase (Authentication > Providers), en plus de l'e-mail. */
  oauth: (env.VITE_SUPABASE_OAUTH ?? '').split(',').map((s) => s.trim()).filter((s): s is OAuthProvider => s === 'google' || s === 'discord'),
};

export type OAuthProvider = 'google' | 'discord';

/** Le jeu a-t-il de quoi se connecter ? Sinon tout ce qui est en ligne reste caché. */
export const onlineConfigured = (): boolean => /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(ONLINE.url) && ONLINE.key.length > 20;

/** Clé localStorage de la session Supabase (sb-<ref>-auth-token) : savoir sans charger le client si on est connecté. */
export const sessionStorageKey = (): string => `sb-${new URL(ONLINE.url).hostname.split('.')[0]}-auth-token`;
