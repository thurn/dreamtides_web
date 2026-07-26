import { useLayoutEffect, useRef, useState } from "react";
import { renderRulesText } from "../card/RulesText";
import { rulesTextDefinitionCards } from "../card/rules-text-reveal";
import { useRevealSource } from "../../internal/reveal/context";
import { revealEntityId } from "../../internal/reveal/identity";
import { Pressable } from "../../primitives/Pressable";
import { token } from "../../primitives/tokens";

/** The smallest aligned ability-text scale. Longer copy grows vertically. */
const ABILITY_MIN_SCALE = 0.9;

/** Two lines of the rules voice in the desktop DreamAvatar selection card. */
const ALIGNED_ABILITY_MIN_HEIGHT = 40;

export interface DreamAvatarAbilityTextProps {
  /** Stable DreamAvatar UUID that owns this ability. */
  readonly dreamAvatarId: string;
  /** Complete rendered rules text for the DreamAvatar ability. */
  readonly text: string;
  /**
   * Natural copy for flowing layouts, or the two-line aligned selection-card
   * treatment used by the desktop DreamAvatar offer triptych.
   * @default "natural"
   */
  readonly presentation?: "natural" | "selectionCard";
}

/**
 * Keeps short desktop abilities centered in a two-line floor while allowing
 * longer copy to grow. The transform scales glyphs and text together.
 */
function AlignedAbilityBox({ children }: { children: React.ReactNode }) {
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

function AbilityCopy({ text }: { readonly text: string }) {
  return (
    <div
      style={{
        font: token("--t-rules"),
        color: token("--text-primary"),
        lineHeight: 1.36,
        cursor: "default",
      }}
    >
      {renderRulesText(text, { interactiveTerms: false })}
    </div>
  );
}

function AbilityDefinitionSource({
  dreamAvatarId,
  text,
  presentation,
}: DreamAvatarAbilityTextProps & {
  readonly presentation: NonNullable<
    DreamAvatarAbilityTextProps["presentation"]
  >;
}) {
  const binding = useRevealSource({
    identity: {
      entityType: "dream-avatar-ability",
      entityId: revealEntityId("dream-avatar-ability", dreamAvatarId),
    },
    spec: {
      primary: { kind: "source", description: text },
      secondaries: rulesTextDefinitionCards(text, "dreamAvatar"),
    },
    feedback: "stationary",
  });
  const copy = <AbilityCopy text={text} />;
  return (
    <Pressable
      as="div"
      ref={binding.ref}
      {...binding.sourceProps}
      hoverFeedback="stationary"
      pressFeedback="stationary"
      tabIndex={0}
      aria-label={`Avatar ability: ${text}`}
      data-dream-avatar-ability={dreamAvatarId}
      style={{
        ...binding.sourceProps.style,
        display: "block",
        width: "100%",
        cursor: "default",
      }}
    >
      {presentation === "selectionCard" ? (
        <AlignedAbilityBox>{copy}</AlignedAbilityBox>
      ) : (
        copy
      )}
    </Pressable>
  );
}

/**
 * Complete DreamAvatar ability copy. If the rules text references glossary
 * terms, the whole ability box becomes one semantic reveal source: hovering,
 * focusing, or touch-holding it shows one compact card containing every
 * definition in glossary-priority order.
 */
export function DreamAvatarAbilityText({
  dreamAvatarId,
  text,
  presentation = "natural",
}: DreamAvatarAbilityTextProps) {
  const definitions = rulesTextDefinitionCards(text, "dreamAvatar");
  const copy = <AbilityCopy text={text} />;
  if (definitions.length === 0) {
    return presentation === "selectionCard" ? (
      <AlignedAbilityBox>{copy}</AlignedAbilityBox>
    ) : (
      copy
    );
  }
  return (
    <AbilityDefinitionSource
      dreamAvatarId={dreamAvatarId}
      text={text}
      presentation={presentation}
    />
  );
}
