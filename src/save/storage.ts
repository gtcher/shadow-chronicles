/**
 * Stockage clé → valeur asynchrone. IndexedDB en priorité (plus de place, pas de limite
 * de 5 Mo, écriture atomique par transaction), repli sur localStorage puis sur la mémoire
 * (navigation privée stricte, iframe sans stockage) pour que le jeu démarre toujours.
 */
export interface KVStore {
  readonly kind: 'indexeddb' | 'localStorage' | 'memory';
  get<T = unknown>(key: string): Promise<T | undefined>;
  /** Écrit plusieurs clés dans une seule transaction : tout ou rien. */
  setMany(entries: Record<string, unknown>): Promise<void>;
  delete(key: string): Promise<void>;
  keys(): Promise<string[]>;
}

export class MemoryStore implements KVStore {
  readonly kind = 'memory' as const;
  readonly data = new Map<string, unknown>();
  async get<T>(key: string): Promise<T | undefined> {
    return this.data.has(key) ? (structuredClone(this.data.get(key)) as T) : undefined;
  }
  async setMany(entries: Record<string, unknown>): Promise<void> {
    const copy = structuredClone(entries);
    for (const [k, v] of Object.entries(copy)) this.data.set(k, v);
  }
  async delete(key: string): Promise<void> { this.data.delete(key); }
  async keys(): Promise<string[]> { return [...this.data.keys()]; }
}

const LS_PREFIX = 'shadow-chronicles:';

export class LocalStorageStore implements KVStore {
  readonly kind = 'localStorage' as const;
  constructor(private readonly ls: Storage) {}
  async get<T>(key: string): Promise<T | undefined> {
    const raw = this.ls.getItem(LS_PREFIX + key);
    if (raw === null) return undefined;
    try { return JSON.parse(raw) as T; } catch { return undefined; }
  }
  async setMany(entries: Record<string, unknown>): Promise<void> {
    const old: Record<string, string | null> = {};
    try {
      for (const [k, v] of Object.entries(entries)) {
        old[k] = this.ls.getItem(LS_PREFIX + k);
        this.ls.setItem(LS_PREFIX + k, JSON.stringify(v));
      }
    } catch (err) {
      // Quota dépassé en cours de route : on remet l'état d'avant (tout ou rien).
      for (const [k, v] of Object.entries(old)) {
        try { if (v === null) this.ls.removeItem(LS_PREFIX + k); else this.ls.setItem(LS_PREFIX + k, v); } catch { /* rien */ }
      }
      throw err;
    }
  }
  async delete(key: string): Promise<void> { this.ls.removeItem(LS_PREFIX + key); }
  async keys(): Promise<string[]> {
    const out: string[] = [];
    for (let i = 0; i < this.ls.length; i++) {
      const k = this.ls.key(i);
      if (k?.startsWith(LS_PREFIX)) out.push(k.slice(LS_PREFIX.length));
    }
    return out;
  }
}

const DB_NAME = 'shadow-chronicles';
const STORE = 'kv';

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export class IdbStore implements KVStore {
  readonly kind = 'indexeddb' as const;
  private constructor(private readonly db: IDBDatabase) {
    // Une autre version du jeu (autre onglet) veut mettre la base à jour : on libère.
    db.onversionchange = () => db.close();
  }

  static open(factory: IDBFactory = indexedDB, name = DB_NAME): Promise<IdbStore> {
    return new Promise((resolve, reject) => {
      const r = factory.open(name, 1);
      r.onupgradeneeded = () => {
        if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE);
      };
      r.onsuccess = () => resolve(new IdbStore(r.result));
      r.onerror = () => reject(r.error);
      r.onblocked = () => reject(new Error('IndexedDB bloquée par un autre onglet'));
    });
  }

  async get<T>(key: string): Promise<T | undefined> {
    const tx = this.db.transaction(STORE, 'readonly');
    return (await req(tx.objectStore(STORE).get(key))) as T | undefined;
  }
  setMany(entries: Record<string, unknown>): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE, 'readwrite', { durability: 'strict' } as IDBTransactionOptions);
      const os = tx.objectStore(STORE);
      for (const [k, v] of Object.entries(entries)) os.put(v, k);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error('Transaction annulée'));
    });
  }
  async delete(key: string): Promise<void> {
    const tx = this.db.transaction(STORE, 'readwrite');
    await req(tx.objectStore(STORE).delete(key));
  }
  async keys(): Promise<string[]> {
    const tx = this.db.transaction(STORE, 'readonly');
    return (await req(tx.objectStore(STORE).getAllKeys())).map(String);
  }
  close(): void { this.db.close(); }
}

/** Ouvre le meilleur stockage disponible. */
export async function openBestStore(): Promise<KVStore> {
  try {
    if (typeof indexedDB !== 'undefined') return await IdbStore.open();
  } catch (err) {
    console.warn('[save] IndexedDB indisponible, repli sur localStorage', err);
  }
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(LS_PREFIX + 'probe', '1');
      localStorage.removeItem(LS_PREFIX + 'probe');
      return new LocalStorageStore(localStorage);
    }
  } catch { /* stockage bloqué */ }
  console.warn('[save] Aucun stockage persistant : la progression sera perdue à la fermeture.');
  return new MemoryStore();
}
