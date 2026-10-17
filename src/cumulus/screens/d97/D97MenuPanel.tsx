// D97MenuPanel — the overworld menu: a popup with Resume. Escape or the close
// disc closes it, returning focus to the control that opened it. PURE: it
// reports Close.

import type { ReactElement } from "react";
import { GlassButton } from "../../components/controls/GlassButton";
import { GlassDialog } from "../../components/overlay/GlassDialog";
import { useEscapeToClose } from "../../primitives/use-escape-to-close";

export interface D97MenuPanelProps {
  readonly onClose: () => void;
}

export function D97MenuPanel({ onClose }: D97MenuPanelProps): ReactElement {
  useEscapeToClose(onClose);
  return (
    <GlassDialog title={"Menu"} presentation="popup" onClose={onClose}>
      <div data-d97-menu="">
        <GlassButton label={"Resume"} testId="d97-menu-resume" onPress={onClose} />
      </div>
    </GlassDialog>
  );
}
