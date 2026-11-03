/**
 * Bus d'événements typé : permet aux modules (gameplay, audio, UI, sauvegarde…)
 * de communiquer sans dépendre les uns des autres.
 *
 * Exemple :
 *   type Ev = { 'enemy:killed': { id: number; x: number; y: number } };
 *   const bus = new EventBus<Ev>();
 *   const off = bus.on('enemy:killed', e => audio.play('kill'));
 *   bus.emit('enemy:killed', { id, x, y });
 */
export class EventBus<Events extends Record<string, unknown>> {
  private handlers = new Map<keyof Events, Set<(p: never) => void>>();

  on<K extends keyof Events>(type: K, fn: (payload: Events[K]) => void): () => void {
    let set = this.handlers.get(type);
    if (!set) this.handlers.set(type, (set = new Set()));
    set.add(fn as (p: never) => void);
    return () => this.off(type, fn);
  }

  once<K extends keyof Events>(type: K, fn: (payload: Events[K]) => void): () => void {
    const off = this.on(type, (p) => { off(); fn(p); });
    return off;
  }

  off<K extends keyof Events>(type: K, fn: (payload: Events[K]) => void): void {
    this.handlers.get(type)?.delete(fn as (p: never) => void);
  }

  emit<K extends keyof Events>(type: K, payload: Events[K]): void {
    const set = this.handlers.get(type);
    if (!set) return;
    for (const fn of [...set]) (fn as (p: Events[K]) => void)(payload);
  }

  clear(): void { this.handlers.clear(); }
}
