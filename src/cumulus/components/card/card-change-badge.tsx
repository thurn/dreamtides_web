import type { CSSProperties, ReactElement } from "react";
import type { LocalizedString } from "@trox/runtime";
import { GLYPHS } from "../../primitives/glyph";
import { useLocalizer } from "../../../runtime/localization/use-localizer";

interface CardChangeBadgeOptions {
  /** CSS length for the badge diameter, resolved by the owning card surface. */
  readonly sizeVar: string;
  /** Accessible description when the badge conveys meaning on its own. */
  readonly ariaLabel?: LocalizedString;
}

/**
 * Renders the monochrome hammer-in-circle marker shared by changed card stats
 * and rules text. This keeps the original Font Awesome metric box used by the
 * stat badges; the flowing-text InlineGlyph alignment is intentionally absent.
 */
export function renderCardChangeBadge({
  sizeVar,
  ariaLabel,
}: CardChangeBadgeOptions): ReactElement {
  const resolve = useLocalizer();
  return (
    <span
      aria-hidden={ariaLabel === undefined ? "true" : undefined}
      aria-label={ariaLabel === undefined ? undefined : resolve(ariaLabel)}
      role={ariaLabel === undefined ? undefined : "img"}
      style={
        {
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: sizeVar,
          height: sizeVar,
          borderRadius: "50%",
          background: "#000000",
          border: `calc(${sizeVar} * ${String(1 / 30)}) solid #ffffff`,
          color: "#ffffff",
          boxSizing: "border-box",
          fontSize: `calc(${sizeVar} * 0.62)`,
          lineHeight: 1,
        } satisfies CSSProperties
      }
    >
      <i className={GLYPHS.transfigurationSite} aria-hidden="true" />
    </span>
  );
}
