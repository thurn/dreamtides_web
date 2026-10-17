// Badge stacking: nearer the player draws on top; a badge overlapped by a
// nearer one fades, and badges apart do not; a badge over the player's body
// hides, and one clear of it does not.

import { describe, expect, it } from "vitest";
import { BADGE_HEIGHT, BADGE_WIDTH, orderBadges } from "./badges";

describe("orderBadges", () => {
  it("puts the nearest on top and fades only overlapped badges", () => {
    const order = orderBadges(
      [
        { x: 0, y: 0, distance: 5 },
        { x: 10, y: 4, distance: 2 },
        { x: 200, y: 0, distance: 9 },
      ],
      BADGE_WIDTH,
      BADGE_HEIGHT,
    );
    expect(order[1]?.zIndex).toBeGreaterThan(order[0]?.zIndex ?? 0);
    expect(order.map((entry) => entry.faded)).toEqual([true, false, false]);
    expect(order.map((entry) => entry.hidden)).toEqual([false, false, false]);
  });

  it("hides a badge that would cover the player's body, and only that one", () => {
    // The player stands one tile north of the first badge's character: the
    // badge over that character's head sits on the player's body.
    const body = { x: 32, y: 10, width: 32, height: 54 };
    const order = orderBadges(
      [
        { x: 38, y: 30, distance: 1 },
        { x: 38, y: -40, distance: 2 },
        { x: 120, y: 30, distance: 3 },
      ],
      BADGE_WIDTH,
      BADGE_HEIGHT,
      body,
    );
    expect(order.map((entry) => entry.hidden)).toEqual([true, false, false]);
    expect(order[0]?.zIndex).toBeGreaterThan(order[1]?.zIndex ?? 0);
  });
});
