import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SCREENS_DIR = new URL("../src/tango/screens/", import.meta.url);

describe("Tango product-screen chrome ownership", () => {
  it("keeps QuestStatusBar and quest-menu rendering out of individual screens", () => {
    const offenders = readdirSync(SCREENS_DIR)
      .filter((name) => name.endsWith(".tsx") && !name.endsWith(".test.tsx"))
      .flatMap((name) => {
        const source = readFileSync(join(SCREENS_DIR.pathname, name), "utf8");
        return source.includes("<QuestStatusBar") ||
          source.includes("<DreamscapeQuestMenu")
          ? [name]
          : [];
      });

    expect(
      offenders,
      "Registered Tango screens receive persistent chrome from TangoQuestChrome; screen files must not render it themselves.",
    ).toEqual([]);
  });
});
