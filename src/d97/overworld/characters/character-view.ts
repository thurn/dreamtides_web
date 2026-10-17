// One character on the overworld: its look's layer sprites stacked in z-order
// and sharing one animation frame, over a soft oval shadow, at its role's
// scale; or a capsule when it has no look. Positioned by its foot point
// (the bottom center of its tile).

import { Container, Graphics, Sprite } from "pixi.js";
import type { D97CharacterTunables } from "../../../content/d97/tunables";
import { drawCapsule, PLACEHOLDER_OUTLINE } from "../placeholder-palette";
import type { Facing } from "../walker";
import { animationColumn, CHARACTER_FRAME_SIZE, FACING_ROWS } from "./animation";
import type { CharacterLook } from "./character-looks";

/** Pixels between an LPC frame's bottom and the character's feet. */
const FEET_INSET = 2;
/** Pixels from an LPC frame's top to the top of a standing head. */
const HEAD_INSET = 10;

export class CharacterView extends Container {
  private readonly look: CharacterLook | null;
  private readonly sprites: Sprite[] = [];
  private facing: Facing = "down";
  private moving = false;
  private clock = 0;
  /** Pixels from the foot point up to the top of the head, scaled. */
  readonly headHeight: number;

  constructor(look: CharacterLook | null, scale: number, tileWidth: number, tileHeight: number, capsuleColor: number) {
    super();
    this.look = look;
    const shadow = new Graphics()
      .ellipse(0, -1, tileWidth * 0.32, tileHeight * 0.11)
      .fill({ color: PLACEHOLDER_OUTLINE, alpha: 0.35 });
    this.addChild(shadow);
    if (look === null) {
      const capsule = new Graphics();
      drawCapsule(capsule, tileWidth, tileHeight, capsuleColor);
      capsule.position.set(-tileWidth / 2, 0);
      this.addChild(capsule);
      this.headHeight = tileHeight * 1.05 * scale;
    } else {
      for (const layer of look.layers) {
        const sprite = new Sprite(layer.frames.idle[FACING_ROWS.down]?.[0]);
        sprite.anchor.set(0.5, 1);
        sprite.position.set(0, FEET_INSET);
        this.sprites.push(sprite);
        this.addChild(sprite);
      }
      this.headHeight = (CHARACTER_FRAME_SIZE - HEAD_INSET - FEET_INSET) * scale;
    }
    this.scale.set(scale);
  }

  /** The current facing. */
  get currentFacing(): Facing {
    return this.facing;
  }

  /** Whether layered sprites draw it (false: a capsule). */
  get layered(): boolean {
    return this.look !== null;
  }

  /** Face `facing`, walking or standing; a change restarts the cycle. */
  setPose(facing: Facing, moving: boolean): void {
    if (facing === this.facing && moving === this.moving) return;
    if (moving !== this.moving) this.clock = 0;
    this.facing = facing;
    this.moving = moving;
  }

  /** Advance the animation by `seconds` and show the current frame. */
  advance(seconds: number, tunables: D97CharacterTunables): void {
    this.clock += seconds;
    if (this.look === null) return;
    const animation = this.moving ? "walk" : "idle";
    const column = animationColumn(animation, this.clock, tunables);
    const row = FACING_ROWS[this.facing];
    this.look.layers.forEach((layer, index) => {
      const texture = layer.frames[animation][row]?.[column];
      const sprite = this.sprites[index];
      if (texture !== undefined && sprite !== undefined) sprite.texture = texture;
    });
  }
}
