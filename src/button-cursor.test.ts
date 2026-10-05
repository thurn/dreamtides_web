// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * Cursor affordance: the global stylesheet promotes enabled buttons to the
 * pointer cursor and disabled buttons to not-allowed, because Tailwind's
 * Preflight leaves buttons with the user agent's default arrow.
 */
describe("button cursor affordance", () => {
  beforeAll(() => {
    const style = document.createElement("style");
    style.textContent = readFileSync(
      join(process.cwd(), "src", "index.css"),
      "utf8",
    );
    document.head.append(style);
  });

  it("shows the pointer cursor on enabled buttons", () => {
    const button = document.createElement("button");
    document.body.append(button);
    expect(getComputedStyle(button).cursor).toBe("pointer");
  });

  it("shows the not-allowed cursor on disabled buttons", () => {
    const button = document.createElement("button");
    button.disabled = true;
    document.body.append(button);
    expect(getComputedStyle(button).cursor).toBe("not-allowed");
  });
});
