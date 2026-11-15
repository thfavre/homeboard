import Phaser from 'phaser';
import type { ArcadeGameId } from '$shared/arcade.ts';
import { H, R, W, type ArcadeScene, type RunOptions } from './base.ts';
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
  /** A big word over the game (a callout about the race) */
  callout(text: string, color: string): void;
  destroy(): void;
}

/**
 * One run of a game in `parent`, on the phone: Phaser draws it in a canvas sized to the parent (the
 * board scaled to fit, sharp at the phone's pixel density, pixels kept square). It shows the board
 * at once and starts when `begin` is called, at the time the server set for both players.
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
    backgroundColor: '#0b0718',
    smoothPixelArt: true,
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    input: { activePointers: 2 },
    banner: false,
    audio: { noAudio: true },
    fps: { target: 60 },
  });
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
    callout(text, color) {
      live()?.banner(text, color, 3, -170);
    },
    destroy() {
      game.destroy(true);
    },
  };
}
