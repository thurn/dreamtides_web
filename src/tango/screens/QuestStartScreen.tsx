// QuestStartScreen — the Tango design-system rendering of Dreamcaller selection
// (the quest's opening screen). It is PURE: it renders from a view-model and
// reports the chosen Dreamcaller through `onPick`, holding no quest state and
// touching no navigation. The adapter that owns `useQuest()` — building the
// offer, minting the run seed, and starting the quest — lives OUTSIDE Tango
// (`src/screens/tango/QuestStartScreenAdapter.tsx`); the Tango isolation
// boundary forbids a screen here from reaching app state directly.
//
// Composed entirely from Tango: the pickable card is the `Pressable` primitive,
// the art is `DreamcallerPortrait`, the essence value is `EssenceValue`, the
// description flows through `RulesText` with a `HoverPopover` term reveal, tides
// are `TidePill`s, and every color is a semantic token.

import { useState } from "react";
import { DreamcallerPortrait } from "../components/hud/DreamcallerPortrait";
import { EssenceValue } from "../components/hud/EssenceValue";
import { TidePill, type Tide } from "../components/hud/TidePill";
import { RulesText } from "../components/card/RulesText";
import { CardTermDefinitions } from "../components/card/CardTermDefinitions";
import { HoverPopover } from "../components/overlay/HoverPopover";
import { GlowIcon } from "../components/controls/GlowIcon";
import { Pressable } from "../primitives/Pressable";
import { GLYPHS } from "../primitives/glyph";
import { token } from "../primitives/tokens";
import { withAlpha } from "../primitives/color";

const SIGNATURE_CARDS_LABEL_HOVER_BLURB =
  "These signature cards define this Dreamcaller's strategy and steer the draft pool toward them.";
const TIDES_LABEL_HOVER_BLURB =
  "Pools of cards you will see during the quest. Different tides are used every time you play.";

/** One tide shown on a Dreamcaller card, already resolved to display copy. */
export interface DreamcallerTideView {
  /** Stable id for the React key / QA hook (a tide's deck id). */
  id: string;
  /** Display name shown on the pill. */
  label: string;
  /** Description revealed through the pill's built-in InfoCard reveal. */
  description: string;
  /** Which of the five tides fixes the pill's icon + color. */
  tide: Tide;
}

/** One signature card shown on a Dreamcaller card. */
export interface DreamcallerSignatureCardView {
  /** Stable id (the card's UUID) for the React key / QA hook. */
  id: string;
  /** Display name, resolved before it reaches the screen. */
  name: string;
}

/** A single Dreamcaller offered on the select screen, as display data. */
export interface DreamcallerOfferView {
  id: string;
  name: string;
  title: string;
  /** Art asset number for {@link DreamcallerPortrait}. */
  imageNumber: string;
  /** Rendered rules/flavor text; flows through {@link RulesText}. */
  renderedText: string;
  startingEssence: number;
  /**
   * Signature cards to list. The adapter empties this when {@link tides} is
   * non-empty, so a `tides4` run shows its dealt tides in place of the
   * signature list (matching the legacy screen).
   */
  signatureCards: DreamcallerSignatureCardView[];
  /** Dealt tides for a `tides4` run; empty for every other algorithm. */
  tides: DreamcallerTideView[];
}

export interface QuestStartScreenProps {
  /** The Dreamcallers offered this run (typically three). */
  dreamcallers: DreamcallerOfferView[];
  /** Called with a Dreamcaller's id when the player picks its card. */
  onPick: (dreamcallerId: string) => void;
}

/**
 * A labelled section heading ("Signature Cards:" / "Tides:") with a trailing
 * "(i)" help mark that reveals `blurb` on hover. The `*Attr` names carry
 * `dreamcallerId` as their value so a QA selector can target one card's row.
 */
function SectionHeading({
  label,
  blurb,
  dreamcallerId,
  wrapperAttr,
  labelAttr,
  infoAttr,
  tooltipAttr,
}: {
  label: string;
  blurb: string;
  dreamcallerId: string;
  wrapperAttr: string;
  labelAttr: string;
  infoAttr: string;
  tooltipAttr: string;
}) {
  return (
    <span
      {...{ [wrapperAttr]: dreamcallerId }}
      style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-3)" }}
    >
      <span
        {...{ [labelAttr]: dreamcallerId }}
        style={{
          font: token("--t-caption"),
          color: token("--text-muted"),
        }}
      >
        {label}
      </span>
      <HoverPopover
        content={
          <span
            {...{ [tooltipAttr]: dreamcallerId }}
            style={{
              display: "block",
              borderRadius: token("--radius-popover"),
              border: `1px solid ${token("--border-mid")}`,
              background: token("--surface-raised"),
              color: token("--text-primary"),
              padding: "var(--space-4) var(--space-5)",
              font: token("--t-caption"),
              lineHeight: 1.5,
              boxShadow: token("--shadow-md"),
            }}
          >
            {blurb}
          </span>
        }
      >
        <span
          {...{ [infoAttr]: dreamcallerId }}
          style={{ display: "inline-flex", cursor: "help" }}
        >
          <GlowIcon
            iconClass={GLYPHS.info}
            color="text-muted"
            size="0.95em"
            title="More information"
          />
        </span>
      </HoverPopover>
    </span>
  );
}

/** One Dreamcaller's selection card: the pickable panel plus its detail rows. */
function DreamcallerCard({
  dreamcaller,
  onPick,
}: {
  dreamcaller: DreamcallerOfferView;
  onPick: (dreamcallerId: string) => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "var(--space-5)",
        width: "100%",
        maxWidth: 340,
        flex: 1,
      }}
    >
      <Pressable
        as="button"
        onClick={() => {
          onPick(dreamcaller.id);
        }}
        onPointerEnter={() => {
          setHovered(true);
        }}
        onPointerLeave={() => {
          setHovered(false);
        }}
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          textAlign: "left",
          padding: "var(--space-6) var(--space-7) var(--space-7)",
          borderRadius: token("--radius-card"),
          background: token("--surface-card"),
          border: `2px solid ${withAlpha("accent", hovered ? 0.7 : 0.28)}`,
          boxShadow: hovered
            ? token("--glow-accent")
            : token("--glow-accent-soft"),
          color: token("--text-primary"),
          transition: `border-color ${token("--dur-fast")} ${token("--ease-out")}, box-shadow ${token("--dur-fast")} ${token("--ease-out")}`,
        }}
      >
        <div style={{ marginBottom: "var(--space-5)", minHeight: 62 }}>
          <div
            style={{
              font: token("--t-title-sm"),
              color: token("--text-primary"),
              lineHeight: 1.15,
            }}
          >
            {dreamcaller.name}
          </div>
          <div
            style={{
              marginTop: "var(--space-2)",
              font: token("--t-body-sm"),
              fontStyle: "italic",
              color: token("--text-secondary"),
            }}
          >
            {dreamcaller.title}
          </div>
        </div>

        <div style={{ marginBottom: "var(--space-5)", borderRadius: token("--radius-panel") }}>
          <DreamcallerPortrait dreamcaller={dreamcaller} variant="panel" />
        </div>

        {/* Hovering the description reveals definitions for any glossary terms
            it uses, matching the term-definition panel shown beside cards. */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
          }}
        >
          <HoverPopover
            triggerAs="div"
            placement="top"
            maxWidthPx={null}
            content={<CardTermDefinitions text={dreamcaller.renderedText} />}
          >
            <div
              style={{
                padding: "0 var(--space-2)",
                textAlign: "center",
                font: token("--t-body-sm"),
                color: token("--text-secondary"),
                lineHeight: 1.55,
              }}
            >
              <RulesText text={dreamcaller.renderedText} />
            </div>
          </HoverPopover>
        </div>

        <div
          data-starting-essence={dreamcaller.id}
          style={{
            marginTop: "var(--space-5)",
            display: "flex",
            alignItems: "baseline",
            justifyContent: "center",
            gap: "var(--space-3)",
          }}
        >
          <span
            style={{
              font: token("--t-eyebrow"),
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              color: token("--text-muted"),
            }}
          >
            Starting Essence
          </span>
          <span
            data-starting-essence-value={dreamcaller.id}
            style={{
              font: token("--t-body"),
            }}
          >
            <EssenceValue amount={dreamcaller.startingEssence} />
          </span>
        </div>
      </Pressable>

      {dreamcaller.signatureCards.length > 0 && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-4)",
            width: "100%",
            padding: "0 var(--space-2)",
          }}
        >
          <SectionHeading
            label="Signature Cards:"
            blurb={SIGNATURE_CARDS_LABEL_HOVER_BLURB}
            dreamcallerId={dreamcaller.id}
            wrapperAttr="data-signature-cards-label-wrapper"
            labelAttr="data-signature-cards-label"
            infoAttr="data-signature-cards-info-icon"
            tooltipAttr="data-signature-cards-label-tooltip"
          />
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
            {dreamcaller.signatureCards.map((card) => (
              <span
                key={`${dreamcaller.id}-${card.id}`}
                data-dreamcaller-signature-card={`${dreamcaller.id}:${card.id}`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "var(--space-3)",
                  minHeight: 30,
                  padding: "var(--space-2) var(--space-2)",
                  font: token("--t-caption"),
                  color: token("--text-primary"),
                }}
              >
                <GlowIcon
                  iconClass={GLYPHS.star}
                  color="accent"
                  size="0.95em"
                />
                <span>{card.name}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {dreamcaller.tides.length > 0 && (
        <div
          data-dreamcaller-tides={dreamcaller.id}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-4)",
            width: "100%",
            padding: "0 var(--space-2)",
          }}
        >
          <SectionHeading
            label="Tides:"
            blurb={TIDES_LABEL_HOVER_BLURB}
            dreamcallerId={dreamcaller.id}
            wrapperAttr="data-dreamcaller-tides-label-wrapper"
            labelAttr="data-dreamcaller-tides-label"
            infoAttr="data-dreamcaller-tides-info-icon"
            tooltipAttr="data-dreamcaller-tides-tooltip"
          />
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-start",
              gap: "var(--space-3)",
            }}
          >
            {dreamcaller.tides.map((tide) => (
              <span
                key={`${dreamcaller.id}-${tide.id}`}
                data-dreamcaller-tide={`${dreamcaller.id}:${tide.id}`}
              >
                <TidePill
                  label={tide.label}
                  description={tide.description}
                  tide={tide.tide}
                  size="sm"
                />
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * The Tango Dreamcaller-selection screen: a title over a row of pickable
 * Dreamcaller cards. Pure and props-driven — it renders {@link
 * QuestStartScreenProps.dreamcallers} and calls {@link
 * QuestStartScreenProps.onPick} with the chosen Dreamcaller's id.
 */
export function QuestStartScreen({ dreamcallers, onPick }: QuestStartScreenProps) {
  return (
    <div
      // `tango` carries the design-token scope so every semantic token used on
      // this screen (`--accent`, `--text-*`, `--dt-gradient-title`, …) resolves;
      // the screen is mounted by an adapter outside any `.tango` subtree.
      className="tango"
      style={{
        // Top-aligned (not vertically centered): the card column can exceed the
        // viewport height, and centering a taller-than-viewport column clips its
        // top (the title) with no way to scroll to it. Flowing from the top keeps
        // the title visible and lets the page scroll when the cards overflow.
        display: "flex",
        minHeight: "100vh",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "flex-start",
        gap: "var(--space-3)",
        padding: "var(--space-10) var(--space-6) var(--space-11)",
      }}
    >
      <h1
        style={{
          margin: 0,
          textAlign: "center",
          font: token("--t-display"),
          letterSpacing: "0.02em",
          backgroundImage: token("--dt-gradient-title"),
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          WebkitTextFillColor: "transparent",
          filter: `drop-shadow(0 0 28px ${withAlpha("accent", 0.35)})`,
        }}
      >
        Dreamtides
      </h1>
      <p
        style={{
          margin: "0 0 var(--space-7)",
          textAlign: "center",
          font: token("--t-lead"),
          color: token("--text-secondary"),
        }}
      >
        Choose Your Dreamcaller
      </p>

      <div
        style={{
          display: "flex",
          width: "100%",
          maxWidth: 1200,
          flexWrap: "wrap",
          alignItems: "flex-start",
          justifyContent: "center",
          gap: "var(--space-8)",
          padding: "0 var(--space-4)",
        }}
      >
        {dreamcallers.map((dreamcaller) => (
          <DreamcallerCard
            key={dreamcaller.id}
            dreamcaller={dreamcaller}
            onPick={onPick}
          />
        ))}
      </div>
    </div>
  );
}
