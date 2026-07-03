import { useState, type CSSProperties } from "react";
import { DreamsignHoverCard } from "./DreamsignHoverCard";
import { HoverPopover } from "../tango/components/HoverPopover";
import { RulesText } from "../tango/components/RulesText";
import type { Dreamsign } from "../types/quest";
import { assetUrl } from "../runtime/asset-url";

/**
 * Compact HUD row of dreamsign thumbnails — one square per owned dreamsign.
 *
 * Each thumbnail uses the dreamsign's `imageName` artwork and wraps itself
 * in a `HoverPopover` so the player can read the dreamsign's name, full
 * effect text, and a larger version of the art on hover.
 *
 * Bane dreamsigns get a red ring and a faint desaturation so they read at a
 * glance as a curse rather than a boon.
 *
 * When the player owns more than `MAX_VISIBLE_ICONS` dreamsigns the row
 * shows the first N and a `+M` overflow pill whose hover popover summarizes
 * every clipped dreamsign in a single list. This keeps the HUD bounded
 * while still giving the player a route to inspect every effect.
 *
 * The row collapses to render nothing when the player owns zero
 * dreamsigns, so the HUD does not reserve any width for an empty list.
 */

const MAX_VISIBLE_ICONS = 10;
const ICON_SIZE_PX = 28;

interface HudDreamsignRowProps {
  dreamsigns: readonly Dreamsign[];
}

export function HudDreamsignRow({ dreamsigns }: HudDreamsignRowProps) {
  if (dreamsigns.length === 0) {
    return null;
  }

  const visible = dreamsigns.slice(0, MAX_VISIBLE_ICONS);
  const overflow = dreamsigns.slice(MAX_VISIBLE_ICONS);

  return (
    <div
      data-testid="hud-dreamsign-row"
      className="flex shrink-0 items-center gap-1"
      role="list"
      aria-label="Dreamsigns"
    >
      {visible.map((dreamsign, index) => (
        <HudDreamsignIcon
          key={`${dreamsign.id ?? dreamsign.name}-${String(index)}`}
          dreamsign={dreamsign}
        />
      ))}
      {overflow.length > 0 && (
        <HudDreamsignOverflowPill dreamsigns={overflow} />
      )}
    </div>
  );
}

/** A single dreamsign artwork tile with a hover popover for the full card. */
function HudDreamsignIcon({ dreamsign }: { dreamsign: Dreamsign }) {
  const [imageBroken, setImageBroken] = useState(false);
  const accent = dreamsign.isBane
    ? { ring: "rgba(239, 68, 68, 0.85)", glow: "rgba(239, 68, 68, 0.45)" }
    : { ring: "rgba(168, 85, 247, 0.65)", glow: "rgba(168, 85, 247, 0.35)" };
  const showImage = Boolean(dreamsign.imageName) && !imageBroken;

  const tileStyle: CSSProperties = {
    height: ICON_SIZE_PX,
    width: ICON_SIZE_PX,
    background: "rgba(10, 6, 18, 0.65)",
    border: `1px solid ${accent.ring}`,
    boxShadow: `0 0 6px ${accent.glow}`,
    // Bane dreamsigns are desaturated so the red ring reads as a warning
    // and the bane art does not compete with the boons for attention.
    filter: dreamsign.isBane ? "grayscale(0.7)" : "none",
  };

  const imgAlt = dreamsign.imageAlt ?? dreamsign.name;

  return (
    <HoverPopover
      triggerAs="span"
      delayMs={250}
      maxWidthPx={null}
      content={({ side, anchorRect }) => (
        <DreamsignHoverCard
          dreamsign={dreamsign}
          testid="hud-dreamsign-popover"
          popoverSide={side}
          anchorRect={anchorRect}
        />
      )}
      className="inline-block"
    >
      <span
        data-testid="hud-dreamsign-icon"
        data-dreamsign-id={dreamsign.id ?? dreamsign.name}
        data-is-bane={String(dreamsign.isBane)}
        aria-label={
          dreamsign.isBane
            ? `Bane dreamsign: ${dreamsign.name}`
            : `Dreamsign: ${dreamsign.name}`
        }
        role="listitem"
        className="flex items-center justify-center overflow-hidden rounded-md"
        style={tileStyle}
      >
        {showImage ? (
          <img
            src={assetUrl(`/dreamsigns/${String(dreamsign.imageName)}`)}
            alt={imgAlt}
            className="h-full w-full object-cover"
            onError={() => {
              setImageBroken(true);
            }}
          />
        ) : (
          <span
            aria-hidden="true"
            className="text-[14px]"
            style={{ color: dreamsign.isBane ? "#fca5a5" : "#e9d5ff" }}
          >
            {dreamsign.isBane ? "☠" : "✨"}
          </span>
        )}
      </span>
    </HoverPopover>
  );
}

/** Trailing "+N" pill when the player owns more dreamsigns than fit inline. */
function HudDreamsignOverflowPill({
  dreamsigns,
}: {
  dreamsigns: readonly Dreamsign[];
}) {
  return (
    <HoverPopover
      triggerAs="span"
      delayMs={250}
      maxWidthPx={null}
      content={
        <div
          data-testid="hud-dreamsign-overflow-popover"
          className="flex max-h-80 flex-col gap-1 overflow-y-auto rounded-lg p-3 shadow-lg"
          style={{
            background: "rgba(15, 10, 24, 0.97)",
            border: "1px solid rgba(168, 85, 247, 0.55)",
            boxShadow: "0 8px 22px rgba(0, 0, 0, 0.55)",
            width: 260,
          }}
        >
          {dreamsigns.map((dreamsign, index) => (
            <div
              key={`${dreamsign.id ?? dreamsign.name}-${String(index)}`}
              className="rounded-md px-2 py-1.5"
              style={{
                background: dreamsign.isBane
                  ? "rgba(239, 68, 68, 0.08)"
                  : "rgba(124, 58, 237, 0.06)",
                border: `1px solid ${dreamsign.isBane ? "rgba(239, 68, 68, 0.25)" : "rgba(124, 58, 237, 0.18)"}`,
              }}
            >
              <span
                className="text-[11px] font-bold"
                style={{
                  color: dreamsign.isBane ? "#fca5a5" : "#f8fafc",
                }}
              >
                {dreamsign.name}
              </span>
              <div
                className="mt-0.5 text-[10px] leading-snug opacity-75"
                style={{ color: "#e2e8f0" }}
              >
                <RulesText text={dreamsign.effectDescription} />
              </div>
            </div>
          ))}
        </div>
      }
    >
      <span
        data-testid="hud-dreamsign-overflow"
        aria-label={`${String(dreamsigns.length)} more dreamsigns`}
        className="flex items-center justify-center rounded-md text-[11px] font-bold"
        style={{
          height: ICON_SIZE_PX,
          minWidth: ICON_SIZE_PX,
          padding: "0 6px",
          background: "rgba(124, 58, 237, 0.16)",
          border: "1px solid rgba(168, 85, 247, 0.55)",
          color: "#e9d5ff",
        }}
      >
        {`+${String(dreamsigns.length)}`}
      </span>
    </HoverPopover>
  );
}
