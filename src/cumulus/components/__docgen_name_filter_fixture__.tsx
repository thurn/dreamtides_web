// Docgen fixture exercised ONLY by generate-cumulus-metadata.test.mjs's
// component-name-filter test.
//
// Mirrors the real-world shape that motivated the filter: Pressable.tsx
// co-locates a PascalCase component with a camelCase hook (`usePress`) and an
// ALL-CAPS constant (`PRESS_SCALE`) in the same file, and react-docgen-typescript
// happily emits doc entries for all three. `extractPropMeta` must document only
// the component (`isComponentName` in generate-cumulus-metadata.mjs).
//
// The `__docgen_*_fixture__` double-underscore prefix marks it as a fixture;
// the real generator's `collectComponentFiles` glob skips it, so it never
// leaks into the committed cumulus-metadata.json.

import type { ReactNode } from "react";

/** A throwaway all-caps constant co-located with the component below. */
export const FILTER_FIXTURE_DELAY_MS = 200;

export interface NameFilterFixtureProps {
  /** Content rendered inside the fixture. */
  children?: ReactNode;
}

/** A throwaway PascalCase component used to test the component-name filter. */
export function NameFilterFixture({ children }: NameFilterFixtureProps) {
  return <div>{children}</div>;
}

/** A throwaway camelCase hook co-located with the component above. */
export function useNameFilterFixtureThing(): boolean {
  return true;
}
