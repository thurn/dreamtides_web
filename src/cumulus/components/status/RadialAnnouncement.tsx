// RadialAnnouncement — the one orbiting circular status presentation for
// scene announcements, card scoring, merge targets, hand totals, and victory
// moments.

import { useState, type ReactElement } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { renderRulesSymbolsInline } from "../card/RulesText";
import { StandaloneGlyph } from "../controls/StandaloneGlyph";
import { EssenceValue } from "../hud/EssenceValue";
import { InlineGlyph } from "../typography/InlineGlyph";
import { GLYPHS, type Glyph } from "../../primitives/glyph";
import { motionTimeSeconds } from "../../primitives/motion-time";
import { token } from "../../primitives/tokens";
import {
  meaning,
  txa,
  plural,
  one,
  other,
  tx,
  type LocalizedString,
} from "@trox/runtime";
import { useLocalizer } from "../../../runtime/localization/use-localizer";

export const RADIAL_ANNOUNCEMENT_DURATION_MS = 2_100;
export const RADIAL_ANNOUNCEMENT_EXTENDED_DURATION_MS = 3_360;

const RADIAL_ANNOUNCEMENT_SIZE = {
  mini: 108,
  wager: 164,
  compact: 184,
  standard: 236,
} as const;

const CARD_SCORE_DISC_WIDTH = "78%";
const CARD_SCORE_ANIMATION_SECONDS = motionTimeSeconds("--dur-slow") * 4;
const MERGE_TARGET_DISC_WIDTH = "72%";
const VICTORY_STAGE_SIZE = "min(76vw, 420px)";
const VICTORY_CORE_SIZE = "min(43vw, 236px)";
const DISC_ARRIVAL_SCALE = 0.48;
const DISC_OVERSHOOT_SCALE = 1.08;
const DISC_EXIT_SCALE = 0.86;
const ORBIT_ARRIVAL_SCALE = 0.64;
const ORBIT_EXIT_SCALE = 1.24;
const RIPPLE_ARRIVAL_SCALE = 0.68;
const RIPPLE_EXIT_SCALE = 1.42;
const MINI_RIPPLE_ARRIVAL_SCALE = 0.82;
const MINI_RIPPLE_EXIT_SCALE = 1.16;
const WAGER_RIPPLE_ARRIVAL_SCALE = 0.76;
const WAGER_RIPPLE_EXIT_SCALE = 1.08;
const COPY_ARRIVAL_SCALE = 0.72;
const COPY_OVERSHOOT_SCALE = 1.06;
const COPY_EXIT_SCALE = 0.94;
const TARGET_DISC_LOW_SCALE = 0.9;
const TARGET_DISC_HIGH_SCALE = 1.04;
const VICTORY_ARRIVAL_SCALE = 0.36;
const VICTORY_OVERSHOOT_SCALE = 1.08;
const VICTORY_RIPPLE_START_SCALE = 0.72;
const VICTORY_RIPPLE_END_SCALE = 1.46;
const VICTORY_BREATHE_LOW_SCALE = 0.97;
const VICTORY_BREATHE_HIGH_SCALE = 1.03;
const VICTORY_STAR_LOW_SCALE = 0.92;
const VICTORY_STAR_HIGH_SCALE = 1.08;
const VICTORY_INTRO_DURATION = `calc(${token("--dur-slow")} * 5)`;
const VICTORY_TITLE_HOLD_DURATION = "3s";
const VICTORY_TITLE_MOVE_DURATION = `calc(${token("--dur-slow")} * 3)`;
export const RADIAL_ANNOUNCEMENT_VICTORY_ACTION_DELAY = `calc(${VICTORY_TITLE_HOLD_DURATION} + ${token("--dur-slow")} * 3)`;
const VICTORY_TITLE_FADE_DURATION = `calc(${token("--dur-slow")} * 0.7)`;

const RADIAL_DISC_BACKGROUND = `radial-gradient(circle at 38% 28%, ${token("--surface-raised")} 0%, ${token("--surface-card")} 56%, ${token("--bg-sunken")} 100%)`;

const RADIAL_ANNOUNCEMENT_CSS = `
  @keyframes radial-announcement-disc {
    0% { opacity: 0; transform: scale(${String(DISC_ARRIVAL_SCALE)}) rotate(-12deg); }
    18% { opacity: 1; transform: scale(${String(DISC_OVERSHOOT_SCALE)}) rotate(3deg); }
    30%, 72% { opacity: 1; transform: scale(1) rotate(0deg); }
    100% { opacity: 0; transform: scale(${String(DISC_EXIT_SCALE)}) rotate(0deg); }
  }

  @keyframes radial-announcement-orbit {
    0% { opacity: 0; transform: scale(${String(ORBIT_ARRIVAL_SCALE)}) rotate(-70deg); }
    24% { opacity: 0.88; }
    74% { opacity: 0.42; }
    100% { opacity: 0; transform: scale(${String(ORBIT_EXIT_SCALE)}) rotate(250deg); }
  }

  @keyframes radial-announcement-ripple {
    0%, 18% { opacity: 0; transform: scale(${String(RIPPLE_ARRIVAL_SCALE)}); }
    36% { opacity: 0.7; }
    100% { opacity: 0; transform: scale(${String(RIPPLE_EXIT_SCALE)}); }
  }

  @keyframes radial-announcement-ripple-mini {
    0%, 18% { opacity: 0; transform: scale(${String(MINI_RIPPLE_ARRIVAL_SCALE)}); }
    36% { opacity: 0.7; }
    100% { opacity: 0; transform: scale(${String(MINI_RIPPLE_EXIT_SCALE)}); }
  }

  @keyframes radial-announcement-ripple-wager {
    0%, 18% { opacity: 0; transform: scale(${String(WAGER_RIPPLE_ARRIVAL_SCALE)}); }
    36% { opacity: 0.7; }
    100% { opacity: 0; transform: scale(${String(WAGER_RIPPLE_EXIT_SCALE)}); }
  }

  @keyframes radial-announcement-copy {
    0%, 14% { opacity: 0; transform: scale(${String(COPY_ARRIVAL_SCALE)}); }
    28% { opacity: 1; transform: scale(${String(COPY_OVERSHOOT_SCALE)}); }
    38%, 72% { opacity: 1; transform: scale(1); }
    100% { opacity: 0; transform: scale(${String(COPY_EXIT_SCALE)}); }
  }

  @keyframes radial-announcement-target-disc {
    0%, 100% { opacity: 0.72; transform: scale(${String(TARGET_DISC_LOW_SCALE)}); }
    50% { opacity: 1; transform: scale(${String(TARGET_DISC_HIGH_SCALE)}); }
  }

  @keyframes radial-announcement-target-orbit {
    0% { opacity: 0.3; transform: rotate(0deg); }
    50% { opacity: 0.9; }
    100% { opacity: 0.3; transform: rotate(360deg); }
  }

  @keyframes radial-announcement-hand-total-orbit {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  @keyframes radial-announcement-victory-arrival {
    0% { opacity: 0; transform: scale(${String(VICTORY_ARRIVAL_SCALE)}) rotate(-18deg); }
    18% { opacity: 1; transform: scale(${String(VICTORY_OVERSHOOT_SCALE)}) rotate(3deg); }
    32%, 100% { opacity: 1; transform: scale(1) rotate(0deg); }
  }

  @keyframes radial-announcement-victory-orbit {
    from { transform: rotate(-70deg); }
    to { transform: rotate(290deg); }
  }

  @keyframes radial-announcement-victory-counter-orbit {
    from { transform: rotate(40deg); }
    to { transform: rotate(-320deg); }
  }

  @keyframes radial-announcement-victory-ripple {
    0% { opacity: 0; transform: scale(${String(VICTORY_RIPPLE_START_SCALE)}); }
    18% { opacity: 0.68; }
    78%, 100% { opacity: 0; transform: scale(${String(VICTORY_RIPPLE_END_SCALE)}); }
  }

  @keyframes radial-announcement-victory-breathe {
    0%, 100% { transform: scale(${String(VICTORY_BREATHE_LOW_SCALE)}); }
    50% { transform: scale(${String(VICTORY_BREATHE_HIGH_SCALE)}); }
  }

  @keyframes radial-announcement-victory-title-move {
    from { top: 50%; transform: translate(-50%, -50%); }
    to { top: 0; transform: translate(-50%, calc(-100% - ${token("--space-m")})); }
  }

  @keyframes radial-announcement-victory-title-fade {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @keyframes radial-announcement-victory-star-reveal {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @keyframes radial-announcement-victory-star-spin {
    0%, 100% { transform: rotate(0deg) scale(${String(VICTORY_STAR_LOW_SCALE)}); }
    50% { transform: rotate(45deg) scale(${String(VICTORY_STAR_HIGH_SCALE)}); }
  }

  @media (prefers-reduced-motion: reduce) {
    [data-radial-announcement-variant="victory"],
    [data-radial-announcement-disc],
    [data-radial-announcement-orbit],
    [data-radial-announcement-ripple],
    [data-radial-announcement-copy],
    [data-radial-announcement-headline],
    [data-radial-announcement-symbol] {
      animation: none !important;
      transition: none !important;
    }
  }
`;

/** Named semantic color treatment for a radial announcement. */
export type RadialAnnouncementTone = "accent" | "reward" | "danger";

/** Named disc size for viewport-scaled announcement contexts. */
export type RadialAnnouncementSize = keyof typeof RADIAL_ANNOUNCEMENT_SIZE;

/** Named display dwell for ordinary and longer reading moments. */
export type RadialAnnouncementDuration = "standard" | "extended";

interface RadialAnnouncementCommonProps {
  /** Stable identifier exposed on the announcement root. */
  announcementId?: string;
}

/** A transient whole-scene announcement. */
export interface RadialAnnouncementSceneProps extends RadialAnnouncementCommonProps {
  /** Named radial presentation. Omit for the ordinary scene announcement. */
  variant?: "announcement";
  /** Primary announcement copy. */
  headline: LocalizedString;
  /** Optional canonical glyph rendered in place of the headline copy. */
  headlineGlyph?: Glyph;
  /** Optional supporting copy beneath the headline. */
  detail?: LocalizedString;
  /** Optional gained Essence amount, rendered with the canonical currency glyph. */
  essenceGained?: number;
  /** Semantic orbit and ripple color. Defaults to accent. */
  tone?: RadialAnnouncementTone;
  /** Named disc diameter. Defaults to standard. */
  size?: RadialAnnouncementSize;
  /** Named animation and reading dwell. Defaults to standard. */
  duration?: RadialAnnouncementDuration;
}

/** A transient points announcement attached to its scoring card. */
export interface RadialAnnouncementCardScoreProps extends RadialAnnouncementCommonProps {
  /** Selects the card-attached scoring presentation. */
  variant: "card-score";
  /** Points scored by the attached card. */
  points: number;
}

/** A continuously animated available merge target. */
export interface RadialAnnouncementAvailableTargetProps extends RadialAnnouncementCommonProps {
  /** Selects the card-attached merge-target presentation. */
  variant: "merge-target";
  /** Available targets use the accent treatment. */
  status: "available";
  /** Spark added by completing the merge. */
  addedSpark: number;
}

/** A continuously animated blocked merge target. */
export interface RadialAnnouncementBlockedTargetProps extends RadialAnnouncementCommonProps {
  /** Selects the card-attached merge-target presentation. */
  variant: "merge-target";
  /** Blocked targets use the danger treatment. */
  status: "blocked";
  /** A blocked merge cannot add Spark. */
  addedSpark?: never;
}

/** A persistent terminal victory presentation. */
export interface RadialAnnouncementVictoryProps extends RadialAnnouncementCommonProps {
  /** Selects the persistent victory presentation. */
  variant: "victory";
  /** Victory heading moved above the radial core after its opening hold. */
  headline: LocalizedString;
}

/** A persistent playing-hand total with a continuously orbiting rim. */
export interface RadialAnnouncementHandTotalProps extends RadialAnnouncementCommonProps {
  /** Selects the compact playing-hand total presentation. */
  variant: "hand-total";
  /** Numeric value shown at the end of the hand. */
  total: number;
  /** Owner included in the accessible total announcement. */
  owner: "dealer" | "player";
  /** Named compact disc diameter. Defaults to compact. */
  size?: "mini" | "compact";
}

/** Strict models for every orbiting circular status presentation. */
export type RadialAnnouncementProps =
  | RadialAnnouncementSceneProps
  | RadialAnnouncementCardScoreProps
  | RadialAnnouncementAvailableTargetProps
  | RadialAnnouncementBlockedTargetProps
  | RadialAnnouncementVictoryProps
  | RadialAnnouncementHandTotalProps;

type RadialAnnouncementImplementationProps = RadialAnnouncementProps & {
  readonly variant?: RadialAnnouncementProps["variant"];
  readonly tone?: RadialAnnouncementTone;
  readonly size?: RadialAnnouncementSize;
  readonly duration?: RadialAnnouncementDuration;
};

function toneColor(tone: RadialAnnouncementTone): string {
  if (tone === "reward") return token("--reward");
  if (tone === "danger") return token("--danger");
  return token("--accent-bright");
}

/**
 * The single orbiting circular status system. Named variants cover transient
 * scene announcements, card scoring, merge targets, hand totals, and terminal
 * victory.
 */
export function RadialAnnouncement(
  props: RadialAnnouncementProps,
): ReactElement;
export function RadialAnnouncement({
  variant = "announcement",
  tone = "accent",
  size = "standard",
  duration = "standard",
  ...props
}: RadialAnnouncementImplementationProps): ReactElement {
  if (variant === "card-score") {
    return (
      <CardScoreAnnouncement
        {...(props as Omit<RadialAnnouncementCardScoreProps, "variant">)}
        variant="card-score"
      />
    );
  }
  if (variant === "merge-target") {
    const mergeProps = props as Omit<
      | RadialAnnouncementAvailableTargetProps
      | RadialAnnouncementBlockedTargetProps,
      "variant"
    >;
    if (mergeProps.status === "available") {
      const availableProps = mergeProps as Omit<
        RadialAnnouncementAvailableTargetProps,
        "variant"
      >;
      return (
        <MergeTargetAnnouncement
          variant="merge-target"
          status="available"
          addedSpark={availableProps.addedSpark}
          announcementId={availableProps.announcementId}
        />
      );
    }
    return (
      <MergeTargetAnnouncement
        variant="merge-target"
        status="blocked"
        announcementId={mergeProps.announcementId}
      />
    );
  }
  if (variant === "victory") {
    return (
      <VictoryAnnouncement
        {...(props as Omit<RadialAnnouncementVictoryProps, "variant">)}
        variant="victory"
      />
    );
  }
  if (variant === "hand-total") {
    const handTotalProps = props as Omit<
      RadialAnnouncementHandTotalProps,
      "variant"
    >;
    return (
      <HandTotalAnnouncement
        variant="hand-total"
        total={handTotalProps.total}
        owner={handTotalProps.owner}
        size={size === "mini" ? "mini" : "compact"}
        announcementId={handTotalProps.announcementId}
      />
    );
  }
  return (
    <SceneAnnouncement
      {...(props as Omit<RadialAnnouncementSceneProps, "variant">)}
      variant="announcement"
      tone={tone}
      size={size}
      duration={duration}
    />
  );
}

function HandTotalAnnouncement({
  total,
  owner,
  size = "compact",
  announcementId,
}: RadialAnnouncementHandTotalProps): ReactElement {
  const reduceMotion = useReducedMotion() === true;
  const resolve = useLocalizer();
  const diameter = size === "mini" ? 52 : 60;
  return (
    <motion.div
      role="status"
      aria-live="polite"
      aria-label={resolve(
        owner === "dealer"
          ? txa(
              "Dealer total {total}",
              { total },
              "Accessible name for a Gamble dealer's final hand total. total is the non-negative numeric hand value.",
            )
          : txa(
              "Player total {total}",
              { total },
              "Accessible name for the local player's final Gamble hand total. total is the non-negative numeric hand value.",
            ),
      )}
      data-radial-announcement={announcementId ?? ""}
      data-radial-announcement-variant="hand-total"
      data-radial-announcement-owner={owner}
      data-radial-announcement-total={total}
      initial={reduceMotion ? false : { opacity: 0, scale: 0.68 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{
        duration: reduceMotion ? 0 : motionTimeSeconds("--dur-slow"),
        ease: [0.22, 0.61, 0.36, 1],
      }}
      style={{
        position: "relative",
        width: diameter,
        height: diameter,
        flex: "0 0 auto",
        display: "grid",
        placeItems: "center",
        borderRadius: token("--radius-pill"),
        background: token("--bg-sunken"),
        boxShadow: `${token("--shadow-lg")}, ${token("--glow-accent-soft")}`,
        color: token("--text-primary"),
        font: token("--t-title-sm"),
        textShadow: token("--text-outline-media"),
        pointerEvents: "none",
      }}
    >
      <style>{RADIAL_ANNOUNCEMENT_CSS}</style>
      <span
        aria-hidden="true"
        data-radial-announcement-orbit=""
        data-radial-announcement-hand-total-orbit=""
        style={{
          position: "absolute",
          inset: token("--space-xxs"),
          borderWidth: token("--space-xxs"),
          borderStyle: "solid",
          borderTopColor: token("--text-primary"),
          borderRightColor: token("--border-accent"),
          borderBottomColor: token("--border-accent"),
          borderLeftColor: token("--border-accent"),
          borderRadius: token("--radius-pill"),
          animation: reduceMotion
            ? undefined
            : `radial-announcement-hand-total-orbit calc(${token("--dur-slow")} * 4) linear infinite`,
        }}
      />
      <span data-radial-announcement-headline="">{total}</span>
    </motion.div>
  );
}

function SceneAnnouncement({
  headline,
  headlineGlyph,
  detail,
  essenceGained,
  tone = "accent",
  size = "standard",
  duration = "standard",
  announcementId,
}: RadialAnnouncementSceneProps): ReactElement {
  return (
    <TransientAnnouncement
      announcementId={announcementId}
      headline={headline}
      headlineGlyph={headlineGlyph}
      detail={detail}
      essenceGained={essenceGained}
      tone={tone}
      size={size}
      duration={duration}
    />
  );
}

function CardScoreAnnouncement({
  points,
  announcementId,
}: RadialAnnouncementCardScoreProps): ReactElement {
  const resolve = useLocalizer();
  const reduceMotion = useReducedMotion();
  const animationDuration = reduceMotion ? 0 : CARD_SCORE_ANIMATION_SECONDS;
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={resolve(
        txa(
          plural(points, [one("{count} Point"), other("{count} Points")]),
          { count: points },
          "Accessible label for a battle score announcement. count is the non-negative number of points shown by the announcement and can be zero.",
        ),
      )}
      data-radial-announcement={announcementId ?? ""}
      data-radial-announcement-variant="card-score"
      data-radial-announcement-tone="accent"
      data-radial-announcement-points={points}
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 8,
        display: "grid",
        placeItems: "center",
        pointerEvents: "none",
      }}
    >
      <motion.div
        data-radial-announcement-disc=""
        data-battle-card-points-bubble=""
        initial={
          reduceMotion
            ? false
            : { opacity: 0, scale: 0.48, y: "24%", rotate: -12 }
        }
        animate={
          reduceMotion
            ? { opacity: 1, scale: 1, y: 0, rotate: 0 }
            : {
                opacity: [0, 1, 1, 0],
                scale: [0.48, 1.08, 1, 0.86],
                y: ["24%", "0%", "-8%", "-18%"],
                rotate: [-12, 3, 0, 0],
              }
        }
        transition={{
          duration: animationDuration,
          times: reduceMotion ? undefined : [0, 0.18, 0.72, 1],
          ease: "easeInOut",
        }}
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: token("--space-xxs"),
          width: CARD_SCORE_DISC_WIDTH,
          aspectRatio: "1",
          borderRadius: token("--radius-pill"),
          background: RADIAL_DISC_BACKGROUND,
          boxShadow: `${token("--shadow-lg")}, ${token("--glow-accent-soft")}`,
          color: token("--text-primary"),
          font: token("--t-popover-headline"),
          textShadow: token("--text-outline-media"),
        }}
      >
        <motion.span
          aria-hidden="true"
          data-radial-announcement-orbit=""
          data-battle-card-points-orbit=""
          animate={
            reduceMotion
              ? { opacity: 0.42, scale: 1, rotate: 0 }
              : {
                  opacity: [0, 0.88, 0.42, 0],
                  scale: [0.64, 1, 1, 1.24],
                  rotate: [-70, 0, 140, 250],
                }
          }
          transition={{
            duration: animationDuration,
            times: reduceMotion ? undefined : [0, 0.24, 0.74, 1],
            ease: "easeInOut",
          }}
          style={{
            position: "absolute",
            inset: token("--space-xs"),
            border: `${token("--space-xxs")} solid ${token("--border-accent")}`,
            borderTopColor: token("--accent-bright"),
            borderRadius: token("--radius-pill"),
          }}
        />
        <span
          data-radial-announcement-headline=""
          data-battle-card-points-value=""
        >
          {points}
        </span>
        <StandaloneGlyph
          glyph={GLYPHS.points}
          color="text-primary"
          depth="content-protection"
        />
      </motion.div>
    </div>
  );
}

function TransientAnnouncement({
  announcementId,
  headline,
  headlineGlyph,
  detail,
  essenceGained,
  tone,
  size,
  duration,
}: {
  readonly announcementId?: string;
  readonly headline: LocalizedString;
  readonly headlineGlyph?: Glyph;
  readonly detail?: LocalizedString;
  readonly essenceGained?: number;
  readonly tone: RadialAnnouncementTone;
  readonly size: RadialAnnouncementSize;
  readonly duration: RadialAnnouncementDuration;
}): ReactElement {
  const resolve = useLocalizer();
  const accent = toneColor(tone);
  const animationDuration = `calc(${token("--dur-slow")} * ${duration === "extended" ? "8" : "5"})`;
  const rippleAnimation =
    size === "mini"
      ? "radial-announcement-ripple-mini"
      : size === "wager"
        ? "radial-announcement-ripple-wager"
        : "radial-announcement-ripple";

  return (
    <div
      role="status"
      aria-live="polite"
      data-radial-announcement={announcementId ?? ""}
      data-radial-announcement-variant="announcement"
      data-radial-announcement-tone={tone}
      data-radial-announcement-duration={duration}
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 55,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        pointerEvents: "none",
      }}
    >
      <style>{RADIAL_ANNOUNCEMENT_CSS}</style>
      <div
        data-radial-announcement-disc=""
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: token("--space-xs"),
          width: RADIAL_ANNOUNCEMENT_SIZE[size],
          height: RADIAL_ANNOUNCEMENT_SIZE[size],
          borderRadius: token("--radius-pill"),
          background: RADIAL_DISC_BACKGROUND,
          boxShadow: `${token("--shadow-lg")}, ${token("--glow-accent-soft")}`,
          animation: `radial-announcement-disc ${animationDuration} ${token("--ease-in-out")} both`,
        }}
      >
        <span
          aria-hidden="true"
          data-radial-announcement-orbit=""
          style={{
            position: "absolute",
            inset: token("--space-s"),
            borderWidth: token("--space-xxs"),
            borderStyle: "solid",
            borderTopColor: token("--text-primary"),
            borderRightColor: accent,
            borderBottomColor: accent,
            borderLeftColor: accent,
            borderRadius: token("--radius-pill"),
            animation: `radial-announcement-orbit ${animationDuration} ${token("--ease-dream")} both`,
          }}
        />
        <span
          aria-hidden="true"
          data-radial-announcement-ripple=""
          style={{
            position: "absolute",
            inset: `calc(-1 * ${token(
              size === "mini" || size === "wager" ? "--space-xxs" : "--space-s",
            )})`,
            border: `${token("--space-xxs")} solid ${accent}`,
            borderRadius: token("--radius-pill"),
            animation: `${rippleAnimation} ${animationDuration} ${token("--ease-out")} both`,
          }}
        />
        <div
          data-radial-announcement-copy=""
          style={{
            position: "relative",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: token("--space-xs"),
            color: token("--text-primary"),
            textAlign: "center",
            textShadow: token("--text-outline-media"),
            animation: `radial-announcement-copy ${animationDuration} ${token("--ease-out")} both`,
          }}
        >
          <span
            data-radial-announcement-headline=""
            data-radial-announcement-headline-glyph={headlineGlyph}
            style={{
              font: token(
                headlineGlyph === undefined
                  ? size === "mini"
                    ? "--t-title-sm"
                    : "--t-title"
                  : size === "mini"
                    ? "--t-title"
                    : "--t-display",
              ),
            }}
          >
            {headlineGlyph === undefined ? (
              renderRulesSymbolsInline(resolve(headline))
            ) : (
              <InlineGlyph glyph={headlineGlyph} label={headline} />
            )}
          </span>
          {essenceGained !== undefined && (
            <span
              data-radial-announcement-essence=""
              style={{
                font: token(size === "mini" ? "--t-body" : "--t-title-sm"),
              }}
            >
              +<EssenceValue amount={essenceGained} tone="inherit" />
            </span>
          )}
          {detail !== undefined ? (
            <span
              data-radial-announcement-detail=""
              style={{
                maxWidth: size === "mini" ? "84%" : "72%",
                font: token(size === "mini" ? "--t-caption" : "--t-body-sm"),
                color: token("--text-secondary"),
              }}
            >
              {renderRulesSymbolsInline(resolve(detail))}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function MergeTargetAnnouncement(
  props:
    | RadialAnnouncementAvailableTargetProps
    | RadialAnnouncementBlockedTargetProps,
): ReactElement {
  const resolve = useLocalizer();
  const blocked = props.status === "blocked";
  const tone: RadialAnnouncementTone = blocked ? "danger" : "accent";
  const orbitColor = blocked ? token("--danger") : token("--border-accent");
  return (
    <div
      role="status"
      aria-live="polite"
      data-radial-announcement={props.announcementId ?? ""}
      data-radial-announcement-variant="merge-target"
      data-radial-announcement-tone={tone}
      data-radial-announcement-target-status={props.status}
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 110,
        display: "grid",
        placeItems: "center",
        pointerEvents: "none",
      }}
    >
      <style>{RADIAL_ANNOUNCEMENT_CSS}</style>
      <div
        data-radial-announcement-disc=""
        style={{
          position: "relative",
          width: MERGE_TARGET_DISC_WIDTH,
          aspectRatio: "1",
          display: "grid",
          placeItems: "center",
          borderRadius: token("--radius-pill"),
          background: RADIAL_DISC_BACKGROUND,
          boxShadow: `${token("--shadow-lg")}, ${token("--glow-accent-soft")}`,
          animation: `radial-announcement-target-disc calc(${token("--dur-slow")} * 2) ${token("--ease-in-out")} infinite`,
        }}
      >
        <span
          aria-hidden="true"
          data-radial-announcement-orbit=""
          style={{
            position: "absolute",
            inset: token("--space-xs"),
            borderWidth: token("--space-xxs"),
            borderStyle: "solid",
            borderTopColor: blocked
              ? token("--danger")
              : token("--accent-bright"),
            borderRightColor: orbitColor,
            borderBottomColor: orbitColor,
            borderLeftColor: orbitColor,
            borderRadius: token("--radius-pill"),
            animation: `radial-announcement-target-orbit calc(${token("--dur-slow")} * 2) linear infinite`,
          }}
        />
        <span
          data-radial-announcement-copy=""
          style={{
            position: "relative",
            display: "grid",
            gap: token("--space-xxs"),
            color: token("--text-primary"),
            font: token("--t-caption"),
            textAlign: "center",
            textShadow: token("--text-outline-media"),
          }}
        >
          <span data-radial-announcement-headline="">
            {resolve(
              blocked
                ? tx(
                    "Cannot Merge",
                    "Headline inside a blocked Figment merge target when exhaustion prevents the merge.",
                  )
                : tx(
                    meaning("figment-merge-headline", "Merge"),
                    "Headline inside an available Figment merge target.",
                  ),
            )}
          </span>
          {!blocked ? (
            <span data-radial-announcement-detail="">
              {renderRulesSymbolsInline(
                resolve(
                  txa(
                    "+{spark_count} ✦",
                    { spark_count: props.addedSpark },
                    "Compact Spark detail inside an available Figment merge target. spark_count is the non-negative Spark that the destination Figment will gain; the star is the canonical Spark symbol and is converted to the shared accessible glyph.",
                  ),
                ),
              )}
            </span>
          ) : null}
        </span>
      </div>
    </div>
  );
}

function VictoryAnnouncement({
  headline,
  announcementId,
}: RadialAnnouncementVictoryProps): ReactElement {
  const [titleSettled, setTitleSettled] = useState(false);
  const resolve = useLocalizer();
  return (
    <div
      data-radial-announcement={announcementId ?? ""}
      data-radial-announcement-variant="victory"
      data-radial-announcement-tone="reward"
      style={{
        position: "relative",
        zIndex: 2,
        width: VICTORY_STAGE_SIZE,
        aspectRatio: "1",
        display: "grid",
        placeItems: "center",
        animation: `radial-announcement-victory-arrival ${VICTORY_INTRO_DURATION} ${token("--ease-dream")} both`,
      }}
    >
      <style>{RADIAL_ANNOUNCEMENT_CSS}</style>
      <h1
        data-radial-announcement-headline=""
        onAnimationEnd={(event) => {
          if (event.currentTarget === event.target) {
            setTitleSettled(true);
          }
        }}
        style={{
          position: "absolute",
          left: "50%",
          top: 0,
          zIndex: 4,
          margin: 0,
          color: token("--text-primary"),
          font: token("--t-display"),
          textAlign: "center",
          textShadow: token("--text-outline-media"),
          whiteSpace: "nowrap",
          transform: `translate(-50%, calc(-100% - ${token("--space-m")}))`,
          animation: titleSettled
            ? undefined
            : `radial-announcement-victory-title-move ${VICTORY_TITLE_MOVE_DURATION} ${token("--ease-dream")} ${VICTORY_TITLE_HOLD_DURATION} both`,
        }}
      >
        <span
          data-radial-announcement-copy=""
          style={{
            display: "block",
            animation: `radial-announcement-victory-title-fade ${VICTORY_TITLE_FADE_DURATION} ${token("--ease-out")} both`,
          }}
        >
          {resolve(headline)}
        </span>
      </h1>
      {[0, 1].map((index) => (
        <span
          key={index}
          aria-hidden="true"
          data-radial-announcement-ripple=""
          style={{
            position: "absolute",
            inset: token("--space-m"),
            border: `${token("--space-xxs")} solid ${token("--border-accent")}`,
            borderRadius: token("--radius-pill"),
            animation:
              `radial-announcement-victory-ripple ${VICTORY_INTRO_DURATION} ${token("--ease-out")} ` +
              `${index === 0 ? "0s" : `calc(${VICTORY_INTRO_DURATION} / 2)`} infinite`,
          }}
        />
      ))}
      <span
        aria-hidden="true"
        data-radial-announcement-orbit="outer"
        style={{
          position: "absolute",
          inset: token("--space-l"),
          border: `${token("--space-xxs")} solid ${token("--border-accent")}`,
          borderTopColor: token("--accent-bright"),
          borderBottomColor: "transparent",
          borderRadius: token("--radius-pill"),
          animation: `radial-announcement-victory-orbit calc(${token("--dur-slow")} * 12) linear infinite`,
        }}
      >
        <span
          style={{
            position: "absolute",
            left: "50%",
            top: `calc(-1 * ${token("--space-xs")})`,
            width: token("--space-l"),
            height: token("--space-l"),
            borderRadius: token("--radius-pill"),
            background: token("--reward"),
            boxShadow: token("--glow-accent-soft"),
          }}
        />
      </span>
      <span
        aria-hidden="true"
        data-radial-announcement-orbit="inner"
        style={{
          position: "absolute",
          inset: token("--space-6xl"),
          border: `${token("--space-xxs")} solid ${token("--border-soft")}`,
          borderLeftColor: token("--reward"),
          borderRightColor: "transparent",
          borderRadius: token("--radius-pill"),
          animation: `radial-announcement-victory-counter-orbit calc(${token("--dur-slow")} * 16) linear infinite`,
        }}
      />
      <span
        aria-hidden="true"
        data-radial-announcement-disc=""
        style={{
          position: "relative",
          width: VICTORY_CORE_SIZE,
          aspectRatio: "1",
          display: "grid",
          placeItems: "center",
          border: `${token("--space-xxs")} solid ${token("--border-accent")}`,
          borderRadius: token("--radius-pill"),
          background: RADIAL_DISC_BACKGROUND,
          boxShadow: `${token("--shadow-lg")}, ${token("--glow-accent-soft")}`,
          animation: `radial-announcement-victory-breathe calc(${token("--dur-slow")} * 7) ${token("--ease-in-out")} infinite`,
        }}
      >
        <span
          data-radial-announcement-symbol="victory"
          style={{
            width: "42%",
            aspectRatio: "1",
            background: token("--reward"),
            clipPath:
              "polygon(50% 0%, 56% 44%, 100% 50%, 56% 56%, 50% 100%, 44% 56%, 0% 50%, 44% 44%)",
            boxShadow: token("--glow-accent-soft"),
            animation:
              `radial-announcement-victory-star-reveal ${VICTORY_TITLE_MOVE_DURATION} ${token("--ease-out")} ${VICTORY_TITLE_HOLD_DURATION} both, ` +
              `radial-announcement-victory-star-spin calc(${token("--dur-slow")} * 8) ${token("--ease-in-out")} ${RADIAL_ANNOUNCEMENT_VICTORY_ACTION_DELAY} infinite`,
          }}
        />
      </span>
    </div>
  );
}
