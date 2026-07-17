import { useState, type CSSProperties, type ReactElement } from "react";
import type { MainMenuButtonVariant } from "../../components/controls/MainMenuButton";
import { token } from "../../primitives/tokens";

export type MainMenuComposition = "cinematic" | "framed" | "restrained" | "airy";
export type MainMenuCrop = "balanced" | "castle" | "wanderer" | "horizon";
export type MainMenuSocialStyle = "neutral" | "github-accent" | "both-accent";

export interface MainMenuTweaks {
  readonly composition: MainMenuComposition;
  readonly crop: MainMenuCrop;
  readonly hoverStyle: MainMenuButtonVariant;
  readonly socialStyle: MainMenuSocialStyle;
}

export const MAIN_MENU_TWEAK_SCHEMA = {
  composition: {
    label: "Composition",
    options: ["cinematic", "framed", "restrained", "airy"],
  },
  crop: {
    label: "Background crop",
    options: ["balanced", "castle", "wanderer", "horizon"],
  },
  hoverStyle: {
    label: "Hover glass",
    options: ["frost", "accent", "popover"],
  },
  socialStyle: {
    label: "Social glass",
    options: ["neutral", "github-accent", "both-accent"],
  },
} as const;

export const DEFAULT_MAIN_MENU_TWEAKS: MainMenuTweaks = {
  composition: "cinematic",
  crop: "castle",
  hoverStyle: "accent",
  socialStyle: "neutral",
};

const panelStyle: CSSProperties = {
  position: "fixed",
  zIndex: 10000,
  maxWidth: "calc(100vw - 32px)",
  border: "1px solid rgba(216, 180, 254, 0.45)",
  borderRadius: 14,
  background: "rgba(18, 14, 28, 0.94)",
  boxShadow: token("--shadow-lg"),
  color: "#fff8ec",
  font: "500 13px/1.4 Inter, system-ui, sans-serif",
};

const controlStyle: CSSProperties = {
  width: "100%",
  marginTop: 4,
  padding: "7px 9px",
  border: "1px solid rgba(216, 180, 254, 0.35)",
  borderRadius: 8,
  background: "#191423",
  color: "#fff8ec",
};

export interface MainMenuTweaksPanelProps {
  readonly values: MainMenuTweaks;
  readonly onChange: (values: MainMenuTweaks) => void;
}

/** Temporary development-only controls for converging on the main-menu look. */
export function MainMenuTweaksPanel({
  values,
  onChange,
}: MainMenuTweaksPanelProps): ReactElement {
  const [expanded, setExpanded] = useState(false);
  return (
    <aside
      id="main-menu-tweaks-panel"
      style={{
        ...panelStyle,
        ...(expanded
          ? { top: 16, right: 16, width: 300 }
          : {
              top: "50%",
              right: 0,
              width: "auto",
              transform: "translateY(-50%)",
            }),
      }}
    >
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls="main-menu-tweaks-controls"
        data-testid="main-menu-tweaks-toggle"
        onClick={() => setExpanded((current) => !current)}
        style={{
          width: expanded ? "100%" : "auto",
          padding: "10px 12px",
          border: 0,
          background: "transparent",
          color: "inherit",
          font: "700 13px/1 Inter, system-ui, sans-serif",
          textAlign: "left",
          writingMode: expanded ? "horizontal-tb" : "vertical-rl",
        }}
      >
        {expanded ? "Hide Tweaks" : "Tweaks"}
      </button>
      {expanded ? (
        <div
          id="main-menu-tweaks-controls"
          style={{ display: "grid", gap: 12, padding: "4px 12px 12px" }}
        >
          <label>
            {MAIN_MENU_TWEAK_SCHEMA.composition.label}
            <select
              data-testid="main-menu-tweak-composition"
              value={values.composition}
              onChange={(event) =>
                onChange({
                  ...values,
                  composition: event.target.value as MainMenuComposition,
                })
              }
              style={controlStyle}
            >
              {MAIN_MENU_TWEAK_SCHEMA.composition.options.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>
          <label>
            {MAIN_MENU_TWEAK_SCHEMA.crop.label}
            <select
              data-testid="main-menu-tweak-crop"
              value={values.crop}
              onChange={(event) =>
                onChange({ ...values, crop: event.target.value as MainMenuCrop })
              }
              style={controlStyle}
            >
              {MAIN_MENU_TWEAK_SCHEMA.crop.options.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>
          <label>
            {MAIN_MENU_TWEAK_SCHEMA.hoverStyle.label}
            <select
              data-testid="main-menu-tweak-hover-style"
              value={values.hoverStyle}
              onChange={(event) =>
                onChange({
                  ...values,
                  hoverStyle: event.target.value as MainMenuButtonVariant,
                })
              }
              style={controlStyle}
            >
              {MAIN_MENU_TWEAK_SCHEMA.hoverStyle.options.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>
          <label>
            {MAIN_MENU_TWEAK_SCHEMA.socialStyle.label}
            <select
              data-testid="main-menu-tweak-social-style"
              value={values.socialStyle}
              onChange={(event) =>
                onChange({
                  ...values,
                  socialStyle: event.target.value as MainMenuSocialStyle,
                })
              }
              style={controlStyle}
            >
              {MAIN_MENU_TWEAK_SCHEMA.socialStyle.options.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => onChange(DEFAULT_MAIN_MENU_TWEAKS)}
            style={{ ...controlStyle, marginTop: 0 }}
          >
            Reset
          </button>
          <pre
            data-testid="main-menu-tweaks-json"
            style={{
              margin: 0,
              padding: 10,
              overflow: "auto",
              borderRadius: 8,
              background: "#0a0612",
              color: "#d8ccba",
              font: "500 11px/1.45 'JetBrains Mono', monospace",
              userSelect: "text",
            }}
          >
            {JSON.stringify(values, null, 2)}
          </pre>
        </div>
      ) : null}
    </aside>
  );
}
