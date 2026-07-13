import { Dreamsign as CumulusDreamsign } from "../cumulus/components/hud/Dreamsign";
import type { Dreamsign } from "../types/quest";
import { requireDreamsignId } from "../data/dreamsigns";

/**
 * Compact HUD row of dreamsign thumbnails — one square per owned dreamsign.
 *
 * Each thumbnail is the named Cumulus Dreamsign source, so the root reveal
 * coordinator supplies its complete reading copy.
 *
 * Bane dreamsigns get a red ring and a faint desaturation so they read at a
 * glance as a curse rather than a boon.
 *
 * The row collapses to render nothing when the player owns zero
 * dreamsigns, so the HUD does not reserve any width for an empty list.
 */

const ICON_SIZE_PX = 28;

interface HudDreamsignRowProps {
  dreamsigns: readonly Dreamsign[];
}

export function HudDreamsignRow({ dreamsigns }: HudDreamsignRowProps) {
  if (dreamsigns.length === 0) {
    return null;
  }

  return (
    <div
      data-testid="hud-dreamsign-row"
      className="flex shrink-0 items-center gap-1"
      role="list"
      aria-label="Dreamsigns"
    >
      {dreamsigns.map((dreamsign) => (
        <HudDreamsignIcon
          key={requireDreamsignId(dreamsign, "HUD dreamsign row")}
          dreamsign={dreamsign}
        />
      ))}
    </div>
  );
}

/** A single named Dreamsign source with coordinator-owned reading detail. */
function HudDreamsignIcon({ dreamsign }: { dreamsign: Dreamsign }) {
  return (
    <span className="inline-block" role="listitem">
      <CumulusDreamsign dreamsign={dreamsign} sizePx={ICON_SIZE_PX} testid="hud-dreamsign-icon" />
    </span>
  );
}
