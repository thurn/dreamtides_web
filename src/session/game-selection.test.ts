// The front door (`/` and `/main` without `?game=`) resumes the most recent
// game; other entries and new-game parameters ask for a new game.

import { describe, expect, it } from "vitest";
import { resumesRecentGame } from "./game-selection";

describe("resumesRecentGame", () => {
  it.each([
    ["", ""],
    ["/main", ""],
    ["/main", "?tutorialSpeed=4"],
    ["", "?ai=1"],
  ])("resumes at %j%s", (pathname, search) => {
    expect(resumesRecentGame(pathname, search)).toBe(true);
  });

  it.each([
    ["/main", "?game=ab12cd"],
    ["/tutorial", ""],
    ["/loading", ""],
    ["/main", "?goto=tutorial-battle"],
    ["", "?seed=7"],
    ["/main", "?loadJourney=qa"],
    ["", "?tutorialSpeed=2&gambleGame=three-gate"],
  ])("asks for a new game at %j%s", (pathname, search) => {
    expect(resumesRecentGame(pathname, search)).toBe(false);
  });
});
