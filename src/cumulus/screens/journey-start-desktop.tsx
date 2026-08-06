// The desktop (wide-viewport) DreamAvatar-select layout: a small purple eyebrow
// title near the top of a shared background, then the offered DreamAvatars side
// by side — each the standing full-body cutout over a soft glow, the name
// floating above the head, and a liquid-glass console panel riding up over the
// legs (ability text, a row of hover-only tide discs + starting-essence chip,
// and a full-width purple accent GlassButton). All columns render at exactly
// the same size. It shares the view types and console primitives with the mobile
// carousel via `journey-start-shared`, and both layouts use the same named
// canonical RulesText source; `JourneyStartScreen` picks by viewport.
// PURE: renders from a view-model and reports the chosen DreamAvatar via `onPick`.

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Motes } from "../components/hud/Motes";
import { GlassButton } from "../components/controls/GlassButton";
import { GlassPanel } from "../components/overlay/GlassPanel";
import { token } from "../primitives/tokens";
import { DreamAvatarStage } from "../components/hud/DreamAvatarStage";
import {
  ConsoleDivider,
  JourneyStartAbilityCopy,
  JourneyStartGuideDialogue,
  JourneyStartRerollControl,
  TidesEssenceBlock,
  type DreamAvatarOfferView,
  type JourneyStartScreenProps,
} from "./journey-start-shared";

/** Desktop column metrics. Box measures are content-driven layout, so these are
 * caller numbers. Each column is a fixed-width figure stage with a narrower,
 * center-aligned console panel riding up over the legs. */
const COLUMN_W = 400; // the figure stage's width
const PORTRAIT_H = 715; // the standing figure's stage height
const CARD_W = 320; // console-card width (narrower than the column, centered)
const CARD_OVERLAP = 275; // how far the panel's center rides up over the figure

/** The smallest aligned ability-text scale. Longer copy grows vertically. */
const ABILITY_MIN_SCALE = 0.9;

/** Two lines of the rules voice in the desktop DreamAvatar selection card. */
const ALIGNED_ABILITY_MIN_HEIGHT = 40;

/**
 * Keeps short desktop abilities centered in a two-line floor while allowing
 * longer copy to grow. The transform scales glyphs and text together.
 */
function AlignedAbilityBox({ children }: { readonly children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [{ scale, boxHeight }, setFit] = useState({
    scale: 1,
    boxHeight: ALIGNED_ABILITY_MIN_HEIGHT,
  });

  useLayoutEffect(() => {
    const element = ref.current;
    if (element === null) return;
    const natural = element.offsetHeight;
    const nextScale =
      natural > ALIGNED_ABILITY_MIN_HEIGHT
        ? Math.max(
            ABILITY_MIN_SCALE,
            ALIGNED_ABILITY_MIN_HEIGHT / natural,
          )
        : 1;
    setFit({
      scale: nextScale,
      boxHeight: Math.max(
        ALIGNED_ABILITY_MIN_HEIGHT,
        Math.round(natural * nextScale),
      ),
    });
  }, [children]);

  return (
    <div
      style={{
        height: boxHeight,
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
      Choose Your Avatar
    </div>
  );
}

/** The DreamAvatar's name + epithet, floating on the portrait above the head.
 * On-media, so it earns legibility from the outline dilation, not a plate. */
function PortraitName({ dreamAvatar }: { dreamAvatar: DreamAvatarOfferView }) {
  return (
    <div
      style={{
        position: "absolute",
        top: token("--space-s"),
        left: token("--space-xs"),
        right: token("--space-xs"),
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
        {dreamAvatar.name}
      </div>
      <div
        style={{
          marginTop: token("--space-xxs"),
          font: token("--t-hero-epithet"),
          color: token("--text-primary"),
          textShadow: token("--text-outline-media"),
        }}
      >
        {dreamAvatar.title}
      </div>
    </div>
  );
}

/** The console panel for one DreamAvatar. It is narrower than its column and
 * center-aligned under the figure, riding up over the legs; its interior is an
 * even --space-l rhythm stack — padding, then the ability text, divider, tides
 * row, and Choose button each separated by one step. The ability region takes
 * its natural height. A fixed alignment zone centers panels of different
 * heights on one line without transforming the glass or its ancestors, which
 * preserves backdrop blur. */
function DreamAvatarCard({
  dreamAvatar,
  onChoose,
}: {
  dreamAvatar: DreamAvatarOfferView;
  onChoose: () => void;
}) {
  return (
    <div
      data-dream-avatar-column={dreamAvatar.id}
      style={{
        position: "relative",
        zIndex: 1,
        width: CARD_W,
        alignSelf: "center",
        height: CARD_OVERLAP * 2,
        marginTop: -CARD_OVERLAP * 2,
        display: "flex",
        alignItems: "center",
      }}
    >
      <GlassPanel testId={`dream-avatar-glass-panel-${dreamAvatar.id}`}>
        <div
          style={{
            padding: token("--space-l"),
            display: "flex",
            flexDirection: "column",
          }}
        >
          <AlignedAbilityBox>
            <JourneyStartAbilityCopy dreamAvatar={dreamAvatar} />
          </AlignedAbilityBox>

          <div style={{ marginTop: token("--space-l") }}>
            <ConsoleDivider flush />
          </div>

          {/* Tides cluster: the "Tides:" caption + starting-essence on one row,
              the tide discs stacked below the caption at the larger 'lg' size —
              the same shared arrangement the mobile carousel renders. */}
          <div style={{ marginTop: token("--space-l") }}>
            <TidesEssenceBlock dreamAvatar={dreamAvatar} />
          </div>

          <div
            data-choose-dream-avatar={dreamAvatar.id}
            style={{ marginTop: token("--space-l"), display: "grid" }}
          >
            <GlassButton
              label="Choose"
              variant="accent"
              placement="onGlass"
              onPress={onChoose}
            />
          </div>
        </div>
      </GlassPanel>
    </div>
  );
}

/** One desktop DreamAvatar column: a fixed-width stack of the portrait stage
 * (the standing cutout with the name floating above the head) and the console
 * panel, which rides up over the legs and takes its natural height. */
function DreamAvatarColumn({
  dreamAvatar,
  onChoose,
}: {
  dreamAvatar: DreamAvatarOfferView;
  onChoose: () => void;
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
        <DreamAvatarStage dreamAvatar={dreamAvatar} variant="standing" />
        <PortraitName dreamAvatar={dreamAvatar} />
      </div>
      <DreamAvatarCard
        dreamAvatar={dreamAvatar}
        onChoose={onChoose}
      />
    </div>
  );
}

/** The desktop DreamAvatar-selection layout: a small purple eyebrow title near
 * the top of a shared background, then the offered DreamAvatars side by side as
 * fixed-width portrait columns. */
export function DesktopSelect({
  dreamAvatars,
  guideDialogue,
  onPick,
  onReroll,
  onGuideDialogueShown,
}: JourneyStartScreenProps) {
  return (
    <div
      className="cumulus"
      style={{
        position: "relative",
        minHeight: "100dvh",
        overflowX: "hidden",
        overflowY: "auto",
        background: token("--bg-app"),
        display: "flex",
        flexDirection: "column",
        paddingBottom: `calc(${token("--safe-bottom")} + ${token("--space-2xl")})`,
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
      {guideDialogue !== undefined && (
        <JourneyStartGuideDialogue
          dialogue={guideDialogue}
          layout="desktop"
          onShown={onGuideDialogueShown}
        />
      )}
      {onReroll !== undefined && (
        <JourneyStartRerollControl onReroll={onReroll} />
      )}

      {/* Small purple eyebrow title, near the top. */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          padding: `calc(${token("--safe-top")} + ${token("--space-l")}) ${token("--gutter")} 0`,
        }}
      >
        <DesktopTitle />
      </div>

      {/* The offered DreamAvatars, centered in the remaining space. The inner
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
          padding: `${token("--space-2xl")} ${token("--gutter")}`,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
            flexWrap: "wrap",
            gap: token("--space-2xl"),
          }}
        >
          {dreamAvatars.map((dreamAvatar) => (
            <DreamAvatarColumn
              key={dreamAvatar.id}
              dreamAvatar={dreamAvatar}
              onChoose={() => {
                onPick(dreamAvatar.id);
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
