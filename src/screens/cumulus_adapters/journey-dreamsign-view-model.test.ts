import { setup as subtypeSetup, apply as subtypeApply, TOAD } from "../../rules/journey/journey-subtype.fixtures";
import { afterEach, describe, expect, it } from "vitest";
import { buildJourneyDreamsignView } from "./journey-dreamsign-view-model";
import { initial, apply, clear, RED, DOLL, sign } from "../../rules/journey/journey-on-gain-fixtures";
import { makeAuguryTestContent } from "../../journey_v2/testing/fixtures";
import { makeTestAtlasNode } from "../../testing/atlas-fixtures";
import { parseAtlasNodeId, parseSiteId } from "../../types/identifiers";
import { testDreamscapeId, testDreamscapeArtKey } from "../../types/test-identities";
import { artRef } from "../../cumulus/primitives/art";
import { initial as remapInitial, clear as remapClear, accepted as remapAccepted, MASK, TYPES } from "../../rules/journey/journey-type-remap-fixtures";
afterEach(() => { remapClear(); clear(); });
const fallbackId = testDreamscapeId("permission-fallback"), currentId = testDreamscapeId("permission-current");
function content() {
  const base = makeAuguryTestContent({ cards: [] }), template = base.dreamscapes[0];
  return { ...base, dreamscapes: [{ ...template, id: fallbackId, artKey: testDreamscapeArtKey("permission_fallback") }, { ...template, id: currentId, artKey: testDreamscapeArtKey("permission_current") }] };
}
describe("physical Dreamsign permission projection", () => {
  it("projects the earned subtype purpose and original source without changing the cohort", () => {
    const state = subtypeApply(subtypeSetup(), "ADD_DREAMSIGN", { dreamsignId: TOAD }).state.journey;
    const snapshot = structuredClone(state);
    expect(buildJourneyDreamsignView(state, content())).toMatchObject({ mode: "subtype", purpose: "deckSubtype", sourceDreamsignId: TOAD, heldIndex: 0, choiceIndex: 0, options: [], canContinue: false });
    expect(state).toEqual(snapshot);
  });
  it("projects the actual earned type permission and catalog types without changing it", () => {
    const state = remapAccepted(remapInitial(), "ADD_DREAMSIGN", { dreamsignId: MASK }, { seq: 41 }).journey;
    const before = structuredClone(state), result = buildJourneyDreamsignView(state, content());
    expect(result).toMatchObject({ mode: "typeRemap", sourceDreamsignId: MASK, heldIndex: 0, permissionSeq: 41, choiceIndex: 0, canContinue: false, options: [], typeOptions: TYPES });
    expect(state).toEqual(before);
  });
  it("keeps duplicate physical targets and resolves current continuation scene by UUID", () => {
    const state = apply(initial([RED, RED]), "ADD_DREAMSIGN", { dreamsignId: DOLL }).state.journey;
    const nodeId = parseAtlasNodeId("permission-node"), siteId = parseSiteId("permission-site"), node = makeTestAtlasNode(nodeId, [{ id: siteId, type: "Battle", isEnhanced: false, isVisited: false }]);
    if (state.screen.type !== "journeyDreamsign" || state.screen.choice.kind !== "copy") throw new Error("missing permission");
    state.atlas.nodes[nodeId] = { ...node, dreamscapeId: currentId };
    state.screen = { ...state.screen, choice: { ...state.screen.choice, continuation: { type: "site", siteId } } };
    const view = buildJourneyDreamsignView(state, content());
    expect(view?.scene).toEqual(artRef.dreamscapeScene(testDreamscapeArtKey("permission_current")));
    expect(view?.options.map((option) => [option.heldIndex, option.dreamsign.id])).toEqual([[0, RED], [1, RED]]);
    expect(view).toMatchObject({ sourceDreamsignId: DOLL, heldIndex: 2, mode: "copy", canContinue: false });
  });
  it("uses declared catalog atmosphere without inventing a node, and finite missing-art fallback", () => {
    const state = apply(initial([RED]), "ADD_DREAMSIGN", { dreamsignId: DOLL }).state.journey, snapshot = structuredClone(state);
    expect(buildJourneyDreamsignView(state, content())?.scene).toEqual(artRef.dreamscapeScene(testDreamscapeArtKey("permission_fallback")));
    expect(buildJourneyDreamsignView(state, { ...content(), dreamscapes: [] })?.scene).toBeNull();
    expect(state).toEqual(snapshot);
    expect(buildJourneyDreamsignView(initial().journey, content())).toBeNull();
  });
  it("projects actual earned source, cap replacements and empty-quote continuation", () => {
    const state = initial([RED]).journey;
    state.screen = { type: "journeyDreamsign", choice: { kind: "afterBattle", siteId: parseSiteId("earned-site"), sources: [{ kind: "dreamsign", dreamsignId: RED, heldIndex: 0, earnedSeq: 17, offerCount: 3, offeredDreamsigns: [sign(DOLL)], remainingPoolIds: [] }], index: 0, returnTo: "atlas" } };
    const raw = JSON.stringify(state.screen);
    const missing = { ...state, screen: { type: "journeyDreamsign" as const, choice: { ...state.screen.choice, index: 7 } } };
    expect(buildJourneyDreamsignView(missing, content())).toBeNull();
    const foreign = { ...state, screen: { type: "journeyDreamsign" as const, choice: { ...state.screen.choice, sources: [{ kind: "purge" as const, dreamsignId: RED, heldIndex: 0, maxCount: 1 }] } } };
    expect(buildJourneyDreamsignView(foreign, content())).toBeNull();
    expect(JSON.stringify(state.screen)).toBe(raw);
    const free = buildJourneyDreamsignView(state, content()); expect(free).toMatchObject({ mode: "offer", permissionSeq: 17, atCap: false, canContinue: false });
    const capped = buildJourneyDreamsignView({ ...state, maxDreamsigns: 1 }, content()); expect(capped).toMatchObject({ atCap: true, canContinue: true });
    if (state.screen.choice.kind !== "afterBattle" || state.screen.choice.sources[0].kind !== "dreamsign") throw new Error("missing earned source");
    const empty = { ...state, screen: { type: "journeyDreamsign" as const, choice: { ...state.screen.choice, sources: [{ ...state.screen.choice.sources[0], offeredDreamsigns: [] }] } } };
    expect(buildJourneyDreamsignView(empty, content())).toMatchObject({ options: [], canContinue: true });
  });
});
