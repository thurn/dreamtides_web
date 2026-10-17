// The dream veil and the waypoint obelisk (overworld visual guide, "Dream
// doors" and "Waypoints"). A veil fills a door's arched opening with a slow
// swirl of its state color flecked with twinkling stars, a soft glow around
// the frame, motes drifting upward and a faint rune ring on the threshold; the
// act exit's red veil has larger motes and a brighter glow. A waypoint is a
// crystal obelisk, grey stone while dormant and lit blue with a glow, motes
// and a rune ring once activated. Pure presentation: Pixi owns the animation.

import { BlurFilter, Container, Graphics, Sprite, Texture } from "pixi.js";

/** A door's veil by door state. */
export type VeilVariant = "unexplored" | "traversed" | "actExit" | "limbo";

interface VeilPalette {
  /** Swirl colors from the center outward. */
  readonly swirl: readonly [string, string, string];
  readonly glow: number;
  readonly mote: number;
  readonly sparkle: number;
  /** Glow opacity at its brightest. */
  readonly glowAlpha: number;
  readonly moteCount: number;
  /** Mote side in pixels at 1×. */
  readonly moteSize: number;
}

const VEIL_PALETTES: Readonly<Record<VeilVariant, VeilPalette>> = {
  unexplored: { swirl: ["#e6d6ff", "#8a5cf0", "#24124f"], glow: 0xa57bff, mote: 0xd9c2ff, sparkle: 0xffffff, glowAlpha: 0.45, moteCount: 6, moteSize: 2 },
  traversed: { swirl: ["#d6ecff", "#4a8ff0", "#0e2457"], glow: 0x6fb2ff, mote: 0xc8e6ff, sparkle: 0xffffff, glowAlpha: 0.45, moteCount: 6, moteSize: 2 },
  actExit: { swirl: ["#ffd9c9", "#e0452f", "#3f0909"], glow: 0xff5a3d, mote: 0xffb199, sparkle: 0xfff1d6, glowAlpha: 0.8, moteCount: 10, moteSize: 3 },
  limbo: { swirl: ["#ffffff", "#d8dcff", "#5d6182"], glow: 0xffffff, mote: 0xffffff, sparkle: 0xffffff, glowAlpha: 0.5, moteCount: 6, moteSize: 2 },
};

const STONE = { frame: 0x4b4f5c, frameEdge: 0x22252d, dormant: 0x8d929c, dormantEdge: 0x4a4e57 } as const;
const WAYPOINT_LIT = { crystal: 0x7cc7ff, crystalEdge: 0x1f4f8a, glow: 0x5ab4ff, mote: 0xc8e6ff, ring: 0x9fd4ff } as const;

/** Seconds per full turn of the swirl. */
const SWIRL_TURN_SECONDS = 14;
const GLOW_PULSE_SECONDS = 2.4;
const SPARKLE_COUNT = 7;
/** Mote rise speed and lifetime, in tile heights and seconds. */
const MOTE_RISE_TILES_PER_SECOND = 0.55;
const MOTE_LIFE_SECONDS = 2.2;
const SWIRL_TEXTURE_SIZE = 96;

/** A deterministic [0, 1) sequence, so captures repeat exactly. */
function sequence(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function swirlTexture(colors: VeilPalette["swirl"]): Texture {
  const size = SWIRL_TEXTURE_SIZE;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (context === null) return Texture.WHITE;
  const center = size / 2;
  const fill = context.createRadialGradient(center, center, 0, center, center, center);
  fill.addColorStop(0, colors[0]);
  fill.addColorStop(0.45, colors[1]);
  fill.addColorStop(1, colors[2]);
  context.fillStyle = fill;
  context.fillRect(0, 0, size, size);
  // Spiral arms in the light color give the rotation something to show.
  context.strokeStyle = colors[0];
  context.lineCap = "round";
  for (let arm = 0; arm < 3; arm += 1) {
    context.globalAlpha = 0.35;
    context.lineWidth = 3;
    context.beginPath();
    for (let step = 0; step <= 40; step += 1) {
      const t = step / 40;
      const angle = arm * ((2 * Math.PI) / 3) + t * Math.PI * 2.2;
      const radius = t * center;
      const x = center + Math.cos(angle) * radius;
      const y = center + Math.sin(angle) * radius;
      if (step === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.stroke();
  }
  context.globalAlpha = 1;
  const texture = Texture.from(canvas);
  texture.source.scaleMode = "nearest";
  return texture;
}

/** Upward-drifting motes over a rectangle, recycled as they fade. */
class Motes extends Container {
  private readonly motes: { readonly view: Graphics; age: number; x: number }[] = [];

  constructor(
    count: number,
    size: number,
    color: number,
    private readonly spanLeft: number,
    private readonly spanWidth: number,
    private readonly baseY: number,
    private readonly tileHeight: number,
    private readonly random: () => number,
  ) {
    super();
    for (let index = 0; index < count; index += 1) {
      const view = new Graphics().rect(0, 0, size, size).fill(color);
      view.blendMode = "add";
      this.addChild(view);
      this.motes.push({ view, age: (index / count) * MOTE_LIFE_SECONDS, x: this.spanLeft + this.random() * this.spanWidth });
    }
  }

  advance(seconds: number): void {
    for (const mote of this.motes) {
      mote.age += seconds;
      if (mote.age >= MOTE_LIFE_SECONDS) {
        mote.age -= MOTE_LIFE_SECONDS;
        mote.x = this.spanLeft + this.random() * this.spanWidth;
      }
      const life = mote.age / MOTE_LIFE_SECONDS;
      mote.view.position.set(Math.round(mote.x), Math.round(this.baseY - mote.age * MOTE_RISE_TILES_PER_SECOND * this.tileHeight));
      mote.view.alpha = Math.sin(life * Math.PI);
    }
  }
}

/** A soft additive glow: `shape` drawn, blurred and pulsing. */
function glow(shape: Graphics, strength: number): Graphics {
  shape.blendMode = "add";
  shape.filters = [new BlurFilter({ strength, quality: 3 })];
  return shape;
}

/** The arch of a door opening: a rectangle under a half-circle top. */
function arch(graphics: Graphics, x: number, top: number, width: number, bottom: number): Graphics {
  const radius = width / 2;
  return graphics
    .moveTo(x, bottom)
    .lineTo(x, top + radius)
    .arc(x + radius, top + radius, radius, Math.PI, 0)
    .lineTo(x + width, bottom)
    .closePath();
}

/**
 * A dream veil in a placeholder stone arch, drawn on a door tile whose
 * bottom-left corner is the container's origin.
 */
export class DreamVeil extends Container {
  readonly variant: VeilVariant;
  private readonly texture: Texture;
  private readonly swirl: Sprite;
  private readonly counterSwirl: Sprite;
  private readonly halo: Graphics;
  private readonly ring: Graphics;
  private readonly sparkles: { readonly view: Graphics; readonly phase: number }[] = [];
  private readonly motes: Motes;
  private readonly palette: VeilPalette;
  private clock = 0;

  constructor(variant: VeilVariant, w: number, h: number, seed: number) {
    super();
    this.variant = variant;
    const palette = VEIL_PALETTES[variant];
    this.palette = palette;
    const random = sequence(seed);
    const left = Math.round(w * 0.14);
    const width = w - 2 * left;
    const top = -Math.round(h * 1.55);

    this.halo = glow(arch(new Graphics(), left - 4, top - 4, width + 8, 0).fill(palette.glow), variant === "actExit" ? 8 : 6);
    const frame = arch(new Graphics(), left - 3, top - 3, width + 6, 0).fill(STONE.frame).stroke({ color: STONE.frameEdge, width: 2 });

    const opening = new Container();
    const mask = arch(new Graphics(), left, top, width, 0).fill(0xffffff);
    this.texture = swirlTexture(palette.swirl);
    const span = Math.max(width, -top) * 1.6;
    this.swirl = new Sprite(this.texture);
    this.counterSwirl = new Sprite(this.texture);
    for (const sprite of [this.swirl, this.counterSwirl]) {
      sprite.anchor.set(0.5);
      sprite.width = span;
      sprite.height = span;
      sprite.position.set(left + width / 2, top / 2);
    }
    this.counterSwirl.alpha = 0.35;
    this.counterSwirl.blendMode = "add";
    opening.addChild(this.swirl, this.counterSwirl);
    for (let index = 0; index < SPARKLE_COUNT; index += 1) {
      const view = new Graphics()
        .rect(-1, 0, 3, 1)
        .rect(0, -1, 1, 3)
        .fill(palette.sparkle);
      view.position.set(Math.round(left + 2 + random() * (width - 4)), Math.round(top + 4 + random() * (-top - 8)));
      opening.addChild(view);
      this.sparkles.push({ view, phase: random() * Math.PI * 2 });
    }
    opening.addChild(mask);
    opening.mask = mask;

    this.ring = new Graphics().ellipse(w / 2, -2, w * 0.46, h * 0.14).stroke({ color: palette.glow, width: 1 });
    this.ring.blendMode = "add";
    this.motes = new Motes(palette.moteCount, palette.moteSize, palette.mote, left, width, -h * 0.2, h, random);
    this.addChild(this.halo, frame, opening, this.ring, this.motes);
    this.advance(0);
  }

  advance(seconds: number): void {
    this.clock += seconds;
    const turn = (2 * Math.PI * this.clock) / SWIRL_TURN_SECONDS;
    this.swirl.rotation = turn;
    this.counterSwirl.rotation = -turn * 1.4;
    const pulse = (1 - Math.cos((2 * Math.PI * this.clock) / GLOW_PULSE_SECONDS)) / 2;
    this.halo.alpha = this.palette.glowAlpha * (0.7 + 0.3 * pulse);
    this.ring.alpha = 0.25 + 0.25 * pulse;
    for (const { view, phase } of this.sparkles) {
      view.alpha = Math.max(0, Math.sin(this.clock * 2.1 + phase));
    }
    this.motes.advance(seconds);
  }

  override destroy(): void {
    super.destroy({ children: true });
    if (this.texture !== Texture.WHITE) this.texture.destroy(true);
  }
}

/**
 * The waypoint obelisk on a tile whose bottom-left corner is the container's
 * origin: grey stone while dormant, lit blue once activated.
 */
export class WaypointObelisk extends Container {
  private readonly crystal = new Graphics();
  private readonly halo: Graphics;
  private readonly ring: Graphics;
  private readonly motes: Motes;
  private readonly w: number;
  private readonly h: number;
  private active = false;
  private clock = 0;

  constructor(w: number, h: number, seed: number) {
    super();
    this.w = w;
    this.h = h;
    const plinth = new Graphics()
      .rect(w * 0.18, -h * 0.22, w * 0.64, h * 0.22)
      .fill(STONE.frame)
      .stroke({ color: STONE.frameEdge, width: 2 });
    this.halo = glow(new Graphics().ellipse(w / 2, -h * 0.75, w * 0.42, h * 0.75).fill(WAYPOINT_LIT.glow), 6);
    this.ring = new Graphics().ellipse(w / 2, -2, w * 0.5, h * 0.16).stroke({ color: WAYPOINT_LIT.ring, width: 1 });
    this.ring.blendMode = "add";
    this.motes = new Motes(5, 2, WAYPOINT_LIT.mote, w * 0.25, w * 0.5, -h * 0.4, h, sequence(seed));
    this.addChild(this.halo, this.ring, plinth, this.crystal, this.motes);
    this.setActive(false);
  }

  get isActive(): boolean {
    return this.active;
  }

  setActive(active: boolean): void {
    this.active = active;
    const { w, h } = this;
    const fill = active ? WAYPOINT_LIT.crystal : STONE.dormant;
    const edge = active ? WAYPOINT_LIT.crystalEdge : STONE.dormantEdge;
    this.crystal
      .clear()
      .poly([w / 2, -h * 1.45, w * 0.68, -h * 0.95, w * 0.62, -h * 0.22, w * 0.38, -h * 0.22, w * 0.32, -h * 0.95])
      .fill(fill)
      .stroke({ color: edge, width: 2 });
    this.halo.visible = active;
    this.ring.visible = active;
    this.motes.visible = active;
  }

  advance(seconds: number): void {
    this.clock += seconds;
    if (!this.active) return;
    const pulse = (1 - Math.cos((2 * Math.PI * this.clock) / GLOW_PULSE_SECONDS)) / 2;
    this.halo.alpha = 0.35 + 0.2 * pulse;
    this.ring.alpha = 0.3 + 0.3 * pulse;
    this.motes.advance(seconds);
  }
}
