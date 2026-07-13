// DreamsignGalleryPanel — the liquid-glass offer shelf for purchasable
// Dreamsigns. It keeps the Dream Market's header, captions, and card-shaped
// restock object while rendering the collectible art itself without chrome.

import type { ReactElement } from "react";
import type { Dreamsign as DreamsignData } from "../../../types/quest";
import { glassSurfaceStyle } from "../../internal/glass-surface";
import { GLYPHS, type Glyph } from "../../primitives/glyph";
import { Pressable } from "../../primitives/Pressable";
import { token } from "../../primitives/tokens";
import { IconButton } from "../controls/IconButton";
import { Dreamsign } from "../hud/Dreamsign";
import { EssenceValue } from "../hud/EssenceValue";
import { CARD_ASPECT_RATIO_VALUE } from "./card-aspect";
import { GalleryActionCard } from "./GalleryActionCard";

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

/** The card-shaped action appended after the Dreamsign offers. */
export interface DreamsignGalleryActionView {
  /** Stable action id. */
  entryId: string;
  /** Glyph that identifies the action. */
  glyph: Glyph;
  /** Visible and accessible action label. */
  label: string;
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
  /** Card-shaped action shown after the offers. */
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

function captionNode(
  price: number | null,
  text: string | null,
): ReactElement {
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
        borderRadius: token("--radius-popover"),
        background: `${token("--glass-sheen")}, ${token("--glass-fill-popover")}`,
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: token("--space-4"),
          padding: compact ? token("--space-5") : token("--space-8"),
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
          testId="tango-dreamsign-bazaar-leave"
        />
      </header>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${compact ? "2" : "4"}, ${String(itemWidth)}px)`,
          gap: compact ? token("--space-3") : token("--space-4"),
          justifyContent: "center",
          alignItems: "start",
          padding: compact ? token("--space-4") : token("--space-8"),
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
                gap: token("--space-1"),
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
                <Dreamsign
                  dreamsign={entry.dreamsign}
                  sizePx={itemWidth}
                  variant="hud"
                  unavailable={unavailable}
                  testid={`tango-dreamsign-bazaar-offer-${entry.entryId}`}
                  onPress={() => onEntryPress(entry.entryId)}
                />
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
            gap: token("--space-1"),
            opacity: endAction.disabled ? 0.42 : 1,
          }}
        >
          <Pressable
            as="button"
            aria-label={endAction.label}
            disabled={endAction.disabled}
            data-testid="tango-dreamsign-bazaar-restock"
            pressFeedback="stationary"
            onClick={endAction.disabled ? undefined : onEndActionPress}
            style={{
              width: "100%",
              display: "block",
              appearance: "none",
              padding: 0,
              border: 0,
              background: "transparent",
            }}
          >
            <GalleryActionCard
              action={{ glyph: endAction.glyph, label: endAction.label }}
              width={itemWidth}
            />
          </Pressable>
          {captionNode(endAction.price, endAction.text)}
        </div>
      </div>
    </section>
  );
}
