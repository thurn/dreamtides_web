// @vitest-environment node
//
// Ghost-component integrity check for the Cumulus doc catalog.
//
// Every entry in src/cumulus/docs/registry.ts is a component we document and
// invite the rest of the app to use. A "ghost" is an entry that NOTHING real
// consumes: no value (non-`import type`) import of its source module from any
// file under src/ outside the doc site and tests. A ghost silently rots — its
// props drift from a call site that no longer exists, and grepping component
// code alone never surfaces it. This test recomputes the consumer count for
// every registry entry (via the shared scripts/lib/cumulus-consumers.mjs helper,
// so its numbers match the docs generator's) and fails the build the moment a
// NEW ghost appears, so a component has to be either wired up, marked
// `status: "incubating"` (the sanctioned "documented ahead of adoption"
// escape, which shows an Incubating badge), or added to BASELINE below.
//
// BASELINE is the reviewed set of ghosts allowed to survive the check. It is
// empty: every registry entry has a real (runtime) consumer under src/ or is
// marked `status: "incubating"` in its demo, so no component needs an exemption
// here. A component that gains a real consumer while listed here is caught by
// the "no stale BASELINE entry" test.

import { describe, expect, it } from "vitest";
import { computeConsumerCounts } from "./lib/cumulus-consumers.mjs";

export const BASELINE = [];

describe("the Cumulus catalog has no unreviewed ghost components", () => {
  it("every entry has a real consumer, is incubating, or is baselined", () => {
    const baseline = new Set(BASELINE);
    const ghosts = computeConsumerCounts().filter(
      (c) =>
        c.count === 0 &&
        c.status !== "incubating" &&
        !baseline.has(c.docName),
    );
    const message = ghosts
      .map(
        (c) =>
          `GHOST COMPONENT ${c.docName} (${c.module}) has no real consumer under src/ — ` +
          `wire it up, mark it status: "incubating" in its demo, or add its docName to ` +
          `BASELINE in scripts/cumulus-ghost-components.test.mjs`,
      )
      .join("\n");
    expect(ghosts, message).toEqual([]);
  });

  it("no stale BASELINE entry", () => {
    const counts = computeConsumerCounts();
    const stale = BASELINE.filter((docName) =>
      counts.some((c) => c.docName === docName && c.count > 0),
    );
    const message = stale
      .map(
        (docName) =>
          `STALE BASELINE ENTRY ${docName} — now has a real consumer, remove it from ` +
          `BASELINE in scripts/cumulus-ghost-components.test.mjs`,
      )
      .join("\n");
    expect(stale, message).toEqual([]);
  });
});
