// QuestStartScreen — the Tango rendering of Dreamcaller selection (the quest's
// opening screen). Two layouts share one view-model and switch on viewport:
//   - Mobile (narrow): a full-bleed swipe carousel, one Dreamcaller per page,
//     with the full-body character cutout standing on an ambient backdrop
//     behind a frosted GroupPanel console.
//   - Desktop (wide): a small purple eyebrow title near the top of a shared
//     background, then the offered Dreamcallers side by side — each the
//     standing full-body cutout over a soft glow, the name floating above the
//     head, and a locked-size console card riding up over the legs (ability
//     text, a row of hover-only tide discs + starting-essence chip, and a
//     full-width Button). All three columns render at exactly the same size.
// PURE: it renders from a view-model and reports the chosen Dreamcaller through
// `onPick`; the adapter owns state, the offer, the seed, and startQuest.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Motes } from "../components/hud/Motes";
import { GroupPanel } from "../components/controls/GroupPanel";
import { Button } from "../components/controls/Button";
import { ResourceChip } from "../components/hud/ResourceChip";
import { RulesText } from "../components/card/RulesText";
import { CardTermDefinitions } from "../components/card/CardTermDefinitions";
import { InfoCard } from "../components/overlay/InfoCard";
import { GlowIcon } from "../components/controls/GlowIcon";
import { richText } from "../components/card/rich-text";
import {
  TideCluster,
  type TideClusterTideView,
} from "../components/hud/TideCluster";
import { tideVisual } from "../components/hud/TidePill";
import { Pressable } from "../primitives/Pressable";
import { GLYPHS } from "../primitives/glyph";
import { token } from "../primitives/tokens";
import type { TangoColor } from "../primitives/color";
import { dreamcallerCutoutSrc } from "../components/hud/DreamcallerPortrait";
import { extractGlossaryTerms } from "../../data/glossary-terms";

/** One tide shown on a Dreamcaller, already resolved to display copy. It is
 * exactly the cluster's tide view, re-exported under the screen's own name so
 * the view-model builder keeps importing `DreamcallerTideView` from here. */
export type DreamcallerTideView = TideClusterTideView;

/** One signature card (kept for the shared view type; unused by the carousel). */
export interface DreamcallerSignatureCardView {
  id: string;
  name: string;
}

/** A single Dreamcaller offered on the select screen, as display data. */
export interface DreamcallerOfferView {
  id: string;
  name: string;
  title: string;
  imageNumber: string;
  renderedText: string;
  startingEssence: number;
  signatureCards: DreamcallerSignatureCardView[];
  tides: DreamcallerTideView[];
}

export interface QuestStartScreenProps {
  /** The Dreamcallers offered this run (typically three). */
  dreamcallers: DreamcallerOfferView[];
  /** Called with a Dreamcaller's id when the player commits to it. */
  onPick: (dreamcallerId: string) => void;
}

/** How wide the viewport must be to lay the offered Dreamcallers out side by
 * side instead of as a one-per-page swipe carousel. Below this the screen is a
 * mobile carousel; at or above it, a desktop triptych. */
const DESKTOP_MIN_WIDTH = 900;
const DESKTOP_QUERY = `(min-width: ${String(DESKTOP_MIN_WIDTH)}px)`;

/** True when the viewport is wide enough for the side-by-side desktop layout.
 * Live via matchMedia so rotating a tablet or resizing a window re-evaluates,
 * mirroring InfoCard's `useFinePointer` idiom. */
function useIsDesktop(): boolean {
  const [desktop, setDesktop] = useState<boolean>(() =>
    typeof window === "undefined" || typeof window.matchMedia !== "function"
      ? false
      : window.matchMedia(DESKTOP_QUERY).matches,
  );

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }
    const query = window.matchMedia(DESKTOP_QUERY);
    const onChange = (): void => setDesktop(query.matches);
    onChange();
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return desktop;
}

/** The full-bleed cinematic figure for one Dreamcaller: the transparent
 * full-body cutout standing on an ambient tinted backdrop, feet anchored to
 * the bottom of the page so the legs sink behind the console's glass. */
function FullBleedPortrait({
  dreamcaller,
}: {
  dreamcaller: DreamcallerOfferView;
}) {
  const [broken, setBroken] = useState(false);
  const backdrop = (
    <div
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        background: `radial-gradient(120% 85% at 50% 24%, color-mix(in srgb, ${token("--gold")} 16%, transparent) 0%, color-mix(in srgb, ${token("--accent")} 22%, transparent) 46%, ${token("--bg-sunken")} 100%)`,
      }}
    />
  );
  if (broken) {
    return (
      <>
        {backdrop}
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeItems: "center",
            color: token("--text-primary"),
            fontWeight: 800,
            fontSize: 64,
            letterSpacing: "0.08em",
          }}
        >
          {dreamcaller.name.charAt(0)}
        </div>
      </>
    );
  }
  return (
    <>
      {backdrop}
      <img
        src={dreamcallerCutoutSrc(dreamcaller.imageNumber)}
        alt={`${dreamcaller.name}, ${dreamcaller.title}`}
        draggable={false}
        // The figure is the scene the console's frosted glass blurs through, so
        // it must paint as early as possible: a late-arriving figure leaves the
        // GroupPanel's `backdrop-filter` with nothing to refract, then "pops"
        // the blur in once the art finally paints. Fetch it eagerly at high
        // priority and decode async so it lands with the first frame.
        fetchPriority="high"
        loading="eager"
        decoding="async"
        onError={() => {
          setBroken(true);
        }}
        style={{
          position: "absolute",
          // Slightly wider than the page so the width-limited `contain` fit
          // renders the figure large: on a phone the head rises to just below
          // the title instead of leaving a dead band of backdrop between them.
          left: "-6%",
          bottom: 0,
          width: "112%",
          height: "96%",
          objectFit: "contain",
          objectPosition: "50% 100%",
          userSelect: "none",
        }}
      />
    </>
  );
}

/** The brand-tinted hairline between ability text and the tides row. `flush`
 * drops the built-in top margin for callers (the desktop card) that own their
 * own spacing rhythm through a flex `gap`. */
function ConsoleDivider({ flush = false }: { flush?: boolean }) {
  return (
    <div
      style={{
        height: 1,
        marginTop: flush ? 0 : token("--space-4"),
        background: `linear-gradient(90deg, transparent, ${token("--line-strong")} 18%, ${token("--line-strong")} 82%, transparent)`,
      }}
    />
  );
}

/** The smallest the ability text is allowed to auto-shrink to (fraction of its
 * natural size), so a long ability stays legible rather than scaling to nothing. */
const ABILITY_MIN_SCALE = 0.7;

/** A fixed-height box that vertically centers its content and shrinks it (as a
 * uniform scale about its center) just enough to fit `height` when the content
 * would otherwise overflow. A transform reads as a smaller font while keeping
 * the rich-text pips/carets in proportion; `offsetHeight` is pre-transform, so
 * the natural size is measured directly with no reset dance. */
function AutoShrinkText({
  height,
  children,
}: {
  height: number;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // offsetHeight ignores the visual transform, so it is always the content's
    // natural (unscaled) height regardless of the scale currently applied.
    const natural = el.offsetHeight;
    const next =
      natural > height ? Math.max(ABILITY_MIN_SCALE, height / natural) : 1;
    setScale(next);
  }, [children, height]);

  return (
    <div
      style={{
        height,
        display: "flex",
        alignItems: "center",
        overflow: "hidden",
      }}
    >
      <div
        ref={ref}
        style={{
          width: "100%",
          transform: scale < 1 ? `scale(${String(scale)})` : undefined,
          transformOrigin: "left center",
        }}
      >
        {children}
      </div>
    </div>
  );
}

/** Ability text with a press/hover reveal of its glossary-keyword definitions.
 * When the text has no terms it renders plain, with no reveal wiring. When
 * `clampHeight` is set (the desktop card, whose columns share one height) the
 * text renders in a fixed-height, vertically-centered box and auto-shrinks to
 * fit; without it the text takes its natural height (the mobile console). */
function AbilityReveal({
  text,
  stageRef,
  clampHeight,
}: {
  text: string;
  stageRef: React.RefObject<HTMLElement | null>;
  clampHeight?: number;
}) {
  const body = (
    <div
      style={{
        font: token("--t-rules"),
        color: token("--text-primary"),
        lineHeight: 1.36,
      }}
    >
      <RulesText text={text} />
    </div>
  );
  const content =
    extractGlossaryTerms(text).length === 0 ? (
      body
    ) : (
      <InfoCard.PressInfo
        stageRef={stageRef}
        as="div"
        card={<CardTermDefinitions text={text} />}
      >
        {body}
      </InfoCard.PressInfo>
    );
  if (clampHeight == null) {
    return content;
  }
  return <AutoShrinkText height={clampHeight}>{content}</AutoShrinkText>;
}

/** The starting-essence value with a press/hover explanation. Informational —
 * hovering brightens it subtly but a press does not compress it (there is no
 * action to press). */
function EssenceReveal({
  dreamcaller,
  stageRef,
}: {
  dreamcaller: DreamcallerOfferView;
  stageRef: React.RefObject<HTMLElement | null>;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <InfoCard.PressInfo
      stageRef={stageRef}
      compress={false}
      card={
        <InfoCard
          variant="icon"
          glyph={GLYPHS.essence}
          title="Starting Essence"
          body={richText.plain(
            "The essence this Dreamcaller begins the quest with, spent at sites this run.",
          )}
        />
      }
    >
      <span
        data-starting-essence-value={dreamcaller.id}
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          font: token("--t-body"),
          color: token("--text-primary"),
          filter: hovered ? "brightness(1.18)" : "none",
          transition: `filter ${token("--dur-fast")} ${token("--ease-out")}`,
        }}
      >
        <ResourceChip kind="essence" value={dreamcaller.startingEssence} />
      </span>
    </InfoCard.PressInfo>
  );
}

/** The mobile carousel's frosted-glass console beneath a portrait: ability
 * text, a hairline, the collapsible tides cluster + starting essence, and the
 * Choose action. */
function DreamcallerConsole({
  dreamcaller,
  stageRef,
  onChoose,
}: {
  dreamcaller: DreamcallerOfferView;
  stageRef: React.RefObject<HTMLElement | null>;
  onChoose: () => void;
}) {
  const hasTides = dreamcaller.tides.length > 0;
  return (
    <GroupPanel>
      <AbilityReveal text={dreamcaller.renderedText} stageRef={stageRef} />

      <ConsoleDivider />

      <div
        style={{
          display: "flex",
          // The essence aligns to the FIRST row of the tides (the TideCluster's
          // header), not the whole block, which grows downward as the cluster
          // expands — so the row is top-aligned and the essence is centered
          // within a header-height box below.
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: token("--space-5"),
          marginTop: token("--space-3"),
        }}
      >
        {hasTides ? (
          <span data-dreamcaller-tides={dreamcaller.id}>
            <TideCluster tides={dreamcaller.tides} stageRef={stageRef} />
          </span>
        ) : (
          <span />
        )}
        {/* Center the essence within a box the height of the tides' first row,
            keeping "200" level with the "Tides" label (a 24px disc in space-2
            padding) in both the collapsed and expanded states. Box measures are
            content-driven layout, so raw px is right. */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            minHeight: `calc(24px + 2 * ${token("--space-2")})`,
          }}
        >
          <EssenceReveal dreamcaller={dreamcaller} stageRef={stageRef} />
        </div>
      </div>

      <div
        data-choose-dreamcaller={dreamcaller.id}
        style={{ marginTop: token("--space-6") }}
      >
        <Button size="lg" full label="Choose" onClick={onChoose} />
      </div>
    </GroupPanel>
  );
}

/** The Dreamcaller's name and epithet, sitting directly on the portrait so it
 * earns legibility from the on-media outline dilation rather than a plate. */
function DreamcallerTitle({ dreamcaller }: { dreamcaller: DreamcallerOfferView }) {
  return (
    <div
      style={{
        position: "absolute",
        top: token("--safe-top"),
        left: 0,
        right: 0,
        padding: `${token("--space-10")} ${token("--gutter")} 0`,
        zIndex: 4,
        textAlign: "center",
      }}
    >
      <h1 style={{ margin: 0 }}>
        <span
          style={{
            display: "block",
            font: token("--t-hero"),
            color: token("--text-primary"),
            textShadow: token("--text-outline-media"),
          }}
        >
          {dreamcaller.name}
        </span>
        <span
          style={{
            display: "block",
            marginTop: token("--space-1"),
            font: token("--t-hero-epithet"),
            color: token("--text-primary"),
            textShadow: token("--text-outline-media"),
          }}
        >
          {dreamcaller.title}
        </span>
      </h1>
    </div>
  );
}

/** The screen's uppercase eyebrow, painted on the portrait at top-center. It
 * does not swipe on mobile and spans the full width on desktop. */
function ScreenHeader() {
  return (
    <div
      style={{
        position: "absolute",
        top: token("--safe-top"),
        left: 0,
        right: 0,
        zIndex: 6,
        padding: `${token("--space-5")} ${token("--gutter")} 0`,
        textAlign: "center",
        pointerEvents: "none",
        font: token("--t-eyebrow"),
        letterSpacing: token("--tracking-eyebrow"),
        textTransform: "uppercase",
        color: token("--accent-bright"),
        // The eyebrow sits directly on the portrait too, so it earns the same
        // on-media outline dilation as the name rather than a soft shadow.
        textShadow: token("--text-outline-media"),
      }}
    >
      Choose Your Dreamcaller
    </div>
  );
}

/** A circular edge chevron that pages the carousel without swiping. */
function EdgeChevron({
  dir,
  onClick,
}: {
  dir: "left" | "right";
  onClick: () => void;
}) {
  return (
    <Pressable
      as="button"
      aria-label={dir === "left" ? "Previous" : "Next"}
      onPointerDown={(event: React.PointerEvent) => {
        event.stopPropagation();
      }}
      onClick={onClick}
      style={{
        position: "absolute",
        top: "46%",
        [dir]: token("--space-3"),
        zIndex: 6,
        width: 40,
        height: 40,
        borderRadius: token("--radius-pill"),
        border: `1px solid ${token("--border-soft")}`,
        background: token("--surface-glass"),
        color: token("--text-secondary"),
        display: "grid",
        placeItems: "center",
        fontSize: 22,
        lineHeight: 1,
      }}
    >
      <GlowIcon
        iconClass={dir === "left" ? GLYPHS.chevronLeft : GLYPHS.chevronRight}
        color="text-secondary"
        size="1em"
      />
    </Pressable>
  );
}

/** One mobile carousel page: portrait + title + console, sized to a fraction of
 * the swipe track and animated in as it becomes active. */
function DreamcallerPage({
  dreamcaller,
  active,
  count,
  onChoose,
  stageRef,
}: {
  dreamcaller: DreamcallerOfferView;
  active: boolean;
  count: number;
  onChoose: () => void;
  stageRef: React.RefObject<HTMLElement | null>;
}) {
  return (
    <div
      data-dreamcaller-page={dreamcaller.id}
      style={{
        width: `${100 / count}%`,
        height: "100%",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <FullBleedPortrait dreamcaller={dreamcaller} />
      <Motes on={active} tint="warm" zIndex={1} />

      <DreamcallerTitle dreamcaller={dreamcaller} />

      {/* Console */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 4,
          padding: `0 ${token("--gutter")} calc(${token("--safe-bottom")} + ${token("--space-5")})`,
          // The console slides up into place, but its opacity is NOT animated:
          // the GroupPanel's frosted glass uses `backdrop-filter`, and an
          // ancestor at `opacity < 1` flattens this subtree into a group the
          // filter cannot sample the scene through — so a fade would leave the
          // glass washed-out until opacity reached exactly 1, then "pop" the
          // blur in. Revealing by transform alone keeps the backdrop live the
          // whole time.
          transform: active ? "translateY(0)" : "translateY(16px)",
          transition: `transform ${token("--dur-base")} ${token("--ease-out")}`,
        }}
      >
        <DreamcallerConsole
          dreamcaller={dreamcaller}
          stageRef={stageRef}
          onChoose={onChoose}
        />
      </div>
    </div>
  );
}

/** The mobile Dreamcaller-selection carousel: a full-bleed swipe carousel of
 * the offered Dreamcallers, one per page. */
function CarouselSelect({ dreamcallers, onPick }: QuestStartScreenProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [dx, setDx] = useState(0);
  const drag = useRef<{ active: boolean; x0: number }>({ active: false, x0: 0 });
  const count = dreamcallers.length;

  const clamp = (next: number): number =>
    Math.max(0, Math.min(count - 1, next));

  const onPointerDown = (event: React.PointerEvent): void => {
    drag.current = { active: true, x0: event.clientX };
    setDx(0);
  };
  const onPointerMove = (event: React.PointerEvent): void => {
    if (drag.current.active) setDx(event.clientX - drag.current.x0);
  };
  const onPointerUp = (): void => {
    if (!drag.current.active) return;
    const threshold = 46;
    let next = index;
    if (dx < -threshold) next = clamp(index + 1);
    else if (dx > threshold) next = clamp(index - 1);
    drag.current.active = false;
    setDx(0);
    setIndex(next);
  };

  return (
    <div
      ref={stageRef}
      className="tango"
      style={{
        position: "relative",
        minHeight: "100vh",
        height: "100dvh",
        overflow: "hidden",
        background: token("--bg-app"),
        touchAction: "pan-y",
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <ScreenHeader />

      {/* Track */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          width: `${count * 100}%`,
          transform: `translateX(calc(${(-index * 100) / count}% + ${dx}px))`,
          transition: drag.current.active
            ? "none"
            : `transform ${token("--dur-slow")} ${token("--ease-out")}`,
        }}
      >
        {dreamcallers.map((dreamcaller, i) => (
          <DreamcallerPage
            key={dreamcaller.id}
            dreamcaller={dreamcaller}
            active={i === index}
            count={count}
            onChoose={() => {
              onPick(dreamcaller.id);
            }}
            stageRef={stageRef}
          />
        ))}
      </div>

      {index > 0 && (
        <EdgeChevron dir="left" onClick={() => setIndex(clamp(index - 1))} />
      )}
      {index < count - 1 && (
        <EdgeChevron dir="right" onClick={() => setIndex(clamp(index + 1))} />
      )}
    </div>
  );
}

/** How many tide discs render at most; a Dreamcaller with more shows the first
 * few (the rest are the same pools, just less prominent). */
const MAX_TIDE_DISCS = 4;
/** The hover-only tide discs' diameter, in px. */
const TIDE_DISC_PX = 24;

/** Desktop column metrics. Box measures are content-driven layout, so these are
 * caller numbers. Each column is a fixed-width figure stage with a narrower,
 * center-aligned console card riding up over the legs. */
const COLUMN_W = 400; // the figure stage's width
const PORTRAIT_H = 715; // the standing figure's stage height
const PORTRAIT_SCALE = 1.2; // grows the cutout art from the feet past the column
const CARD_W = 320; // console-card width (narrower than the column, centered)
const CARD_OVERLAP = 275; // how far the card's center rides up over the figure
/** The fixed height of the desktop ability-text box — two lines of the rules
 * voice (14px × 1.36 ≈ 38px, rounded to a round 40). The ability text is
 * vertically centered in this box and auto-shrinks to fit, so every column's
 * ability region is exactly the same height regardless of copy length. Box
 * measures are content-driven layout, so this is a caller number. */
const ABILITY_BOX_H = 40;

/** What the "Tides (i)" reveal explains, mirroring the legacy select screen. */
const TIDES_BLURB =
  "Pools of cards you will see during the quest. Different tides are used every time you play.";

/** The desktop screen's small purple eyebrow title, pinned near the top of the
 * screen — the mobile ScreenHeader's uppercase accent treatment, in flow. */
function DesktopTitle() {
  return (
    <div
      style={{
        // The mobile ScreenHeader's uppercase accent eyebrow, scaled up so the
        // screen's one title carries real presence at desktop widths.
        font: token("--t-eyebrow"),
        fontSize: 18,
        letterSpacing: token("--tracking-eyebrow"),
        textTransform: "uppercase",
        color: token("--accent-bright"),
        textAlign: "center",
      }}
    >
      Choose Your Dreamcaller
    </div>
  );
}

/** The Dreamcaller's transparent full-body cutout, standing unframed on the
 * screen's shared background over a soft ambient glow. Feet anchor to the
 * bottom of the stage, where the console card rides up over the legs and its
 * glass blurs them. Falls back to a tinted monogram disc on a 404. */
function StandingFigure({ dreamcaller }: { dreamcaller: DreamcallerOfferView }) {
  const [broken, setBroken] = useState(false);
  const glow = (
    <div
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        background: `radial-gradient(72% 56% at 50% 62%, color-mix(in srgb, ${token("--accent")} 26%, transparent) 0%, color-mix(in srgb, ${token("--gold")} 10%, transparent) 46%, transparent 72%)`,
        pointerEvents: "none",
      }}
    />
  );
  if (broken) {
    return (
      <>
        {glow}
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeItems: "center",
          }}
        >
          <div
            style={{
              width: 160,
              height: 160,
              borderRadius: "50%",
              display: "grid",
              placeItems: "center",
              background: `radial-gradient(circle at 50% 20%, color-mix(in srgb, ${token("--gold")} 24%, transparent) 0%, color-mix(in srgb, ${token("--accent")} 24%, transparent) 38%, ${token("--bg-sunken")} 100%)`,
              color: token("--text-primary"),
              fontWeight: 800,
              fontSize: 56,
              letterSpacing: "0.08em",
            }}
          >
            {dreamcaller.name.charAt(0)}
          </div>
        </div>
      </>
    );
  }
  return (
    <>
      {glow}
      <img
        src={dreamcallerCutoutSrc(dreamcaller.imageNumber)}
        alt={`${dreamcaller.name}, ${dreamcaller.title}`}
        draggable={false}
        fetchPriority="high"
        loading="eager"
        decoding="async"
        onError={() => {
          setBroken(true);
        }}
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          width: "100%",
          height: "100%",
          objectFit: "contain",
          // Feet on the floor of the stage: the head keeps the cutout's own
          // headroom for the floating name, and the legs drop to the bottom
          // where the console card rides over them.
          objectPosition: "50% 100%",
          // Grow the art from the feet: the cutout is contained within the
          // column width, so scaling here is how it reads larger (overflowing
          // the column) while the feet — and thus the card that rides over the
          // legs — stay anchored to the stage floor.
          transform: `scale(${String(PORTRAIT_SCALE)})`,
          transformOrigin: "50% 100%",
          userSelect: "none",
        }}
      />
    </>
  );
}

/** The Dreamcaller's name + epithet, floating on the portrait above the head.
 * On-media, so it earns legibility from the outline dilation, not a plate. */
function PortraitName({ dreamcaller }: { dreamcaller: DreamcallerOfferView }) {
  return (
    <div
      style={{
        position: "absolute",
        top: token("--space-4"),
        left: token("--space-3"),
        right: token("--space-3"),
        zIndex: 2,
        textAlign: "center",
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          font: token("--t-title"),
          color: token("--text-primary"),
          textShadow: token("--text-outline-media"),
          lineHeight: 1.05,
        }}
      >
        {dreamcaller.name}
      </div>
      <div
        style={{
          marginTop: token("--space-1"),
          font: token("--t-hero-epithet"),
          color: token("--text-primary"),
          textShadow: token("--text-outline-media"),
        }}
      >
        {dreamcaller.title}
      </div>
    </div>
  );
}

/** One hover-only tide mark: a colored disc carrying the tide's glyph. On hover
 * / press it reveals, through the shared InfoCard, what tides are (the general
 * blurb) stacked ABOVE this specific tide's own colored card. Informational —
 * hovering brightens the disc but a press does not compress it (there is no
 * action to press). Uses `tideVisual` — the sanctioned tide-disc palette — so
 * the disc reads identically to that tide's card and pill elsewhere. */
function TideDiscReveal({
  tide,
  stageRef,
}: {
  tide: DreamcallerTideView;
  stageRef: React.RefObject<HTMLElement | null>;
}) {
  const v = tideVisual(tide.tide);
  const [hovered, setHovered] = useState(false);
  return (
    <InfoCard.PressInfo
      stageRef={stageRef}
      compress={false}
      card={
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: token("--space-3"),
          }}
        >
          <InfoCard
            variant="icon"
            glyph={GLYPHS.water}
            title="Tides"
            body={richText.plain(TIDES_BLURB)}
          />
          <InfoCard
            variant="tide"
            tide={tide.tide}
            title={tide.label}
            body={richText.plain(tide.description)}
          />
        </div>
      }
    >
      <span
        data-tide-disc={tide.id}
        aria-label={`Tide: ${tide.label}`}
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
        style={{
          width: TIDE_DISC_PX,
          height: TIDE_DISC_PX,
          borderRadius: "50%",
          display: "grid",
          placeItems: "center",
          background: v.bg,
          border: `1px solid ${v.bd}`,
          cursor: "pointer",
          filter: hovered ? "brightness(1.25)" : "none",
          transition: `filter ${token("--dur-fast")} ${token("--ease-out")}`,
        }}
      >
        <GlowIcon
          iconClass={v.icon}
          color={v.fg as TangoColor}
          size={`${String(Math.round(TIDE_DISC_PX * 0.5))}px`}
        />
      </span>
    </InfoCard.PressInfo>
  );
}

/** The desktop tides display: a plain "Tides:" label, followed by a row of
 * hover-only tide discs (capped at {@link MAX_TIDE_DISCS}). Nothing expands —
 * each disc reveals, on hover, what tides are plus its own tide's card. The
 * label itself is a static caption, not a reveal trigger. */
function StaticTides({
  tides,
  stageRef,
}: {
  tides: DreamcallerTideView[];
  stageRef: React.RefObject<HTMLElement | null>;
}) {
  return (
    <div
      style={{ display: "flex", alignItems: "center", gap: token("--space-4") }}
    >
      <span
        style={{
          font: token("--t-eyebrow"),
          letterSpacing: token("--tracking-eyebrow"),
          textTransform: "uppercase",
          color: token("--text-secondary"),
          lineHeight: 1,
        }}
      >
        Tides:
      </span>

      <span
        style={{ display: "flex", alignItems: "center", gap: token("--space-2") }}
      >
        {tides.slice(0, MAX_TIDE_DISCS).map((tide) => (
          <TideDiscReveal key={tide.id} tide={tide} stageRef={stageRef} />
        ))}
      </span>
    </div>
  );
}

/** The console card for one Dreamcaller. It is narrower than its column and
 * center-aligned under the figure, riding up over the legs; its interior is an
 * even --space-6 rhythm stack — padding, then the ability text, divider, tides
 * row, and Choose button each separated by one step. The ability region takes
 * its natural height, and the card is pulled up by half its own height
 * (`translateY(-50%)`) so cards of different heights share one vertical center
 * line, positioned by {@link CARD_OVERLAP}. Spreading GroupPanel's glass onto
 * our own node is the sanctioned rung-2 way to size the pane. */
function DreamcallerCard({
  dreamcaller,
  onChoose,
  stageRef,
}: {
  dreamcaller: DreamcallerOfferView;
  onChoose: () => void;
  stageRef: React.RefObject<HTMLElement | null>;
}) {
  const hasTides = dreamcaller.tides.length > 0;
  return (
    <div
      data-dreamcaller-column={dreamcaller.id}
      style={{
        ...GroupPanel.style(),
        position: "relative",
        zIndex: 1,
        // Narrower than its column (the figure stage keeps the full column
        // width); centering it leaves the portrait framing intact.
        width: CARD_W,
        alignSelf: "center",
        marginTop: -CARD_OVERLAP,
        // Pull the card up by half its own height so its vertical CENTER lands
        // on the flow anchor (the same line for every column), center-aligning
        // cards that differ in height.
        transform: "translateY(-50%)",
        // The vertical rhythm: one --space-6 of padding on every side and the
        // same step above each stacked child (applied as margins so the layout
        // reads as an even stack).
        padding: token("--space-6"),
        display: "flex",
        flexDirection: "column",
      }}
    >
      <AbilityReveal
        text={dreamcaller.renderedText}
        stageRef={stageRef}
        clampHeight={ABILITY_BOX_H}
      />

      <div style={{ marginTop: token("--space-6") }}>
        <ConsoleDivider flush />
      </div>

      {/* Tides row: the "Tides:" label + hover discs on the left, the
          starting-essence chip on the right. */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: token("--space-4"),
          marginTop: token("--space-6"),
        }}
      >
        {hasTides ? (
          <span data-dreamcaller-tides={dreamcaller.id}>
            <StaticTides tides={dreamcaller.tides} stageRef={stageRef} />
          </span>
        ) : (
          <span />
        )}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            minHeight: TIDE_DISC_PX,
          }}
        >
          <EssenceReveal dreamcaller={dreamcaller} stageRef={stageRef} />
        </div>
      </div>

      <div
        data-choose-dreamcaller={dreamcaller.id}
        style={{ marginTop: token("--space-6") }}
      >
        {/* The responsive `md` height — the `lg` commit height belongs to the
            mobile carousel, where the button is the page's single full-width
            action. */}
        <Button size="md" full label="Choose" onClick={onChoose} />
      </div>
    </div>
  );
}

/** One desktop Dreamcaller column: a fixed-width stack of the portrait stage
 * (the standing cutout with the name floating above the head) and the console
 * card, which rides up over the legs and takes its natural height. */
function DreamcallerColumn({
  dreamcaller,
  onChoose,
  stageRef,
}: {
  dreamcaller: DreamcallerOfferView;
  onChoose: () => void;
  stageRef: React.RefObject<HTMLElement | null>;
}) {
  return (
    <div
      style={{
        width: COLUMN_W,
        flex: "none",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          position: "relative",
          height: PORTRAIT_H,
          flex: "none",
        }}
      >
        <StandingFigure dreamcaller={dreamcaller} />
        <PortraitName dreamcaller={dreamcaller} />
      </div>
      <DreamcallerCard
        dreamcaller={dreamcaller}
        onChoose={onChoose}
        stageRef={stageRef}
      />
    </div>
  );
}

/** The desktop Dreamcaller-selection layout: a small purple eyebrow title near
 * the top of a shared background, then the offered Dreamcallers side by side as
 * fixed-width portrait columns. */
function DesktopSelect({ dreamcallers, onPick }: QuestStartScreenProps) {
  const stageRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={stageRef}
      className="tango"
      style={{
        position: "relative",
        minHeight: "100dvh",
        overflowX: "hidden",
        overflowY: "auto",
        background: token("--bg-app"),
        display: "flex",
        flexDirection: "column",
        paddingBottom: `calc(${token("--safe-bottom")} + ${token("--space-8")})`,
      }}
    >
      {/* A soft ambient glow + drifting motes give the shared background life
          without competing with the portraits. */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 0,
          background: `radial-gradient(120% 80% at 50% 0%, color-mix(in srgb, ${token("--accent")} 16%, transparent) 0%, transparent 60%)`,
          pointerEvents: "none",
        }}
      />
      <Motes on tint="violet" zIndex={0} />

      {/* Small purple eyebrow title, near the top. */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          padding: `calc(${token("--safe-top")} + ${token("--space-6")}) ${token("--gutter")} 0`,
        }}
      >
        <DesktopTitle />
      </div>

      {/* The offered Dreamcallers, centered in the remaining space. The inner
          triptych aligns the columns at the top (`alignItems: flex-start`) so
          the fixed-height figure stages keep their feet on one line; each card
          then center-aligns itself within its own footprint. */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: `${token("--space-8")} ${token("--gutter")}`,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
            flexWrap: "wrap",
            gap: token("--space-8"),
          }}
        >
          {dreamcallers.map((dreamcaller) => (
            <DreamcallerColumn
              key={dreamcaller.id}
              dreamcaller={dreamcaller}
              onChoose={() => {
                onPick(dreamcaller.id);
              }}
              stageRef={stageRef}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * The Tango Dreamcaller-selection screen. Pure and props-driven — it renders
 * {@link QuestStartScreenProps.dreamcallers} and calls {@link
 * QuestStartScreenProps.onPick} with the chosen Dreamcaller's id. The layout
 * follows the viewport: a swipe carousel on mobile, a side-by-side triptych of
 * standalone portraits on desktop.
 */
export function QuestStartScreen(props: QuestStartScreenProps) {
  const isDesktop = useIsDesktop();
  return isDesktop ? <DesktopSelect {...props} /> : <CarouselSelect {...props} />;
}
