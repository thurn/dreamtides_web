// InfoCard — the ONE press-to-reveal information card for Tango. Every
// reveal-on-interaction popup — tide descriptions, the Dreamcaller profile,
// dreamsign abilities, site descriptions, essence — renders through this single
// component so the vocabulary is identical everywhere.
//
// The shell is fixed and shared (a clean solid ground, not a scrim):
//   - no colored border, no arrow / caret pointing back at the origin
//   - one solid surface        — --surface-raised
//   - one corner radius         — --radius-popover
//   - one shadow                — --shadow-lg
//   - one type scale            — headline (serif) / body (rules) / meta (mono)
// Only the MEDIA treatment varies by content, via `variant`:
//   - object — a centered framed portrait OR contained transparent object
//   - hero   — a full-bleed media banner across the top, text below
//   - icon   — a glyph disc beside the title
//   - text   — an optional small lead glyph + title
//
// The placement / timing engine ships alongside it and is attached as
// statics: `InfoCard.PressPopover / PressInfo / usePressReveal / anchorRect /
// setRevealDelay / SITE_DISC`.
//
// ── The reveal contract ──────────────────────────────────────────────────
//   - no close button, no scrim; anchored to the trigger/pointer (never
//     centered, never under the finger), clamped fully on-screen, and
//     pointerEvents:none on the popover so it can't eat the release.
//   - a ~300ms click-window separates a TAP-to-enter from a HOLD-to-read.
//
// THE ONE DELIBERATE GENERALIZATION from the touch-first design source is the
// input-adaptive reveal (see `useFinePointer` / `usePressReveal`): on a fine
// pointer (mouse/desktop) HOVER reveals and press only compresses; on a coarse
// pointer (touch) press-down reveals and release dismisses. The popover
// contract above is identical in both modes.
//
// Ported from the Claude Design "Dreamtides Mobile" project
// (components/overlays/InfoCard.jsx / .d.ts), generalized from touch-only to
// Tango's input-adaptive pointer model.

import * as React from "react";
import { createPortal } from "react-dom";
import { Pressable, PRESS_SCALE } from "../primitives/Pressable";
import { token } from "../primitives/tokens";

/* ---- faithfully-copied layout literals from the design source (not tokens:
   these are the info-card's own fixed geometry, not design-system scale) ---- */
const CARD_W = 248; // every info card is this wide
const EDGE_PX = 12; // never within 12px of a screen edge
const GAP_PX = 14; // uniform distance from the pressed object
const CLICK_WINDOW_MS = 300; // release within this → still counts as a tap/click
const PADX = 15;
const PADY = 14;

/** Screen inset (px): the popover is clamped to never come within this of any
 * viewport edge. Exported for the clamp tests. */
export const EDGE = EDGE_PX;
/** Default uniform gap (px) between the popover and its anchor. Exported for
 * the clamp tests. */
export const GAP = GAP_PX;
/** Default click window (ms) separating a tap from a hold. Exported for the
 * tap-vs-hold tests. */
export const CLICK_WINDOW = CLICK_WINDOW_MS;

/**
 * The ONE global reveal delay (ms). Module-scoped (NOT a per-call prop) and read
 * live on each press, so a press target literally cannot be wired up without it —
 * there is no delay argument to forget. Default 0 — immediate, never a
 * long-press. Set via `InfoCard.setRevealDelay(ms)`.
 */
let revealDelayMs = 0;

/** Set the ONE global reveal delay (ms). Default 0 — immediate, never long-press. */
export function setRevealDelay(ms: number): void {
  revealDelayMs = Math.max(0, Math.round(Number(ms) || 0));
}

/* ---- the shared shell + type scale (the coherent vocabulary) ---- */
const shell: React.CSSProperties = {
  width: CARD_W,
  boxSizing: "border-box",
  textAlign: "left",
  overflow: "hidden",
  background: token("--surface-raised"), // solid, no transparency, no scrim
  borderRadius: token("--radius-popover"),
  boxShadow: token("--shadow-lg"), // no border
};
const tHeadline: React.CSSProperties = {
  margin: 0,
  font: token("--t-popover-headline"),
  color: token("--text-primary"),
  letterSpacing: "-0.01em",
};
const tBody: React.CSSProperties = {
  font: token("--t-popover-body"),
  color: token("--text-primary"),
};
const tMeta: React.CSSProperties = {
  font: token("--t-popover-meta"),
  letterSpacing: ".12em",
  textTransform: "uppercase",
  color: token("--text-faint"),
};

/** id of the one-time <style> element carrying the entrance keyframe. Guarded so
 * multiple InfoCard/PressPopover instances never duplicate it. */
const KEYFRAME_STYLE_ID = "info-card-kf";

/** Inserts the shared entrance keyframe into document.head, once per document. */
function ensureKeyframes(): void {
  if (typeof document === "undefined") {
    return;
  }
  if (document.getElementById(KEYFRAME_STYLE_ID) !== null) {
    return;
  }
  const styleElement = document.createElement("style");
  styleElement.id = KEYFRAME_STYLE_ID;
  styleElement.textContent =
    "@keyframes infoCardIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}";
  document.head.appendChild(styleElement);
}

/**
 * The violet-glow disc shared by the icon variant AND the dreamscape SiteNode,
 * so the disc reads identically in both. The gradient stops and glow are the
 * design source's own faithfully-copied literals; the inset ring is the
 * --accent token so a rebrand propagates.
 */
export const SITE_DISC: React.CSSProperties = {
  background: "radial-gradient(circle at 50% 34%, #23212b, #0a0910 82%)",
  boxShadow: `inset 0 0 0 2.5px ${token("--accent")}, 0 0 14px 1px rgba(168,85,247,0.45)`,
};

/**
 * The icon-variant disc tinted to a caller-supplied accent color, so a reveal
 * disc can read as the same hue as the node it opens from (e.g. a dreamscape
 * SiteNode). The gradient + glow recipe lives here in the design system; the
 * caller supplies only the accent color via `InfoCardProps.discAccent`.
 */
function accentDiscStyle(accent: string): React.CSSProperties {
  return {
    background: "radial-gradient(120% 120% at 50% 28%, #1a1525, #070512)",
    boxShadow: `inset 0 0 0 2px ${accent}73, 0 0 14px 1px ${accent}5c`,
  };
}

/** Which media treatment an InfoCard renders. */
export type InfoCardVariant = "object" | "hero" | "icon" | "text";

export interface InfoCardProps {
  /** Which media treatment. Default 'text'. */
  variant?: InfoCardVariant;
  title?: React.ReactNode;
  body?: React.ReactNode;
  /** Small mono/uppercase overline (hero + text variants). */
  meta?: React.ReactNode;
  /** Media source (object + hero variants). */
  image?: string;
  imagePos?: string;
  imageFilter?: string;
  /** A CSS background painted over the media (object frame / hero). */
  wash?: string;
  /** object variant: true = framed portrait, false = contained transparent object. */
  frame?: boolean;
  /** icon variant: the boxicon class. */
  glyph?: string;
  /**
   * icon variant: tint the reveal disc to this accent color so it matches the
   * node it opens from. Omit for the default violet-glow disc (SITE_DISC).
   */
  discAccent?: string;
  /** text variant: a small leading glyph node. */
  leadGlyph?: React.ReactNode;
}

/* ================================================================
   InfoCard — content, four media variants, one shell.
   ================================================================ */
/**
 * InfoCard — the one press-to-reveal information card. Four media variants on
 * one fixed shell (solid surface, no border/caret, one radius + shadow + type
 * scale). The placement/timing engine is attached as statics:
 * `InfoCard.PressPopover / PressInfo / usePressReveal / anchorRect /
 * setRevealDelay / SITE_DISC`.
 */
function InfoCardComponent({
  variant = "text",
  title,
  body,
  meta,
  image,
  imagePos = "50% 6%",
  imageFilter,
  wash,
  frame = false,
  glyph,
  discAccent,
  leadGlyph,
}: InfoCardProps): React.ReactElement {
  const Body =
    body == null ? null : (
      <div
        style={{ ...tBody, textAlign: variant === "object" ? "center" : "left" }}
      >
        {body}
      </div>
    );
  const Meta = meta ? <div style={{ ...tMeta, marginBottom: 7 }}>{meta}</div> : null;

  /* --- object: a centered media block (framed portrait OR contained
     transparent object) above its name + text. --- */
  if (variant === "object") {
    const media = frame ? (
      <div
        style={{
          width: 124,
          height: 150,
          flex: "none",
          position: "relative",
          overflow: "hidden",
          borderRadius: token("--radius-control"),
          // shadow token + a faithfully-copied inset hairline highlight
          boxShadow: `${token("--shadow-md")}, inset 0 0 0 1px rgba(255,255,255,0.08)`,
        }}
      >
        <img
          src={image}
          alt=""
          draggable={false}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition: imagePos,
            userSelect: "none",
          }}
        />
        {wash && (
          <div style={{ position: "absolute", inset: 0, background: wash }} />
        )}
      </div>
    ) : (
      <img
        src={image}
        alt=""
        draggable={false}
        style={{
          width: 96,
          height: 96,
          objectFit: "contain",
          display: "block",
          filter: imageFilter,
        }}
      />
    );
    return (
      <div
        style={{
          ...shell,
          padding: "18px 16px 16px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 12,
          textAlign: "center",
        }}
      >
        {media}
        <div style={{ ...tHeadline, textAlign: "center" }}>{title}</div>
        {Body}
      </div>
    );
  }

  /* --- hero: full-bleed media banner across the top, text at the bottom. A
     base gradient dissolves the media into the solid surface so the title/body
     sit on the card's own material, not a scrim over the scene. --- */
  if (variant === "hero") {
    return (
      <div style={{ ...shell }}>
        <div
          style={{
            position: "relative",
            width: "100%",
            height: 210,
            overflow: "hidden",
          }}
        >
          <img
            src={image}
            alt=""
            draggable={false}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
              objectPosition: imagePos,
              userSelect: "none",
              filter: imageFilter,
            }}
          />
          {wash && (
            <div style={{ position: "absolute", inset: 0, background: wash }} />
          )}
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: -1,
              height: 120,
              // faithfully-copied dissolve gradient into the raised surface
              background: `linear-gradient(to bottom, rgba(34,26,49,0) 0%, rgba(34,26,49,0.7) 60%, ${token("--surface-raised")} 100%)`,
            }}
          />
        </div>
        <div
          style={{
            position: "relative",
            marginTop: -16,
            padding: "0 16px 16px",
            background: token("--surface-raised"),
          }}
        >
          {Meta}
          <div style={{ ...tHeadline, marginBottom: body ? 7 : 0 }}>{title}</div>
          {body != null && <div style={{ ...tBody }}>{body}</div>}
        </div>
      </div>
    );
  }

  /* --- icon: a glyph disc beside the title, description below --- */
  if (variant === "icon") {
    return (
      <div style={{ ...shell, padding: `${String(PADY)}px ${String(PADX)}px` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span
            style={{
              width: 44,
              height: 44,
              flex: "none",
              borderRadius: "50%",
              display: "grid",
              placeItems: "center",
              ...(discAccent !== undefined
                ? accentDiscStyle(discAccent)
                : SITE_DISC),
            }}
          >
            <i
              className={glyph}
              aria-hidden="true"
              style={{ fontSize: 21, color: token("--text-on-accent") }}
            />
          </span>
          <div style={tHeadline}>{title}</div>
        </div>
        {body != null && <div style={{ ...tBody, marginTop: 11 }}>{body}</div>}
      </div>
    );
  }

  /* --- text: optional small lead glyph + title, description below --- */
  return (
    <div style={{ ...shell, padding: `${String(PADY)}px ${String(PADX)}px` }}>
      {Meta}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 9,
          marginBottom: body ? 7 : 0,
        }}
      >
        {leadGlyph}
        <div style={tHeadline}>{title}</div>
      </div>
      {Body}
    </div>
  );
}

/* ================================================================
   Pure engine logic (factored out for direct unit testing).
   ================================================================ */

/** A target element's box in stage-native px (frame scale divided out). */
export interface AnchorRect {
  x: number;
  top: number;
  bottom: number;
  w: number;
  h: number;
}

/**
 * The tap-vs-hold discriminator. PURE. A press released strictly WITHIN
 * `clickWindow` of the down time is a TAP (returns false → the child's onClick
 * is allowed to fire); a press whose duration reaches or exceeds the window is
 * a HOLD (returns true → reveal only, the child click is swallowed on touch).
 */
export function isHold(downT: number, upT: number, clickWindow: number): boolean {
  return upT - downT >= clickWindow;
}

/**
 * The on-screen clamp. PURE. Places a `width`×`height` popover a uniform
 * `gap` from `anchor`, preferring above then below, and clamps it to stay at
 * least `edge` px from every viewport side (the viewport dims travel on the
 * anchor as `w`/`h`). Returns the popover's { left, top } in stage-native px.
 *
 * A card larger than the viewport cannot satisfy every edge; it is pinned to
 * the leading (top-left) inset so at least its title/corner stays reachable.
 */
export function computePopoverPosition(
  anchor: AnchorRect,
  width: number,
  height: number,
  gap: number,
  edge: number,
): { left: number; top: number } {
  const { x, top, bottom, w, h } = anchor;
  const left = Math.max(edge, Math.min(x - width / 2, w - width - edge));
  const aboveTop = top - gap - height;
  const belowTop = bottom + gap;
  let t: number;
  if (aboveTop >= edge) {
    t = aboveTop; // fits above
  } else if (belowTop + height <= h - edge) {
    t = belowTop; // fits below
  } else {
    t = Math.max(edge, Math.min(aboveTop, h - height - edge)); // clamp into view
  }
  return { left, top: t };
}

/* ================================================================
   anchorRect — a target element's box in stage-native px. `stageEl` is the
   screen root; we divide out any frame scale so the anchor lives in the
   popover's coordinate space. Returns { x (center), top, bottom, w, h }.
   ================================================================ */
export function anchorRect(
  stageEl: HTMLElement,
  targetEl: HTMLElement,
): AnchorRect {
  const sr = stageEl.getBoundingClientRect();
  const r = targetEl.getBoundingClientRect();
  const k = sr.width ? stageEl.clientWidth / sr.width : 1;
  return {
    x: (r.left - sr.left + r.width / 2) * k,
    top: (r.top - sr.top) * k,
    bottom: (r.bottom - sr.top) * k,
    w: stageEl.clientWidth,
    h: stageEl.clientHeight,
  };
}

/* ================================================================
   useFinePointer — THE input-mode detector for the input-adaptive reveal.
   True on a fine pointer with real hover (mouse / trackpad / desktop), false
   on a coarse pointer (touch). Live via matchMedia so plugging in a mouse or
   switching to touch emulation re-evaluates.
   ================================================================ */
const FINE_POINTER_QUERY = "(hover: hover) and (pointer: fine)";

function useFinePointer(): boolean {
  const [fine, setFine] = React.useState<boolean>(() =>
    typeof window === "undefined" || typeof window.matchMedia !== "function"
      ? false
      : window.matchMedia(FINE_POINTER_QUERY).matches,
  );

  React.useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }
    const query = window.matchMedia(FINE_POINTER_QUERY);
    const onChange = (): void => setFine(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return fine;
}

export interface UsePressRevealResult {
  /** true from pointer-down to release (drive the immediate press scale). */
  pressed: boolean;
  /** true while the InfoCard should be revealed (gate the popover on this). */
  shown: boolean;
  /** true on a fine pointer / mouse (hover reveals); false on touch (press reveals). */
  fine: boolean;
  /** onPointerDown — begins the press; on touch it also reveals. */
  begin: (event?: React.PointerEvent) => void;
  /** onPointerUp / onPointerCancel — ends the press; on touch it dismisses. */
  end: () => void;
  /** onPointerEnter — reveals on a fine pointer (hover); no-op on touch. */
  enter: () => void;
  /** onPointerLeave — hides the reveal and releases the press (both modes). */
  leave: () => void;
  /** true once the press has outlasted the click window (a deliberate hold). */
  heldPastTap: () => boolean;
}

/* ================================================================
   usePressReveal — THE single press-reveal engine, generalized to Tango's
   input-adaptive model. EVERY reveal target drives its show/hide through this
   one hook so the reveal delay + click window apply identically everywhere.

   Fine pointer (mouse/desktop): HOVER reveals (enter shows, leave hides).
   pointerdown only compresses (pressed) — it never reveals; a click is a click,
   never a "hold".

   Coarse pointer (touch): pointerdown reveals (immediately — delay defaults to
   0, never a long-press) and compresses; pointerup/cancel/leave dismisses. The
   click window discriminates a TAP (child onClick fires) from a HOLD
   (reveal only).
   ================================================================ */
export function usePressReveal(
  { clickWindow = CLICK_WINDOW }: { clickWindow?: number } = {},
): UsePressRevealResult {
  const fine = useFinePointer();
  const [pressed, setPressed] = React.useState(false);
  const [shown, setShown] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const downAt = React.useRef(0);

  const clear = (): void => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };

  const reveal = (): void => {
    clear();
    if (revealDelayMs > 0) {
      timer.current = setTimeout(() => setShown(true), revealDelayMs);
    } else {
      setShown(true);
    }
  };

  const begin = (event?: React.PointerEvent): void => {
    event?.stopPropagation();
    downAt.current = Date.now();
    setPressed(true);
    // Touch: press-down reveals. Fine pointer: press only compresses (hover
    // owns the reveal) — nothing reveals on press.
    if (!fine) {
      reveal();
    }
  };

  const end = (): void => {
    setPressed(false);
    // Touch: release dismisses. Fine pointer: keep the hover reveal up (a
    // pointerup while still hovering must not hide the card); leave() hides it.
    if (!fine) {
      clear();
      setShown(false);
    }
  };

  const enter = (): void => {
    // Fine pointer only: hover reveals. On touch, enter fires right before down
    // and must NOT double-drive the reveal.
    if (fine) {
      reveal();
    }
  };

  const leave = (): void => {
    clear();
    setPressed(false);
    setShown(false);
  };

  const heldPastTap = (): boolean => isHold(downAt.current, Date.now(), clickWindow);

  React.useEffect(() => clear, []);

  return { pressed, shown, fine, begin, end, enter, leave, heldPastTap };
}

/* ================================================================
   PressPopover — positions its child a uniform GAP from the anchored object and
   clamps it fully on-screen. Measures its own height after mount, so it never
   guesses. pointerEvents:none so it can't intercept the release. Anchored to
   the trigger/pointer — never centered.
   ================================================================ */
export interface PressPopoverProps {
  anchor: AnchorRect | null;
  gap?: number;
  width?: number;
  children?: React.ReactNode;
}

export function PressPopover({
  anchor,
  gap = GAP,
  width = CARD_W,
  children,
}: PressPopoverProps): React.ReactElement {
  const ref = React.useRef<HTMLDivElement>(null);
  const [pos, setPos] = React.useState<{ left: number; top: number } | null>(
    null,
  );

  React.useEffect(() => {
    ensureKeyframes();
  }, []);

  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !anchor) {
      return;
    }
    setPos(computePopoverPosition(anchor, width, el.offsetHeight, gap, EDGE));
  }, [anchor, gap, width]);

  return (
    // `.tango` re-establishes the design-system token scope. The popover portals
    // OUT of its trigger's subtree (into a screen root or `document.body`), which
    // in the production app is not under a `.tango` ancestor, so without this the
    // InfoCard shell's `--surface-raised` / `--radius-popover` / `--shadow-lg` /
    // `--text-*` tokens resolve to nothing and the card renders with no surface.
    // The class only declares custom properties, so it adds no styling of its own.
    <div
      ref={ref}
      className="tango"
      style={{
        position: "absolute",
        width,
        zIndex: 90,
        pointerEvents: "none",
        left: pos ? pos.left : anchor ? anchor.x - width / 2 : 0,
        top: pos ? pos.top : 0,
        opacity: pos ? 1 : 0,
        animation: pos ? `infoCardIn 150ms ${token("--ease-out")} both` : "none",
      }}
    >
      {children}
    </div>
  );
}

/* ================================================================
   PressInfo — a trigger wrapper for inline objects (tide pills, the menu
   button, essence value). Drives the shared usePressReveal engine, measures
   itself against `stageRef` once the reveal fires, and portals a PressPopover
   into the stage so placement / clamping use stage coords.

   Input-adaptive: on a fine pointer it reveals on HOVER; on touch it reveals on
   press-down and dismisses on release. For bespoke press logic (sites,
   dreamsigns, HUD) call usePressReveal directly + anchorRect.

   `holdStillClicks` — what happens to the child's click when a TOUCH press
   OUTLASTS the click window (a deliberate hold-to-read, not a tap):
     - false (default) — the click is swallowed. Use for NAVIGATION or
       one-way / destructive triggers.
     - true — the click still fires after the hold. Use for triggers that merely
       OPEN A MENU or TOGGLE UI STATE on the same screen.
   On a fine pointer a click is always a click (hover is not a hold), so this
   flag has no effect there.
   ================================================================ */
export interface PressInfoProps {
  stageRef: React.RefObject<HTMLElement | null>;
  gap?: number;
  width?: number;
  /** The InfoCard (or any node) to reveal while pressed/hovered. */
  card?: React.ReactNode;
  children?: React.ReactNode;
  as?: React.ElementType;
  /** true = a touch hold still fires the child's click (menu / UI toggle). */
  holdStillClicks?: boolean;
}

export function PressInfo({
  stageRef,
  gap = GAP,
  width = CARD_W,
  card,
  children,
  as = "span",
  holdStillClicks = false,
}: PressInfoProps): React.ReactElement {
  const { shown, fine, begin, end, enter, leave, heldPastTap } =
    usePressReveal();
  const elRef = React.useRef<HTMLElement>(null);
  const [anchor, setAnchor] = React.useState<AnchorRect | null>(null);

  React.useLayoutEffect(() => {
    if (shown && stageRef.current && elRef.current) {
      setAnchor(anchorRect(stageRef.current, elRef.current));
    } else {
      setAnchor(null);
    }
  }, [shown, stageRef]);

  const onClickCapture = (event: React.MouseEvent): void => {
    // Only a TOUCH hold swallows the click; a mouse click is always a click.
    if (!fine && !holdStillClicks && heldPastTap()) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  return (
    <Pressable
      as={as}
      ref={elRef}
      onPointerEnter={enter}
      onPointerDown={begin}
      onPointerUp={end}
      onPointerLeave={leave}
      onPointerCancel={end}
      onClickCapture={onClickCapture}
      style={{ display: "inline-flex" }}
    >
      {children}
      {anchor &&
        stageRef.current &&
        createPortal(
          <PressPopover anchor={anchor} gap={gap} width={width}>
            {card}
          </PressPopover>,
          stageRef.current,
        )}
    </Pressable>
  );
}

/**
 * The engine statics attached to InfoCard, so any component reaches the whole
 * placement/timing engine through the one capitalized path:
 * `const { usePressReveal, PressPopover, PressInfo, anchorRect, SITE_DISC,
 * setRevealDelay } = InfoCard;`
 */
interface InfoCardStatics {
  PressPopover: typeof PressPopover;
  PressInfo: typeof PressInfo;
  usePressReveal: typeof usePressReveal;
  anchorRect: typeof anchorRect;
  setRevealDelay: typeof setRevealDelay;
  SITE_DISC: React.CSSProperties;
  PRESS_SCALE: number;
  CLICK_WINDOW: number;
}

/**
 * InfoCard — the component plus its engine statics. Attaching the engine with a
 * single typed `Object.assign` (no `any`) means the exported symbol both renders
 * the four variants and exposes `InfoCard.PressPopover / PressInfo /
 * usePressReveal / anchorRect / setRevealDelay / SITE_DISC` to callers.
 */
export const InfoCard: typeof InfoCardComponent & InfoCardStatics =
  Object.assign(InfoCardComponent, {
    PressPopover,
    PressInfo,
    usePressReveal,
    anchorRect,
    setRevealDelay,
    SITE_DISC,
    PRESS_SCALE,
    CLICK_WINDOW,
  });
