import { assertLocalized } from "@trox/runtime";
// Registry demo entry for full-body AvatarStage treatments.

import type { ReactNode } from "react";
import type { AvatarVisual } from "../../components/hud/AvatarPortrait";
import { AvatarStage } from "../../components/hud/AvatarStage";
import { token } from "../../primitives/tokens";
import type { CumulusComponent } from "../registry";

/** Curated real Avatar with shipped cutout art. */
const sampleAvatar: AvatarVisual = {
  imageNumber: "0025",
  name: assertLocalized("Threxan"),
  title: assertLocalized("the Resounding Wrath"),
};

function Cell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: token("--space-xs"),
      }}
    >
      {children}
      <span
        style={{
          fontSize: 12,
          color: token("--text-secondary"),
          fontFamily: "monospace",
        }}
      >
        {label}
      </span>
    </div>
  );
}

function Stage({ children }: { children: ReactNode }) {
  return (
    <div
      className="cumulus"
      style={{
        position: "relative",
        width: 150,
        height: 230,
        overflow: "hidden",
        borderRadius: token("--radius-panel"),
        border: `1px solid ${token("--border-mid")}`,
        background: token("--bg-sunken"),
      }}
    >
      {children}
    </div>
  );
}

function AvatarStageDemo(args: Record<string, unknown>) {
  const avatar = args.avatar as AvatarVisual;
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
      <Cell label="standing">
        <Stage>
          <AvatarStage avatar={avatar} variant="standing" />
        </Stage>
      </Cell>
      <Cell label="cutout">
        <Stage>
          <AvatarStage avatar={avatar} variant="cutout" />
        </Stage>
      </Cell>
      <Cell label="fullBleed">
        <Stage>
          <AvatarStage avatar={avatar} variant="fullBleed" />
        </Stage>
      </Cell>
    </div>
  );
}

export const avatarStageDemo: CumulusComponent = {
  id: "avatar-stage",
  title: "Avatar Stage",
  blurb:
    "The full-body Avatar art layer for a caller-owned stage: `standing` adds a low ambient glow, `cutout` preserves the underlying scene, and `fullBleed` supplies a cinematic backdrop and head-focused composition.",
  callout:
    "Place this component inside a position-relative stage whose width, height, overflow, and placement belong to the caller.",
  details: [
    "Use Avatar Portrait for framed profile crops and semantic profile reveals.",
  ],
  group: "Characters & Collectibles",
  docName: "AvatarStage",
  Component: AvatarStageDemo,
  usage: [
    {
      label: "Standing figure",
      note: "Full-body art over the ambient selection glow.",
      code: `import { AvatarStage } from "src/cumulus/components/hud/AvatarStage";

<div style={{ position: "relative", width: 320, height: 480 }}>
  <AvatarStage avatar={avatar} variant="standing" />
</div>`,
    },
    {
      label: "Scene-preserving cutout",
      note: "Full-body art with no component-owned backdrop.",
      code: `<div style={{ position: "relative", width: 320, height: 480 }}>
  <AvatarStage avatar={avatar} variant="cutout" />
</div>`,
    },
    {
      label: "Cinematic showcase",
      note: "Head-focused full-body art over the cinematic backdrop.",
      code: `<div style={{ position: "relative", width: 320, height: 480 }}>
  <AvatarStage avatar={avatar} variant="fullBleed" />
</div>`,
    },
  ],
  demo: {
    defaultArgs: {
      variant: "standing",
    },
    sampleContent: {
      avatar: sampleAvatar,
    },
  },
};
