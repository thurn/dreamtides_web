import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { vi } from "vitest";
import { ScreenRouter } from "./ScreenRouter";
import { JourneyContextProvider } from "../state/journey-context";
import { testJourneyState } from "../testing/journey-genesis";
import type { JourneyMutations } from "../state/journey-context";
import { parseRuntimeConfig } from "../runtime/runtime-config";
import type { JourneyContent } from "../data/journey-content";
import type { DreamGuideContent } from "../types/content";
import type { CardData } from "../types/cards";
import { parseCardName } from "../types/card-identity";
import { CumulusRoot } from "../cumulus/CumulusRoot";
import type { JourneyState, SiteState } from "../types/journey";
import { LayerName } from "../types/layer-name";
import {
  makeAuguryTestCard,
  makeAuguryTestContent,
  makeAuguryTestDeckEntry,
  makeAuguryTestDreamsignTemplate,
  makeAuguryTestJourneyState,
} from "../journey_v2/testing/fixtures";
import { getLogEntries } from "../logging";
import { parseAtlasNodeId, parseDeckEntryId, parseSiteId } from "../types/identifiers";
import {
  testAvatarId,
  testCardId,
  testDreamscapeId,
  testDreamsignId,
  testGuideArtKey,
  testJourneySeed,
} from "../types/test-identities";

export const roots: Root[] = [];

export function card(idSeed: string, cardNumber: number, overrides: Partial<CardData> = {}): CardData {
  return makeAuguryTestCard({
    id: testCardId(idSeed),
    cardNumber,
    name: parseCardName(`Router Fixture ${cardNumber}`),
    cardType: "Character",
    energyCost: 2,
    spark: 1,
    renderedText: "",
    ...overrides,
  });
}

/** Deck cards (1-6) plus draw, recursion, interaction and early-curve cards. */
const FIXTURE_CARDS: ReadonlyArray<readonly [number, Partial<CardData>]> = [
  [1, { cardType: "Event", energyCost: 5, spark: null, renderedText: "Fast." }],
  [2, { energyCost: 5, spark: 4 }],
  [3, { energyCost: 4 }],
  [4, { energyCost: 4 }],
  [5, { energyCost: 3 }],
  [6, { energyCost: 3 }],
  [101, { renderedText: "Draw a card." }],
  [102, { renderedText: "Draw two cards." }],
  [103, { renderedText: "When this enters, draw a card." }],
  [201, { renderedText: "Reclaim 1." }],
  [202, { renderedText: "Return a card from your void to your hand." }],
  [301, { renderedText: "Banish an enemy." }],
  [302, { renderedText: "Prevent the next damage." }],
  [401, { energyCost: 1 }],
  [402, { energyCost: 1 }],
];

export function auguryContent(
  { cards, withDreamsigns = true }: { cards?: CardData[]; withDreamsigns?: boolean } = {},
): JourneyContent {
  const content = makeAuguryTestContent({
    cards:
      cards ??
      FIXTURE_CARDS.map(([n, overrides]) =>
        card(`71000000-0000-4000-8000-${String(n).padStart(12, "0")}`, n, overrides),
      ),
    dreamsignTemplates: withDreamsigns
      ? ["router-sign-a", "router-sign-b"].map((seed) =>
          makeAuguryTestDreamsignTemplate({ id: testDreamsignId(seed), name: seed }),
        )
      : [],
  });
  const guides = Object.entries(content.sitesData.guideAssignments).map(
    ([siteType, assignment]): DreamGuideContent => ({
      id: assignment.guideId,
      name: `Fixture ${siteType} Guide`,
      homeDreamscapeId: assignment.homeDreamscapeId,
      siteType: siteType as DreamGuideContent["siteType"],
      portraitSource: "fixture-guide.png",
      artKey: testGuideArtKey("fixture-guide"),
      headTargetX: 0.6,
      dialogue: { site: ["Fixture."], "random-site": ["Fixture."], "gamble-three-gate": ["Fixture."] },
      homeSpecialty: "Fixture specialty",
    }),
  );
  return { ...content, guides };
}

/** Every mutation is a lazily created spy, so routes may call any intent. */
export function makeMutations(): JourneyMutations {
  const spies = new Map<string, ReturnType<typeof vi.fn>>();
  return new Proxy({} as JourneyMutations, {
    get(_target, key) {
      if (typeof key !== "string" || key === "then" || key === "toJSON") return undefined;
      const spy = spies.get(key) ?? vi.fn();
      spies.set(key, spy);
      return spy;
    },
  });
}

export function makeSite(type: SiteState["type"]): SiteState {
  return { id: parseSiteId("router-site"), type, isEnhanced: false, isVisited: false };
}

export function makeStateFor(site: SiteState): JourneyState {
  const nodeId = parseAtlasNodeId("dreamscape-router");
  const base = makeAuguryTestJourneyState({
    seed: testJourneySeed("router-augury-seed"),
    essence: 180,
    deck: [1, 2, 3, 4, 5, 6].map((cardNumber) =>
      makeAuguryTestDeckEntry({ entryId: parseDeckEntryId(`router-entry-${cardNumber}`), cardNumber }),
    ),
  });
  const node = {
    id: nodeId, layer: LayerName.One, indexInLayer: 0, position: { x: 0, y: 0 },
    dreamscapeId: testDreamscapeId("test_dreamscape"), state: "available" as const,
    enhancedSiteType: null, forwardIds: [], backwardIds: [], knownDreamsignId: null,
    sites: [site],
  };
  return {
    ...base,
    currentDreamscape: nodeId,
    screen: { type: "site", siteId: site.id },
    atlas: { ...testJourneyState().atlas, startingNodeId: nodeId, nodes: { [nodeId]: node } },
  };
}

export function mountRouter(options: {
  state: JourneyState;
  journeyContent?: JourneyContent;
  query?: string;
  strict?: boolean;
}) {
  const { state, journeyContent = auguryContent(), query = "", strict = false } = options;
  const mutations = makeMutations();
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  const renderTree = (nextState: JourneyState, nextMutations: JourneyMutations) => {
    const { cardDatabase } = journeyContent;
    const value = { state: nextState, mutations: nextMutations, cardDatabase, journeyContent };
    const tree = (
      <CumulusRoot>
        <JourneyContextProvider value={value}>
          <ScreenRouter runtimeConfig={parseRuntimeConfig(query)} />
        </JourneyContextProvider>
      </CumulusRoot>
    );
    root.render(strict ? <StrictMode>{tree}</StrictMode> : tree);
  };
  act(() => renderTree(state, mutations));
  const rerender = async (nextState: JourneyState, nextMutations: JourneyMutations) => {
    await act(async () => {
      renderTree(nextState, nextMutations);
      await Promise.resolve();
    });
  };
  return { container, mutations, rerender };
}

export function click(element: Element | null | undefined): void {
  if (!(element instanceof HTMLElement)) throw new Error("expected a clickable element");
  act(() => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

export function logs(event: string) {
  return getLogEntries().filter((entry) => entry.event === event);
}

export const fixtureAvatar = (uuid: string) => ({
  id: testAvatarId(uuid), name: "Avatar Fixture", title: "Keeper of Tests",
  renderedText: "", imageNumber: "0001", startingEssence: 180,
});
