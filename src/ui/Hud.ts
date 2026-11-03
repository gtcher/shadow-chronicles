import { h, fmt } from './dom';
import { BLESSINGS, HERO_INFO, type Blessing, type HeroId } from './data';

/**
 * HUD épuré : portrait + PV/bouclier/mana à gauche, vague au centre, monnaies à droite,
 * combo à droite, techniques en bas (ou en arc sous le pouce en tactile).
 *
 * Le gameplay pousse l'état (aucune lecture directe de l'ECS) :
 *   hud.setVitals({ hp, max, shield, mana, manaMax })
 *   hud.setCooldown(i, restant, total)   i = 0..3 techniques, 4 = esquive
 *   hud.setWave(n, progression 0..1, contrat?)
 *   hud.addKill() / hud.setGold(n) / hud.setShards(n)
 *   hud.banner('Vague 3', 'Les loups arrivent') · hud.toast('Duo débloqué', 'Fracture Polaire', '#ffd65c')
 */
/** Technique 1 = attaque de base (clic / J), 2..4 = touches 1..3, esquive = Espace. */
const KB = ['Clic', '1', '2', '3', 'Esp'];
const PAD = ['RT', 'X', 'Y', 'RB', 'LT'];

export interface Vitals { hp: number; max: number; shield?: number; mana?: number; manaMax?: number }

export class Hud {
  readonly el: HTMLElement;
  /** Appui / relâchement sur une technique (0 = frappe, 1..3, 4 = esquive) : branché sur l'Input par UiRoot. */
  onSkillDown: (i: number) => void = () => {};
  onSkillUp: (i: number) => void = () => {};
  onPause: () => void = () => {};

  private hpFill!: HTMLElement; private hpGhost!: HTMLElement; private hpShield!: HTMLElement; private hpText!: HTMLElement; private hpBar!: HTMLElement;
  private manaFill!: HTMLElement; private manaBar!: HTMLElement;
  private portrait!: HTMLElement; private nameEl!: HTMLElement; private lvl!: HTMLElement; private boons!: HTMLElement;
  private waveTitle!: HTMLElement; private waveTrack!: HTMLElement; private waveInfo!: HTMLElement;
  private gold!: HTMLElement; private shards!: HTMLElement; private killsEl!: HTMLElement;
  private combo!: HTMLElement; private comboNum!: HTMLElement; private comboDecay!: HTMLElement;
  private skills: HTMLButtonElement[] = [];
  private cds = [0, 0, 0, 0, 0];
  private banners!: HTMLElement; private toasts!: HTMLElement; private live!: HTMLElement;
  private comboCount = 0; private comboT = 0; private kills = 0;
  private readonly comboWindow = 3;
  private mana = 1;
  private hero: HeroId = 'taro';
  /**
   * Dernières valeurs écrites dans le DOM. Le HUD est mis à jour à chaque image : réécrire un texte
   * ou une largeur identique invalide quand même le style et la mise en page (coûteux sur mobile).
   * On n'écrit donc que ce qui change.
   */
  private readonly written = new Map<HTMLElement, Record<string, string>>();
  private changed(el: HTMLElement, key: string, v: string): boolean {
    let m = this.written.get(el);
    if (!m) this.written.set(el, (m = {}));
    if (m[key] === v) return false;
    m[key] = v;
    return true;
  }
  private text(el: HTMLElement, v: string): void { if (this.changed(el, 'text', v)) el.textContent = v; }
  private width(el: HTMLElement, ratio: number): void {
    const v = `${Math.round(Math.max(0, Math.min(1, ratio)) * 1000) / 10}%`;
    if (this.changed(el, 'width', v)) el.style.width = v;
  }

  constructor() {
    this.el = h('div', { class: 'sc-hud' });
    this.build();
  }

  private build(): void {
    const hpBar = h('div', { class: 'sc-bar', role: 'meter', 'aria-label': 'Points de vie' },
      this.hpGhost = h('i', { class: 'sc-ghost' }), this.hpFill = h('i', { class: 'sc-fill' }), this.hpShield = h('i', { class: 'sc-shield', style: { width: '0' } }), this.hpText = h('b'));
    this.hpBar = hpBar;
    this.manaBar = h('div', { class: 'sc-bar sc-mana', 'aria-label': 'Mana' }, this.manaFill = h('i', { class: 'sc-fill' }));
    this.el.append(
      h('div', { class: 'sc-hero' },
        this.portrait = h('div', { class: 'sc-portrait' }, this.lvl = h('span', { class: 'sc-lvl' }, '1')),
        this.nameEl = h('div', { class: 'sc-name' }),
        hpBar, this.manaBar,
        this.boons = h('div', { class: 'sc-boons', 'aria-label': 'Bénédictions' })),
      h('div', { class: 'sc-wave sc-panel' },
        this.waveTitle = h('h3', {}, 'Vague 1'),
        h('div', { class: 'sc-track' }, this.waveTrack = h('i')),
        this.waveInfo = h('p')),
      h('div', { class: 'sc-top-right' },
        h('div', { class: 'sc-chip sc-opt', title: 'Éliminations' }, h('span', { '--c': '#ff8a7a' }, '☠'), this.killsEl = h('b', {}, '0')),
        h('div', { class: 'sc-chip', title: 'Or' }, h('span', { '--c': '#f2c94c' }, '◉'), this.gold = h('b', {}, '0')),
        h('div', { class: 'sc-chip sc-opt', title: "Éclats d'Akar" }, h('span', { '--c': '#d9ab74' }, '✦'), this.shards = h('b', {}, '0')),
        h('button', { class: 'sc-iconbtn', 'aria-label': 'Pause', onclick: () => this.onPause() }, '❚❚')),
      this.combo = h('div', { class: 'sc-combo', 'aria-hidden': 'true' }, this.comboNum = h('strong', {}, '0'), h('span', {}, 'COMBO'), this.comboDecay = h('div', { class: 'sc-decay' })),
      this.banners = h('div', { class: 'sc-banner' }),
      this.toasts = h('div', { class: 'sc-toasts', 'aria-live': 'polite' }),
      this.live = h('div', { class: 'sc-sr', 'aria-live': 'assertive' }),
    );
  }

  /** Construit la barre de techniques pour un héros. `assetUrl(key)` renvoie l'URL d'une image du manifest. */
  setHero(hero: HeroId, assetUrl: (key: string) => string | undefined, level = 1): void {
    this.hero = hero;
    const info = HERO_INFO[hero];
    this.portrait.style.backgroundImage = `url(${assetUrl(`portrait-${hero}`)})`;
    this.portrait.style.borderColor = info.color;
    this.nameEl.replaceChildren(h('span', {}, info.name), h('small', {}, info.role));
    this.lvl.textContent = String(level);
    this.el.querySelector('.sc-skills')?.remove();
    const bar = h('div', { class: 'sc-skills sc-panel' });
    this.skills = info.skills.map((s, i) => {
      const b = h('button', { class: `sc-skill${i === 3 ? ' sc-ult' : ''}`, 'data-i': i, 'aria-label': `${s.name} : ${s.desc}`, title: `${s.name} — ${s.desc}`,
        style: { backgroundImage: `url(${assetUrl(`skill-${hero}-${i}`)})` },
        }, h('b'), s.cost ? h('span', { class: 'sc-cost' }, String(s.cost)) : null, h('span', { class: 'sc-kbd' }, KB[i]));
      this.bindPress(b, i);
      return b;
    });
    const dash = h('button', { class: 'sc-skill sc-dash', 'data-i': 4, 'aria-label': 'Esquive', title: 'Esquive' },
      h('b', {}, '➶'), h('span', { class: 'sc-kbd' }, KB[4]));
    this.bindPress(dash, 4);
    this.skills.push(dash);
    bar.append(...this.skills);
    this.el.append(bar);
  }

  private bindPress(b: HTMLElement, i: number): void {
    let id = -1;
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation(); id = e.pointerId;
      try { b.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      b.classList.add('sc-held'); this.onSkillDown(i);
    });
    const up = (e: PointerEvent) => { if (e.pointerId !== id) return; id = -1; b.classList.remove('sc-held'); this.onSkillUp(i); };
    b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up);
  }

  /** Libellés de touches selon le périphérique (clavier / manette). */
  setDevice(device: 'keyboard' | 'mouse' | 'gamepad' | 'touch'): void {
    this.skills.forEach((b, i) => { const k = b.querySelector('.sc-kbd'); if (k) k.textContent = device === 'gamepad' ? PAD[i] : KB[i]; });
  }

  setVitals(v: Vitals): void {
    const max = Math.max(1, v.max);
    const k = Math.max(0, Math.min(1, v.hp / max));
    this.width(this.hpFill, k);
    this.width(this.hpGhost, k);
    const sh = Math.min(1, (v.shield ?? 0) / max);
    this.width(this.hpShield, sh);
    this.text(this.hpText, `${fmt(Math.ceil(v.hp))} / ${fmt(max)}${v.shield ? `  +${fmt(v.shield)}` : ''}`);
    const low = k < 0.3 && k > 0;
    if (this.changed(this.hpBar, 'low', String(low))) this.hpBar.classList.toggle('sc-low', low);
    const now = String(Math.round(k * 100));
    if (this.changed(this.hpBar, 'aria', now)) this.hpBar.setAttribute('aria-valuenow', now);
    if (v.mana !== undefined && v.manaMax) {
      this.mana = v.mana;
      this.width(this.manaFill, v.mana / v.manaMax);
      HERO_INFO[this.hero].skills.forEach((s, i) => {
        const b = this.skills[i], off = s.cost > this.mana;
        if (b && this.changed(b, 'nomana', String(off))) b.classList.toggle('sc-nomana', off);
      });
    }
  }

  /** Recharge d'une technique (i 0..3) ou de l'esquive (4). */
  setCooldown(i: number, remaining: number, total: number): void {
    const b = this.skills[i];
    if (!b) return;
    const was = this.cds[i];
    this.cds[i] = remaining;
    const cd = total > 0 ? String(Math.round(Math.max(0, remaining / total) * 500) / 500) : '0';
    if (this.changed(b, 'cd', cd)) b.style.setProperty('--cd', cd);
    const label = b.querySelector('b');
    if (i < 4 && label) this.text(label, remaining > 0.05 && total >= 1.5 ? (remaining >= 1 ? String(Math.ceil(remaining)) : remaining.toFixed(1)) : '');
    if (was > 0.05 && remaining <= 0.05 && total >= 1.5) { b.classList.remove('sc-ready'); void b.offsetWidth; b.classList.add('sc-ready'); }
  }

  setWave(n: number, progress: number, info?: string): void {
    this.text(this.waveTitle, `Vague ${n}`);
    this.width(this.waveTrack, progress);
    if (this.changed(this.waveInfo, 'html', info ?? '')) this.waveInfo.innerHTML = info ?? '';
  }

  setGold(n: number): void { this.bump(this.gold, n); }
  setShards(n: number): void { this.bump(this.shards, n); }
  setLevel(n: number): void { this.lvl.textContent = String(n); }

  setBlessings(list: Blessing[]): void {
    this.boons.replaceChildren(...list.map((b) => {
      const p = BLESSINGS.patrons[b.patron];
      return h('span', { class: 'sc-boon', '--c': p?.color, title: `${b.name} (${p?.name ?? ''})` }, p?.icon ?? '✦');
    }));
  }

  addKill(): void {
    this.kills++; this.killsEl.textContent = fmt(this.kills);
    this.comboCount++; this.comboT = this.comboWindow;
    this.comboNum.textContent = `×${this.comboCount}`;
    this.comboNum.classList.remove('sc-pop'); void this.comboNum.offsetWidth; this.comboNum.classList.add('sc-pop');
    const tier = this.comboCount >= 50 ? 4 : this.comboCount >= 25 ? 3 : this.comboCount >= 10 ? 2 : 1;
    this.combo.className = `sc-combo${this.comboCount >= 3 ? ' sc-on' : ''} sc-tier${tier}`;
    if ([10, 25, 50, 100].includes(this.comboCount)) this.toast(`Combo ×${this.comboCount}`, ['', 'Belle série', 'Carnage', 'Massacre', 'Légende'][tier]);
  }
  resetKills(): void { this.kills = 0; this.killsEl.textContent = '0'; this.comboCount = 0; this.combo.classList.remove('sc-on'); }
  get comboValue(): number { return this.comboCount; }

  /** À appeler chaque frame (dt en secondes) : fait décroître le combo. */
  tick(dt: number): void {
    if (this.comboT > 0) {
      this.comboT -= dt;
      this.comboDecay.style.transform = `scaleX(${Math.max(0, this.comboT / this.comboWindow)})`;
      if (this.comboT <= 0) { this.comboCount = 0; this.combo.classList.remove('sc-on'); }
    }
  }

  banner(title: string, sub = '', color?: string): void {
    const b = h('div', { '--c': color }, h('h2', {}, title), sub ? h('p', {}, sub) : null);
    this.banners.replaceChildren(b);
    this.live.textContent = `${title}. ${sub}`;
    setTimeout(() => b.remove(), 2500);
  }

  toast(title: string, text = '', color?: string): void {
    const t = h('div', { class: 'sc-toast', '--c': color }, h('strong', {}, title), text ? ` ${text}` : '');
    this.toasts.append(t);
    while (this.toasts.children.length > 4) this.toasts.firstElementChild!.remove();
    setTimeout(() => t.remove(), 3300);
  }

  dim(on: boolean): void { this.el.classList.toggle('sc-dim', on); }

  private bump(el: HTMLElement, n: number): void {
    const s = fmt(n);
    if (el.textContent === s) return;
    el.textContent = s;
    const chip = el.parentElement!;
    chip.classList.remove('sc-bump'); void chip.offsetWidth; chip.classList.add('sc-bump');
  }
}
