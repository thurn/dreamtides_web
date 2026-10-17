// Each dialogue effect records exactly one intent event: its type and its
// payload, which names the speaker's anchor.

import { describe, expect, it } from "vitest";
import type { D97DialogueEffect } from "../../content/d97/dialogue/schema";
import { ANCHORS, DEFEAT_QUEST, FLAG, ITEMS, STEPS } from "./dialogue.fixtures";
import { effectIntent } from "./effects";

const AT = ANCHORS.giver;

describe("effectIntent", () => {
  it.each<[D97DialogueEffect, string, Record<string, unknown>]>([
    [{ kind: "offerQuest", questId: DEFEAT_QUEST.id }, "D97_ACCEPT_QUEST", { questId: DEFEAT_QUEST.id, anchorId: AT }],
    [
      { kind: "advanceQuest", questId: DEFEAT_QUEST.id, stepId: STEPS.visit },
      "D97_ADVANCE_QUEST",
      { questId: DEFEAT_QUEST.id, stepId: STEPS.visit, anchorId: AT },
    ],
    [{ kind: "completeQuest", questId: DEFEAT_QUEST.id }, "D97_COMPLETE_QUEST", { questId: DEFEAT_QUEST.id, anchorId: AT }],
    [{ kind: "giveItem", itemId: ITEMS.relic }, "D97_GIVE_ITEM", { itemId: ITEMS.relic, anchorId: AT }],
    [{ kind: "takeItem", itemId: ITEMS.relic }, "D97_TAKE_ITEM", { itemId: ITEMS.relic, anchorId: AT }],
    [{ kind: "openShop" }, "D97_OPEN_SHOP", { anchorId: AT }],
    [{ kind: "openService", service: "sage" }, "D97_OPEN_SERVICE", { anchorId: AT, service: "sage" }],
    [{ kind: "setFlag", flagId: FLAG, value: true }, "D97_SET_FLAG", { flagId: FLAG, value: true, anchorId: AT }],
    [{ kind: "startChallenge" }, "D97_PREVIEW_ENCOUNTER", { anchorId: AT }],
  ])("%o records %s", (effect, type, payload) => {
    expect(effectIntent(effect, AT)).toEqual({ type, payload });
  });
});
