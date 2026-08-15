// The mobile (narrow-viewport) Avatar-select layout: a full-bleed swipe
// carousel, one Avatar per page, with the full-body character cutout
// standing on an ambient backdrop behind a liquid-glass console. It shares
// the view types and console primitives with the desktop triptych via
// `journey-start-shared`, and both layouts compose the canonical RulesText
// source; `JourneyStartScreen` picks between the two by viewport.
// PURE: renders from a view-model and reports the chosen Avatar via `onPick`.

import { tx, type LocalizedString } from "@trox/runtime";
import { useRef, useState } from "react";
import { Motes } from "../components/hud/Motes";
import { GlassButton } from "../components/controls/GlassButton";
import { IconButton } from "../components/controls/IconButton";
import { GlassPanel } from "../components/overlay/GlassPanel";
import { GLYPHS } from "../primitives/glyph";
import { token } from "../primitives/tokens";
import { AvatarStage } from "../components/hud/AvatarStage";
import { useLocalizer } from "../../runtime/localization/use-localizer";
import {
  ConsoleDivider,
  JourneyStartAbilityCopy,
  JourneyStartGuideDialogue,
  OnMediaEyebrow,
  JourneyStartRerollControl,
  TidesEssenceBlock,
  type AvatarOfferView,
  type JourneyStartScreenProps,
} from "./journey-start-shared";

/** Invisible touch slop padded around each mobile tide disc so it is easier to
 * press; the disc row reabsorbs it with negative margins so the visual layout
 * is unchanged. A spacing step, so the token is right. */
const TIDE_HIT_SLOP = token("--space-xs");

/** The mobile carousel's glass console beneath a portrait: ability text, a
 * hairline, the tides cluster + starting essence, and the Choose action. */
function AvatarConsole({
  avatar,
  chooseLabel,
  onChoose,
}: {
  avatar: AvatarOfferView;
  chooseLabel: LocalizedString;
  onChoose: () => void;
}) {
  return (
    <GlassPanel testId={`avatar-glass-panel-${avatar.id}`}>
      <div
        style={{
          padding: token("--space-l"),
          display: "flex",
          flexDirection: "column",
        }}
      >
        <JourneyStartAbilityCopy avatar={avatar} />

        {/* An even --space-l rhythm around the divider, matching the desktop
            panel: one step above and one below. */}
        <div style={{ marginTop: token("--space-l") }}>
          <ConsoleDivider flush />
        </div>

        <div style={{ marginTop: token("--space-l") }}>
          <TidesEssenceBlock
            avatar={avatar}
            hitSlop={TIDE_HIT_SLOP}
          />
        </div>

        <div
          data-choose-avatar={avatar.id}
          style={{ marginTop: token("--space-l"), display: "grid" }}
        >
          <GlassButton
            label={chooseLabel}
            variant="accent"
            placement="onGlass"
            onPress={onChoose}
          />
        </div>
      </div>
    </GlassPanel>
  );
}

/** The Avatar's name and epithet, sitting directly on the portrait so it
 * earns legibility from the on-media outline dilation rather than a plate. */
function AvatarTitle({
  avatar,
}: {
  avatar: AvatarOfferView;
}) {
  const resolve = useLocalizer();
  return (
    <div
      style={{
        position: "absolute",
        top: token("--safe-top"),
        left: 0,
        right: 0,
        padding: `${token("--space-4xl")} ${token("--gutter")} 0`,
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
          {resolve(avatar.name)}
        </span>
        <span
          style={{
            display: "block",
            marginTop: token("--space-xxs"),
            font: token("--t-hero-epithet"),
            color: token("--text-primary"),
            textShadow: token("--text-outline-media"),
          }}
        >
          {resolve(avatar.title)}
        </span>
      </h1>
    </div>
  );
}

/** The screen's uppercase eyebrow, painted on the portrait at top-center. It
 * does not swipe on mobile and spans the full width on desktop. */
function ScreenHeader({ title }: { readonly title: LocalizedString }) {
  return (
    <div
      style={{
        position: "absolute",
        top: token("--safe-top"),
        left: 0,
        right: 0,
        zIndex: 6,
        padding: `${token("--space-m")} ${token("--gutter")} 0`,
        textAlign: "center",
        pointerEvents: "none",
      }}
    >
      <OnMediaEyebrow label={title} />
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
        [dir]: token("--space-xs"),
        zIndex: 6,
      }}
    >
      <IconButton
        size="sm"
        glyph={dir === "left" ? GLYPHS.chevronLeft : GLYPHS.chevronRight}
        label={
          dir === "left"
            ? tx(
                "Previous",
                "[avatar] [journey] Command that moves to the previous Avatar offer.",
              )
            : tx(
                "Next",
                "[avatar] [journey] Command that moves to the next Avatar offer.",
              )
        }
        onPress={onClick}
      />
    </div>
  );
}

/** One mobile carousel page: portrait + title, sized to a fraction of the swipe
 * track. The glass console stays outside this transformed track so it can blur
 * the live scene. */
function AvatarPage({
  avatar,
  active,
  count,
}: {
  avatar: AvatarOfferView;
  active: boolean;
  count: number;
}) {
  return (
    <div
      data-avatar-page={avatar.id}
      style={{
        width: `${100 / count}%`,
        height: "100%",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <AvatarStage avatar={avatar} variant="fullBleed" />
      <Motes on={active} tint="warm" zIndex={1} />

      <AvatarTitle avatar={avatar} />
    </div>
  );
}

/** The mobile Avatar-selection carousel: a full-bleed swipe carousel of
 * the offered Avatars, one per page. */
export function CarouselSelect({
  avatars,
  guideDialogue,
  onPick,
  onReroll,
  onGuideDialogueShown,
}: JourneyStartScreenProps) {
  const [index, setIndex] = useState(0);
  const [dx, setDx] = useState(0);
  const drag = useRef<{ active: boolean; x0: number }>({
    active: false,
    x0: 0,
  });
  const count = avatars.length;
  const activeAvatar = avatars[index];

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
      className="cumulus"
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
      <ScreenHeader
        title={tx(
          "Choose Your Avatar",
          "[avatar] [journey] Title and actions on the Avatar selection screen.",
        )}
      />
      {guideDialogue !== undefined && (
        <JourneyStartGuideDialogue
          dialogue={guideDialogue}
          layout="mobile"
          onShown={onGuideDialogueShown}
        />
      )}
      {onReroll !== undefined && (
        <JourneyStartRerollControl
          onReroll={onReroll}
          label={tx("Reroll Avatars", "[journey] Start reroll action.")}
        />
      )}

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
        {avatars.map((avatar, i) => (
          <AvatarPage
            key={avatar.id}
            avatar={avatar}
            active={i === index}
            count={count}
          />
        ))}
      </div>

      {activeAvatar !== undefined && (
        <div
          data-avatar-console={activeAvatar.id}
          onPointerDown={(event) => {
            event.stopPropagation();
          }}
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 4,
            padding: `0 ${token("--gutter")} calc(${token("--safe-bottom")} + ${token("--space-m")})`,
          }}
        >
          <AvatarConsole
            avatar={activeAvatar}
            chooseLabel={tx(
              "Choose",
              "[avatar] [journey] Command that chooses the currently selected Avatar or starting-deck option.",
            )}
            onChoose={() => {
              onPick(activeAvatar.id);
            }}
          />
        </div>
      )}

      {index > 0 && (
        <EdgeChevron dir="left" onClick={() => setIndex(clamp(index - 1))} />
      )}
      {index < count - 1 && (
        <EdgeChevron dir="right" onClick={() => setIndex(clamp(index + 1))} />
      )}
    </div>
  );
}
