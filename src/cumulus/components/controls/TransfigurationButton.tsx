// TransfigurationButton — the canonical forge-form choice.

import type { TransfigurationType } from "../../../types/journey";
import { GLYPHS } from "../../primitives/glyph";
import { Pressable } from "../../primitives/Pressable";
import type { DomTestId } from "../../types/dom";
import { token } from "../../primitives/tokens";
import { EssenceValue } from "../hud/EssenceValue";
import { StandaloneGlyph } from "./StandaloneGlyph";
import type { TransfigurationPresentation } from "./transfiguration-presentation";
import { useRevealSource } from "../../internal/reveal/context";
import { revealEntityId } from "../../internal/reveal/identity";
import { richText } from "../card/rich-text";
import { useRef } from "react";
import { formatNumber } from "../../../runtime/format-number";

/** Identity and authored presentation shared by every Transfiguration choice. */
export interface TransfigurationButtonBaseModel {
  /** Named transfiguration form, which determines the canonical glyph. */
  type: TransfigurationType;
  /** Authored presentation resolved from the injected catalog. */
  presentation: TransfigurationPresentation;
}

/** First-class pricing semantics for a Transfiguration choice. */
export type TransfigurationButtonPricing =
  | {
      /** Pricing does not apply to this choice. */
      readonly kind: "unpriced";
    }
  | {
      /** The choice is purchased with the attached Essence quote. */
      readonly kind: "essence";
      readonly amount: number;
      readonly affordable: boolean;
    };

/** One first-class unpriced or Essence-priced Transfiguration choice. */
export interface TransfigurationButtonModel
  extends TransfigurationButtonBaseModel {
  /** Unpriced semantics or the complete Essence-price behavior. */
  pricing: TransfigurationButtonPricing;
}

/** Strict layouts independent of whether the choice carries a price. */
export type TransfigurationButtonLayout = "compact" | "wide";

export interface TransfigurationButtonProps {
  /** Structured offered-form data; the component owns its canonical glyph and color. */
  form: TransfigurationButtonModel;
  /** Compact or wide layout; wide priced choices show their Essence amount. */
  layout: TransfigurationButtonLayout;
  /** Whether this form is the active radio choice. */
  selected: boolean;
  /** Prevent activation while a transfiguration commit is in flight. */
  disabled?: boolean;
  /** Select the form after a press. */
  onPress: (type: TransfigurationType) => void;
  /** Optional stable test id for the semantic source. */
  testId?: DomTestId;
}

/**
 * Canonical forge-form choice. A press selects the form and updates
 * the adjacent card preview.
 */
export function TransfigurationButton({
  form,
  layout,
  selected,
  disabled = false,
  onPress,
  testId,
}: TransfigurationButtonProps) {
  
  const canAfford =
    form.pricing.kind === "unpriced" || form.pricing.affordable;
  const canSelect = canAfford && !disabled;
  const glyph = GLYPHS[form.presentation.glyph];
  const accent = form.presentation.accentColor;
  const compact = layout === "compact";
  const showPrice = !compact && form.pricing.kind === "essence";
  const suppressCompatibilityClick = useRef(false);
  const binding = useRevealSource({
    identity: {
      entityType: "glossary-term",
      entityId: revealEntityId(
        "glossary-term",
        form.presentation.glossaryUuid,
      ),
    },
    spec: {
      primary: {
        kind: "infoCard",
        card: {
          variant: "icon",
          glyph,
          title: form.presentation.name,
          body: richText.plain(form.presentation.description),
        },
      },
      secondaries: [],
    },
    onActivate: canSelect ? () => onPress(form.type) : undefined,
  });
  const pointerDown = binding.sourceProps.onPointerDown;

  return (
    <Pressable
      as="button"
      ref={binding.ref}
      {...binding.sourceProps}
      data-transfiguration-button-layout={layout}
      role="radio"
      aria-checked={selected}
      aria-description={`${form.presentation.description}`}
      ariaLabelMessage={
        form.pricing.kind === "unpriced"
          ? form.presentation.name
          : `${form.presentation.name}, ${formatNumber(form.pricing.amount)} Essence`
      }
      aria-disabled={canSelect ? undefined : true}
      data-testid={testId}
      onPointerDown={(event) => {
        suppressCompatibilityClick.current = event.pointerType === "touch";
        pointerDown?.(event);
      }}
      onClick={(event) => {
        if (!canSelect) return;
        if (event.detail === 0) {
          suppressCompatibilityClick.current = false;
          onPress(form.type);
        } else if (suppressCompatibilityClick.current) {
          suppressCompatibilityClick.current = false;
        } else {
          onPress(form.type);
        }
      }}
      style={{
        ...binding.sourceProps.style,
        height: compact ? token("--touch-min") : undefined,
        width: "100%",
        minWidth: 0,
        flex: "none",
        display: compact ? "flex" : "grid",
        gridTemplateColumns: compact
          ? undefined
          : showPrice
            ? "auto minmax(0, 1fr) auto"
            : "auto minmax(0, 1fr)",
        alignItems: "center",
        justifyContent: compact ? "center" : undefined,
        textAlign: compact ? "center" : "left",
        gap: compact ? token("--space-xs") : token("--space-s"),
        ...(compact
          ? {
              paddingRight: token("--space-xs"),
              paddingLeft: token("--space-xs"),
            }
          : { padding: token("--space-xs") }),
        boxSizing: "border-box",
        border: `2px solid ${selected ? accent : token("--border-soft")}`,
        borderRadius: token("--radius-control"),
        background: "transparent",
        boxShadow: "none",
        color: token("--text-on-glass"),
        opacity: canAfford ? 1 : 0.46,
      }}
    >
      <span
        style={{
          display: "inline-flex",
          fontSize: compact ? 20 : 28,
        }}
      >
        <StandaloneGlyph
          glyph={glyph}
          color={accent}
          depth="content-protection"
        />
      </span>
      <strong
        style={{
          minWidth: 0,
          font: token("--t-button"),
          color: token("--text-on-glass"),
          whiteSpace: "nowrap",
        }}
      >
        {form.presentation.name}
      </strong>
      {showPrice && form.pricing.kind === "essence" && (
        <span
          data-transfiguration-button-price=""
          style={{
            font: token("--t-button"),
            color: token("--text-on-glass"),
            whiteSpace: "nowrap",
          }}
        >
          <EssenceValue amount={form.pricing.amount} tone="inherit" />
        </span>
      )}
    </Pressable>
  );
}
