import { assertLocalized } from "@trox/runtime";
// Registry demo entry for the framed DreamAvatarPortrait component.

import type { ReactNode } from "react";
import {
  DreamAvatarPortrait,
  type DreamAvatarVisual,
} from "../../components/hud/DreamAvatarPortrait";
import { token } from "../../primitives/tokens";
import type { CumulusComponent } from "../registry";

/** Curated real DreamAvatar with shipped cutout art. */
const sampleDreamAvatar: DreamAvatarVisual = {
  imageNumber: "0025",
  name: assertLocalized("Threxan"),
  title: assertLocalized("the Resounding Wrath"),
};

function Cell({
  label,
  width,
  children,
}: {
  label: string;
  width: number;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: token("--space-xs"),
      }}
    >
      <div style={{ width }}>{children}</div>
      <span
        style={{
          fontSize: 12,
          color: token("--text-secondary"),
          fontFamily: "monospace",
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </span>
    </div>
  );
}

function DreamAvatarPortraitDemo(args: Record<string, unknown>) {
  const dreamAvatar = args.dreamAvatar as DreamAvatarVisual;
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "flex-end",
        justifyContent: "center",
        gap: token("--space-2xl"),
      }}
    >
      <Cell label="panel · wrapper 160" width={160}>
        <DreamAvatarPortrait dreamAvatar={dreamAvatar} variant="panel" />
      </Cell>
      <Cell label="thumb · wrapper 56" width={56}>
        <DreamAvatarPortrait dreamAvatar={dreamAvatar} variant="thumb" />
      </Cell>
    </div>
  );
}

export const dreamAvatarPortraitDemo: CumulusComponent = {
  id: "dream-avatar-portrait",
  title: "DreamAvatar Portrait",
  blurb:
    "The shared framed DreamAvatar profile surface: a square `panel` crop for profile cards and popovers, or a close `thumb` crop for HUD rows and resident lists. Both render the transparent cutout over the canonical opaque portrait field and fall back to a monogram when art is unavailable.",
  callout: "The portrait always fills its caller-owned wrapper.",
  details: [
    "Put width, flex behavior, and placement on that wrapper; the component owns only its frame chrome and crop. Use DreamAvatar Stage for full-body scene art.",
  ],
  group: "Characters & Collectibles",
  docName: "DreamAvatarPortrait",
  Component: DreamAvatarPortraitDemo,
  usage: [
    {
      label: "Panel in a profile card",
      note: "The square framing for profile cards and popovers.",
      code: `import { DreamAvatarPortrait } from "src/cumulus/components/hud/DreamAvatarPortrait";

<div style={{ width: 160 }}>
  <DreamAvatarPortrait dreamAvatar={dreamAvatar} variant="panel" />
</div>`,
    },
    {
      label: "Thumb in a HUD row",
      note: "The close crop for compact rows and status objects.",
      code: `<div style={{ width: 56 }}>
  <DreamAvatarPortrait dreamAvatar={dreamAvatar} variant="thumb" />
</div>`,
    },
  ],
  demo: {
    defaultArgs: {
      variant: "panel",
    },
    sampleContent: {
      dreamAvatar: sampleDreamAvatar,
    },
  },
};
