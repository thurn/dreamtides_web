// DeviceFrameDemo — a browser-QA page that proves the device-frame safe-area
// injection end to end. Mount it with `?demo=device-frame`, and capture it
// through the device-screenshot tool (which adds the `deviceFrame` param):
//
//   node scripts/device-screenshots.mjs -d iphone-16 --query 'demo=device-frame'
//
// It demonstrates the two capabilities the injection unlocks:
//   1. Safe-area layout — a title band padded by `var(--safe-area-inset-top)`,
//      so the "Your Deck" title clears the Dynamic Island instead of hiding
//      under it (the bug this feature fixes).
//   2. Unsafe-region placement — a control deliberately parked to the *right*
//      of the Dynamic Island, positioned from the `--display-cutout-*` box.
//
// Dashed guides trace the safe-area top band and the cutout's bounding box so a
// QA screenshot shows, at a glance, that the injected metrics line up with the
// painted island. On a device with no cutout (e.g. iPhone SE) the island guide
// and the island-relative control are omitted.

import { useEffect, useState } from "react";
import { parseDeviceFrame } from "../../../runtime/device-frame";

const GUIDE = "rgba(103, 232, 249, 0.9)";

/** Read a published custom property's resolved value off the document root. */
function readVar(name: string): string {
  if (typeof window === "undefined") return "";
  return getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
}

export function DeviceFrameDemo() {
  // The same descriptor main.tsx already published to CSS vars; re-parsed here
  // only to decide whether a cutout-relative control is meaningful.
  const frame =
    typeof window === "undefined"
      ? null
      : parseDeviceFrame(window.location.search);
  const hasCutout = Boolean(frame?.cutout);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background:
          "radial-gradient(120% 90% at 50% 0%, #241640 0%, #0a0612 70%)",
        color: "#e2e8f0",
        fontFamily:
          'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
        overflow: "hidden",
      }}
    >
      {/* Safe-area top band guide: fills exactly the reserved top inset. */}
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          height: "var(--safe-area-inset-top, 0px)",
          background: "rgba(103, 232, 249, 0.10)",
          borderBottom: `1px dashed ${GUIDE}`,
          pointerEvents: "none",
        }}
      />

      {/* Cutout bounding-box guide: should trace the painted Dynamic Island. */}
      {hasCutout && (
        <div
          style={{
            position: "fixed",
            top: "var(--display-cutout-top, 0px)",
            left: "var(--display-cutout-left, 0px)",
            width: "var(--display-cutout-width, 0px)",
            height: "var(--display-cutout-height, 0px)",
            border: `1px dashed ${GUIDE}`,
            borderRadius: 999,
            pointerEvents: "none",
          }}
        />
      )}

      {/* Capability 2: a control parked to the RIGHT of the Dynamic Island,
          vertically centered on it, positioned from the cutout box. The island
          is horizontally centered, so its right edge sits at 50% + width/2. */}
      {hasCutout && (
        <button
          type="button"
          aria-label="Notifications"
          style={{
            position: "fixed",
            top: "var(--display-cutout-top, 0px)",
            height: "var(--display-cutout-height, 0px)",
            left: "calc(50% + var(--display-cutout-width, 0px) / 2 + 10px)",
            display: "grid",
            placeItems: "center",
            padding: "0 14px",
            borderRadius: 999,
            border: "1px solid rgba(103, 232, 249, 0.55)",
            background: "rgba(103, 232, 249, 0.16)",
            color: "#a5f3fc",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          Right of island
        </button>
      )}

      {/* Capability 1: a title band whose top padding clears the safe area, so
          the title never hides under the cutout. */}
      <header
        style={{
          paddingTop: "max(var(--safe-area-inset-top, 0px), 12px)",
          paddingLeft: 18,
          paddingRight: 18,
          paddingBottom: 12,
          borderBottom: "1px solid rgba(124, 58, 237, 0.35)",
        }}
      >
        <div
          style={{
            display: "grid",
            placeItems: "center",
            minHeight: 48,
            fontSize: 20,
            fontWeight: 700,
          }}
        >
          Your Deck
        </div>
      </header>

      <main style={{ padding: "20px 18px", maxWidth: 520 }}>
        <h1 style={{ fontSize: 18, margin: "0 0 8px" }}>Device-frame safe area</h1>
        <p style={{ fontSize: 14, lineHeight: 1.5, color: "#cbd5f5", margin: 0 }}>
          The title above is padded by <code>var(--safe-area-inset-top)</code>,
          so it clears the Dynamic Island in a mock-up exactly as it does on
          hardware. The cyan guides trace the injected safe-area band and the
          cutout box.
        </p>
        <dl style={{ fontSize: 13, lineHeight: 1.7, marginTop: 16 }}>
          <FrameRow label="safe-area top" cssVar="--safe-area-inset-top" />
          <FrameRow label="safe-area bottom" cssVar="--safe-area-inset-bottom" />
          {hasCutout ? (
            <>
              <FrameRow label="cutout top" cssVar="--display-cutout-top" />
              <FrameRow label="cutout width" cssVar="--display-cutout-width" />
              <FrameRow label="cutout height" cssVar="--display-cutout-height" />
            </>
          ) : (
            <div style={{ color: "#94a3b8" }}>No screen cutout on this target.</div>
          )}
        </dl>
      </main>
    </div>
  );
}

/** One published custom property, printed with its resolved px value so a QA
 *  screenshot records exactly what the injection set. */
function FrameRow({ label, cssVar }: { label: string; cssVar: string }) {
  const [value, setValue] = useState("");
  // Read after paint so main.tsx's injection has landed on the document root.
  useEffect(() => {
    setValue(readVar(cssVar) || "(unset)");
  }, [cssVar]);
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <dt style={{ width: 130, color: "#94a3b8" }}>{label}</dt>
      <dd
        style={{ margin: 0, fontFamily: "JetBrains Mono, ui-monospace, monospace" }}
      >
        {value}
      </dd>
    </div>
  );
}
