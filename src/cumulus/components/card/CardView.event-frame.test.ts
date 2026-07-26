import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const CARD_VIEW_CSS = fileURLToPath(
  new URL("./CardView.css", import.meta.url),
);

describe("CardView event frame", () => {
  it("uses Cumulus violet roles in an opaque frame treatment", () => {
    const css = readFileSync(CARD_VIEW_CSS, "utf8");

    expect(css).toMatch(
      /\.card-view\[data-card-type="Event"\]\s*\{[\s\S]*?--cv-textbox-bg:\s*linear-gradient\([\s\S]*?var\(--accent-bright\)[\s\S]*?var\(--accent-strong\)[\s\S]*?var\(--surface-card\)[\s\S]*?\);[\s\S]*?--cv-textbox-border:\s*color-mix\(in srgb, var\(--accent-bright\)[\s\S]*?var\(--text-on-card\)\);[\s\S]*?\}/,
    );
  });
});
