import Phaser from 'phaser';
import type { ArcadeGameId } from '$shared/arcade.ts';
import { DPR, type ArcadeScene, type RunOptions } from './base.ts';
import { KnifeScene } from '../games/knife.ts';
import { StackScene } from '../games/stack.ts';
import { FlapScene } from '../games/flap.ts';
import { ZigScene } from '../games/zig.ts';
import { PlankScene } from '../games/plank.ts';
import { DodgeScene } from '../games/dodge.ts';
import { WhackScene } from '../games/whack.ts';
import { MathsScene } from '../games/maths.ts';
import { SlicerScene } from '../games/slicer.ts';

/** Each game's scene. A new game: write its scene on ArcadeScene and add it here (and in shared/arcade.ts) */
const SCENES: Record<ArcadeGameId, new () => ArcadeScene> = {
  knife: KnifeScene,
  stack: StackScene,
  flap: FlapScene,
  zig: ZigScene,
  plank: PlankScene,
  dodge: DodgeScene,
  whack: WhackScene,
  maths: MathsScene,
  slicer: SlicerScene,
};

export interface Run {
  /** The countdown is over: play */
  begin(): void;
  /** Where the rival is (their ghost) */
  rival(d: number[]): void;
  /** The rival's run is over */
  rivalOver(): void;
  destroy(): void;
}

/**
 * One run of a game in `parent`, on the phone: Phaser draws it in a canvas filling the parent, as
 * many pixels as the screen has there (sharp, pixels kept square), the board scaled to fit inside
 * (see ArcadeScene.fit). The canvas follows the parent's size when it changes. It shows the board at
 * once and starts when `begin` is called, at the time the server set for both players.
 */
export function startRun(parent: HTMLElement, opts: RunOptions): Run {
  let scene: ArcadeScene | null = null;
  let wantBegin = false;
  const size = () => {
    const r = parent.getBoundingClientRect();
    return { w: Math.max(2, Math.round(r.width * DPR)), h: Math.max(2, Math.round(r.height * DPR)) };
  };
  const first = size();
  const game = new Phaser.Game({
    type: Phaser.WEBGL,
    parent,
    width: first.w,
    height: first.h,
    transparent: false,
    backgroundColor: '#0b0718',
    smoothPixelArt: true,
    // The canvas is stretched to the parent by CSS (GameView): its pixels are the screen's
    scale: { mode: Phaser.Scale.NONE },
    input: { activePointers: 2 },
    banner: false,
    audio: { noAudio: true },
    fps: { target: 60 },
  });
  const resized = new ResizeObserver(() => {
    if (!game.isBooted) return;
    const s = size();
    if (s.w === game.scale.width && s.h === game.scale.height) return;
    game.scale.resize(s.w, s.h);
    game.scale.refresh();
  });
  resized.observe(parent);
  const Scene = SCENES[opts.game];
  /** The scene, once it is created and running */
  const live = () => (scene?.sys.isActive() && scene.opts ? scene : null);
  game.events.once(Phaser.Core.Events.READY, () => {
    game.scene.add('run', Scene, true, opts);
    scene = game.scene.getScene('run') as unknown as ArcadeScene;
    if (wantBegin) scene.events.once(Phaser.Scenes.Events.CREATE, () => scene?.begin());
  });
  return {
    begin() {
      // The scene may still be getting created: it begins as soon as it is
      if (live()) scene!.begin();
      else if (scene) scene.events.once(Phaser.Scenes.Events.CREATE, () => scene?.begin());
      else wantBegin = true;
    },
    rival(d) {
      live()?.rival(d);
    },
    rivalOver() {
      live()?.rivalOver();
    },
    destroy() {
      resized.disconnect();
      game.destroy(true);
    },
  };
}
