import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const CARD_VIEW_CSS = fileURLToPath(
  new URL("./CardView.css", import.meta.url),
);

describe("CardView event frame", () => {
  it("owns a complete violet treatment with canonical token fallbacks", () => {
    const css = readFileSync(CARD_VIEW_CSS, "utf8");

    expect(css).toContain(
      "--cv-event-accent-bright: var(--accent-bright, #c084fc);",
    );
    expect(css).toContain(
      "--cv-event-accent-strong: var(--accent-strong, #7c3aed);",
    );
    expect(css).toContain(
      "--cv-event-surface: var(--surface-card, #1a1525);",
    );
    expect(css).toContain(
      "--cv-event-text: var(--text-on-card, #f6f6f5);",
    );

    const eventFrame = css.match(
      /\.card-view\[data-card-type="Event"\]\s*\{[\s\S]*?\n\}/,
    )?.[0];
    expect(eventFrame).toContain("var(--cv-event-accent-bright)");
    expect(eventFrame).toContain("var(--cv-event-accent-strong)");
    expect(eventFrame).toContain("var(--cv-event-surface)");
    expect(eventFrame).toContain("var(--cv-event-text)");
    expect(eventFrame).not.toMatch(
      /var\(--(?:accent-bright|accent-strong|surface-card|text-on-card)\)/,
    );
  });
});
