import { describe, expect, it } from "vitest";
import { tutorialJourneyUrl } from "./tutorial-journey-url";

describe("tutorialJourneyUrl", () => {
  it("opens the journey runtime in the same room without replaying a QA scene", () => {
    expect(
      tutorialJourneyUrl(
        "http://localhost:5174/tutorial?goto=tutorial-victory&game=room42&realtime=1#shared",
      ),
    ).toBe("/?game=room42&realtime=1#shared");
  });
});
