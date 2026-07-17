import type { ReactElement } from "react";
import { Pressable } from "../../primitives/Pressable";
import "./main-menu-button.css";

/** Four right-origin hover motions available while the menu design is tuned. */
export type MainMenuButtonVariant = "mist" | "bloom" | "veil" | "ripple";

export interface MainMenuButtonProps {
  /** Player-facing action label. */
  label: string;
  /** Right-origin ethereal fill treatment. Defaults to `mist`. */
  variant?: MainMenuButtonVariant;
  /** Reports activation to the route adapter. */
  onPress: () => void;
  /** A `data-testid` for selecting the action in tests. */
  testId?: string;
}

/**
 * A main-menu action that rests as outlined white text, then reveals a deep
 * purple AAA-contrast field and right-edge glow on hover or keyboard focus.
 */
export function MainMenuButton({
  label,
  variant = "mist",
  onPress,
  testId,
}: MainMenuButtonProps): ReactElement {
  return (
    <Pressable
      as="button"
      className="main-menu-button"
      data-main-menu-button-variant={variant}
      data-testid={testId}
      onClick={onPress}
    >
      <span className="main-menu-button__label">{label}</span>
    </Pressable>
  );
}
