// QuestStartScreen — the Tango rendering of Dreamcaller selection (the quest's
// opening screen). Two layouts share one view-model and switch on viewport:
//   - Mobile (narrow): a full-bleed swipe carousel, one Dreamcaller per page.
//   - Desktop (wide): all offered Dreamcallers side by side as full-bleed
//     standalone portraits — no carousel — each with its own console.
// Both show a cinematic portrait + serif name/epithet + a frosted GroupPanel
// console holding ability text, tides, starting essence, and a Choose action.
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
import { TidePill } from "../components/hud/TidePill";
import { Pressable } from "../primitives/Pressable";
import { GLYPHS } from "../primitives/glyph";
import { token } from "../primitives/tokens";
import { dreamcallerImageSrc } from "../components/hud/DreamcallerPortrait";
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

/** The full-bleed cinematic portrait for one Dreamcaller. Screen-local: it
 * fills its slot and needs no frame, unlike the shared DreamcallerPortrait —
 * on the desktop layout it stands alone as a media element, uncontained. */
function FullBleedPortrait({
  dreamcaller,
}: {
  dreamcaller: DreamcallerOfferView;
}) {
  const [broken, setBroken] = useState(false);
  if (broken) {
    return (
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "grid",
          placeItems: "center",
          background: `radial-gradient(circle at 50% 20%, color-mix(in srgb, ${token("--gold")} 24%, transparent) 0%, color-mix(in srgb, ${token("--accent")} 24%, transparent) 38%, ${token("--bg-sunken")} 100%)`,
          color: token("--text-primary"),
          fontWeight: 800,
          fontSize: 64,
          letterSpacing: "0.08em",
        }}
      >
        {dreamcaller.name.charAt(0)}
      </div>
    );
  }
  return (
    <img
      src={dreamcallerImageSrc(dreamcaller.imageNumber)}
      alt={`${dreamcaller.name}, ${dreamcaller.title}`}
      draggable={false}
      // The portrait is the scene the console's frosted glass blurs through, so
      // it must paint as early as possible: a late-arriving portrait leaves the
      // GroupPanel's `backdrop-filter` with nothing to refract, then "pops" the
      // blur in once the art finally paints. Fetch it eagerly at high priority
      // and decode async so it lands with the first frame of the screen.
      fetchPriority="high"
      loading="eager"
      decoding="async"
      onError={() => {
        setBroken(true);
      }}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        objectFit: "cover",
        objectPosition: "50% 10%",
        transform: "scale(1.5)",
        transformOrigin: "50% 0%",
        userSelect: "none",
      }}
    />
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

/** The desktop tides display: every tide as a full, always-visible pill (each
 * carrying its own hover/press description reveal), wrapping to fill the
 * console width — no collapsed disc cluster. */
function TidePillsRow({
  tides,
  stageRef,
}: {
  tides: DreamcallerTideView[];
  stageRef: React.RefObject<HTMLElement | null>;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: token("--space-2"),
      }}
    >
      {tides.map((tide) => (
        <TidePill
          key={tide.id}
          size="sm"
          label={tide.label}
          description={tide.description}
          tide={tide.tide}
          stageRef={stageRef}
        />
      ))}
    </div>
  );
}

/** The frosted-glass console beneath a portrait: ability text, a hairline, the
 * tides + starting essence, and the Choose action. Shared by both layouts; the
 * `layout` picks how the tides read — the mobile carousel collapses them into a
 * TideCluster, the desktop triptych shows the full pills at all times. */
function DreamcallerConsole({
  dreamcaller,
  stageRef,
  layout,
  onChoose,
}: {
  dreamcaller: DreamcallerOfferView;
  stageRef: React.RefObject<HTMLElement | null>;
  layout: "mobile" | "desktop";
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
          // The essence aligns to the FIRST row of the tides (the mobile
          // TideCluster's header, the desktop pills' first line), not the whole
          // block, which grows downward as tides expand or wrap — so the row is
          // top-aligned and the essence is centered within a header-height box
          // below.
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: token("--space-5"),
          marginTop: token("--space-3"),
        }}
      >
        {hasTides ? (
          <span
            data-dreamcaller-tides={dreamcaller.id}
            style={layout === "desktop" ? { minWidth: 0, flex: "1 1 auto" } : undefined}
          >
            {layout === "desktop" ? (
              <TidePillsRow tides={dreamcaller.tides} stageRef={stageRef} />
            ) : (
              <TideCluster tides={dreamcaller.tides} stageRef={stageRef} />
            )}
          </span>
        ) : (
          <span />
        )}
        {/* Center the essence within a box the height of the tides' first row,
            keeping "200" level with the mobile "Tides" label (a 24px disc in
            space-2 padding) / the desktop pills' first line, in every tide
            state. Box measures are content-driven layout, so raw px is right. */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            minHeight:
              layout === "desktop"
                ? "20px"
                : `calc(24px + 2 * ${token("--space-2")})`,
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
          layout="mobile"
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

/** One desktop column: a full-bleed standalone portrait — no frame, no
 * container — with its title on the art and its console anchored at the bottom.
 * The column div is layout-only (an equal flex slice); the portrait is the
 * media element and stands alone. */
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
      data-dreamcaller-column={dreamcaller.id}
      style={{
        position: "relative",
        flex: "1 1 0",
        minWidth: 0,
        height: "100%",
        overflow: "hidden",
      }}
    >
      <FullBleedPortrait dreamcaller={dreamcaller} />
      <Motes on tint="warm" zIndex={1} />

      <DreamcallerTitle dreamcaller={dreamcaller} />

      {/* Console — bottom-anchored so the three consoles align along their base
          and grow upward with their ability text. */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 4,
          padding: `0 ${token("--gutter")} calc(${token("--safe-bottom")} + ${token("--space-5")})`,
        }}
      >
        <DreamcallerConsole
          dreamcaller={dreamcaller}
          stageRef={stageRef}
          layout="desktop"
          onChoose={onChoose}
        />
      </div>
    </div>
  );
}

/** The desktop Dreamcaller-selection layout: all offered Dreamcallers side by
 * side as full-bleed standalone portraits (no carousel), each with its own
 * console. */
function DesktopSelect({ dreamcallers, onPick }: QuestStartScreenProps) {
  const stageRef = useRef<HTMLDivElement>(null);

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
      }}
    >
      <ScreenHeader />

      <div style={{ position: "absolute", inset: 0, display: "flex" }}>
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
