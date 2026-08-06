import type { ReactElement } from "react";
import { controlChrome } from "../../internal/control-treatment";
import { Pressable } from "../../primitives/Pressable";
import "./main-menu-button.css";

export interface MainMenuButtonProps {
  /** Player-facing action label. */
  label: string;
  /** Reports activation to the route adapter. */
  onPress: () => void;
  /** A `data-testid` for selecting the action in tests. */
  testId?: string;
}

/**
 * A main-menu action that rests as outlined white text, then shows the shared
 * Cumulus liquid-glass material on hover or focus.
 */
export function MainMenuButton({
  label,
  onPress,
  testId,
}: MainMenuButtonProps): ReactElement {
  const glassChrome = controlChrome("onMedia").trigger;

  return (
    <Pressable
      as="button"
      className="main-menu-button"
      data-testid={testId}
      onClick={onPress}
    >
      <span
        aria-hidden="true"
        className="main-menu-button__glass"
        data-main-menu-button-glass
        style={glassChrome}
      />
      <span className="main-menu-button__label">{label}</span>
    </Pressable>
  );
}
