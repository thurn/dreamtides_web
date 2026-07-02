// Tests for the pure CSS custom-property parser shared by the tango tokens.ts
// generator (scripts/generate-tango-tokens.mjs) and the Primitives-section
// token doc. Fixtures below are small and self-contained by design: they pin
// the parsing contract without depending on the real, ever-changing contents
// of src/tango/primitives/tango-tokens.css.
//
// Run with `npx vitest run scripts/lib/tango-css-tokens.test.mjs`, matching
// every sibling scripts/lib and scripts test file (vite.config.ts's
// `test.include` picks up scripts/**/*.test.mjs for `npm test`, so a
// node:test-only file here would make vitest fail with "No test suite found
// in file").

import { describe, expect, it } from "vitest";
import { parseCssTokens } from "./tango-css-tokens.mjs";

describe("parseCssTokens", () => {
  it("extracts one entry per declaration with a trimmed value (extraction contract)", () => {
    const css = `.tango {
  --foo: 10px;
  --bar:   #ffffff  ;
}`;

    expect(parseCssTokens(css)).toEqual([
      { name: "foo", value: "10px" },
      { name: "bar", value: "#ffffff" },
    ]);
  });

  it("ignores block comments between declarations without corrupting the next value (comment robustness)", () => {
    const css = `.tango {
  /* ---- Section: something with a colon: value ---- */
  --a: 1px;
  /* a block
     comment spanning
     multiple lines */
  --b: 2px;
}`;

    expect(parseCssTokens(css)).toEqual([
      { name: "a", value: "1px" },
      { name: "b", value: "2px" },
    ]);
  });

  it("does not return ordinary (non-custom) properties (non-custom-property exclusion)", () => {
    const css = `.tango {
  color: red;
  --accent: blue;
}`;

    expect(parseCssTokens(css)).toEqual([{ name: "accent", value: "blue" }]);
  });

  it("attaches a trailing @kind comment as the entry's kind (@kind capture)", () => {
    const css = `.tango {
  --r-popover: 8px; /* @kind radius */
  --r-lg: 18px;
}`;

    const tokens = parseCssTokens(css);
    expect(tokens).toEqual([
      { name: "r-popover", value: "8px", kind: "radius" },
      { name: "r-lg", value: "18px" },
    ]);
    // kind must be genuinely absent (not undefined-but-present) when no
    // marker was found, per the documented return shape.
    expect("kind" in tokens[1]).toBe(false);
  });

  it("preserves duplicate names in source order (duplicate names preserved)", () => {
    // Mirrors the real file: --text-faint is declared twice, and the
    // downstream generator needs to see both to apply last-wins itself.
    const css = `.tango {
  --text-faint: #111111;
  --text-faint: #7b7299; /* second declaration wins downstream */
}`;

    expect(parseCssTokens(css)).toEqual([
      { name: "text-faint", value: "#111111" },
      { name: "text-faint", value: "#7b7299" },
    ]);
  });
});
