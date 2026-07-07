// DEV-ONLY tweak panel — dial in the mobile info-card scale live, then bake the
// chosen value into MOBILE_WIDTH_FRACTION in InfoCard and DELETE this file (the
// tweaks-panel loop; see the tango skill's "Tuning taste values" section).
//
// The mobile scale is a single CSS `zoom` on the whole card, so moving the one
// slider shrinks the title, body, meta, and the containing card TOGETHER and
// proportionally — the card gets smaller as the text gets smaller.
//
// This file lives under src/tango/screens/devtools/, which is exempt from the
// raw-input / hardcoded-value / untokenized-length lint rules, so it may use
// native <input> controls and hand-styled markup. That is intentional: it is
// scaffolding, not product UI, and leaves no residue once removed.

import * as React from "react";
import {
  InfoCard,
  INFO_CARD_WIDTH,
  infoCardScale,
  setInfoCardMobileFraction,
  useInfoCardMobileFraction,
  MOBILE_WIDTH_FRACTION_DEFAULT,
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
 * Renders a slider for the mobile width fraction, a reference-width slider so
 * the resulting sizes read out at a chosen phone width, a copy-paste JSON line,
 * and a live text-card preview that reflects the tweak on the real viewport.
 */
export function InfoCardScaleTweakPanel(): React.ReactElement {
  const fraction = useInfoCardMobileFraction();
  const [refWidth, setRefWidth] = React.useState(390);
  const [collapsed, setCollapsed] = React.useState(false);

  const scaleAtRef = infoCardScale(refWidth, fraction);
  const cardPx = Math.round(INFO_CARD_WIDTH * scaleAtRef);
  const titlePx = (NATIVE_TITLE_PX * scaleAtRef).toFixed(1);
  const bodyPx = (NATIVE_BODY_PX * scaleAtRef).toFixed(1);
  const json = `{ "mobileWidthFraction": ${fraction.toFixed(3)} }`;

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
          Info-card mobile scale
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
            <span style={{ width: 62, opacity: 0.8 }}>fraction</span>
            <input
              type="range"
              min={0.2}
              max={0.55}
              step={0.005}
              value={fraction}
              onChange={(e) =>
                setInfoCardMobileFraction(Number.parseFloat(e.target.value))
              }
              style={{ flex: 1 }}
            />
            <span style={{ width: 40, textAlign: "right" }}>
              {fraction.toFixed(3)}
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
              At {refWidth}px screen — zoom{" "}
              <strong>{scaleAtRef.toFixed(3)}</strong>
            </div>
            <div>
              card <strong>{cardPx}px</strong> · title{" "}
              <strong>{titlePx}px</strong> · body <strong>{bodyPx}px</strong>
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
                setInfoCardMobileFraction(MOBILE_WIDTH_FRACTION_DEFAULT)
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
              reset to {MOBILE_WIDTH_FRACTION_DEFAULT}
            </button>
            <span style={{ opacity: 0.6, fontSize: 11 }}>
              live preview below ↓
            </span>
          </div>

          {/* Live preview: a real InfoCard, which reflects the tweak on the
              actual viewport (drive a narrow viewport to see the mobile scale).
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
