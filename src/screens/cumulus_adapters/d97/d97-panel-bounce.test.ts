// A preview or shop panel the overworld opens with its intent closes when the
// fold bounces that intent: here the encounter preview whose opponent deck
// the content cannot build, and a shop opening the run's dream does not hold.
// Other panels, other anchors and other events leave the open panel alone.

import { afterEach, describe, expect, it } from "vitest";
import { eventRng } from "../../../eventlog/rng";
import type { Genesis } from "../../../eventlog/types";
import { registerD97ContentProvider } from "../../../rules/d97/d97-content";
import { syntheticD97Content } from "../../../rules/d97/d97-content.fixtures";
import { SYNTHETIC_DREAM_A, SYNTHETIC_DREAM_B } from "../../../rules/d97/d97-dreams.fixtures";
import { genesisFoldState, type FoldState } from "../../../rules/fold-state";
import { reduceGameEvent } from "../../../rules/reducer";
import { ctx, event, GENESIS } from "../../../rules/reducer-fixtures";
import { testAvatarId } from "../../../types/test-identities";
import { overworldPanelReducer, type D97OverworldPanel } from "./d97-overworld-view-model";

const AVATAR = testAvatarId("d97-bounce-avatar");
const D97_GENESIS: Genesis = { ...GENESIS, mode: "d97" };
const challenger = SYNTHETIC_DREAM_A.residents.find((resident) => resident.role === "challenger");
if (challenger === undefined) throw new Error("synthetic dream A has no challenger");
const CHALLENGER = challenger.anchorId;
const SHOP_A = SYNTHETIC_DREAM_A.topology.shopAnchorId;
const SHOP_B = SYNTHETIC_DREAM_B.topology.shopAnchorId;

function started(): FoldState {
  const result = reduceGameEvent(
    genesisFoldState(D97_GENESIS),
    event("D97_START_RUN", { avatarId: AVATAR, dreamId: SYNTHETIC_DREAM_A.id }),
    ctx({ seq: 1, rng: eventRng(D97_GENESIS.seed, 1) }),
  );
  if (result.outcome !== "applied") throw new Error("run did not start");
  return result.state;
}

/** Fold `intent` after the run start; the panel after its outcome. */
function afterIntent(panel: D97OverworldPanel, type: string, payload: Record<string, unknown>): D97OverworldPanel | null {
  const intent = event(type as never, payload);
  const result = reduceGameEvent(started(), intent, ctx({ seq: 2, rng: eventRng(D97_GENESIS.seed, 2) }));
  return result.outcome === "bounced" ? overworldPanelReducer(panel, { type: "openingBounced", event: intent }) : panel;
}

afterEach(() => registerD97ContentProvider(null));

describe("a panel whose opening intent bounces", () => {
  it("closes the preview of an opponent whose deck cannot be built", () => {
    const content = syntheticD97Content({ avatarIds: [AVATAR] });
    registerD97ContentProvider({ ...content, buildOpponentDeck: () => null });
    const panel: D97OverworldPanel = { kind: "preview", anchorId: CHALLENGER };
    expect(afterIntent(panel, "D97_PREVIEW_ENCOUNTER", { anchorId: CHALLENGER })).toBeNull();
  });

  it("keeps the preview when its opponent's deck builds", () => {
    registerD97ContentProvider(syntheticD97Content({ avatarIds: [AVATAR] }));
    const panel: D97OverworldPanel = { kind: "preview", anchorId: CHALLENGER };
    expect(afterIntent(panel, "D97_PREVIEW_ENCOUNTER", { anchorId: CHALLENGER })).toEqual(panel);
  });

  it("closes a shop the run's dream does not hold, and keeps its own", () => {
    registerD97ContentProvider(syntheticD97Content({ avatarIds: [AVATAR] }));
    const foreign: D97OverworldPanel = { kind: "shop", anchorId: SHOP_B };
    expect(afterIntent(foreign, "D97_OPEN_SHOP", { anchorId: SHOP_B })).toBeNull();
    const own: D97OverworldPanel = { kind: "shop", anchorId: SHOP_A };
    expect(afterIntent(own, "D97_OPEN_SHOP", { anchorId: SHOP_A })).toEqual(own);
  });

  it("leaves other panels, anchors and events alone", () => {
    const preview: D97OverworldPanel = { kind: "preview", anchorId: CHALLENGER };
    const bounce = (type: string, anchorId: unknown) =>
      ({ type: "openingBounced", event: { type, payload: { anchorId } } }) as const;
    expect(overworldPanelReducer(preview, bounce("D97_PREVIEW_ENCOUNTER", SHOP_A))).toEqual(preview);
    expect(overworldPanelReducer(preview, bounce("D97_OPEN_SHOP", CHALLENGER))).toEqual(preview);
    expect(overworldPanelReducer({ kind: "menu" }, bounce("D97_OPEN_SHOP", SHOP_A))).toEqual({ kind: "menu" });
    expect(overworldPanelReducer(null, bounce("D97_PREVIEW_ENCOUNTER", CHALLENGER))).toBeNull();
  });
});
