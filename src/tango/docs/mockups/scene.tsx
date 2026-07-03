// Shared chrome for the full-screen component mockups. Every mockup fills the
// viewport (the MockupView wrapper in TangoApp gives it a 100vw×100vh stage) and
// drops a small caption chip in a corner naming the scene, so the page reads as
// a deliberate showcase rather than a bare screenshot. Kept token-styled so the
// mockups dogfood the design system they document.

import type { CSSProperties, ReactNode } from "react";
import { token } from "../../primitives/tokens";

/** Root style for a mockup: fills the MockupView stage, clips its own bleed. */
export const sceneRoot: CSSProperties = {
  position: "relative",
  width: "100%",
  height: "100%",
  overflow: "hidden",
  boxSizing: "border-box",
  fontFamily: token("--font-ui"),
  color: token("--text-primary"),
};

interface SceneCaptionProps {
  /** Small uppercase overline, e.g. the component name. */
  eyebrow: string;
  /** One-line description of what the scene demonstrates. */
  title: ReactNode;
  /** Corner to pin the caption to. Defaults to bottom-left. */
  corner?: "top-left" | "bottom-left" | "top-right";
}

/**
 * A compact caption chip pinned to a corner of the scene, naming the mockup and
 * describing what it demonstrates. Sits above the scene content but below the
 * floating back affordance MockupView renders.
 */
export function SceneCaption({
  eyebrow,
  title,
  corner = "bottom-left",
}: SceneCaptionProps) {
  const anchor: CSSProperties =
    corner === "top-left"
      ? { top: token("--space-6"), left: token("--space-6") }
      : corner === "top-right"
        ? { top: token("--space-6"), right: token("--space-6") }
        : { bottom: token("--space-6"), left: token("--space-6") };
  return (
    <div
      style={{
        position: "absolute",
        zIndex: 40,
        maxWidth: "min(340px, 78vw)",
        padding: `${token("--space-3")} ${token("--space-5")}`,
        background: "rgba(12, 8, 22, 0.62)",
        border: `1px solid ${token("--border-soft")}`,
        borderRadius: token("--radius-control"),
        backdropFilter: "blur(6px)",
        pointerEvents: "none",
        ...anchor,
      }}
    >
      <p
        style={{
          font: token("--t-eyebrow"),
          letterSpacing: token("--tracking-eyebrow"),
          textTransform: "uppercase",
          color: token("--accent-bright"),
          margin: 0,
        }}
      >
        {eyebrow}
      </p>
      <p
        style={{
          font: token("--t-caption"),
          color: token("--text-secondary"),
          margin: `${token("--space-2")} 0 0`,
        }}
      >
        {title}
      </p>
    </div>
  );
}
