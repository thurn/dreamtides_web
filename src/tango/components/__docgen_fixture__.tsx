// Docgen fixture exercised ONLY by scripts/generate-tango-metadata.test.mjs.
//
// This component is intentionally NOT a real Tango primitive. Its props cover
// every downstream control class (boolean toggle, string-literal union select,
// number input, text input, ReactNode slot) plus a required/optional pair and
// an inherited DOM prop, so the metadata generator's normalization can be
// asserted structurally. The generator's real-file glob skips `__*__` files, so
// this fixture never leaks into the committed tango-metadata.json.
//
// The `__docgen_fixture__` double-underscore prefix marks it as a fixture.

import type { HTMLAttributes, ReactNode } from "react";

/**
 * Props for the docgen fixture. Extends a node_modules DOM type so the test can
 * confirm the generator's propFilter excludes inherited DOM props.
 */
export interface DocgenFixtureProps
  extends HTMLAttributes<HTMLDivElement> {
  /** Whether the fixture renders in its active state. */
  active: boolean;
  /** The size of the fixture. */
  size?: "sm" | "md" | "lg";
  /** How many times to repeat the label. */
  count?: number;
  /** The text label shown by the fixture. */
  label: string;
  /** Arbitrary content rendered after the label. */
  children?: ReactNode;
}

/**
 * A throwaway component used purely to validate metadata extraction.
 */
export function DocgenFixture({
  active,
  size = "md",
  count = 1,
  label,
  children,
  ...rest
}: DocgenFixtureProps) {
  return (
    <div data-active={active} data-size={size} {...rest}>
      {Array.from({ length: count }, (_, i) => (
        <span key={i}>{label}</span>
      ))}
      {children}
    </div>
  );
}

export default DocgenFixture;
