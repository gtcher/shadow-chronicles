import { DEFAULT_BINDINGS, type Action, type Binding, type Bindings } from '@engine';

/** Touches effectives = défaut du moteur + changements du joueur (settings.bindings). */
export function applyBindings(overrides: Partial<Bindings>): Bindings {
  const out = structuredClone(DEFAULT_BINDINGS);
  for (const [action, b] of Object.entries(overrides) as [Action, Binding][]) {
    if (action in out && b) out[action] = structuredClone(b);
  }
  return out;
}

/** Ne garde que les actions différentes du défaut (sauvegarde compacte, défauts futurs suivis). */
export function diffBindings(current: Bindings): Partial<Bindings> {
  const out: Partial<Bindings> = {};
  for (const action of Object.keys(DEFAULT_BINDINGS) as Action[]) {
    if (JSON.stringify(current[action]) !== JSON.stringify(DEFAULT_BINDINGS[action])) out[action] = structuredClone(current[action]);
  }
  return out;
}
