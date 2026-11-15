import Phaser from 'phaser';
import type { ArcadeGameId } from '$shared/arcade.ts';
import { H, R, W, type ArcadeScene, type RunOptions } from './base.ts';
import { KnifeScene } from '../games/knife.ts';
import { StackScene } from '../games/stack.ts';
import { FlapScene } from '../games/flap.ts';
import { ZigScene } from '../games/zig.ts';
import { MathsScene } from '../games/maths.ts';
import { SlicerScene } from '../games/slicer.ts';

/** Each game's scene. A new game: write its scene on ArcadeScene and add it here (and in shared/arcade.ts) */
const SCENES: Record<ArcadeGameId, new () => ArcadeScene> = {
  knife: KnifeScene,
  stack: StackScene,
  flap: FlapScene,
  zig: ZigScene,
  maths: MathsScene,
  slicer: SlicerScene,
};

export interface Run {
  /** The countdown is over: play */
  begin(): void;
  destroy(): void;
}

/**
 * One run of a game in `parent`, on the phone: Phaser draws it in a canvas sized to the parent (the
 * board scaled to fit, sharp at the phone's pixel density). It shows the board at once and starts
 * when `begin` is called, at the time the server set for both players.
 */
export function startRun(parent: HTMLElement, opts: RunOptions): Run {
  let scene: ArcadeScene | null = null;
  let wantBegin = false;
  const game = new Phaser.Game({
    type: Phaser.WEBGL,
    parent,
    width: W * R,
    height: H * R,
    transparent: false,
    backgroundColor: '#000000',
    antialias: true,
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    input: { activePointers: 2 },
    banner: false,
    audio: { noAudio: true },
    fps: { target: 60 },
  });
  const Scene = SCENES[opts.game];
  game.events.once(Phaser.Core.Events.READY, () => {
    game.scene.add('run', Scene, true, opts);
    scene = game.scene.getScene('run') as unknown as ArcadeScene;
    if (wantBegin) scene.events.once(Phaser.Scenes.Events.CREATE, () => scene?.begin());
  });
  return {
    begin() {
      // The scene may still be getting created: it begins as soon as it is
      if (scene?.sys.isActive() && scene.opts) scene.begin();
      else if (scene) scene.events.once(Phaser.Scenes.Events.CREATE, () => scene?.begin());
      else wantBegin = true;
    },
    destroy() {
      game.destroy(true);
    },
  };
}
