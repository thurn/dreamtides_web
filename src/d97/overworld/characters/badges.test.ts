// Badge stacking: nearer the player draws on top; a badge overlapped by a
// nearer one fades, and badges apart do not.

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
  });
});
