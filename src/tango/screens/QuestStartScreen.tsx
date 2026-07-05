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

import { useEffect, useRef, useState } from "react";
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

/** The brand-tinted hairline between ability text and the tides row. */
function ConsoleDivider() {
  return (
    <div
      style={{
        height: 1,
        marginTop: token("--space-4"),
        background: `linear-gradient(90deg, transparent, ${token("--line-strong")} 18%, ${token("--line-strong")} 82%, transparent)`,
      }}
    />
  );
}

/** Ability text with a press/hover reveal of its glossary-keyword definitions.
 * When the text has no terms it renders plain, with no reveal wiring. */
function AbilityReveal({
  text,
  stageRef,
}: {
  text: string;
  stageRef: React.RefObject<HTMLElement | null>;
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
  if (extractGlossaryTerms(text).length === 0) {
    return body;
  }
  return (
    <InfoCard.PressInfo
      stageRef={stageRef}
      as="div"
      card={<CardTermDefinitions text={text} />}
    >
      {body}
    </InfoCard.PressInfo>
  );
}

/** The starting-essence value with a press/hover explanation. */
function EssenceReveal({
  dreamcaller,
  stageRef,
}: {
  dreamcaller: DreamcallerOfferView;
  stageRef: React.RefObject<HTMLElement | null>;
}) {
  return (
    <InfoCard.PressInfo
      stageRef={stageRef}
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
        style={{
          display: "inline-flex",
          alignItems: "center",
          font: token("--t-body"),
          color: token("--text-primary"),
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

/** Desktop column metrics. Box measures are content-driven layout, so these
 * are caller numbers — locked so all three Dreamcaller columns render at
 * exactly the same fixed size. */
const COLUMN_W = 320; // wide enough for the full-body cutout to read large
const PORTRAIT_H = 500; // the standing figure's stage (cutout is 2:3, so ~480)
const CARD_OVERLAP = 120; // how far the console card rides up over the legs
const TIDE_DISC_PX = 30; // the hover-only tide discs (a touch bigger)
// A floor for the ability-text region so cards with shorter abilities keep the
// same layout as the common ~3-line ones — the height difference is absorbed
// here (above the divider) rather than opening a chasm above the Choose button.
// --t-rules is 14px at 1.36 line-height, so three lines ≈ 58px.
const ABILITY_MIN_H = 58;

/** What the "Tides (i)" reveal explains, mirroring the legacy select screen. */
const TIDES_BLURB =
  "Pools of cards you will see during the quest. Different tides are used every time you play.";

/** The desktop screen's small purple eyebrow title, pinned near the top of the
 * screen — the mobile ScreenHeader's uppercase accent treatment, in flow. */
function DesktopTitle() {
  return (
    <div
      style={{
        font: token("--t-eyebrow"),
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

/** One hover-only tide mark: a colored disc carrying the tide's glyph that
 * reveals the tide's name + description through the shared InfoCard on hover /
 * press. Uses `tideVisual` — the sanctioned tide-disc palette — so the disc
 * reads identically to that tide's pill elsewhere. */
function TideDiscReveal({
  tide,
  stageRef,
}: {
  tide: DreamcallerTideView;
  stageRef: React.RefObject<HTMLElement | null>;
}) {
  const v = tideVisual(tide.tide);
  return (
    <InfoCard.PressInfo
      stageRef={stageRef}
      card={
        <InfoCard
          variant="icon"
          glyph={v.icon}
          title={tide.label}
          body={richText.plain(tide.description)}
        />
      }
    >
      <span
        data-tide-disc={tide.id}
        aria-label={`Tide: ${tide.label}`}
        style={{
          width: TIDE_DISC_PX,
          height: TIDE_DISC_PX,
          borderRadius: "50%",
          display: "grid",
          placeItems: "center",
          background: v.bg,
          border: `1px solid ${v.bd}`,
          cursor: "pointer",
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

/** The desktop tides display: a "Tides (i)" eyebrow whose (i) reveals what
 * tides are, followed by a row of hover-only tide discs. Nothing expands —
 * each disc reveals its own tide on hover, mirroring the legacy select UI. */
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
      <InfoCard.PressInfo
        stageRef={stageRef}
        card={
          <InfoCard
            variant="icon"
            glyph={GLYPHS.water}
            title="Tides"
            body={richText.plain(TIDES_BLURB)}
          />
        }
      >
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: token("--space-1"),
            cursor: "pointer",
          }}
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
            Tides
          </span>
          <GlowIcon
            iconClass={GLYPHS.infoFilled}
            color="text-muted"
            size="13px"
          />
        </span>
      </InfoCard.PressInfo>

      <span
        style={{ display: "flex", alignItems: "center", gap: token("--space-2") }}
      >
        {tides.map((tide) => (
          <TideDiscReveal key={tide.id} tide={tide} stageRef={stageRef} />
        ))}
      </span>
    </div>
  );
}

/** The console card for one Dreamcaller. It rides up over the portrait's legs
 * (negative top margin) and grows to fill its column, which is stretched to the
 * tallest column — so all three cards lock to one height, with a modest bounded
 * whitespace above the Choose button. Spreading GroupPanel's glass onto our own
 * node is the sanctioned rung-2 way to size the pane. */
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
        flex: 1,
        marginTop: -CARD_OVERLAP,
        padding: token("--space-7"),
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Ability text, floored to a common height so a short ability doesn't
          push its divider (and everything below) up out of line with the
          others. */}
      <div style={{ minHeight: ABILITY_MIN_H }}>
        <AbilityReveal text={dreamcaller.renderedText} stageRef={stageRef} />
      </div>

      <ConsoleDivider />

      {/* Tides row: the "Tides (i)" eyebrow + hover discs on the left, the
          starting-essence chip on the right. */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: token("--space-4"),
          marginTop: token("--space-4"),
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

      {/* A flex backstop that only grows when a rare long ability makes another
          column taller; on the common case it is zero, so the gap above the
          button is just the fixed margin below. */}
      <div style={{ flex: 1 }} />

      <div
        data-choose-dreamcaller={dreamcaller.id}
        style={{ marginTop: token("--space-8") }}
      >
        <Button size="lg" full label="Choose" onClick={onChoose} />
      </div>
    </div>
  );
}

/** One desktop Dreamcaller column: the standing full-body cutout with the name
 * floating above the head, and the console card riding up over the legs. Fixed
 * width, a floored ability region, and stretch-to-tallest equalization lock all
 * three columns to one size. */
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
        style={{ position: "relative", height: PORTRAIT_H, flex: "none" }}
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
 * locked-size portrait columns. */
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
          triptych sizes to its content (the tallest column); `alignItems:
          stretch` there equalizes the three columns to that tallest one, so all
          cards lock to a single height without stretching to the viewport. */}
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
            alignItems: "stretch",
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
