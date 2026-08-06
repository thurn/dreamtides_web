// Registry demo entry for full-body DreamAvatarStage treatments.

import type { ReactNode } from "react";
import type { DreamAvatarVisual } from "../../components/hud/DreamAvatarPortrait";
import { DreamAvatarStage } from "../../components/hud/DreamAvatarStage";
import { token } from "../../primitives/tokens";
import type { CumulusComponent } from "../registry";

/** Curated real DreamAvatar with shipped cutout art. */
const sampleDreamAvatar: DreamAvatarVisual = {
  imageNumber: "0025",
  name: "Threxan",
  title: "the Resounding Wrath",
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

function DreamAvatarStageDemo(args: Record<string, unknown>) {
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
      <Cell label="standing">
        <Stage>
          <DreamAvatarStage dreamAvatar={dreamAvatar} variant="standing" />
        </Stage>
      </Cell>
      <Cell label="cutout">
        <Stage>
          <DreamAvatarStage dreamAvatar={dreamAvatar} variant="cutout" />
        </Stage>
      </Cell>
      <Cell label="fullBleed">
        <Stage>
          <DreamAvatarStage dreamAvatar={dreamAvatar} variant="fullBleed" />
        </Stage>
      </Cell>
    </div>
  );
}

export const dreamAvatarStageDemo: CumulusComponent = {
  id: "dream-avatar-stage",
  title: "DreamAvatar Stage",
  blurb:
    "The full-body DreamAvatar art layer for a caller-owned stage: `standing` adds a low ambient glow, `cutout` preserves the underlying scene, and `fullBleed` supplies a cinematic backdrop and head-focused composition.",
  callout:
    "Place this component inside a position-relative stage whose width, height, overflow, and placement belong to the caller. Use DreamAvatar Portrait for framed profile crops and semantic profile reveals.",
  group: "Components",
  docName: "DreamAvatarStage",
  Component: DreamAvatarStageDemo,
  usage: [
    {
      label: "Standing figure",
      note: "Full-body art over the ambient selection glow.",
      code: `import { DreamAvatarStage } from "src/cumulus/components/hud/DreamAvatarStage";

<div style={{ position: "relative", width: 320, height: 480 }}>
  <DreamAvatarStage dreamAvatar={dreamAvatar} variant="standing" />
</div>`,
    },
    {
      label: "Scene-preserving cutout",
      note: "Full-body art with no component-owned backdrop.",
      code: `<div style={{ position: "relative", width: 320, height: 480 }}>
  <DreamAvatarStage dreamAvatar={dreamAvatar} variant="cutout" />
</div>`,
    },
    {
      label: "Cinematic showcase",
      note: "Head-focused full-body art over the cinematic backdrop.",
      code: `<div style={{ position: "relative", width: 320, height: 480 }}>
  <DreamAvatarStage dreamAvatar={dreamAvatar} variant="fullBleed" />
</div>`,
    },
  ],
  demo: {
    defaultArgs: {
      variant: "standing",
    },
    sampleContent: {
      dreamAvatar: sampleDreamAvatar,
    },
  },
};
