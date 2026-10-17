// D97MenuPanel — the overworld menu: a popup with Resume. Escape or the close
// disc closes it, returning focus to the control that opened it. PURE: it
// reports Close.

import type { ReactElement } from "react";
import { GlassButton } from "../../components/controls/GlassButton";
import { useEscapeToClose } from "../../primitives/use-escape-to-close";
import { D97Panel } from "./D97Panel";

export interface D97MenuPanelProps {
  readonly onClose: () => void;
}

export function D97MenuPanel({ onClose }: D97MenuPanelProps): ReactElement {
  useEscapeToClose(onClose);
  return (
    <D97Panel kind="menu" title={"Menu"} onClose={onClose}>
      <div data-d97-menu="" style={{ display: "flex", justifyContent: "center" }}>
        <GlassButton label={"Resume"} placement="onGlass" testId="d97-menu-resume" onPress={onClose} />
      </div>
    </D97Panel>
  );
}
