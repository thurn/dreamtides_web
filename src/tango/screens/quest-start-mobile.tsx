// The mobile (narrow-viewport) Dreamcaller-select layout: a full-bleed swipe
// carousel, one Dreamcaller per page, with the full-body character cutout
// standing on an ambient backdrop behind a frosted GroupPanel console. It shares
// the view types and the ability / essence reveals with the desktop triptych via
// `quest-start-shared`; `QuestStartScreen` picks between the two by viewport.
// PURE: renders from a view-model and reports the chosen Dreamcaller via `onPick`.

import { useRef, useState } from "react";
import { Motes } from "../components/hud/Motes";
import { GroupPanel } from "../components/controls/GroupPanel";
import { Button } from "../components/controls/Button";
import { GlowIcon } from "../components/controls/GlowIcon";
import { Pressable } from "../primitives/Pressable";
import { GLYPHS } from "../primitives/glyph";
import { token } from "../primitives/tokens";
import { dreamcallerCutoutSrc } from "../components/hud/DreamcallerPortrait";
import {
  AbilityReveal,
  ConsoleDivider,
  EssenceReveal,
  MAX_TIDE_DISCS,
  TideDiscReveal,
  TidesLabel,
  type DreamcallerOfferView,
  type QuestStartScreenProps,
} from "./quest-start-shared";

/** Invisible touch slop padded around each mobile tide disc so it is easier to
 * press; the disc row reabsorbs it with negative margins so the visual layout
 * is unchanged. A spacing step, so the token is right. */
const TIDE_HIT_SLOP = token("--space-2");

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

      {/* An even --space-6 rhythm around the divider, matching the desktop card:
          one step above (equal to the GroupPanel's own --space-6 top padding, so
          the ability text has balanced space above and below it) and one step
          below. This lands the ability-baseline→divider and divider→tides-caption
          visual gaps within a sub-pixel of each other (the residual is the two
          fonts' differing built-in leading, which token-scale margins cannot
          split finer). */}
      <div style={{ marginTop: token("--space-6") }}>
        <ConsoleDivider flush />
      </div>

      <div style={{ marginTop: token("--space-6") }}>
        {/* Top row: the "Tides:" caption on the left and the starting essence on
            the right. The essence stays TOP-aligned, level with the caption, as
            the disc row stacks below it — matching the desktop tides treatment. */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: token("--space-5"),
          }}
        >
          {hasTides ? <TidesLabel /> : <span />}
          <EssenceReveal dreamcaller={dreamcaller} stageRef={stageRef} />
        </div>

        {hasTides && (
          <div
            data-dreamcaller-tides={dreamcaller.id}
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              // Left-aligned under the caption. Each disc carries invisible
              // TIDE_HIT_SLOP touch padding; the row pulls its margins in by
              // that slop so the discs' visual bounds still start at the
              // caption's left edge and sit one --space-3 below it.
              marginTop: `calc(${token("--space-3")} - ${TIDE_HIT_SLOP})`,
              marginLeft: `calc(-1 * ${TIDE_HIT_SLOP})`,
              marginRight: `calc(-1 * ${TIDE_HIT_SLOP})`,
              marginBottom: `calc(-1 * ${TIDE_HIT_SLOP})`,
            }}
          >
            {dreamcaller.tides.slice(0, MAX_TIDE_DISCS).map((tide) => (
              <TideDiscReveal
                key={tide.id}
                tide={tide}
                stageRef={stageRef}
                size="lg"
                hitSlop={TIDE_HIT_SLOP}
              />
            ))}
          </div>
        )}
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
export function CarouselSelect({ dreamcallers, onPick }: QuestStartScreenProps) {
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
