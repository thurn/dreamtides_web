import type { ReactElement } from "react";
import {
  controlChrome,
  glassAccentChrome,
} from "../../internal/control-treatment";
import { Pressable } from "../../primitives/Pressable";
import { token } from "../../primitives/tokens";
import "./main-menu-button.css";

/** Shared Cumulus glass treatments available while the menu design is tuned. */
export type MainMenuButtonVariant = "frost" | "accent" | "popover";

export interface MainMenuButtonProps {
  /** Player-facing action label. */
  label: string;
  /** Liquid-glass reveal treatment. Defaults to `accent`. */
  variant?: MainMenuButtonVariant;
  /** Reports activation to the route adapter. */
  onPress: () => void;
  /** A `data-testid` for selecting the action in tests. */
  testId?: string;
}

/**
 * A main-menu action that rests as outlined white text, then reveals the
 * shared Cumulus liquid-glass material from the right on hover or focus.
 */
export function MainMenuButton({
  label,
  variant = "accent",
  onPress,
  testId,
}: MainMenuButtonProps): ReactElement {
  const baseChrome = controlChrome("onMedia").trigger;
  const glassChrome =
    variant === "accent"
      ? { ...baseChrome, ...glassAccentChrome("onMedia") }
      : variant === "popover"
        ? {
            ...baseChrome,
            background: `${token("--glass-sheen")}, ${token("--glass-fill-popover")}`,
          }
        : baseChrome;

  return (
    <Pressable
      as="button"
      className="main-menu-button"
      data-main-menu-button-variant={variant}
      data-testid={testId}
      onClick={onPress}
    >
      <span
        aria-hidden="true"
        className="main-menu-button__glass"
        data-main-menu-button-glass={variant}
        style={glassChrome}
      />
      <span className="main-menu-button__label">{label}</span>
    </Pressable>
  );
}
