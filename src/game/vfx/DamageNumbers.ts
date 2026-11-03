import { BitmapFont, BitmapText, type Container } from 'pixi.js';

/**
 * Chiffres de dégâts « juteux » : apparition en surgissement (échelle élastique),
 * arc vers le haut, fondu. Police bitmap générée une fois → coût quasi nul, même à 80 chiffres.
 *
 * Styles : normal (crème), critique (or, plus gros, « ! »), soin (vert), joueur blessé (rouge).
 * Les coups rapprochés sur la même cible s'additionnent dans le même chiffre (lisibilité).
 */
export type DamageStyle = 'normal' | 'crit' | 'heal' | 'hurt';

const STYLES: Record<DamageStyle, { color: number; size: number; pop: number }> = {
  normal: { color: 0xfff0d6, size: 22, pop: 1.5 },
  crit: { color: 0xffc23a, size: 34, pop: 2.1 },
  heal: { color: 0x8dff9a, size: 24, pop: 1.5 },
  hurt: { color: 0xff5a4a, size: 28, pop: 1.8 },
};

interface N { t: BitmapText; x: number; y: number; vx: number; vy: number; life: number; max: number; pop: number; base: number; key: number; value: number; style: DamageStyle }

let fontReady = false;
function installFont(): void {
  if (fontReady) return;
  fontReady = true;
  BitmapFont.install({
    name: 'VfxDamage',
    style: {
      fontFamily: 'Georgia, "Times New Roman", serif', fontWeight: 'bold', fontSize: 48, fill: 0xffffff,
      stroke: { color: 0x1a0b06, width: 7, join: 'round' },
      dropShadow: { color: 0x000000, alpha: 0.7, distance: 3, blur: 2, angle: Math.PI / 2 },
    },
    chars: [['0', '9'], '+!-.k'],
    resolution: 1,
    padding: 6,
  });
}

export class DamageNumbers {
  max = 80;
  enabled = true;
  private live: N[] = [];
  private pool: BitmapText[] = [];

  constructor(private readonly layer: Container) { installFont(); }

  /**
   * @param key identifiant de la cible (pour fusionner les coups rapprochés), −1 = jamais fusionner.
   */
  show(x: number, y: number, value: number, style: DamageStyle = 'normal', key = -1): void {
    if (!this.enabled || value <= 0) return;
    // Fusion : même cible, même style, chiffre encore jeune → on additionne.
    if (key >= 0) {
      for (const n of this.live) {
        if (n.key === key && n.style === style && n.max - n.life < 0.25) {
          n.value += value;
          n.t.text = this.format(n.value, style);
          n.life = n.max; n.pop = STYLES[style].pop * 0.85;
          return;
        }
      }
    }
    if (this.live.length >= this.max) this.recycle(0);
    const st = STYLES[style];
    const t = this.pool.pop() ?? new BitmapText({ text: '', style: { fontFamily: 'VfxDamage', fontSize: 48 } });
    t.anchor.set(0.5, 1);
    t.text = this.format(value, style);
    t.tint = st.color;
    t.alpha = 1;
    this.layer.addChild(t);
    const life = style === 'crit' ? 0.95 : 0.75;
    this.live.push({
      t, x: x + (Math.random() - 0.5) * 24, y, vx: (Math.random() - 0.5) * 70, vy: -170 - Math.random() * 40,
      life, max: life, pop: st.pop, base: st.size / 48, key, value, style,
    });
  }

  private format(v: number, style: DamageStyle): string {
    const s = v >= 10000 ? `${(v / 1000).toFixed(1)}k` : v < 10 && v % 1 ? v.toFixed(1) : `${Math.round(v)}`;
    return style === 'crit' ? `${s}!` : style === 'heal' ? `+${s}` : style === 'hurt' ? `-${s}` : s;
  }

  update(dt: number): void {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const n = this.live[i];
      n.life -= dt;
      if (n.life <= 0) { this.recycle(i); continue; }
      n.vy += 420 * dt; // gravité : arc
      n.vx *= Math.exp(-3 * dt);
      n.x += n.vx * dt; n.y += Math.min(n.vy, 30) * dt;
      // Surgissement élastique vers l'échelle de base.
      n.pop += (1 - n.pop) * (1 - Math.exp(-14 * dt));
      const age = n.max - n.life;
      const squash = age < 0.08 ? 1 + (0.08 - age) * 3 : 1;
      n.t.scale.set(n.base * n.pop * squash, n.base * n.pop / squash);
      n.t.position.set(n.x, n.y);
      const t = n.life / n.max;
      n.t.alpha = t < 0.35 ? t / 0.35 : 1;
    }
  }

  private recycle(i: number): void {
    const n = this.live[i];
    n.t.removeFromParent(); this.pool.push(n.t);
    this.live[i] = this.live[this.live.length - 1]; this.live.pop();
  }

  clear(): void { while (this.live.length) this.recycle(this.live.length - 1); }
  get count(): number { return this.live.length; }
  destroy(): void { this.clear(); for (const t of this.pool) t.destroy(); }
}
