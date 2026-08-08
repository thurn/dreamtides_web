// DreamsignGalleryPanel — the liquid-glass offer shelf for purchasable
// Dreamsigns. It keeps the Dream Market's header and captions while rendering
// both the collectible art and the restock glyph without object backgrounds.

import { useRef, type ReactElement } from "react";
import type { Dreamsign as DreamsignData } from "../../../types/journey";
import { glassSurfaceStyle } from "../../internal/glass-surface";
import { useRevealSource } from "../../internal/reveal/context";
import { revealEntityId } from "../../internal/reveal/identity";
import { GLYPHS, type Glyph } from "../../primitives/glyph";
import { Pressable } from "../../primitives/Pressable";
import { token } from "../../primitives/tokens";
import { IconButton } from "../controls/IconButton";
import { Dreamsign } from "../hud/Dreamsign";
import { EssenceValue } from "../hud/EssenceValue";
import { CARD_ASPECT_RATIO_VALUE } from "./card-aspect";
import { glossaryInfoCard } from "./glossary-info-card";

/** One UUID-keyed Dreamsign offered by a gallery. */
export interface DreamsignGalleryEntryView {
  /** Stable gallery entry id derived from the persistent slot and Dreamsign UUID. */
  entryId: string;
  /** The Dreamsign domain object rendered by the shared Dreamsign component. */
  dreamsign: DreamsignData;
  /** Essence price shown beneath the offer. */
  price: number;
  /** Whether interaction is available, unaffordable, or already acquired. */
  state: "available" | "unaffordable" | "purchased";
}

/** The bare-glyph action appended after the Dreamsign offers. */
export interface DreamsignGalleryActionView {
  /** Stable action id. */
  entryId: string;
  /** Glyph that identifies the action. */
  glyph: Glyph;
  /** Visible and accessible action label. */
  label: string;
  /** Stable Glossary UUID for the action's explanatory Info Card. */
  glossaryId: string;
  /** Essence price, or null for a free/spent text caption. */
  price: number | null;
  /** Caption used when the action is free or already spent. */
  text: string | null;
  /** Whether the action can currently be triggered. */
  disabled: boolean;
}

export interface DreamsignGalleryPanelProps {
  /** Header title. */
  title: string;
  /** Dreamsign offers in persistent slot order. */
  entries: readonly DreamsignGalleryEntryView[];
  /** Bare-glyph action shown after the offers. */
  endAction: DreamsignGalleryActionView;
  /** Compact uses the two-column phone shelf; standard uses the four-column desktop shelf. */
  size?: "compact" | "standard";
  /** Accessible label for the close control. */
  closeLabel: string;
  /** Fires when the close disc is activated. */
  onClose: () => void;
  /** Fires with the UUID-derived entry id when an available Dreamsign is activated. */
  onEntryPress: (entryId: string) => void;
  /** Fires when the appended action is activated. */
  onEndActionPress: () => void;
  /** Stable test id for the panel root. */
  testId?: string;
}

const COMPACT_ITEM_WIDTH = 92;
const STANDARD_ITEM_WIDTH = 126;
const END_ACTION_GLYPH_SCALE = 0.82;

function captionNode(price: number | null, text: string | null): ReactElement {
  return (
    <p
      data-dreamsign-gallery-caption={price === null ? "text" : "essence"}
      style={{
        minHeight: 18,
        margin: 0,
        display: "grid",
        placeItems: "center",
        font: token("--t-caption"),
        color: token("--text-on-glass"),
        textAlign: "center",
      }}
    >
      {price === null ? text : <EssenceValue amount={price} tone="inherit" />}
    </p>
  );
}

function DreamsignGalleryEndAction({
  action,
  size,
  onActivate,
}: {
  readonly action: DreamsignGalleryActionView;
  readonly size: "compact" | "standard";
  readonly onActivate: () => void;
}): ReactElement {
  const itemWidth =
    size === "compact" ? COMPACT_ITEM_WIDTH : STANDARD_ITEM_WIDTH;
  const itemHeight = itemWidth / CARD_ASPECT_RATIO_VALUE;
  const binding = useRevealSource({
    identity: {
      entityType: "dreamsign-gallery-action",
      entityId: revealEntityId("dreamsign-gallery-action", action.entryId),
    },
    spec: {
      primary: {
        kind: "infoCard",
        card: glossaryInfoCard(action.glossaryId, {
          variant: "icon",
          glyph: action.glyph,
        }),
      },
      secondaries: [],
    },
    onActivate: action.disabled ? undefined : onActivate,
  });
  const lastPointerType = useRef<string | null>(null);
  const pointerDown = binding.sourceProps.onPointerDown;

  return (
    <Pressable
      as="button"
      ref={binding.ref}
      {...binding.sourceProps}
      aria-label={action.label}
      aria-disabled={action.disabled || undefined}
      data-testid="cumulus-dreamsign-bazaar-restock"
      data-reveal-complete-game-card="false"
      data-press-feedback="responsive"
      onPointerDown={(event) => {
        lastPointerType.current = event.pointerType;
        pointerDown?.(event);
      }}
      onClick={() => {
        if (!action.disabled && lastPointerType.current !== "touch")
          onActivate();
      }}
      style={{
        ...binding.sourceProps.style,
        width: "100%",
        display: "block",
        appearance: "none",
        padding: 0,
        border: 0,
        background: "transparent",
      }}
    >
      <span
        style={{
          width: itemWidth,
          height: itemHeight,
          display: "grid",
          placeItems: "center",
        }}
      >
        <i
          className={action.glyph}
          aria-hidden="true"
          data-dreamsign-gallery-action-glyph=""
          style={{
            fontSize: itemWidth * END_ACTION_GLYPH_SCALE,
            color: token("--text-on-accent"),
            textShadow: token("--text-outline-media"),
          }}
        />
      </span>
    </Pressable>
  );
}

/** A glass Dreamsign shelf with UUID-keyed direct-buy offers and one end action. */
export function DreamsignGalleryPanel({
  title,
  entries,
  endAction,
  size = "standard",
  closeLabel,
  onClose,
  onEntryPress,
  onEndActionPress,
  testId,
}: DreamsignGalleryPanelProps): ReactElement {
  const compact = size === "compact";
  const itemWidth = compact ? COMPACT_ITEM_WIDTH : STANDARD_ITEM_WIDTH;
  const itemHeight = itemWidth / CARD_ASPECT_RATIO_VALUE;

  return (
    <section
      data-testid={testId}
      data-dreamsign-gallery-size={size}
      style={{
        ...glassSurfaceStyle(),
        position: "relative",
        width: "100%",
        maxWidth: "100%",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        pointerEvents: "auto",
        borderRadius: token("--radius-compact"),
        background: `${token("--glass-sheen")}, ${token("--glass-fill-popover")}`,
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: token("--space-s"),
          padding: compact ? token("--space-m") : token("--space-2xl"),
          borderBottom: `1px solid ${token("--border-strong")}`,
        }}
      >
        <h2
          style={{
            margin: 0,
            font: token("--t-title-sm"),
            color: token("--text-on-glass"),
            letterSpacing: 0,
          }}
        >
          {title}
        </h2>
        <IconButton
          glyph={GLYPHS.close}
          label={closeLabel}
          placement="onGlass"
          onPress={onClose}
          testId="cumulus-dreamsign-bazaar-leave"
        />
      </header>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${compact ? "2" : "4"}, ${String(itemWidth)}px)`,
          gap: compact ? token("--space-xs") : token("--space-s"),
          justifyContent: "center",
          alignItems: "start",
          padding: compact ? token("--space-s") : token("--space-2xl"),
        }}
      >
        {entries.map((entry) => {
          const reserved = entry.state === "purchased";
          const unavailable = entry.state !== "available";
          return (
            <div
              key={entry.entryId}
              data-dreamsign-gallery-entry-id={entry.entryId}
              data-dreamsign-gallery-reserved={reserved || undefined}
              aria-hidden={reserved || undefined}
              style={{
                minWidth: 0,
                display: "flex",
                flexDirection: "column",
                gap: token("--space-xxs"),
                opacity: unavailable ? 0.42 : 1,
                visibility: reserved ? "hidden" : undefined,
              }}
            >
              <div
                style={{
                  width: itemWidth,
                  height: itemHeight,
                  display: "grid",
                  placeItems: "center",
                }}
              >
                <div style={{ width: itemWidth, height: itemWidth }}>
                  <Dreamsign
                    dreamsign={entry.dreamsign}
                    variant="hud"
                    unavailable={unavailable}
                    testid={`cumulus-dreamsign-bazaar-offer-${entry.entryId}`}
                    onPress={() => onEntryPress(entry.entryId)}
                  />
                </div>
              </div>
              {captionNode(entry.price, null)}
            </div>
          );
        })}

        <div
          style={{
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            gap: token("--space-xxs"),
            opacity: endAction.disabled ? 0.42 : 1,
          }}
        >
          <DreamsignGalleryEndAction
            action={endAction}
            size={size}
            onActivate={onEndActionPress}
          />
          {captionNode(endAction.price, endAction.text)}
        </div>
      </div>
    </section>
  );
}
