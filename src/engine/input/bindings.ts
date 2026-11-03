/**
 * Actions du jeu et correspondances par défaut.
 *
 * Les touches utilisent `KeyboardEvent.code` (position physique) : « KeyW » est la touche
 * Z sur un clavier AZERTY. ZQSD (AZERTY) et WASD (QWERTY) marchent donc sans réglage.
 * Boutons manette : mapping « standard » W3C (0=A/Croix, 1=B/Rond, 2=X/Carré, 3=Y/Triangle,
 * 4=LB, 5=RB, 6=LT, 7=RT, 8=Select, 9=Start, 12-15=croix directionnelle).
 */
export type Action =
  | 'up' | 'down' | 'left' | 'right'
  | 'attack' | 'dash'
  | 'skill1' | 'skill2' | 'skill3' | 'skill4'
  | 'interact' | 'pause' | 'map' | 'inventory' | 'debug';

export interface Binding { keys: string[]; mouse?: number[]; pad?: number[] }
export type Bindings = Record<Action, Binding>;

export const DEFAULT_BINDINGS: Bindings = {
  up: { keys: ['KeyW', 'ArrowUp'], pad: [12] },
  down: { keys: ['KeyS', 'ArrowDown'], pad: [13] },
  left: { keys: ['KeyA', 'ArrowLeft'], pad: [14] },
  right: { keys: ['KeyD', 'ArrowRight'], pad: [15] },
  attack: { keys: ['KeyJ'], mouse: [0], pad: [7, 0] },
  dash: { keys: ['Space', 'ShiftLeft'], mouse: [2], pad: [6, 1] },
  skill1: { keys: ['Digit1', 'KeyQ'], pad: [2] },     // KeyQ = touche A en AZERTY
  skill2: { keys: ['Digit2', 'KeyE'], pad: [3] },
  skill3: { keys: ['Digit3', 'KeyR'], pad: [4] },
  skill4: { keys: ['Digit4', 'KeyF'], pad: [5] },
  interact: { keys: ['KeyG', 'Enter'], pad: [] },
  pause: { keys: ['Escape', 'KeyP'], pad: [9] },
  map: { keys: ['KeyM', 'Tab'], pad: [8] },
  inventory: { keys: ['KeyI', 'KeyB'], pad: [] },
  debug: { keys: ['F3', 'Backquote'], pad: [] },
};
