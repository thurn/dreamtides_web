// The mobile (narrow-viewport) Dreamcaller-select layout: a full-bleed swipe
// carousel, one Dreamcaller per page, with the full-body character cutout
// standing on an ambient backdrop behind a flat GroupPanel console. It shares
// the view types and the ability / essence reveals with the desktop triptych via
// `quest-start-shared`; `QuestStartScreen` picks between the two by viewport.
// PURE: renders from a view-model and reports the chosen Dreamcaller via `onPick`.

import { useRef, useState } from "react";
import { Motes } from "../components/hud/Motes";
import { GroupPanel } from "../components/controls/GroupPanel";
import { Button } from "../components/controls/Button";
import { IconButton } from "../components/controls/IconButton";
import { GLYPHS } from "../primitives/glyph";
import { token } from "../primitives/tokens";
import { DreamcallerPortrait } from "../components/hud/DreamcallerPortrait";
import {
  AbilityReveal,
  ConsoleDivider,
  OnMediaEyebrow,
  TidesEssenceBlock,
  type DreamcallerOfferView,
  type QuestStartScreenProps,
} from "./quest-start-shared";

/** Invisible touch slop padded around each mobile tide disc so it is easier to
 * press; the disc row reabsorbs it with negative margins so the visual layout
 * is unchanged. A spacing step, so the token is right. */
const TIDE_HIT_SLOP = token("--space-2");

/** The mobile carousel's flat console beneath a portrait: ability text, a
 * hairline, the tides cluster + starting essence, and the Choose action. */
function DreamcallerConsole({
  dreamcaller,
  onChoose,
}: {
  dreamcaller: DreamcallerOfferView;
  onChoose: () => void;
}) {
  return (
    <GroupPanel>
      <AbilityReveal text={dreamcaller.renderedText} />

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
        <TidesEssenceBlock dreamcaller={dreamcaller} hitSlop={TIDE_HIT_SLOP} />
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
function DreamcallerTitle({
  dreamcaller,
}: {
  dreamcaller: DreamcallerOfferView;
}) {
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
      }}
    >
      <OnMediaEyebrow label="Choose Your Dreamcaller" />
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
    <div
      onPointerDown={(event: React.PointerEvent) => {
        event.stopPropagation();
      }}
      style={{
        position: "absolute",
        top: "46%",
        [dir]: token("--space-3"),
        zIndex: 6,
      }}
    >
      <IconButton
        size="sm"
        glyph={dir === "left" ? GLYPHS.chevronLeft : GLYPHS.chevronRight}
        label={dir === "left" ? "Previous" : "Next"}
        onPress={onClick}
      />
    </div>
  );
}

/** One mobile carousel page: portrait + title + console, sized to a fraction of
 * the swipe track and animated in as it becomes active. */
function DreamcallerPage({
  dreamcaller,
  active,
  count,
  onChoose,
}: {
  dreamcaller: DreamcallerOfferView;
  active: boolean;
  count: number;
  onChoose: () => void;
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
      <DreamcallerPortrait dreamcaller={dreamcaller} variant="fullBleed" />
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
          // The console slides up into place as its page becomes active — a
          // transform-only reveal, no opacity fade, so the flat card simply
          // rises into view without cross-fading over the portrait behind it.
          transform: active ? "translateY(0)" : "translateY(16px)",
          transition: `transform ${token("--dur-base")} ${token("--ease-out")}`,
        }}
      >
        <DreamcallerConsole dreamcaller={dreamcaller} onChoose={onChoose} />
      </div>
    </div>
  );
}

/** The mobile Dreamcaller-selection carousel: a full-bleed swipe carousel of
 * the offered Dreamcallers, one per page. */
export function CarouselSelect({
  dreamcallers,
  onPick,
}: QuestStartScreenProps) {
  const [index, setIndex] = useState(0);
  const [dx, setDx] = useState(0);
  const drag = useRef<{ active: boolean; x0: number }>({
    active: false,
    x0: 0,
  });
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
