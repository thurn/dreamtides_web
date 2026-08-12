import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const SCREENS_DIR = new URL("../src/cumulus/screens/", import.meta.url);

describe("Cumulus product-screen chrome ownership", () => {
  it("keeps JourneyStatusBar and journey-menu rendering out of individual screens", () => {
    const offenders = readdirSync(SCREENS_DIR)
      .filter((name) => name.endsWith(".tsx") && !name.endsWith(".test.tsx"))
      .flatMap((name) => {
        const source = readFileSync(new URL(name, SCREENS_DIR), "utf8");
        return source.includes("<JourneyStatusBar") ||
          source.includes("<DreamscapeJourneyMenu")
          ? [name]
          : [];
      });

    expect(
      offenders,
      "Registered Cumulus screens receive persistent chrome from CumulusJourneyChrome; screen files must not render it themselves.",
    ).toEqual([]);
  });
});
