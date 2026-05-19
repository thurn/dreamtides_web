import { useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  HUD_BUTTON_BASE_CLASS,
  HUD_DREAMSIGN_DEBUG_SLOT_ID,
} from "./hud-button-styles";
import { OfferingSecondaryButton } from "./OfferingScreen";

interface DreamsignSourceButtonProps {
  readonly onClick: () => void;
}

export function DreamsignSourceButton({
  onClick,
}: DreamsignSourceButtonProps) {
  const [hudSlot, setHudSlot] = useState<HTMLElement | null>(() =>
    typeof document === "undefined"
      ? null
      : document.getElementById(HUD_DREAMSIGN_DEBUG_SLOT_ID),
  );

  useLayoutEffect(() => {
    setHudSlot(document.getElementById(HUD_DREAMSIGN_DEBUG_SLOT_ID));
  });

  if (hudSlot !== null) {
    return createPortal(
      <button
        type="button"
        data-testid="hud-why-dreamsigns-button"
        className={`${HUD_BUTTON_BASE_CLASS} focus-visible:ring-purple-300`}
        style={{
          background: "rgba(168, 85, 247, 0.14)",
          border: "1px solid rgba(168, 85, 247, 0.35)",
          color: "#d8b4fe",
        }}
        onClick={onClick}
      >
        <span className="lg:hidden" aria-hidden="true">
          {"?"}
        </span>
        <span className="hidden lg:inline">Why Dreamsigns</span>
        <span className="sr-only lg:hidden">Why Dreamsigns</span>
      </button>,
      hudSlot,
    );
  }

  return (
    <OfferingSecondaryButton onClick={onClick}>
      Why Dreamsigns?
    </OfferingSecondaryButton>
  );
}
