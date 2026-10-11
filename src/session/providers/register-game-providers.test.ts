// Integration coverage for the real content providers behind the reducer
// seams. Unlike the per-case rules tests (which register minimal fakes), this
// suite registers the actual generators via `registerGameProviders(content)`
// and folds content-coupled event chains through the canonical engine config:
//   (a) each provider-backed event applies once the real providers are
//       registered; and
//   (b) folding the same log twice yields an identical final hash, so a
//       generator that leaked ambient randomness fails the determinism rail.
// Site ids and the avatar id are resolved from the folded state, and the
// assertions are over outcomes, hashes, and fixture-derived values.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { GameEvent } from "../../eventlog/types";
import { eventRng } from "../../eventlog/rng";
import type { SeqEvent } from "../../rules/replay/replay";
import { replayLog } from "../../rules/replay/replay";
import { genesisFoldState, type FoldState } from "../../rules/fold-state";
import { reduceGameEvent } from "../../rules/reducer";
import type { AtlasData, SiteType } from "../../types/journey";
import { makeSyntheticAtlasData } from "../../testing/atlas-fixtures";
import { TEST_CONTENT_CONFIG } from "../../testing/journey-genesis";
import { LayerName } from "../../types/layer-name";
import {
  clearGameProviders,
  registerGameProviders,
} from "./register-game-providers";
import type { SiteId } from "../../types/identifiers";
import { testEventActor } from "../../types/test-identities";
import { journeyBattleOf } from "../../rules/battle/fold";
import {
  AVATAR_ID,
  ev,
  expectAllApplied,
  GENESIS,
  makeJourneyContent,
  OPEN,
  START,
  TIMESTAMP,
} from "./register-game-providers.fixtures";

const CONTENT_SITE_TYPES: SiteType[] = [
  "Reward",
  "DreamsignRevelation",
  "Shop",
  "DreamsignBazaar",
  "Transfiguration",
  "Duplication",
  "Gamble",
];

/**
 * Plays a started run through every Atlas layer with authoritative reducer
 * events against the registered providers: each layer's non-Battle sites,
 * then its Battle, won by a debug action. Returns the final fold state.
 */
function playEveryLayer(): FoldState {
  let state = genesisFoldState(GENESIS);
  let seq = 1;
  const apply = (
    type: GameEvent["type"],
    payload: Record<string, unknown>,
  ): void => {
    const result = reduceGameEvent(
      state,
      {
        type,
        payload,
        actor: testEventActor("p1"),
        clientTimestamp: TIMESTAMP,
        basedOnSeq: seq - 1,
      },
      {
        contentConfig: TEST_CONTENT_CONFIG,
        seq,
        timestamp: TIMESTAMP,
        rng: eventRng(GENESIS.seed, seq),
        intervening: [],
      },
    );
    expect(
      result.outcome,
      `seq ${String(seq)} ${type} ${
        result.outcome === "bounced" ? result.bounceReason : ""
      }`,
    ).toBe("applied");
    state = result.state;
    seq += 1;
  };

  apply("START_JOURNEY", { avatarId: AVATAR_ID });
  const layerCount = state.journey.atlas.layers.length;
  for (let layer = 0; layer < layerCount; layer += 1) {
    const nodeId = state.journey.currentDreamscape;
    if (nodeId === null) throw new Error("expected a current dreamscape");
    const node = state.journey.atlas.nodes[nodeId];
    for (const site of node.sites.filter(({ type }) => type !== "Battle")) {
      apply("ENTER_SITE", { siteId: site.id });
      apply("COMPLETE_SITE", { siteId: site.id });
    }
    const battle = node.sites.find(({ type }) => type === "Battle");
    apply("ENTER_SITE", { siteId: battle?.id });
    apply("BEGIN_BATTLE", { siteId: battle?.id });
    // The real provider starts every journey battle's engine battle; a
    // debug action wins it.
    const engine = journeyBattleOf(state.battle)?.engine;
    expect(engine?.slice.committed.result).toBeNull();
    apply("BATTLE_DEBUG", {
      op: { kind: "setScore", side: "player", score: engine?.init.scoreToWin },
    });
    apply("END_BATTLE", {});

    expect(state.journey.atlas.nodes[nodeId].state).toBe("completed");
    expect(state.journey.completionLevel).toBe(layer + 1);
    if (layer < layerCount - 1) {
      const nextId = node.forwardIds.find(
        (id) => state.journey.atlas.nodes[id].state === "available",
      );
      if (nextId === undefined) throw new Error("expected a frontier");
      expect(state.journey.atlas.nodes[nextId].dreamscapeId).not.toBeNull();
      apply("TRAVEL_TO_DREAMSCAPE", { nodeId: nextId });
    }
  }

  return state;
}

describe("registerGameProviders (real content providers)", () => {
  beforeAll(() => {
    registerGameProviders(makeJourneyContent());
  });
  afterAll(() => {
    clearGameProviders();
  });

  it("applies OPEN_SITE for every content-coupled type and REROLL_SHOP, deterministically", () => {
    const started = replayLog({ genesis: GENESIS, events: START });
    const nodeId = started.finalState.journey.currentDreamscape;
    if (nodeId === null) throw new Error("expected a current dreamscape");

    let seq = START.length;
    const addSites = CONTENT_SITE_TYPES.map((siteType) =>
      ev(++seq, "ADD_SITE_TO_DREAMSCAPE", { nodeId, siteType }),
    );
    const withSites = replayLog({
      genesis: GENESIS,
      events: [...START, ...addSites],
    });
    const opened = new Map<SiteType, SiteId>();
    const visits: SeqEvent[] = [];
    for (const site of withSites.finalState.journey.atlas.nodes[nodeId].sites) {
      if (!CONTENT_SITE_TYPES.includes(site.type) || opened.has(site.type)) {
        continue;
      }
      opened.set(site.type, site.id);
      visits.push(
        ev(++seq, "ENTER_SITE", { siteId: site.id }),
        ev(++seq, "OPEN_SITE", { siteId: site.id, ...OPEN }),
      );
      if (site.type === "Shop" || site.type === "DreamsignBazaar") {
        visits.push(ev(++seq, "REROLL_SHOP", { siteId: site.id }));
      }
      visits.push(ev(++seq, "COMPLETE_SITE", { siteId: site.id }));
    }
    expect([...opened.keys()].sort()).toEqual([...CONTENT_SITE_TYPES].sort());

    const events = [...START, ...addSites, ...visits];
    const first = replayLog({ genesis: GENESIS, events });
    expectAllApplied(first.outcomes);
    const runtimeOf = (type: SiteType) => {
      const siteId = opened.get(type);
      return siteId === undefined
        ? undefined
        : first.finalState.journey.siteRuntime[siteId];
    };
    const bazaar = runtimeOf("DreamsignBazaar");
    expect(bazaar?.kind).toBe("shop");
    if (bazaar?.kind === "shop") {
      expect(bazaar.slots.length).toBeGreaterThan(0);
      expect(
        bazaar.slots.every(({ itemType }) => itemType === "dreamsign"),
      ).toBe(true);
    }
    expect(runtimeOf("Gamble")?.kind).toBe("gamble");

    expect(replayLog({ genesis: GENESIS, events }).finalHash).toBe(
      first.finalHash,
    );
  });

  it("rebuilds debug progress as one consistent Atlas transition", () => {
    const result = replayLog({
      genesis: GENESIS,
      events: [START[0], ev(2, "REGENERATE_ATLAS", { completionLevel: 3 })],
    });
    expectAllApplied(result.outcomes);
    const { journey } = result.finalState;
    const nodes = Object.values(journey.atlas.nodes);

    expect(journey.completionLevel).toBe(3);
    expect(journey.screen.type).toBe("atlas");
    expect(nodes.filter(({ state }) => state === "completed")).toHaveLength(3);
    expect(
      nodes
        .filter(({ state }) => state === "available")
        .every(({ dreamscapeId }) => dreamscapeId !== null),
    ).toBe(true);
  });

  it("rebuilds debug progress up to the final completion level, onto the end screen", () => {
    const finalLevel = makeSyntheticAtlasData().layers.length;
    const regenerate = (completionLevel: number) =>
      replayLog({
        genesis: GENESIS,
        events: [START[0], ev(2, "REGENERATE_ATLAS", { completionLevel })],
      });

    const final = regenerate(finalLevel);
    expectAllApplied(final.outcomes);
    expect(final.finalState.journey.completionLevel).toBe(finalLevel);
    expect(final.finalState.journey.screen.type).toBe("journeyComplete");

    const past = regenerate(finalLevel + 1);
    expect(
      past.outcomes.map(({ outcome, bounceReason }) => ({
        outcome,
        bounceReason,
      })),
    ).toEqual([
      { outcome: "applied", bounceReason: undefined },
      { outcome: "bounced", bounceReason: "invalid_action" },
    ]);
    expect(past.finalState.journey.completionLevel).toBe(0);
  });

  it.each([
    ["the full synthetic Atlas", (layers: AtlasData["layers"]) => layers],
    [
      "a two-layer Atlas",
      (layers: AtlasData["layers"]) => [
        layers[0],
        { ...layers[layers.length - 1], name: LayerName.Two },
      ],
    ],
  ])(
    "finishes the run after one victory per layer of %s",
    (_label, selectLayers) => {
      const content = makeJourneyContent();
      const layers = selectLayers(content.atlasData.layers);
      registerGameProviders({
        ...content,
        atlasData: { ...content.atlasData, layers },
      });
      try {
        const state = playEveryLayer();
        expect(state.journey.atlas.layers).toHaveLength(layers.length);
        expect(state.journey.completionLevel).toBe(layers.length);
        expect(state.battle).toBeNull();
        expect(state.journey.screen.type).toBe("journeyComplete");
        for (const layer of state.journey.atlas.layers) {
          expect(
            layer.filter(
              (nodeId) =>
                state.journey.atlas.nodes[nodeId].state === "completed",
            ),
          ).toHaveLength(1);
        }
      } finally {
        registerGameProviders(makeJourneyContent());
      }
    },
  );
});
