import { IconButton } from "../cumulus/components/controls/IconButton";
import { GLYPHS } from "../cumulus/primitives/glyph";
import "./site-leave-control.css";

export interface SiteLeaveControlProps {
  label: string;
  onLeave: () => void;
  testId?: string;
  disabled?: boolean;
}

/** Shared top-right close control for legacy product-site screens. */
export function SiteLeaveControl({
  label,
  onLeave,
  testId,
  disabled = false,
}: SiteLeaveControlProps) {
  return (
    <div className="cumulus site-leave-control">
      <IconButton
        glyph={GLYPHS.close}
        label={label}
        onPress={onLeave}
        testId={testId}
        disabled={disabled}
      />
    </div>
  );
}
