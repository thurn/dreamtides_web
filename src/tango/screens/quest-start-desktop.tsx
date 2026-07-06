// The desktop (wide-viewport) Dreamcaller-select layout: a small purple eyebrow
// title near the top of a shared background, then the offered Dreamcallers side
// by side — each the standing full-body cutout over a soft glow, the name
// floating above the head, and a locked-size console card riding up over the
// legs (ability text, a row of hover-only tide discs + starting-essence chip,
// and a full-width Button). All columns render at exactly the same size. It
// shares the view types and the ability / essence reveals with the mobile
// carousel via `quest-start-shared`; `QuestStartScreen` picks by viewport.
// PURE: renders from a view-model and reports the chosen Dreamcaller via `onPick`.

import { useRef, useState } from "react";
import { Motes } from "../components/hud/Motes";
import { GroupPanel } from "../components/controls/GroupPanel";
import { Button } from "../components/controls/Button";
import { token } from "../primitives/tokens";
import { dreamcallerCutoutSrc } from "../components/hud/DreamcallerPortrait";
import {
  AbilityReveal,
  ConsoleDivider,
  TidesEssenceBlock,
  type DreamcallerOfferView,
  type QuestStartScreenProps,
} from "./quest-start-shared";

/** Desktop column metrics. Box measures are content-driven layout, so these are
 * caller numbers. Each column is a fixed-width figure stage with a narrower,
 * center-aligned console card riding up over the legs. */
const COLUMN_W = 400; // the figure stage's width
const PORTRAIT_H = 715; // the standing figure's stage height
const PORTRAIT_SCALE = 1.2; // grows the cutout art from the feet past the column
const CARD_W = 320; // console-card width (narrower than the column, centered)
const CARD_OVERLAP = 275; // how far the card's center rides up over the figure
/** The minimum height of the desktop ability-text box — two lines of the rules
 * voice (14px × 1.36 ≈ 38px, rounded to a round 40). Short abilities center
 * within this two-line floor so the common case aligns across columns; longer
 * copy grows the box and is nudged down by a gentle scale rather than crammed.
 * Box measures are content-driven layout, so this is a caller number. */
const ABILITY_BOX_MIN_H = 40;

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
 * bottom of the stage, where the console card rides up over the legs and
 * covers them. Falls back to a tinted monogram disc on a 404. */
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

/** The console card for one Dreamcaller. It is narrower than its column and
 * center-aligned under the figure, riding up over the legs; its interior is an
 * even --space-6 rhythm stack — padding, then the ability text, divider, tides
 * row, and Choose button each separated by one step. The ability region takes
 * its natural height, and the card is pulled up by half its own height
 * (`translateY(-50%)`) so cards of different heights share one vertical center
 * line, positioned by {@link CARD_OVERLAP}. Spreading GroupPanel's card surface
 * onto our own node is the sanctioned rung-2 way to size the pane. */
function DreamcallerCard({
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
        minHeight={ABILITY_BOX_MIN_H}
      />

      <div style={{ marginTop: token("--space-6") }}>
        <ConsoleDivider flush />
      </div>

      {/* Tides cluster: the "Tides:" caption + starting-essence on one row, the
          tide discs stacked below the caption at the larger 'lg' size — the same
          shared arrangement the mobile carousel renders. */}
      <div style={{ marginTop: token("--space-6") }}>
        <TidesEssenceBlock dreamcaller={dreamcaller} stageRef={stageRef} />
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
export function DesktopSelect({ dreamcallers, onPick }: QuestStartScreenProps) {
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
