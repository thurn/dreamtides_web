// DEV-ONLY tweak panel — dial in the mobile info-card typography live, then
// bake the chosen value into MOBILE_TEXT_SCALE in InfoCard and DELETE this file
// (the tweaks-panel loop; see the tango skill's "Tuning taste values" section).
//
// Mobile InfoCards are always laid out at 45% of the viewport width. This panel
// controls only the internal text scale, applied proportionally to title, body,
// meta, and epithet text across every InfoCard variant.
//
// This file lives under src/tango/screens/devtools/, which is exempt from the
// raw-input / hardcoded-value / untokenized-length lint rules, so it may use
// native <input> controls and hand-styled markup. That is intentional: it is
// scaffolding, not product UI, and leaves no residue once removed.

import * as React from "react";
import {
  InfoCard,
  infoCardTextScale,
  infoCardWidth,
  MOBILE_TEXT_SCALE_DEFAULT,
  setInfoCardMobileTextScale,
  useInfoCardMobileTextScale,
} from "../../components/overlay/InfoCard";
import { richText } from "../../components/card/rich-text";

// The info card's native popover type sizes (from --t-popover-* tokens), used
// only to show the resulting on-screen text sizes as the scale is dialed in.
const NATIVE_TITLE_PX = 19;
const NATIVE_BODY_PX = 14;

const panelStyle: React.CSSProperties = {
  position: "fixed",
  top: 12,
  right: 12,
  zIndex: 2147483647,
  width: 300,
  padding: "12px 14px 14px",
  borderRadius: 12,
  background: "rgba(20,16,30,0.94)",
  border: "1px solid rgba(168,85,247,0.5)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.55)",
  color: "#efe9f7",
  font: "500 12px/1.4 ui-sans-serif, system-ui, sans-serif",
  backdropFilter: "blur(6px)",
  WebkitBackdropFilter: "blur(6px)",
};

const rowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  marginTop: 10,
};

const readoutStyle: React.CSSProperties = {
  marginTop: 10,
  padding: "8px 10px",
  borderRadius: 8,
  background: "rgba(0,0,0,0.3)",
  fontVariantNumeric: "tabular-nums",
  lineHeight: 1.6,
};

/**
 * The floating tweak panel. Mount at the app root behind `import.meta.env.DEV`.
 * Renders a slider for the mobile text multiplier, a reference-width slider so
 * the resulting sizes read out at a chosen phone width, a copy-paste JSON line,
 * and a live text-card preview that reflects the tweak on the real viewport.
 */
export function InfoCardScaleTweakPanel(): React.ReactElement {
  const mobileTextScale = useInfoCardMobileTextScale();
  const [refWidth, setRefWidth] = React.useState(390);
  const [collapsed, setCollapsed] = React.useState(false);

  const cardPx = Math.round(infoCardWidth(refWidth));
  const textScaleAtRef = infoCardTextScale(refWidth, mobileTextScale);
  const titlePx = (NATIVE_TITLE_PX * textScaleAtRef).toFixed(1);
  const bodyPx = (NATIVE_BODY_PX * textScaleAtRef).toFixed(1);
  const json = `{ "mobileTextScale": ${mobileTextScale.toFixed(3)} }`;

  return (
    <div style={panelStyle}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <strong style={{ fontSize: 12, letterSpacing: "0.02em" }}>
          Info-card mobile type
        </strong>
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          style={{
            background: "transparent",
            border: "1px solid rgba(255,255,255,0.25)",
            borderRadius: 6,
            color: "inherit",
            cursor: "pointer",
            padding: "2px 8px",
          }}
        >
          {collapsed ? "show" : "hide"}
        </button>
      </div>

      {!collapsed && (
        <>
          <div style={rowStyle}>
            <span style={{ width: 62, opacity: 0.8 }}>type</span>
            <input
              type="range"
              min={0.35}
              max={1}
              step={0.005}
              value={mobileTextScale}
              onChange={(e) =>
                setInfoCardMobileTextScale(Number.parseFloat(e.target.value))
              }
              style={{ flex: 1 }}
            />
            <span style={{ width: 40, textAlign: "right" }}>
              {mobileTextScale.toFixed(3)}
            </span>
          </div>

          <div style={rowStyle}>
            <span style={{ width: 62, opacity: 0.8 }}>phone px</span>
            <input
              type="range"
              min={320}
              max={540}
              step={2}
              value={refWidth}
              onChange={(e) => setRefWidth(Number.parseInt(e.target.value, 10))}
              style={{ flex: 1 }}
            />
            <span style={{ width: 40, textAlign: "right" }}>{refWidth}</span>
          </div>

          <div style={readoutStyle}>
            <div>
              At {refWidth}px screen — card <strong>{cardPx}px</strong>
            </div>
            <div>
              text multiplier <strong>{textScaleAtRef.toFixed(3)}</strong>
            </div>
            <div>
              title <strong>{titlePx}px</strong> · body{" "}
              <strong>{bodyPx}px</strong>
            </div>
            <div
              style={{
                marginTop: 6,
                fontFamily: "ui-monospace, monospace",
                fontSize: 11,
                userSelect: "all",
                color: "#c9a6ff",
              }}
            >
              {json}
            </div>
          </div>

          <div style={rowStyle}>
            <button
              type="button"
              onClick={() =>
                setInfoCardMobileTextScale(MOBILE_TEXT_SCALE_DEFAULT)
              }
              style={{
                background: "transparent",
                border: "1px solid rgba(255,255,255,0.25)",
                borderRadius: 6,
                color: "inherit",
                cursor: "pointer",
                padding: "3px 10px",
              }}
            >
              reset to {MOBILE_TEXT_SCALE_DEFAULT}
            </button>
            <span style={{ opacity: 0.6, fontSize: 11 }}>
              live preview below ↓
            </span>
          </div>

          {/* Live preview: a real InfoCard, which reflects the typography tweak
              on the actual viewport (drive a narrow viewport to see mobile).
              `.tango` re-establishes the token scope the card renders from. */}
          <div
            className="tango"
            style={{
              marginTop: 10,
              display: "flex",
              justifyContent: "center",
            }}
          >
            <InfoCard
              variant="text"
              meta="Preview"
              title="Sigrún, the Seer"
              body={richText.plain(
                "Sigrún offers several dreamsign choices, tailored to your deck.",
              )}
            />
          </div>
        </>
      )}
    </div>
  );
}
