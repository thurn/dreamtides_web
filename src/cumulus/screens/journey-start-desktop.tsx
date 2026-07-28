// The desktop (wide-viewport) DreamAvatar-select layout: a small purple eyebrow
// title near the top of a shared background, then the offered DreamAvatars side
// by side — each the standing full-body cutout over a soft glow, the name
// floating above the head, and a locked-size console card riding up over the
// legs (ability text, a row of hover-only tide discs + starting-essence chip,
// and a full-width purple accent GlassButton). All columns render at exactly
// the same size. It shares the view types and console primitives with the mobile
// carousel via `journey-start-shared`, and both layouts use the same named
// DreamAvatar ability source; `JourneyStartScreen` picks by viewport.
// PURE: renders from a view-model and reports the chosen DreamAvatar via `onPick`.

import { Motes } from "../components/hud/Motes";
import { GroupPanel } from "../components/controls/GroupPanel";
import { GlassButton } from "../components/controls/GlassButton";
import { token } from "../primitives/tokens";
import { DreamAvatarPortrait } from "../components/hud/DreamAvatarPortrait";
import { DreamAvatarAbilityText } from "../components/hud/DreamAvatarAbilityText";
import {
  ConsoleDivider,
  JourneyStartRerollControl,
  TidesEssenceBlock,
  type DreamAvatarOfferView,
  type JourneyStartScreenProps,
} from "./journey-start-shared";

/** Desktop column metrics. Box measures are content-driven layout, so these are
 * caller numbers. Each column is a fixed-width figure stage with a narrower,
 * center-aligned console card riding up over the legs. */
const COLUMN_W = 400; // the figure stage's width
const PORTRAIT_H = 715; // the standing figure's stage height
const CARD_W = 320; // console-card width (narrower than the column, centered)
const CARD_OVERLAP = 275; // how far the card's center rides up over the figure

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
        {dreamAvatar.name}
      </div>
      <div
        style={{
          marginTop: token("--space-1"),
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

/** The console card for one DreamAvatar. It is narrower than its column and
 * center-aligned under the figure, riding up over the legs; its interior is an
 * even --space-6 rhythm stack — padding, then the ability text, divider, tides
 * row, and Choose button each separated by one step. The ability region takes
 * its natural height, and the card is pulled up by half its own height
 * (`translateY(-50%)`) so cards of different heights share one vertical center
 * line, positioned by {@link CARD_OVERLAP}. Spreading GroupPanel's card surface
 * onto our own node is the sanctioned rung-2 way to size the pane. */
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
      <DreamAvatarAbilityText
        dreamAvatarId={dreamAvatar.id}
        text={dreamAvatar.renderedText}
        presentation="selectionCard"
      />

      <div style={{ marginTop: token("--space-6") }}>
        <ConsoleDivider flush />
      </div>

      {/* Tides cluster: the "Tides:" caption + starting-essence on one row, the
          tide discs stacked below the caption at the larger 'lg' size — the same
          shared arrangement the mobile carousel renders. */}
      <div style={{ marginTop: token("--space-6") }}>
        <TidesEssenceBlock dreamAvatar={dreamAvatar} />
      </div>

      <div
        data-choose-dream-avatar={dreamAvatar.id}
        style={{ marginTop: token("--space-6"), display: "grid" }}
      >
        <GlassButton label="Choose" variant="accent" onPress={onChoose} />
      </div>
    </div>
  );
}

/** One desktop DreamAvatar column: a fixed-width stack of the portrait stage
 * (the standing cutout with the name floating above the head) and the console
 * card, which rides up over the legs and takes its natural height. */
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
        <DreamAvatarPortrait dreamAvatar={dreamAvatar} variant="standing" />
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
  onPick,
  onReroll,
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
      {onReroll !== undefined && (
        <JourneyStartRerollControl onReroll={onReroll} />
      )}

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
