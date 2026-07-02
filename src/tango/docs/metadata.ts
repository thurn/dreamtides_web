// Typed access to the generated docgen metadata that drives the /tango doc
// site. `tango-metadata.json` is a `Record<componentDisplayName, PropMeta[]>`
// produced by scripts/generate-tango-metadata.mjs, but resolveJsonModule infers
// its type from the (currently empty) committed contents, so we assert the real
// shape once here and let every consumer import the typed view.

import type { PropMeta } from "./controls";
import rawMetadata from "../metadata/tango-metadata.json";

/** The generated prop metadata, keyed by component display name. */
export const TANGO_METADATA = rawMetadata as Record<string, PropMeta[]>;

/** PropMeta[] for a component display name, or [] if it has no documented props. */
export function metasFor(docName: string): PropMeta[] {
  return TANGO_METADATA[docName] ?? [];
}
