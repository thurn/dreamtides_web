import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Cursor-affordance regression coverage.
 *
 * Tailwind v4 (Preflight) leaves `<button>` with the user-agent's auto
 * cursor, which renders as the default arrow on most desktop browsers. The
 * project relies on a global rule in `src/index.css` to promote every
 * `<button>` to the pointer cursor — and to switch disabled buttons to the
 * `not-allowed` cursor so the affordance matches the visual state. These
 * tests pin that contract so we keep the affordance everywhere the
 * prototype renders a button.
 *
 * `DreamscapeSiteNode` (the floating dreamscape site button) participates in
 * the same contract: it must let the global rule pick the cursor instead of
 * hard-coding a per-state cursor inline, because an inline cursor wins the
 * cascade over the global rule.
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SRC_DIR = path.resolve(__dirname);
const INDEX_CSS = path.join(SRC_DIR, "index.css");
const SITE_NODE = path.join(
  SRC_DIR,
  "cumulus",
  "components",
  "dreamscape",
  "SiteNode.tsx",
);

describe("button cursor affordance", () => {
  it("declares the global pointer cursor for enabled buttons", () => {
    const css = readFileSync(INDEX_CSS, "utf8");
    expect(css).toMatch(/button:not\(:disabled\)\s*{[^}]*cursor:\s*pointer/);
  });

  it("declares the global not-allowed cursor for disabled buttons", () => {
    const css = readFileSync(INDEX_CSS, "utf8");
    expect(css).toMatch(/button:disabled\s*{[^}]*cursor:\s*not-allowed/);
  });

  it("does not force a per-state cursor on the dreamscape site-node button", () => {
    // Inline `cursor:` styles win over the global rule, so the site-node
    // button must defer to the cascade for locked, visited, and active
    // states.
    const tsx = readFileSync(SITE_NODE, "utf8");
    expect(tsx).not.toMatch(/cursor:\s*['"](?:default|pointer|not-allowed)['"]/);
  });
});
