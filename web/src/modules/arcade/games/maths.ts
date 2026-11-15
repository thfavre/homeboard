import Phaser from 'phaser';
import { ArcadeScene, H, W } from '../engine/base.ts';

/** A wrong answer takes this off the clock */
const PENALTY_MS = 2000;
const BTN_W = 168;
const BTN_H = 104;
const ROWS = [470, 592];
const COLS = [W / 2 - 88, W / 2 + 88];

interface Question {
  text: string;
  answer: number;
  choices: number[];
}

interface Button {
  g: Phaser.GameObjects.Graphics;
  t: Phaser.GameObjects.Text;
  x: number;
  y: number;
  value: number;
}

/**
 * Quick Maths: a sum, four answers. The right one scores and the next sum comes; a wrong one costs
 * two seconds. The sums get harder as they go (adding, taking away, times tables, dividing), and
 * come in the same order for both players, drawn from the seed.
 */
export class MathsScene extends ArcadeScene {
  private q = 0;
  private current: Question | null = null;
  private card!: Phaser.GameObjects.Container;
  private question!: Phaser.GameObjects.Text;
  private buttons: Button[] = [];
  private locked = false;
  private streak = 0;

  build(): void {
    this.backdrop('maths-bg', '#0d3b46', '#081420');
    // A faint grid, like squared paper
    const grid = this.add.graphics().setDepth(-90);
    grid.lineStyle(1, 0xffffff, 0.05);
    for (let x = 0; x <= W; x += 32) grid.lineBetween(x, 0, x, H);
    for (let y = 0; y <= H; y += 32) grid.lineBetween(0, y, W, y);

    this.card = this.add.container(W / 2, 250);
    const bg = this.add.graphics();
    bg.fillStyle(0xffffff, 0.08).fillRoundedRect(-170, -90, 340, 180, 26);
    bg.lineStyle(2, 0x6ff0d0, 0.35).strokeRoundedRect(-170, -90, 340, 180, 26);
    this.question = this.text(0, 0, '?', 64, '#ffffff', 800);
    this.card.add([bg, this.question]);
    for (const y of ROWS) for (const x of COLS) this.buttons.push({ g: this.add.graphics({ x, y }), t: this.text(x, y, '', 40, '#ffffff', 800), x, y, value: 0 });
    this.drawButtons(null);
    this.question.setText('Ready?');
    this.question.setFontSize(48);
  }

  private drawButtons(mark: { i: number; ok: boolean } | null): void {
    this.buttons.forEach((b, i) => {
      const color = mark?.i === i ? (mark.ok ? 0x2fd27a : 0xff4d5e) : 0x1d5a6e;
      b.g.clear();
      b.g.fillStyle(0x000000, 0.25).fillRoundedRect(-BTN_W / 2, -BTN_H / 2 + 6, BTN_W, BTN_H, 22);
      b.g.fillStyle(color, 1).fillRoundedRect(-BTN_W / 2, -BTN_H / 2, BTN_W, BTN_H, 22);
      b.g.fillStyle(0xffffff, 0.12).fillRoundedRect(-BTN_W / 2, -BTN_H / 2, BTN_W, BTN_H / 2, { tl: 22, tr: 22, bl: 0, br: 0 });
    });
  }

  private int(a: number, b: number): number {
    return a + Math.floor(this.rand() * (b - a + 1));
  }

  /** The q-th sum: harder as q goes up */
  private sumFor(q: number): Question {
    const pick = this.rand();
    let a: number;
    let b: number;
    let text: string;
    let answer: number;
    if (q < 4) {
      a = this.int(2, 9);
      b = this.int(2, 9);
      [text, answer] = [`${a} + ${b}`, a + b];
    } else if (q < 9) {
      if (pick < 0.5) {
        a = this.int(11, 39);
        b = this.int(3, 9);
        [text, answer] = [`${a} + ${b}`, a + b];
      } else {
        a = this.int(11, 25);
        b = this.int(3, 9);
        [text, answer] = [`${a} - ${b}`, a - b];
      }
    } else if (q < 16) {
      if (pick < 0.55) {
        a = this.int(3, 9);
        b = this.int(3, 9);
        [text, answer] = [`${a} × ${b}`, a * b];
      } else {
        a = this.int(21, 69);
        b = this.int(12, 29);
        [text, answer] = pick < 0.8 ? [`${a} + ${b}`, a + b] : [`${a} - ${b}`, a - b];
      }
    } else {
      if (pick < 0.35) {
        a = this.int(6, 12);
        b = this.int(6, 12);
        [text, answer] = [`${a} × ${b}`, a * b];
      } else if (pick < 0.6) {
        b = this.int(3, 9);
        answer = this.int(3, 12);
        text = `${answer * b} ÷ ${b}`;
      } else {
        a = this.int(35, 99);
        b = this.int(15, 49);
        [text, answer] = pick < 0.8 ? [`${a} + ${b}`, a + b] : [`${a} - ${b}`, a - b];
      }
    }
    // Wrong answers close to the right one: off by one, by two, by ten, the digits swapped
    const near = [answer + 1, answer - 1, answer + 2, answer - 2, answer + 10, answer - 10, Number(String(answer).split('').reverse().join(''))];
    const wrong: number[] = [];
    while (wrong.length < 3) {
      const c = near.length ? near.splice(Math.floor(this.rand() * near.length), 1)[0] : answer + this.int(3, 15);
      if (c >= 0 && c !== answer && !wrong.includes(c)) wrong.push(c);
    }
    const choices = [answer, ...wrong];
    for (let i = choices.length - 1; i > 0; i--) {
      const j = Math.floor(this.rand() * (i + 1));
      [choices[i], choices[j]] = [choices[j], choices[i]];
    }
    return { text, answer, choices };
  }

  private next(): void {
    this.current = this.sumFor(this.q++);
    this.question.setFontSize(this.current.text.length > 7 ? 58 : 66);
    this.question.setText(this.current.text);
    this.card.setScale(0.85).setAlpha(0.3);
    this.tweens.add({ targets: this.card, scale: 1, alpha: 1, duration: 180, ease: 'Back.Out' });
    this.buttons.forEach((b, i) => {
      b.value = this.current!.choices[i];
      b.t.setText(String(b.value));
      b.t.setScale(0.7);
      this.tweens.add({ targets: b.t, scale: 1, duration: 160, delay: i * 25, ease: 'Back.Out' });
    });
    this.drawButtons(null);
    this.locked = false;
  }

  started(): void {
    this.next();
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      const { x, y } = this.at(p);
      const i = this.buttons.findIndex((b) => Math.abs(x - b.x) < BTN_W / 2 && Math.abs(y - b.y) < BTN_H / 2);
      if (i >= 0) this.answer(i);
    });
  }

  private answer(i: number): void {
    if (!this.running || this.locked || !this.current) return;
    this.locked = true;
    const b = this.buttons[i];
    const ok = b.value === this.current.answer;
    this.drawButtons({ i, ok });
    this.tweens.add({ targets: [b.g, b.t], scale: { from: 0.92, to: 1 }, duration: 160, ease: 'Back.Out' });
    if (ok) {
      this.streak++;
      this.addScore(1);
      this.sfx('right', 0.8 + Math.min(0.4, this.streak * 0.05));
      this.buzz(10);
      this.burst(b.x, b.y, '#4fffb0', 10, 220);
      this.pop(b.x, b.y - 50, '+1', '#9dffd6', 30);
      this.time.delayedCall(170, () => this.running && this.next());
    } else {
      this.streak = 0;
      this.penalty += PENALTY_MS;
      this.sfx('wrong');
      this.buzz([40, 30, 40]);
      this.shake(160, 0.01);
      this.pop(b.x, b.y - 50, '-2s', '#ff8a96', 30);
      // The right one shows a moment
      const right = this.buttons.findIndex((x) => x.value === this.current!.answer);
      this.time.delayedCall(120, () => this.drawButtons({ i: right, ok: true }));
      this.time.delayedCall(520, () => this.running && this.next());
    }
  }

  tick(): void {}

  finished(): void {
    this.input.removeAllListeners();
    this.question.setText('TIME');
    this.question.setFontSize(58);
    for (const b of this.buttons) b.t.setText('');
    this.drawButtons(null);
  }
}
