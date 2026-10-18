// @vitest-environment jsdom
// A conversation that turns a quest in for a card choice resumes at the
// choice's next node once the reward panel in front of it is done: while
// suspended it draws nothing but keeps its position.

import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { D97DialogueModule } from "../../../content/d97/dialogue/schema";
import { renderInCumulus } from "../../../cumulus/testing/render";
import { emptyCollection } from "../../../d97/collection/collection";
import type { D97DialogueContext } from "../../../d97/dialogue/conditions";
import { ANCHORS, FLAG } from "../../../d97/dialogue/dialogue.fixtures";
import { emptyQuestState } from "../../../d97/quests/quests";
import { parseD97DialogueId, parseD97DialogueNodeId } from "../../../types/identifiers";
import { D97ConversationAdapter } from "./D97ConversationAdapter";

const d97 = vi.fn(() => Promise.resolve(1));
vi.mock("../../../session/hooks", () => ({ useActions: () => ({ d97 }) }));
vi.mock("../../../logging", () => ({ logEvent: vi.fn() }));

const TURN_IN = parseD97DialogueNodeId("d97e0000-0000-4000-8000-000000000001");
const THANKS = parseD97DialogueNodeId("d97e0000-0000-4000-8000-000000000002");
const MODULE: D97DialogueModule = {
  id: parseD97DialogueId("d97e0000-0000-4000-8000-000000000010"),
  speaker: { name: "Giver", kind: "friendly" },
  entries: [{ node: TURN_IN }],
  nodes: [
    { id: TURN_IN, lines: ["Found it?"], choices: [{ label: "Here.", effect: { kind: "setFlag", flagId: FLAG, value: true }, next: THANKS }] },
    { id: THANKS, lines: ["Thank you."], choices: [] },
  ],
};

const CONTEXT: D97DialogueContext = {
  quests: emptyQuestState(),
  questCatalog: new Map(),
  flags: [],
  act: 1,
  beatenAnchorIds: [],
  collection: emptyCollection(),
  cardFacts: () => null,
};

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class { observe(): void {} unobserve(): void {} disconnect(): void {} });
});

afterEach(() => {
  d97.mockClear();
  vi.unstubAllGlobals();
});

function view(suspended: boolean) {
  return (
    <D97ConversationAdapter
      module={MODULE}
      anchorId={ANCHORS.giver}
      characterId={null}
      context={CONTEXT}
      avatars={[]}
      onChallenge={vi.fn()}
      onOpenShop={vi.fn()}
      onClose={vi.fn()}
      suspended={suspended}
    />
  );
}

describe("D97ConversationAdapter", () => {
  it("keeps its node while suspended and resumes at the chosen choice's next node", () => {
    const rendered = renderInCumulus(view(false));
    const document = rendered.container.ownerDocument;
    const node = () => document.querySelector("[data-d97-dialogue-node]")?.getAttribute("data-d97-dialogue-node") ?? null;
    expect(node()).toBe(TURN_IN);
    act(() => (document.querySelector('[data-testid="d97-dialogue-choice-0"]') as HTMLElement).click());
    expect(d97).toHaveBeenCalledTimes(1);
    rendered.rerender(view(true));
    expect(node()).toBeNull();
    rendered.rerender(view(false));
    expect(node()).toBe(THANKS);
  });
});
