// ResourceChip — the sized, self-contained inline "value + mark" pairing for
// the game's economy (energy, spark, essence, points, counters): a blue droplet
// for energy, a gold
// sparkle for spark, a violet crypto-mark for essence/points, an hourglass
// for generic counters. The kind→glyph/color table lives in the shared
// `economy-spec` module (imported below). Flowing essence amounts use
// `EssenceValue`, while standalone essence marks use `EssenceGlyph`.
//
// The value and its mark are paired TIGHT (see the parent design system's
// rules): the default `spacing` is "tight" (a 0px gap) so a value reads as one
// unit — `200◆`, the mark hugging the number — matching the game's HUD. Pass
// `spacing="loose"` to add a little air where a layout needs it.
//
// Size and spacing are enumerated variants, not raw pixel props: `size` picks
// one of three inline scales (sm/md/lg) and `spacing` one of two gaps. A bare
// essence amount inside flowing text belongs in `EssenceValue` instead (it
// inherits the surrounding type); `ResourceChip` is for a sized, self-contained
// economy value — optionally on its own chip surface.
//
// Colors are token-driven (the `--energy` / `--spark` / `--essence` /
// `--points` / `--accent-bright` resource-role tokens via `economy-spec`),
// never a raw hex, so a future token rename/reband propagates automatically.
//
// Ported from the Claude Design "Dreamtides Mobile" project
// (components/buttons/ResourceChip.jsx / .d.ts). Requires Boxicons v3's
// filled stylesheet on the page (loaded globally for /cumulus by main.tsx).

import { ECONOMY_MARKS, type EconomyKind } from "./economy-spec";
import { token } from "../../primitives/tokens";
import { useRevealSource } from "../../internal/reveal/context";
import { revealEntityId } from "../../internal/reveal/identity";
import { Pressable } from "../../primitives/Pressable";
import { glossaryInfoCard } from "../card/glossary-info-card";
import type { ReactElement } from "react";

export interface ResourceEntity {
  /** Stable domain identity of this resource source. */
  id: string;
  /** Stable TOML glossary entry used for the explanatory Info Card. */
  glossaryId: string;
}

/** Inline scale of a ResourceChip. `md` (16px) is the default HUD size. */
export type ResourceChipSize = "sm" | "md" | "lg";
/** Gap between the value and its mark. `tight` (0px) glues them into one unit. */
export type ResourceChipSpacing = "tight" | "loose";
/** Color treatment. `resource` uses the economy role; `inherit` follows its surface. */
export type ResourceChipTone = "resource" | "inherit";

/** Font pixel size per enumerated scale; everything else scales from it. */
const SIZE_PX: Record<ResourceChipSize, number> = {
  sm: 13,
  md: 16,
  lg: 20,
};

/** Gap pixels per enumerated spacing. `tight` is the tight `200◆` pairing. */
const SPACING_PX: Record<ResourceChipSpacing, number> = {
  tight: 0,
  loose: 4,
};

export interface ResourceChipProps {
  /** Which economy value: essence, energy, spark, points, counter. Rendered as
   *  the parent's filled-Boxicon mark (bx-crypto / bx-fire-alt / bx-sparkles /
   *  bx-star-circle / bx-hourglass), colored by role. */
  kind?: EconomyKind;
  /** The numeric value to show. Omit to render the mark alone. */
  value?: number | string;
  /** Inline scale — sm (13px) / md (16px, default) / lg (20px). */
  size?: ResourceChipSize;
  /** Render as a solid pill badge (for HUD/over-art) instead of inline text. */
  chip?: boolean;
  /** Gap between value and mark — tight (0px, default) or loose (4px). */
  spacing?: ResourceChipSpacing;
  /** Color treatment — the resource role (default) or the parent surface. */
  tone?: ResourceChipTone;
  /** Semantic resource represented by this chip; makes the named chip self-revealing. */
  entity?: ResourceEntity;
}

/**
 * Displays a single game-economy resource value with its colored filled-Boxicon
 * mark. Use it for HUD-like readouts that need their own enumerated size,
 * spacing, and surface treatment; flowing essence copy uses `EssenceValue`.
 */
export function ResourceChip({
  kind = "essence",
  value,
  size = "md",
  chip = false,
  spacing = "tight",
  tone = "resource",
  entity,
}: ResourceChipProps) {
  const visual = <ResourceChipVisual kind={kind} value={value} size={size} chip={chip} spacing={spacing} tone={tone} />;
  return entity === undefined ? visual : <ResourceChipReveal kind={kind} entity={entity}>{visual}</ResourceChipReveal>;
}

function ResourceChipVisual({ kind, value, size, chip, spacing, tone }: Required<Pick<ResourceChipProps, "kind" | "size" | "chip" | "spacing" | "tone">> & Pick<ResourceChipProps, "value">) {
  const mark = ECONOMY_MARKS[kind] ?? ECONOMY_MARKS.essence;
  const fontSize = SIZE_PX[size];
  const glyph = (
    <i
      className={mark.glyph}
      aria-hidden="true"
      style={{ color: tone === "inherit" ? "inherit" : mark.color, fontSize: "1.04em", lineHeight: 1 }}
    />
  );
  return (
    <span
      data-resource-chip=""
      data-resource-chip-kind={kind}
      data-resource-chip-size={size}
      data-resource-chip-tone={tone}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: SPACING_PX[spacing],
        fontFamily: "var(--font-ui)",
        fontSize,
        fontWeight: 800,
        lineHeight: 1,
        color: tone === "inherit" ? "inherit" : token("--text-primary"),
        fontVariantNumeric: "tabular-nums",
        ...(chip
          ? {
              paddingTop: fontSize * 0.34,
              paddingRight: fontSize * 0.6,
              paddingBottom: fontSize * 0.34,
              paddingLeft: fontSize * 0.6,
              background: token("--surface-chrome"),
              border: `1px solid ${token("--border-soft")}`,
              borderRadius: token("--radius-pill"),
            }
          : {}),
      }}
    >
      {value != null && <span>{value}</span>}
      {glyph}
    </span>
  );
}

function ResourceChipReveal({ kind, entity, children }: { kind: EconomyKind; entity: ResourceEntity; children: ReactElement }) {
  const mark = ECONOMY_MARKS[kind];
  const binding = useRevealSource({
    identity: { entityType: `resource-${kind}`, entityId: revealEntityId(`resource-${kind}`, entity.id) },
    spec: { primary: { kind: "infoCard", card: glossaryInfoCard(entity.glossaryId, { variant: "icon", glyph: mark.glyph }) }, secondaries: [] },
  });
  return <Pressable as="span" ref={binding.ref} {...binding.sourceProps} tabIndex={0} data-resource-source={entity.id} style={{ ...binding.sourceProps.style, display: "inline-flex" }}>{children}</Pressable>;
}
