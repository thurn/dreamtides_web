// QuestStartScreen — the Tango rendering of Dreamcaller selection (the quest's
// opening screen). Two layouts share one view-model and switch on viewport:
//   - Mobile (narrow): a full-bleed swipe carousel, one Dreamcaller per page,
//     with a cinematic portrait behind a frosted GroupPanel console.
//   - Desktop (wide): one shared background carries the screen title and all
//     offered Dreamcallers laid out on a grid — name at the top, a round
//     portrait medallion, then an equal-height console card (ability text, the
//     collapsed tides cluster + starting-essence chip, and a small "Choose"
//     text action). The grid's row tracks equalize the card height across the
//     three Dreamcallers.
// PURE: it renders from a view-model and reports the chosen Dreamcaller through
// `onPick`; the adapter owns state, the offer, the seed, and startQuest.

import { Fragment, useEffect, useRef, useState } from "react";
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

/** The desktop portrait diameter — the round medallion is a deliberately
 * modest, desktop-scaled object, not a full-bleed cinematic backdrop. Box
 * measures are content-driven layout, so this is a caller number. */
const MEDALLION_PX = 208;

/** A dreamcaller's character art cropped to a round medallion that floats on
 * the screen's shared background. Screen-local: the circle, ring, and face
 * crop are this screen's framing, distinct from the shared DreamcallerPortrait
 * variants. Falls back to a tinted monogram when the art 404s. */
function PortraitMedallion({
  dreamcaller,
}: {
  dreamcaller: DreamcallerOfferView;
}) {
  const [broken, setBroken] = useState(false);
  return (
    <div
      style={{
        position: "relative",
        width: MEDALLION_PX,
        height: MEDALLION_PX,
        flex: "none",
        borderRadius: token("--radius-pill"),
        overflow: "hidden",
        background: token("--bg-sunken"),
        border: `1px solid ${token("--border-mid")}`,
        boxShadow: token("--shadow-card"),
      }}
    >
      {broken ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
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
      ) : (
        <img
          src={dreamcallerImageSrc(dreamcaller.imageNumber)}
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
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition: "50% 12%",
            transform: "scale(1.42)",
            transformOrigin: "50% 8%",
            userSelect: "none",
          }}
        />
      )}
    </div>
  );
}

/** The dreamcaller's name + epithet, set below the medallion on the shared
 * background (so it reads as a label, not on-media text). */
function MedallionName({ dreamcaller }: { dreamcaller: DreamcallerOfferView }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div
        style={{
          font: token("--t-title"),
          color: token("--text-primary"),
          lineHeight: 1.05,
        }}
      >
        {dreamcaller.name}
      </div>
      <div
        style={{
          marginTop: token("--space-1"),
          font: token("--t-hero-epithet"),
          color: token("--text-secondary"),
        }}
      >
        {dreamcaller.title}
      </div>
    </div>
  );
}

/** The desktop commit action: a small, purple "Choose" text button — a light
 * accent-colored affordance rather than the heavy beveled Button sprite, to
 * keep the desktop card quiet. Built on the Pressable press primitive. */
function ChooseText({ onClick }: { onClick: () => void }) {
  return (
    <Pressable
      as="button"
      onClick={onClick}
      style={{
        background: "none",
        border: "none",
        padding: `${token("--space-2")} ${token("--space-3")}`,
        cursor: "pointer",
        font: token("--t-button-sm"),
        color: token("--accent-bright"),
        letterSpacing: token("--tracking-wordmark"),
      }}
    >
      Choose
    </Pressable>
  );
}

/** The grid cells for one Dreamcaller: the medallion, the name, the console
 * card, and — floating below the card on the shared background (outside the
 * card) — the Tides header and pills. Returned as siblings (not wrapped) so
 * each lands in its own grid-row track; the tracks then equalize each element
 * height across the three Dreamcallers. */
function DreamcallerColumnCells({
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
    <>
      {/* Name + epithet at the top of the column. */}
      <MedallionName dreamcaller={dreamcaller} />

      {/* Circle-cutout medallion, centered within its column track. */}
      <div style={{ justifySelf: "center" }}>
        <PortraitMedallion dreamcaller={dreamcaller} />
      </div>

      {/* Console card — the grid stretches it to fill the (equal-height) card
          row and its inner flex column pins the Choose action to the base.
          Spreading GroupPanel's glass onto our own node is the sanctioned
          rung-2 way to size the pane. */}
      <div
        data-dreamcaller-column={dreamcaller.id}
        style={{
          ...GroupPanel.style(),
          padding: token("--space-6"),
          display: "flex",
          flexDirection: "column",
          gap: token("--space-4"),
        }}
      >
        <div style={{ flex: 1 }}>
          <AbilityReveal text={dreamcaller.renderedText} stageRef={stageRef} />

          <ConsoleDivider />

          {/* Collapsed tides cluster + the starting-essence chip (no label),
              mirroring the mobile console. The essence sits in a box the height
              of the tides' first row so it lines up with the "Tides" label. */}
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: token("--space-5"),
              marginTop: token("--space-4"),
            }}
          >
            {hasTides ? (
              <span data-dreamcaller-tides={dreamcaller.id}>
                <TideCluster tides={dreamcaller.tides} stageRef={stageRef} />
              </span>
            ) : (
              <span />
            )}
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
        </div>

        <div
          data-choose-dreamcaller={dreamcaller.id}
          style={{ textAlign: "center", marginTop: token("--space-2") }}
        >
          <ChooseText onClick={onChoose} />
        </div>
      </div>
    </>
  );
}

/** The desktop Dreamcaller-selection layout: a shared background carrying the
 * screen title and, on a column-flowed grid, every offered Dreamcaller's name,
 * medallion, and equal-height console card. */
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
        justifyContent: "center",
        paddingBottom: `calc(${token("--safe-bottom")} + ${token("--space-8")})`,
      }}
    >
      {/* A soft ambient glow + drifting motes give the shared background life
          without competing with the medallions. */}
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

      <div
        style={{
          position: "relative",
          zIndex: 1,
          textAlign: "center",
          padding: `calc(${token("--safe-top")} + ${token("--space-6")}) ${token("--gutter")} ${token("--space-8")}`,
        }}
      >
        <h1
          style={{
            margin: 0,
            font: token("--t-display"),
            color: token("--text-primary"),
          }}
        >
          Choose Your Dreamcaller
        </h1>
      </div>

      {/* Column-flowed grid: each Dreamcaller fills one column (name, medallion,
          card down the three rows). The card row track sizes to the tallest
          card, so all three cards render at the same height. */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          display: "grid",
          gridAutoFlow: "column",
          gridTemplateColumns: `repeat(${String(dreamcallers.length)}, minmax(0, 340px))`,
          gridTemplateRows: "auto auto auto",
          columnGap: token("--space-8"),
          rowGap: token("--space-4"),
          justifyContent: "center",
          width: "100%",
          padding: `0 ${token("--gutter")}`,
        }}
      >
        {dreamcallers.map((dreamcaller) => (
          <Fragment key={dreamcaller.id}>
            <DreamcallerColumnCells
              dreamcaller={dreamcaller}
              onChoose={() => {
                onPick(dreamcaller.id);
              }}
              stageRef={stageRef}
            />
          </Fragment>
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
