import Phaser from 'phaser';
import { ArcadeScene, H, INK, PX, W } from '../engine/base.ts';

/** A wrong answer takes this off the clock */
const PENALTY_MS = 2000;
/** An answer this quick (ms) fills the fever bar a lot more */
const QUICK_MS = 1800;
const BTN_W = 168;
const BTN_H = 104;
const ROWS = [490, 610];
const COLS = [W / 2 - 88, W / 2 + 88];

interface Question {
  text: string;
  answer: number;
  choices: number[];
}

interface Button {
  img: Phaser.GameObjects.Image;
  t: Phaser.GameObjects.Container;
  x: number;
  y: number;
  value: number;
}

/**
 * Quick Maths: a sum in chalk on the board, four answers on wooden tiles. The right one scores and
 * the next sum comes (a quick one fills the fever bar faster); a wrong one costs two seconds. The
 * sums get harder as they go (adding, taking away, times tables, dividing), and come in the same
 * order for both players, drawn from the seed.
 */
export class MathsScene extends ArcadeScene {
  private q = 0;
  private current: Question | null = null;
  private shownAt = 0;
  private question!: Phaser.GameObjects.Container;
  private buttons: Button[] = [];
  private locked = false;

  build(): void {
    this.paintArt();
    this.sprite(W / 2, H / 2, 'maths-wall').setDepth(-100);
    this.sprite(W / 2, 230, 'maths-board');
    this.question = this.label(W / 2, 224, 'READY?', 4, '#f4f7ee');
    for (const y of ROWS) {
      for (const x of COLS) {
        const img = this.sprite(x, y, 'mbtn');
        this.buttons.push({ img, t: this.label(x, y - 4, '', 4, INK.cream).setDepth(2), x, y, value: 0 });
      }
    }
  }

  private paintArt(): void {
    this.pix('maths-wall', W / PX, H / PX, (p) => {
      const w = W / PX;
      const h = H / PX;
      p.rect('#2e4a52', 0, 0, w, h);
      p.dither('#34545c', 0, 0, w, h);
      // A wooden rail along the wall, the floor
      p.rect('#5a3a24', 0, 200, w, 6);
      p.rect('#7a5234', 0, 200, w, 2);
      p.rect('#24343a', 0, 206, w, h - 206);
      for (let y = 210; y < h; y += 12) p.rect('#2c3e44', 0, y, w, 1);
    });
    const bw = 176;
    const bh = 112;
    this.pix('maths-board', bw, bh, (p) => {
      p.rect(INK.line, 0, 0, bw, bh);
      p.rect('#8a5a34', 1, 1, bw - 2, bh - 2);
      p.rect('#a8744a', 1, 1, bw - 2, 2);
      p.rect('#1f4a3a', 6, 6, bw - 12, bh - 16);
      p.dither('#245442', 6, 6, bw - 12, bh - 16);
      // Old chalk smudges, the chalk ledge with two sticks
      p.dither('rgba(255,255,255,0.08)', 20, 14, 40, 10);
      p.dither('rgba(255,255,255,0.06)', 110, 70, 50, 12, 1);
      p.rect('#6a4428', 4, bh - 10, bw - 8, 5);
      p.rect('#f4f4f0', 30, bh - 12, 8, 2);
      p.rect('#ffd0e0', 44, bh - 12, 6, 2);
    });
    const tile = (key: string, face: string, light: string, dark: string) =>
      this.pix(key, BTN_W / PX, BTN_H / PX, (p) => {
        const w = BTN_W / PX;
        const h = BTN_H / PX;
        p.rect(INK.line, 0, 0, w, h);
        p.rect(dark, 1, 1, w - 2, h - 2);
        p.rect(face, 1, 1, w - 2, h - 6);
        p.rect(light, 1, 1, w - 2, 2);
        p.rect(light, 1, 1, 2, h - 6);
        // Wood grain
        for (let y = 8; y < h - 8; y += 7) p.rect(dark, 6 + ((y * 5) % 9), y, w - 16 - ((y * 3) % 11), 1);
      });
    tile('mbtn', '#b07a4a', '#d49a62', '#7a4e2c');
    tile('mbtn-right', '#3fae5a', '#7ae08a', '#24703a');
    tile('mbtn-wrong', '#c8384a', '#f0707e', '#802030');
  }

  /** One tile green or red, the others plain */
  private mark(state: { i: number; ok: boolean } | null): void {
    this.buttons.forEach((b, i) => b.img.setTexture(state?.i === i ? (state.ok ? 'mbtn-right' : 'mbtn-wrong') : 'mbtn'));
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
    this.relabel(this.question, this.current.text);
    this.question.setScale(this.current.text.length > 6 ? 0.8 : 1).setAlpha(0);
    this.tweens.add({ targets: this.question, alpha: 1, duration: 140 });
    this.buttons.forEach((b, i) => {
      b.value = this.current!.choices[i];
      this.relabel(b.t, String(b.value));
      b.t.setScale(0.7);
      this.tweens.add({ targets: b.t, scale: 1, duration: 160, delay: i * 25, ease: 'Back.Out' });
    });
    this.mark(null);
    this.shownAt = this.played;
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
    this.mark({ i, ok });
    this.tweens.add({ targets: b.img, scale: { from: PX * 0.92, to: PX }, duration: 160, ease: 'Back.Out' });
    if (ok) {
      const quick = this.played - this.shownAt < QUICK_MS;
      const got = this.addScore(1);
      this.good(quick);
      this.sfx('right', 0.8 + Math.min(0.4, this.combo * 0.05));
      this.buzz(10);
      this.burst(b.x, b.y, '#4fffb0', 10, 220);
      this.pop(b.x, b.y - 60, quick ? `QUICK +${got}` : `+${got}`, quick ? INK.gold : '#9dffd6', 2);
      this.time.delayedCall(170, () => this.running && this.next());
    } else {
      this.penalty += PENALTY_MS;
      this.miss();
      this.sfx('wrong');
      this.buzz([40, 30, 40]);
      this.shake(160, 0.01);
      this.pop(b.x, b.y - 60, '-2S', '#ff8a96', 3);
      // The right one shows a moment
      const right = this.buttons.findIndex((x) => x.value === this.current!.answer);
      this.time.delayedCall(120, () => this.mark({ i: right, ok: true }));
      this.time.delayedCall(520, () => this.running && this.next());
    }
  }

  tick(): void {}

  finished(): void {
    this.input.removeAllListeners();
    this.relabel(this.question, 'TIME');
    this.question.setScale(1);
    for (const b of this.buttons) this.relabel(b.t, '');
    this.mark(null);
  }
}
