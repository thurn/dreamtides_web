// Integration coverage for the REAL content providers behind the five reducer
// seams (Task 25b). Unlike the per-case rules unit tests (which register minimal
// deterministic FAKES) and the synthetic replay fixtures, this suite registers
// the ACTUAL generators via `registerGameProviders(content)` and folds a full
// content-coupled event chain through the canonical game engine config, so the
// previously-bouncing provider-backed events APPLY:
//
//   START_QUEST -> SELECT_DREAMCALLER -> OPEN_SITE (every content-coupled site
//   type) -> REROLL_SHOP -> BEGIN_BATTLE
//
// Two invariants:
//   (a) each provider-backed event APPLIES (never bounces) once the real
//       providers are registered; and
//   (b) folding the same log twice yields a byte-identical final hash — the
//       determinism rail. A generator that leaked `Math.random` (e.g. the atlas
//       generator, or a site generator not threaded off `ctx.rng`) would make
//       the two folds diverge and fail (b), which is exactly the desync this
//       task exists to prevent.
//
// Data-resilient per AGENTS.md: the QuestContent is built from the shared
// __test-helpers__ (live compiled dreamscape / atlas-config bundles) plus a
// hand-authored card/dreamsign corpus. Site ids and the dreamcaller id are
// RESOLVED from the folded state / content, never hardcoded, and the assertions
// are over OUTCOMES and HASHES, never TOML content — so a data edit cannot
// break the suite.

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Genesis } from "../../eventlog/types";
import type { SeqEvent } from "../../rules/replay/replay";
import { replayLog } from "../../rules/replay/replay";
import type { QuestContent } from "../../data/quest-content";
import type { CardData } from "../../types/cards";
import type { DreamcallerContent, DreamsignTemplate } from "../../types/content";
import type { FoldState } from "../../rules/fold-state";
import type { SiteType } from "../../types/quest";
import { asCardId, asCardName } from "../../types/card-identity";
import { STARTER_CARD_NUMBERS } from "../../data/starter-cards";
import {
  loadTestAffiliations,
  loadTestAtlasConfig,
  loadTestDreamGuides,
  loadTestDreamscapes,
} from "../../__test-helpers__/atlas-fixtures";
import {
  buildTestCorpusCards,
  makeTestPoolContext,
} from "../../__test-helpers__/pool-context";
import {
  clearGameProviders,
  registerGameProviders,
} from "./register-game-providers";

const DREAMCALLER_ID = "dreamcaller-real-provider";
const TIMESTAMP = "1970-01-01T00:00:00.000Z";
const GENESIS: Genesis = {
  seed: "real-provider-seed",
  reducerVersion: "test",
  createdAt: 0,
};

/** Eight dreamsign templates so the reward / dreamsign / market generators have a live pool. */
function makeDreamsignTemplates(): DreamsignTemplate[] {
  return Array.from({ length: 8 }, (_value, index) => ({
    id: `dreamsign-${String(index)}`,
    name: `Dreamsign ${String(index)}`,
    effectDescription: "A test dreamsign.",
    imageName: "sign",
    imageAlt: "sign",
  }));
}

function makeCard(cardNumber: number, isStarter: boolean): CardData {
  return {
    name: asCardName(`Card ${String(cardNumber)}`),
    id: asCardId(`card-${String(cardNumber)}`),
    cardNumber,
    cardType: "Character",
    subtype: "",
    isStarter,
    energyCost: 2,
    spark: 1,
    isFast: false,
    renderedText: "",
    imageNumber: cardNumber,
    artOwned: true,
  };
}

function makeDreamcaller(id: string): DreamcallerContent {
  return {
    id,
    name: `Dreamcaller ${id}`,
    title: "Provider Witness",
    renderedText: "Test ability.",
    imageNumber: "0006",
    startingEssence: 200,
    signatureCards: [],
  };
}

/**
 * A {@link QuestContent} built from the shared test helpers plus a hand-authored
 * card / dreamsign corpus, exercising the REAL quest-start, atlas, shop, and
 * battle-init generators without any network fetch.
 */
function makeQuestContent(): QuestContent {
  const dreamsignTemplates = makeDreamsignTemplates();
  const dreamsignIds = dreamsignTemplates.map((template) => template.id);
  const starterCards = STARTER_CARD_NUMBERS.map((cardNumber) =>
    makeCard(cardNumber, true),
  );
  const corpusCards = buildTestCorpusCards();
  const cardDatabase = new Map<number, CardData>(
    [...starterCards, ...corpusCards].map((card) => [card.cardNumber, card]),
  );
  return {
    cardDatabase,
    dreamcallers: [makeDreamcaller(DREAMCALLER_ID)],
    dreamwellCards: [],
    dreamsignTemplates,
    dreamscapes: loadTestDreamscapes(),
    affiliations: loadTestAffiliations(),
    guides: loadTestDreamGuides(),
    atlasConfig: loadTestAtlasConfig(),
    poolContext: makeTestPoolContext(dreamsignIds),
  };
}

const CONTENT_SITE_TYPES: SiteType[] = [
  "Reward",
  "DreamsignRevelation",
  "Shop",
  "DreamsignMarket",
  "Transfiguration",
  "Duplication",
];

/** A single-actor committed event: basedOnSeq = seq - 1 (empty intervening window). */
function ev(
  seq: number,
  type: string,
  payload: Record<string, unknown>,
): SeqEvent {
  return {
    seq,
    event: {
      type,
      payload,
      actor: "p1",
      clientTimestamp: TIMESTAMP,
      basedOnSeq: seq - 1,
    },
  };
}

/** The current dreamscape node id after START_QUEST, or throws. */
function currentNodeId(state: FoldState): string {
  const id = state.quest.currentDreamscape;
  if (id === null) {
    throw new Error("expected a current dreamscape after START_QUEST");
  }
  return id;
}

beforeAll(() => {
  registerGameProviders(makeQuestContent());
});

afterAll(() => {
  clearGameProviders();
});

describe("registerGameProviders (real content providers)", () => {
  it("folds START_QUEST -> SELECT_DREAMCALLER -> OPEN_SITE(each type) -> REROLL_SHOP -> BEGIN_BATTLE, all applied, deterministically", () => {
    // Phase 1: start the run and add one site of every content-coupled type
    // (plus a Battle site) to the starting node, so OPEN_SITE / BEGIN_BATTLE
    // have live targets regardless of what the atlas generator rolled.
    const prefix: SeqEvent[] = [
      ev(1, "START_QUEST", { dreamcallerId: DREAMCALLER_ID }),
      ev(2, "SELECT_DREAMCALLER", { dreamcallerId: DREAMCALLER_ID }),
    ];
    const started = replayLog({ genesis: GENESIS, events: prefix });
    expect(started.outcomes.find((o) => o.seq === 1)?.outcome).toBe("applied");
    expect(started.outcomes.find((o) => o.seq === 2)?.outcome).toBe("applied");
    const nodeId = currentNodeId(started.finalState);

    let seq = 2;
    const addSiteEvents: SeqEvent[] = [];
    for (const siteType of [...CONTENT_SITE_TYPES, "Battle" as SiteType]) {
      seq += 1;
      addSiteEvents.push(ev(seq, "ADD_SITE_TO_DREAMSCAPE", { nodeId, siteType }));
    }

    // Fold the site-additions so we can resolve the minted site ids by type.
    const withSites = replayLog({
      genesis: GENESIS,
      events: [...prefix, ...addSiteEvents],
    });
    for (const added of addSiteEvents) {
      expect(
        withSites.outcomes.find((o) => o.seq === added.seq)?.outcome,
      ).toBe("applied");
    }
    const node = withSites.finalState.quest.atlas.nodes[nodeId];
    const siteIdByType = new Map<SiteType, string>();
    for (const site of node.sites) {
      if (!siteIdByType.has(site.type)) siteIdByType.set(site.type, site.id);
    }
    for (const siteType of CONTENT_SITE_TYPES) {
      expect(siteIdByType.get(siteType)).toBeDefined();
    }

    // Phase 2: OPEN each content site, REROLL the shop, BEGIN the battle.
    const tail: SeqEvent[] = [];
    for (const siteType of CONTENT_SITE_TYPES) {
      seq += 1;
      tail.push(
        ev(seq, "OPEN_SITE", { siteId: siteIdByType.get(siteType) }),
      );
    }
    seq += 1;
    tail.push(
      ev(seq, "REROLL_SHOP", {
        siteId: siteIdByType.get("Shop"),
        essenceCost: 0,
      }),
    );
    seq += 1;
    tail.push(ev(seq, "BEGIN_BATTLE", { siteId: siteIdByType.get("Battle") }));

    const events = [...prefix, ...addSiteEvents, ...tail];
    const first = replayLog({ genesis: GENESIS, events });

    // (a) Every provider-backed event APPLIES (nothing bounces).
    for (const outcome of first.outcomes) {
      expect(
        outcome.outcome,
        `seq ${String(outcome.seq)} bounced${
          outcome.error ? ` (${outcome.error.message})` : ""
        }`,
      ).toBe("applied");
    }
    // The battle slice exists after BEGIN_BATTLE.
    expect(first.finalState.battle).not.toBeNull();

    // (b) Determinism: folding the identical log again is byte-identical.
    const second = replayLog({ genesis: GENESIS, events });
    expect(second.finalHash).toBe(first.finalHash);
  });
});
