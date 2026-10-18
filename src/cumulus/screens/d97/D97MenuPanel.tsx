// D97MenuPanel — the overworld menu: a popup with Resume and Credits. Escape
// or the close disc closes it, returning focus to the control that opened it.
// PURE: it reports Close and Credits.

import type { ReactElement } from "react";
import { GlassButton } from "../../components/controls/GlassButton";
import { token } from "../../primitives/tokens";
import { useEscapeToClose } from "../../primitives/use-escape-to-close";
import { D97Panel } from "./D97Panel";

export interface D97MenuPanelProps {
  readonly onClose: () => void;
  /** Opens the art credits. */
  readonly onCredits: () => void;
}

export function D97MenuPanel({ onClose, onCredits }: D97MenuPanelProps): ReactElement {
  useEscapeToClose(onClose);
  return (
    <D97Panel kind="menu" title={"Menu"} onClose={onClose}>
      <div data-d97-menu="" style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: token("--space-m") }}>
        <GlassButton label={"Resume"} placement="onGlass" testId="d97-menu-resume" onPress={onClose} />
        <GlassButton label={"Credits"} placement="onGlass" testId="d97-menu-credits" onPress={onCredits} />
      </div>
    </D97Panel>
  );
}
