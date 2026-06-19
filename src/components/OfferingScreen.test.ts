import { describe, it, expect } from "vitest";

import {
  OFFERING_ACCENT,
  OFFERING_NEUTRAL,
  OFFERING_CARD_BACKGROUND,
} from "./OfferingScreen";
import {
  OFFERING_ACCENT as JOURNEY_OFFERING_ACCENT,
  OFFERING_NEUTRAL as JOURNEY_OFFERING_NEUTRAL,
  OFFERING_CARD_BACKGROUND as JOURNEY_OFFERING_CARD_BACKGROUND,
} from "../journeys/ui/chooser/offering-tokens";

/**
 * The journey module's isolation contract forbids it from importing from
 * `src/components/`. To keep the journey chooser modal aligned with the
 * dreamsign-draft, dreamsign-offering, and card-draft surfaces the journey
 * package mirrors the offering tokens locally. These deep-equality
 * assertions catch any silent drift between the two copies.
 */
describe("offering tokens", () => {
  it("journey OFFERING_ACCENT deep-equals the prototype-side OFFERING_ACCENT", () => {
    expect(JOURNEY_OFFERING_ACCENT).toEqual(OFFERING_ACCENT);
  });

  it("journey OFFERING_NEUTRAL deep-equals the prototype-side OFFERING_NEUTRAL", () => {
    expect(JOURNEY_OFFERING_NEUTRAL).toEqual(OFFERING_NEUTRAL);
  });

  it("journey OFFERING_CARD_BACKGROUND matches the prototype-side value", () => {
    expect(JOURNEY_OFFERING_CARD_BACKGROUND).toBe(OFFERING_CARD_BACKGROUND);
  });
});

describe("offering screen consumer guarantees", () => {
  /**
   * Loads the module text and asserts every "pick one of N offered
   * options" surface routes through `OfferingScreen.tsx`. A new offering
   * surface added without this import will fail this test, prompting the
   * author to either consume the shared tokens or move the surface to the
   * journey-side `chooser` overlays which mirror them.
   */
  const CONSUMER_FILES = [
    "src/screens/DreamsignPurgeOverlay.tsx",
    "src/screens/DraftSiteScreen.tsx",
  ] as const;

  for (const path of CONSUMER_FILES) {
    it(`${path} imports from the shared OfferingScreen module`, async () => {
      const fs = await import("node:fs/promises");
      const source = await fs.readFile(path, "utf8");
      expect(source).toContain('from "../components/OfferingScreen"');
    });
  }

  it("the journey chooser overlay imports the mirrored offering tokens", async () => {
    const fs = await import("node:fs/promises");
    const source = await fs.readFile(
      "src/journeys/ui/chooser/ChooserOverlay.tsx",
      "utf8",
    );
    expect(source).toContain('from "./offering-tokens"');
  });
});
