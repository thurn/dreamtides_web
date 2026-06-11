// @vitest-environment jsdom

// UI tests for `JourneyScreen`.
//
// Tests cover the non-redundant branches in the screen's state machine.
// Each test owns its manifest: `generateNextJourney` is mocked at the module
// boundary so tests never run the real generation pipeline (already covered
// by Phase F's `generate.test.ts` and Phase G's shape suites).
//
// Bug classes guarded against:
//
//   1. Flat-shape option rendering. A regression that breaks the per-option
//      circle mapping for flat manifests (count mismatch, key collision).
//   2. `option.locked` propagation. A regression where the screen ignores the
//      locked flag and lets the player click into an unaffordable option.
//   3. Close-button enabling. A regression in the `choose_your_loss` /
//      everything-else dispatch (close locked on the wrong shape, or
//      unlocked on `choose_your_loss`).
//   4. Tree advancement state. A regression where the dream image control on a
//      non-terminal branch fails to update `currentNodeId` (the screen
//      either closes prematurely or rerenders the same node).
//   5. Terminal detection. A regression where the dream image control on a
//      branch whose advancement reaches a terminal updates `currentNodeId`
//      instead of calling `onClose`.
//   6. Error handling. A regression where a thrown generator stack-traces
//      the screen instead of rendering the player-readable fallback.
//   7. Auto-leave filter. A regression where `pickBehavior === "leave"`
//      options leak through to the render loop and surface as extra circles
//      (every shape except `choose_your_loss` appends an auto-leave option).
//   8. Missing dream art is a hard error. A regression where a rendered
//      option without a matching dream-art assignment falls through to
//      placeholder visuals instead of the player-readable error fallback.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from "vitest";
import type { HTMLAttributes, ReactElement, ReactNode } from "react";

import * as applyBranchModule from "../apply/applyBranch";
import * as applyOptionModule from "../apply/applyOption";
import type { ChooserRequest, ChooserResolution } from "../apply/chooserPlan";
import { createRecordingMutations } from "../apply/testing/recordingMutations";
import type { Reward } from "../journey/shared/types";
import type { JourneyContext } from "../journey/context";
import {
  makeUnlockedBranch,
  makeUnlockedOption,
  type JourneyManifest,
  type JourneyOption,
  type JourneyShapeId,
  type JourneyTree,
  type JourneyTreeBranch,
  type JourneyTreeNode,
  type PrecommittedOutcomes,
} from "../journey/manifest";
import { generateNextJourney } from "../journey/generate";
import * as loggingModule from "../../logging";

import * as dreamArtModule from "./dreamArt";
import { JourneyScreen } from "./JourneyScreen";
import type { JourneyExplanation } from "./journeyExplanation";

const { stubRewards } = vi.hoisted(() => ({
  stubRewards: new Map<string, Reward>(),
}));

// Mock framer-motion so the rendered DOM matches the JSX one-to-one and we
// can query buttons without animation wrappers swallowing them. The
// `AnimatePresence` and `motion.div` mocks mirror those used by
// `DreamJourneyScreen.test.tsx`.
vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
  motion: {
    div: ({
      animate: _animate,
      children,
      exit: _exit,
      initial: _initial,
      transition: _transition,
      ...props
    }: {
      animate?: unknown;
      children: ReactNode;
      exit?: unknown;
      initial?: unknown;
      transition?: unknown;
    } & HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
  },
}));

vi.mock("../journey/generate", () => ({
  generateNextJourney: vi.fn(),
}));

vi.mock("../journey/shared/rewards", async () => {
  const actual = await vi.importActual<typeof import("../journey/shared/rewards")>(
    "../journey/shared/rewards",
  );
  return {
    ...actual,
    findReward: (id: string): Reward | undefined =>
      stubRewards.get(id) ?? actual.findReward(id),
  };
});

const mockedGenerate = generateNextJourney as unknown as Mock;

// ---- Manifest builders ----------------------------------------------------

function baseOptionFields(number: number): Omit<JourneyOption, "locked"> {
  return {
    number,
    symbols: ["reward"],
    text: `Option ${String(number)} text`,
    operations: [],
    costs: [],
    effects: [],
    burdens: [],
    targets: [],
    triggers: [],
    routeEffects: [],
    costConvertedEssence: 0,
    effectConvertedEssence: 1,
    burdenConvertedEssence: 0,
    uncertaintyConvertedEssence: 0,
    netConvertedEssence: 1,
    pickBehavior: "record_and_generate_next",
  };
}

function baseBranchFields(
  id: string,
  overrides: Partial<JourneyTreeBranch> = {},
): Omit<JourneyTreeBranch, "locked"> {
  return {
    id,
    label: id,
    kind: "player_choice",
    text: `Branch ${id} text`,
    operations: [],
    costs: [],
    effects: [],
    burdens: [],
    targets: [],
    triggers: [],
    routeEffects: [],
    costConvertedEssence: 0,
    effectConvertedEssence: 1,
    burdenConvertedEssence: 0,
    uncertaintyConvertedEssence: 0,
    netConvertedEssence: 1,
    ...overrides,
  };
}

/**
 * Build a manifest skeleton. The screen only reads the fields populated
 * here; the unused metadata (`versions`, `debug`, etc.) is cast through
 * `as`. Tests own the small set of fields they actually exercise.
 */
function manifestSkeleton(overrides: {
  readonly shapeId?: JourneyShapeId;
  readonly options?: readonly JourneyOption[];
  readonly tree?: JourneyTree;
  readonly precommitted?: PrecommittedOutcomes;
}): JourneyManifest {
  return {
    schemaVersion: 2,
    journeyId: "test-journey",
    seed: "test-seed",
    rootJourneyIndex: 0,
    shapeId: overrides.shapeId ?? "random_rewards",
    stage: "early",
    dreamscape: 0,
    selectedTags: [],
    options: overrides.options ?? [],
    generatedObjects: [],
    tree: overrides.tree,
    precommitted: overrides.precommitted ?? {},
    versions: { contentVersion: "test-content" },
    debug: {
      shapeScores: [],
      selectedShapeId: overrides.shapeId ?? "random_rewards",
      selectedTags: [],
      optionValues: [],
    },
    references: {
      cardIds: [],
      dreamsignIds: [],
      dreamcallerIds: [],
      baneNames: [],
    },
  } as unknown as JourneyManifest;
}

function makeFlatManifest(
  optionCount: number,
  shapeId: JourneyShapeId = "random_rewards",
): JourneyManifest {
  const options: JourneyOption[] = [];
  for (let index = 0; index < optionCount; index += 1) {
    options.push(makeUnlockedOption(baseOptionFields(index + 1)));
  }
  return manifestSkeleton({ shapeId, options });
}

function rewardEnvelope(
  templateId: string,
  params: Record<string, unknown> = {},
): unknown {
  return {
    kind: "shared_reward_template",
    templateId,
    params,
    text: `reward:${templateId}`,
    convertedEssence: 0,
  };
}

function cardChooserRequest(
  requestId: string,
  title = "Choose a card",
): Extract<ChooserRequest, { kind: "card" }> {
  return {
    kind: "card",
    requestId,
    poolKind: "deck",
    minPicks: 1,
    maxPicks: 1,
    title,
  };
}

function cardChooserReward(
  id: string,
  request: ChooserRequest,
  type: "Enduring" | "Amplified" = "Enduring",
): Reward<Record<string, unknown>> {
  return {
    id,
    weight: 1,
    rollParams: () => ({}),
    cec: () => 0,
    viable: () => true,
    render: () => request.title,
    choosePlan: () => request,
    apply: (_params, _ctx, mut, resolution) => {
      if (resolution?.kind !== "card") return;
      for (const entryId of resolution.entryIds) {
        mut.transfigureDeckEntry(entryId, type, `dream_journey:${id}`);
      }
    },
  };
}

function immediateEssenceReward(
  id: string,
  amount: number,
): Reward<Record<string, unknown>> {
  return {
    id,
    weight: 1,
    rollParams: () => ({}),
    cec: () => amount,
    viable: () => true,
    render: () => `Gain ${String(amount)} essence`,
    apply: (_params, _ctx, mut) => {
      mut.changeEssence(amount, `dream_journey:${id}`);
    },
  };
}

/**
 * Build a two-node tree: root has two player_choice branches, one leading
 * to a second node (also player_choice) and one terminating. Used to
 * exercise both the "advance to next node" and "advance to terminal"
 * paths.
 */
function makeTwoNodeTreeManifest(): JourneyManifest {
  const advanceBranch: JourneyTreeBranch = makeUnlockedBranch(
    baseBranchFields("branch-advance", {
      label: "Advance",
      text: "Walk deeper into the dream.",
      nextNodeId: "node-2",
    }),
  );
  const terminalBranch: JourneyTreeBranch = makeUnlockedBranch(
    baseBranchFields("branch-terminal", {
      label: "Claim",
      text: "Claim the offered prize.",
      terminal: {
        text: "You wake holding the prize.",
        outcome: "claim",
        operations: [],
        costs: [],
        effects: [],
        burdens: [],
        targets: [],
        routeEffects: [],
      },
    }),
  );

  const nestedBranch: JourneyTreeBranch = makeUnlockedBranch(
    baseBranchFields("branch-nested", {
      label: "Nested",
      text: "Step further still.",
      terminal: {
        text: "You wake unchanged.",
        outcome: "end",
        operations: [],
        costs: [],
        effects: [],
        burdens: [],
        targets: [],
        routeEffects: [],
      },
    }),
  );

  const rootNode: JourneyTreeNode = {
    id: "node-1",
    levelLabel: "Choose",
    branches: [advanceBranch, terminalBranch],
  };
  const secondNode: JourneyTreeNode = {
    id: "node-2",
    levelLabel: "Inner",
    branches: [nestedBranch],
  };

  const tree: JourneyTree = {
    rootNodeId: "node-1",
    nodes: [rootNode, secondNode],
  };

  return manifestSkeleton({
    shapeId: "push_your_luck",
    tree,
    precommitted: {},
  });
}

// ---- Test fixtures --------------------------------------------------------

function dummyContext(): JourneyContext {
  return {
    state: {
      quest: {
        seed: "test-seed",
        resources: { essence: 0, maxEssence: 0, omens: 0, dreamscape: 0 },
        deck: { entries: [], summary: { totalCards: 0, starterCards: 0, uniqueCards: 0 } },
        draftPool: [],
        activeDreamsigns: [],
        dreamsignPoolIds: [],
        banes: [],
        dreamcaller: { id: "" },
      },
    },
    content: {
      cards: [],
      dreamcallers: [],
      dreamsigns: [],
    },
    contentVersion: "test-content",
  } as JourneyContext;
}

function contextWithDeck(): JourneyContext {
  return {
    ...dummyContext(),
    state: {
      quest: {
        ...dummyContext().state.quest,
        deck: {
          entries: [
            {
              cardId: "card-a",
              copies: 1,
              entryIds: ["deck-1"],
              entryTransfigurations: [null],
            },
            {
              cardId: "card-b",
              copies: 1,
              entryIds: ["deck-2"],
              entryTransfigurations: [null],
            },
          ],
          summary: { totalCards: 2, starterCards: 2, uniqueCards: 2 },
        },
      },
    },
    content: {
      ...dummyContext().content,
      cards: [
        {
          id: "card-a",
          name: "Glimmer Knife",
          rarity: "Starter",
          cardType: "Event",
          energyCost: 1,
          spark: 1,
          cardNumber: 1,
          raw: { renderedText: "Deal 1 damage.", rulesText: "Deal 1 damage." },
        },
        {
          id: "card-b",
          name: "Amber Lantern",
          rarity: "Starter",
          cardType: "Character",
          energyCost: 1,
          spark: 1,
          cardNumber: 2,
          raw: { renderedText: "Gain 1 block.", rulesText: "Gain 1 block." },
        },
      ],
    },
  } as JourneyContext;
}

function contextWithTransfiguredDeckEntries(): JourneyContext {
  const base = contextWithDeck();
  return {
    ...base,
    state: {
      quest: {
        ...base.state.quest,
        deck: {
          entries: [
            {
              cardId: "card-a",
              copies: 2,
              entryIds: ["plain-copy", "bronze-copy"],
              entryTransfigurations: [null, "Enduring"],
            },
          ],
          summary: { totalCards: 2, starterCards: 2, uniqueCards: 1 },
        },
      },
    },
    content: {
      ...base.content,
      cards: [
        {
          id: "card-a",
          name: "Glimmer Knife",
          rarity: "Starter",
          cardType: "Event",
          energyCost: 1,
          spark: 1,
          cardNumber: 1,
          raw: {
            renderedText: "Transfigured text marker on the base card.",
            rulesText: "Transfigured text marker on the base card.",
          },
        },
      ],
    },
  } as JourneyContext;
}

const TEST_SITE_ID = "site-test";

function dummyMutations() {
  return createRecordingMutations().mut;
}

function mount(element: ReactElement): { container: HTMLDivElement; root: Root } {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(element);
  });
  return { container, root };
}

function queryDreamImageControls(container: HTMLElement): HTMLButtonElement[] {
  return Array.from(
    container.querySelectorAll<HTMLButtonElement>(
      'button[aria-label^="Enter dream:"], button[aria-label^="Locked dream:"]',
    ),
  );
}

function queryVisibleEnterDreamButtons(container: HTMLElement): HTMLButtonElement[] {
  return Array.from(container.querySelectorAll("button")).filter(
    (button) => button.textContent?.trim() === "Enter Dream",
  );
}

function queryCloseButton(container: HTMLElement): HTMLButtonElement {
  const button = container.querySelector<HTMLButtonElement>(
    'button[aria-label="Close journey"]',
  );
  if (!button) throw new Error("Close button not rendered");
  return button;
}

function queryRerollButton(container: HTMLElement): HTMLButtonElement {
  const button = container.querySelector<HTMLButtonElement>(
    'button[aria-label="Reroll journey"]',
  );
  if (!button) throw new Error("Reroll button not rendered");
  return button;
}

function getButtonByText(container: HTMLElement, text: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll("button")).find((candidate) =>
    candidate.textContent?.includes(text),
  );
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Button not found: ${text}`);
  }
  return button;
}

function queryChooser(container: HTMLElement): HTMLElement | null {
  return container.querySelector('[role="dialog"]');
}

beforeEach(() => {
  mockedGenerate.mockReset();
  stubRewards.clear();
});

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("JourneyScreen", () => {
  it("renders the primary 'Choose a dream to enter' heading above the options", () => {
    mockedGenerate.mockReturnValue(makeFlatManifest(3));
    const onClose = vi.fn();

    const { container, root } = mount(
      <JourneyScreen
        context={dummyContext()}
        onClose={onClose}
        siteId={TEST_SITE_ID}
        mutations={dummyMutations()}
      />,
    );

    const heading = container.querySelector("h1");
    if (heading === null) throw new Error("Heading not rendered");
    expect(heading.textContent).toBe("Choose a dream to enter");

    // The heading must precede the option circles in the rendered DOM order
    // so it reads as a top-of-screen header rather than a caption beneath
    // the choices.
    const firstImageControl = container.querySelector<HTMLButtonElement>(
      'button[aria-label^="Enter dream:"], button[aria-label^="Locked dream:"]',
    );
    if (firstImageControl === null) {
      throw new Error("Expected at least one option circle to be rendered");
    }
    expect(
      heading.compareDocumentPosition(firstImageControl) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeGreaterThan(0);

    act(() => {
      root.unmount();
    });
  });

  it("renders one circle per option for a flat manifest", () => {
    mockedGenerate.mockReturnValue(makeFlatManifest(3));
    const onClose = vi.fn();

    const { container, root } = mount(
      <JourneyScreen
        context={dummyContext()}
        onClose={onClose}
        siteId={TEST_SITE_ID}
        mutations={dummyMutations()}
      />,
    );

    const enterButtons = queryDreamImageControls(container);
    expect(enterButtons).toHaveLength(3);
    expect(queryVisibleEnterDreamButtons(container)).toHaveLength(0);

    const optionImages = Array.from(container.querySelectorAll("img"));
    expect(optionImages).toHaveLength(3);
    for (const image of optionImages) {
      expect(image.parentElement?.className).toContain("h-64");
      expect(image.parentElement?.className).toContain("w-64");
    }

    act(() => {
      root.unmount();
    });
  });

  it("publishes a structured journey explanation for the active manifest", () => {
    const option = makeUnlockedOption({
      ...baseOptionFields(1),
      text: "Pay essence for a reward.",
      costs: [
        {
          kind: "shared_cost_template",
          templateId: "pay_essence",
          text: "Pay 25 essence",
          convertedEssence: 25,
        },
      ],
      effects: [
        {
          kind: "shared_reward_template",
          templateId: "gain_essence",
          text: "Gain 80 essence",
          convertedEssence: 80,
        },
      ],
      costConvertedEssence: 25,
      effectConvertedEssence: 80,
      netConvertedEssence: 55,
    });
    mockedGenerate.mockReturnValue(
      manifestSkeleton({
        shapeId: "single_offer",
        options: [option],
      }),
    );
    const onExplanationChange = vi.fn<
      (explanation: JourneyExplanation | null) => void
    >();

    const { root } = mount(
      <JourneyScreen
        context={dummyContext()}
        onClose={vi.fn()}
        siteId={TEST_SITE_ID}
        mutations={dummyMutations()}
        onExplanationChange={onExplanationChange}
      />,
    );

    const explanation = onExplanationChange.mock.calls.find(
      (call) => call[0] !== null,
    )?.[0];
    expect(explanation?.shapeId).toBe("single_offer");
    expect(explanation?.shapeLabel).toBe("Single offer");
    expect(explanation?.progress.detail).toContain("1 visible choices");
    expect(explanation?.choices[0]?.cec).toEqual({
      cost: 25,
      reward: 80,
      burden: 0,
      uncertainty: 0,
      net: 55,
    });
    expect(explanation?.choices[0]?.costs[0]?.label).toBe("Pay 25 essence");
    expect(explanation?.choices[0]?.rewards[0]?.label).toBe("Gain 80 essence");

    act(() => {
      root.unmount();
    });
    expect(onExplanationChange).toHaveBeenLastCalledWith(null);
  });

  it("keeps dream names off the option row while preserving accessible labels and hover headings", () => {
    mockedGenerate.mockReturnValue(makeFlatManifest(3));
    const onClose = vi.fn();

    const { container, root } = mount(
      <JourneyScreen
        context={dummyContext()}
        onClose={onClose}
        siteId={TEST_SITE_ID}
        mutations={dummyMutations()}
      />,
    );

    const imageControls = queryDreamImageControls(container);
    expect(imageControls).toHaveLength(3);
    const firstLabel = imageControls[0].getAttribute("aria-label");
    expect(firstLabel).toMatch(/^Enter dream: .+/);
    const firstDreamName = firstLabel?.replace("Enter dream: ", "") ?? "";
    expect(firstDreamName.length).toBeGreaterThan(0);
    expect(container.textContent).not.toContain(firstDreamName);

    act(() => {
      imageControls[0].dispatchEvent(
        new MouseEvent("mouseover", { bubbles: true }),
      );
    });

    expect(container.querySelector('[role="tooltip"]')?.textContent).toContain(
      firstDreamName,
    );

    act(() => {
      root.unmount();
    });
  });

  it("rerolls with the same context and the next root journey index", () => {
    mockedGenerate
      .mockReturnValueOnce(makeFlatManifest(1))
      .mockReturnValueOnce(makeFlatManifest(2));
    const context = dummyContext();
    const onClose = vi.fn();

    const { container, root } = mount(
      <JourneyScreen
        context={context}
        onClose={onClose}
        siteId={TEST_SITE_ID}
        mutations={dummyMutations()}
      />,
    );

    expect(queryDreamImageControls(container)).toHaveLength(1);
    expect(mockedGenerate.mock.calls[0]?.[0]).toMatchObject({
      context,
      drawContext: {
        seed: "test-seed",
        contentVersion: "test-content",
        rootJourneyIndex: 0,
      },
    });

    const reroll = queryRerollButton(container);
    expect(reroll.className).toContain("h-10");
    expect(reroll.className).toContain("w-10");

    act(() => {
      reroll.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(queryDreamImageControls(container)).toHaveLength(2);
    expect(mockedGenerate.mock.calls[1]?.[0]).toMatchObject({
      context,
      drawContext: {
        seed: "test-seed",
        contentVersion: "test-content",
        rootJourneyIndex: 1,
      },
    });

    act(() => {
      root.unmount();
    });
  });

  it("marks locked image controls unavailable and keeps them inert", () => {
    const lockedManifest = manifestSkeleton({
      shapeId: "random_rewards",
      options: [
        makeUnlockedOption({ ...baseOptionFields(1), locked: true }),
        makeUnlockedOption(baseOptionFields(2)),
      ],
    });
    mockedGenerate.mockReturnValue(lockedManifest);
    const onClose = vi.fn();

    const { container, root } = mount(
      <JourneyScreen
        context={dummyContext()}
        onClose={onClose}
        siteId={TEST_SITE_ID}
        mutations={dummyMutations()}
      />,
    );

    const enterButtons = queryDreamImageControls(container);
    expect(enterButtons).toHaveLength(2);
    const lockedControl = enterButtons.find((button) =>
      button.getAttribute("aria-label")?.startsWith("Locked dream:"),
    );
    const enabledControl = enterButtons.find((button) =>
      button.getAttribute("aria-label")?.startsWith("Enter dream:"),
    );
    expect(lockedControl).toBeDefined();
    expect(enabledControl).toBeDefined();
    expect(lockedControl?.getAttribute("aria-disabled")).toBe("true");
    expect(lockedControl?.style.cursor).toBe("not-allowed");
    expect(enabledControl?.getAttribute("aria-disabled")).toBeNull();
    expect(queryVisibleEnterDreamButtons(container)).toHaveLength(0);

    act(() => {
      lockedControl?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onClose).not.toHaveBeenCalled();

    act(() => {
      root.unmount();
    });
  });

  it("disables Close on choose_your_loss and enables it on other shapes", () => {
    const onCloseLoss = vi.fn();
    mockedGenerate.mockReturnValue(makeFlatManifest(1, "choose_your_loss"));
    const lossMount = mount(
      <JourneyScreen
        context={dummyContext()}
        onClose={onCloseLoss}
        siteId={TEST_SITE_ID}
        mutations={dummyMutations()}
      />,
    );
    const lossClose = queryCloseButton(lossMount.container);
    expect(lossClose.disabled).toBe(true);

    act(() => {
      lossClose.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onCloseLoss).not.toHaveBeenCalled();

    act(() => {
      lossMount.root.unmount();
    });

    const onCloseOther = vi.fn();
    mockedGenerate.mockReturnValue(makeFlatManifest(1, "random_rewards"));
    const otherMount = mount(
      <JourneyScreen
        context={dummyContext()}
        onClose={onCloseOther}
        siteId={TEST_SITE_ID}
        mutations={dummyMutations()}
      />,
    );
    const otherClose = queryCloseButton(otherMount.container);
    expect(otherClose.disabled).toBe(false);

    act(() => {
      otherClose.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onCloseOther).toHaveBeenCalledTimes(1);

    act(() => {
      otherMount.root.unmount();
    });
  });

  it("advances currentNodeId when the image control picks a non-terminal branch", () => {
    mockedGenerate.mockReturnValue(makeTwoNodeTreeManifest());
    const onClose = vi.fn();

    const { container, root } = mount(
      <JourneyScreen
        context={dummyContext()}
        onClose={onClose}
        siteId={TEST_SITE_ID}
        mutations={dummyMutations()}
      />,
    );

    // Root node has two player_choice branches. After the image control on the
    // non-terminal branch, the screen advances to node-2, which has a
    // single player_choice branch.
    let enterButtons = queryDreamImageControls(container);
    expect(enterButtons).toHaveLength(2);

    // Click the Advance branch (index 0). It points at node-2.
    act(() => {
      enterButtons[0].dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    // The screen should still be open (no terminal reached) and now render
    // exactly one branch — the single player_choice branch on node-2.
    expect(onClose).not.toHaveBeenCalled();
    enterButtons = queryDreamImageControls(container);
    expect(enterButtons).toHaveLength(1);

    act(() => {
      root.unmount();
    });
  });

  it("updates the journey explanation progress as tree journeys advance", () => {
    mockedGenerate.mockReturnValue(makeTwoNodeTreeManifest());
    const onExplanationChange = vi.fn<
      (explanation: JourneyExplanation | null) => void
    >();

    const { container, root } = mount(
      <JourneyScreen
        context={dummyContext()}
        onClose={vi.fn()}
        siteId={TEST_SITE_ID}
        mutations={dummyMutations()}
        onExplanationChange={onExplanationChange}
      />,
    );

    expect(
      onExplanationChange.mock.calls.find((call) => call[0] !== null)?.[0]
        ?.progress.detail,
    ).toContain("node-1");

    const enterButtons = queryDreamImageControls(container);
    act(() => {
      enterButtons[0].dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const explanationCalls = onExplanationChange.mock.calls
      .map((call) => call[0])
      .filter((entry): entry is JourneyExplanation => entry !== null);
    const latestExplanation = explanationCalls[explanationCalls.length - 1];
    expect(latestExplanation?.progress.detail).toContain("node-2");
    expect(latestExplanation?.choices).toHaveLength(1);

    act(() => {
      root.unmount();
    });
  });

  it("calls onClose when the image control picks a terminal branch", () => {
    mockedGenerate.mockReturnValue(makeTwoNodeTreeManifest());
    const onClose = vi.fn();

    const { container, root } = mount(
      <JourneyScreen
        context={dummyContext()}
        onClose={onClose}
        siteId={TEST_SITE_ID}
        mutations={dummyMutations()}
      />,
    );

    const enterButtons = queryDreamImageControls(container);
    expect(enterButtons).toHaveLength(2);

    // Click the Claim branch (index 1) — it carries a terminal so the
    // screen should close.
    act(() => {
      enterButtons[1].dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onClose).toHaveBeenCalledTimes(1);

    act(() => {
      root.unmount();
    });
  });

  it("filters auto-leave options out of the flat render loop", () => {
    // Three real options plus the auto-leave option appended by every shape
    // except `choose_your_loss`. Render must show three circles, not four.
    const leaveOption = makeUnlockedOption({
      ...baseOptionFields(4),
      pickBehavior: "leave",
    });
    const manifest = manifestSkeleton({
      shapeId: "random_rewards",
      options: [
        makeUnlockedOption(baseOptionFields(1)),
        makeUnlockedOption(baseOptionFields(2)),
        makeUnlockedOption(baseOptionFields(3)),
        leaveOption,
      ],
    });
    mockedGenerate.mockReturnValue(manifest);
    const onClose = vi.fn();

    const { container, root } = mount(
      <JourneyScreen
        context={dummyContext()}
        onClose={onClose}
        siteId={TEST_SITE_ID}
        mutations={dummyMutations()}
      />,
    );

    // CloseButton is also a <button>, so filter to dream image controls only.
    const enterButtons = queryDreamImageControls(container);
    expect(enterButtons).toHaveLength(3);

    act(() => {
      root.unmount();
    });
  });

  it("renders the error fallback when a rendered option has no dream art", () => {
    mockedGenerate.mockReturnValue(makeFlatManifest(2));
    // Force the matcher to return zero assignments so the render path sees a
    // gap for every rendered option. The screen must surface the player-
    // readable fallback rather than placeholder visuals.
    const assignSpy = vi
      .spyOn(dreamArtModule, "assignDreamArt")
      .mockReturnValue({
        assignments: [],
        reviewFlags: [],
        repeatFallbacks: [],
      });

    const onClose = vi.fn();
    const { container, root } = mount(
      <JourneyScreen
        context={dummyContext()}
        onClose={onClose}
        siteId={TEST_SITE_ID}
        mutations={dummyMutations()}
      />,
    );

    expect(container.textContent).toContain(
      "This dream eludes you. Press × to leave.",
    );
    // No dream image controls rendered in the fallback.
    expect(queryDreamImageControls(container)).toHaveLength(0);
    // CloseButton is still enabled so the player is never stuck.
    expect(queryCloseButton(container).disabled).toBe(false);

    act(() => {
      root.unmount();
    });
    assignSpy.mockRestore();
  });

  it("renders the error fallback when generateNextJourney throws", () => {
    mockedGenerate.mockImplementation(() => {
      throw new Error("validation failure");
    });
    const onClose = vi.fn();

    const { container, root } = mount(
      <JourneyScreen
        context={dummyContext()}
        onClose={onClose}
        siteId={TEST_SITE_ID}
        mutations={dummyMutations()}
      />,
    );

    expect(container.textContent).toContain(
      "This dream eludes you. Press × to leave.",
    );
    const close = queryCloseButton(container);
    expect(close.disabled).toBe(false);

    act(() => {
      close.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);

    act(() => {
      root.unmount();
    });
  });

  it("renders the debug harness failure detail when a forced id is invalid", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { container, root } = mount(
      <JourneyScreen
        context={dummyContext()}
        onClose={vi.fn()}
        siteId={TEST_SITE_ID}
        mutations={dummyMutations()}
        debugForcing={{ rewardTemplateId: "missing_reward" }}
      />,
    );

    expect(container.textContent).toContain("Invalid debugJourneyReward");
    expect(container.textContent).toContain("missing_reward");
    expect(queryDreamImageControls(container)).toHaveLength(0);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("missing_reward"),
      expect.objectContaining({ attempts: [] }),
    );

    act(() => {
      root.unmount();
    });
    errorSpy.mockRestore();
  });

  // ---- Apply dispatch wiring ---------------------------------------------
  //
  // These three tests pin the contract that the dream image control dispatches
  // through the apply pass. They spy on `applyOption` /
  // `applyBranch` at the module boundary rather than asserting against the
  // recording mutations directly — at this point in Wave 1 the per-template
  // `apply` methods are still stubs, so a recording double would observe
  // zero calls regardless of whether dispatch is wired correctly.

  it("calls applyOption with screen meta and closes after a flat image control click", () => {
    const manifest = makeFlatManifest(1);
    mockedGenerate.mockReturnValue(manifest);
    const onClose = vi.fn();
    const mut = createRecordingMutations().mut;
    const applySpy = vi
      .spyOn(applyOptionModule, "applyOption")
      .mockReturnValue({ done: true });

    const { container, root } = mount(
      <JourneyScreen
        context={dummyContext()}
        onClose={onClose}
        siteId={TEST_SITE_ID}
        mutations={mut}
      />,
    );

    const enterButtons = queryDreamImageControls(container);
    expect(enterButtons).toHaveLength(1);

    act(() => {
      enterButtons[0].dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(applySpy).toHaveBeenCalledTimes(1);
    const [option, meta, ctxArg, mutArg] = applySpy.mock.calls[0];
    expect(option).toBe(manifest.options[0]);
    expect(meta).toEqual({
      siteId: TEST_SITE_ID,
      journeyId: manifest.journeyId,
      shapeId: manifest.shapeId,
    });
    expect(ctxArg).toBeDefined();
    expect(mutArg).toBe(mut);
    expect(onClose).toHaveBeenCalledTimes(1);

    act(() => {
      root.unmount();
    });
    applySpy.mockRestore();
  });

  it("mounts a card chooser without mutating when a flat option needs a choice", () => {
    const templateId = "choose_card_then_transfigure";
    const request = cardChooserRequest("1:choose_card_then_transfigure:0");
    stubRewards.set(templateId, cardChooserReward(templateId, request));
    const manifest = manifestSkeleton({
      options: [
        makeUnlockedOption({
          ...baseOptionFields(1),
          effects: [rewardEnvelope(templateId)],
        }),
      ],
    });
    mockedGenerate.mockReturnValue(manifest);
    const onClose = vi.fn();
    const { mut, calls } = createRecordingMutations();
    const applySpy = vi.spyOn(applyOptionModule, "applyOption");

    const { container, root } = mount(
      <JourneyScreen
        context={contextWithDeck()}
        onClose={onClose}
        siteId={TEST_SITE_ID}
        mutations={mut}
      />,
    );

    act(() => {
      queryDreamImageControls(container)[0].dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });

    expect(queryChooser(container)?.textContent).toContain("Choose a card");
    expect(calls).toEqual([]);
    expect(onClose).not.toHaveBeenCalled();
    expect(applySpy.mock.calls[0][4]).toBeInstanceOf(Map);
    expect((applySpy.mock.calls[0][4] as Map<string, ChooserResolution>).size).toBe(0);

    act(() => {
      root.unmount();
    });
  });

  it("filters deck chooser card candidates by predicateId", () => {
    const templateId = "choose_event_card";
    const request: ChooserRequest = {
      ...cardChooserRequest("1:choose_event_card:0"),
      deckFilter: { predicateId: "events" },
    };
    stubRewards.set(templateId, cardChooserReward(templateId, request));
    mockedGenerate.mockReturnValue(
      manifestSkeleton({
        options: [
          makeUnlockedOption({
            ...baseOptionFields(1),
            effects: [rewardEnvelope(templateId)],
          }),
        ],
      }),
    );
    const { mut } = createRecordingMutations();

    const { container, root } = mount(
      <JourneyScreen
        context={contextWithDeck()}
        onClose={vi.fn()}
        siteId={TEST_SITE_ID}
        mutations={mut}
      />,
    );

    act(() => {
      queryDreamImageControls(container)[0].dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });

    expect(queryChooser(container)?.textContent).toContain("Glimmer Knife");
    expect(queryChooser(container)?.textContent).not.toContain("Amber Lantern");

    act(() => {
      root.unmount();
    });
  });

  it("filters deck chooser card candidates by explicit entry ids", () => {
    const templateId = "choose_exact_entry_card";
    const request: ChooserRequest = {
      ...cardChooserRequest("1:choose_exact_entry_card:0"),
      deckFilter: { entryIds: ["deck-2"] },
    };
    stubRewards.set(templateId, cardChooserReward(templateId, request));
    mockedGenerate.mockReturnValue(
      manifestSkeleton({
        options: [
          makeUnlockedOption({
            ...baseOptionFields(1),
            effects: [rewardEnvelope(templateId)],
          }),
        ],
      }),
    );
    const { mut } = createRecordingMutations();

    const { container, root } = mount(
      <JourneyScreen
        context={contextWithDeck()}
        onClose={vi.fn()}
        siteId={TEST_SITE_ID}
        mutations={mut}
      />,
    );

    act(() => {
      queryDreamImageControls(container)[0].dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });

    expect(queryChooser(container)?.textContent).not.toContain("Glimmer Knife");
    expect(queryChooser(container)?.textContent).toContain("Amber Lantern");

    act(() => {
      root.unmount();
    });
  });

  it("filters transfigured deck chooser candidates by deck entry state", () => {
    const templateId = "choose_transfigured_card";
    const request: ChooserRequest = {
      ...cardChooserRequest("1:choose_transfigured_card:0"),
      deckFilter: { predicateId: "transfigured" },
    };
    stubRewards.set(templateId, cardChooserReward(templateId, request));
    mockedGenerate.mockReturnValue(
      manifestSkeleton({
        options: [
          makeUnlockedOption({
            ...baseOptionFields(1),
            effects: [rewardEnvelope(templateId)],
          }),
        ],
      }),
    );
    const { mut, calls } = createRecordingMutations();

    const { container, root } = mount(
      <JourneyScreen
        context={contextWithTransfiguredDeckEntries()}
        onClose={vi.fn()}
        siteId={TEST_SITE_ID}
        mutations={mut}
      />,
    );

    act(() => {
      queryDreamImageControls(container)[0].dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });

    const chooserButtons = Array.from(
      queryChooser(container)?.querySelectorAll("button[aria-pressed]") ?? [],
    );
    expect(chooserButtons).toHaveLength(1);
    act(() => {
      getButtonByText(container, "Glimmer Knife").dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });
    act(() => {
      getButtonByText(container, "Confirm").dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });
    expect(calls).toEqual([
      {
        method: "transfigureDeckEntry",
        args: ["bronze-copy", "Enduring", "dream_journey:choose_transfigured_card"],
      },
    ]);

    act(() => {
      root.unmount();
    });
  });

  it("confirms a flat chooser, commits mutations, unmounts the overlay, and closes", () => {
    const templateId = "choose_card_then_transfigure";
    const request = cardChooserRequest("1:choose_card_then_transfigure:0");
    stubRewards.set(templateId, cardChooserReward(templateId, request));
    mockedGenerate.mockReturnValue(
      manifestSkeleton({
        options: [
          makeUnlockedOption({
            ...baseOptionFields(1),
            effects: [rewardEnvelope(templateId)],
          }),
        ],
      }),
    );
    const onClose = vi.fn();
    const { mut, calls } = createRecordingMutations();

    const { container, root } = mount(
      <JourneyScreen
        context={contextWithDeck()}
        onClose={onClose}
        siteId={TEST_SITE_ID}
        mutations={mut}
      />,
    );

    act(() => {
      queryDreamImageControls(container)[0].dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });
    act(() => {
      getButtonByText(container, "Glimmer Knife").dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });
    act(() => {
      getButtonByText(container, "Confirm").dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });

    expect(queryChooser(container)).toBeNull();
    expect(calls).toEqual([
      {
        method: "transfigureDeckEntry",
        args: [
          "deck-1",
          "Enduring",
          "dream_journey:choose_card_then_transfigure",
        ],
      },
    ]);
    expect(onClose).toHaveBeenCalledTimes(1);

    act(() => {
      root.unmount();
    });
  });

  it("cancels a chooser without mutating and re-enters with a fresh resolutions map", () => {
    const templateId = "choose_card_then_transfigure";
    const request = cardChooserRequest("1:choose_card_then_transfigure:0");
    stubRewards.set(templateId, cardChooserReward(templateId, request));
    mockedGenerate.mockReturnValue(
      manifestSkeleton({
        options: [
          makeUnlockedOption({
            ...baseOptionFields(1),
            effects: [rewardEnvelope(templateId)],
          }),
        ],
      }),
    );
    const onClose = vi.fn();
    const { mut, calls } = createRecordingMutations();
    const applySpy = vi.spyOn(applyOptionModule, "applyOption");
    const logSpy = vi
      .spyOn(loggingModule, "logEvent")
      .mockImplementation(() => ({ event: "", seq: 0, timestamp: "" }) as never);

    const { container, root } = mount(
      <JourneyScreen
        context={contextWithDeck()}
        onClose={onClose}
        siteId={TEST_SITE_ID}
        mutations={mut}
      />,
    );

    act(() => {
      queryDreamImageControls(container)[0].dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });
    const firstMap = applySpy.mock.calls[0][4] as Map<string, ChooserResolution>;
    act(() => {
      getButtonByText(container, "Cancel").dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });

    expect(queryChooser(container)).toBeNull();
    expect(queryDreamImageControls(container)).toHaveLength(1);
    expect(calls).toEqual([]);
    expect(onClose).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith("dream_journey_chooser_cancelled", {
      siteId: TEST_SITE_ID,
      journeyId: "test-journey",
      requestId: request.requestId,
    });

    act(() => {
      queryDreamImageControls(container)[0].dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });
    const secondMap = applySpy.mock.calls[1][4] as Map<string, ChooserResolution>;

    expect(queryChooser(container)?.textContent).toContain("Choose a card");
    expect(secondMap).toBeInstanceOf(Map);
    expect(secondMap).not.toBe(firstMap);
    expect(secondMap.size).toBe(0);
    expect(calls).toEqual([]);

    act(() => {
      root.unmount();
    });
  });

  it("progresses sequential flat choosers before applying mutations", () => {
    const firstTemplateId = "choose_first_card";
    const secondTemplateId = "choose_second_card";
    stubRewards.set(
      firstTemplateId,
      cardChooserReward(
        firstTemplateId,
        cardChooserRequest("1:choose_first_card:0", "Choose first card"),
        "Enduring",
      ),
    );
    stubRewards.set(
      secondTemplateId,
      cardChooserReward(
        secondTemplateId,
        cardChooserRequest("1:choose_second_card:0", "Choose second card"),
        "Amplified",
      ),
    );
    mockedGenerate.mockReturnValue(
      manifestSkeleton({
        options: [
          makeUnlockedOption({
            ...baseOptionFields(1),
            effects: [
              rewardEnvelope(firstTemplateId),
              rewardEnvelope(secondTemplateId),
            ],
          }),
        ],
      }),
    );
    const onClose = vi.fn();
    const { mut, calls } = createRecordingMutations();

    const { container, root } = mount(
      <JourneyScreen
        context={contextWithDeck()}
        onClose={onClose}
        siteId={TEST_SITE_ID}
        mutations={mut}
      />,
    );

    act(() => {
      queryDreamImageControls(container)[0].dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });
    expect(queryChooser(container)?.textContent).toContain("Choose first card");
    act(() => {
      getButtonByText(container, "Glimmer Knife").dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });
    act(() => {
      getButtonByText(container, "Confirm").dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });

    expect(queryChooser(container)?.textContent).toContain("Choose second card");
    expect(calls).toEqual([]);
    act(() => {
      getButtonByText(container, "Amber Lantern").dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });
    act(() => {
      getButtonByText(container, "Confirm").dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });

    expect(queryChooser(container)).toBeNull();
    expect(calls).toEqual([
      {
        method: "transfigureDeckEntry",
        args: ["deck-1", "Enduring", "dream_journey:choose_first_card"],
      },
      {
        method: "transfigureDeckEntry",
        args: ["deck-2", "Amplified", "dream_journey:choose_second_card"],
      },
    ]);
    expect(onClose).toHaveBeenCalledTimes(1);

    act(() => {
      root.unmount();
    });
  });

  it("mounts and confirms a branch-path chooser before advancing the tree", () => {
    const templateId = "branch_choose_card";
    stubRewards.set(
      templateId,
      cardChooserReward(
        templateId,
        cardChooserRequest("branch-advance:branch_choose_card:0"),
      ),
    );
    const manifest = makeTwoNodeTreeManifest();
    const rootNode = manifest.tree?.nodes.find((node) => node.id === "node-1");
    const advanceBranch = rootNode?.branches[0];
    if (!advanceBranch) throw new Error("missing advance branch");
    advanceBranch.effects = [rewardEnvelope(templateId)];
    mockedGenerate.mockReturnValue(manifest);
    const onClose = vi.fn();
    const { mut, calls } = createRecordingMutations();

    const { container, root } = mount(
      <JourneyScreen
        context={contextWithDeck()}
        onClose={onClose}
        siteId={TEST_SITE_ID}
        mutations={mut}
      />,
    );

    act(() => {
      queryDreamImageControls(container)[0].dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });
    expect(queryChooser(container)?.textContent).toContain("Choose a card");
    expect(calls).toEqual([]);

    act(() => {
      getButtonByText(container, "Glimmer Knife").dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });
    act(() => {
      getButtonByText(container, "Confirm").dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });

    expect(queryChooser(container)).toBeNull();
    expect(calls).toEqual([
      {
        method: "transfigureDeckEntry",
        args: ["deck-1", "Enduring", "dream_journey:branch_choose_card"],
      },
    ]);
    expect(onClose).not.toHaveBeenCalled();
    expect(queryDreamImageControls(container)).toHaveLength(1);

    act(() => {
      root.unmount();
    });
  });

  it("mounts and confirms a terminal chooser before closing", () => {
    const templateId = "terminal_choose_card";
    stubRewards.set(
      templateId,
      cardChooserReward(
        templateId,
        cardChooserRequest("terminal:terminal_choose_card:0"),
      ),
    );
    const manifest = makeTwoNodeTreeManifest();
    const rootNode = manifest.tree?.nodes.find((node) => node.id === "node-1");
    const terminalBranch = rootNode?.branches[1];
    if (!terminalBranch?.terminal) throw new Error("missing terminal branch");
    terminalBranch.terminal.effects = [rewardEnvelope(templateId)];
    mockedGenerate.mockReturnValue(manifest);
    const onClose = vi.fn();
    const { mut, calls } = createRecordingMutations();

    const { container, root } = mount(
      <JourneyScreen
        context={contextWithDeck()}
        onClose={onClose}
        siteId={TEST_SITE_ID}
        mutations={mut}
      />,
    );

    act(() => {
      queryDreamImageControls(container)[1].dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });
    expect(queryChooser(container)?.textContent).toContain("Choose a card");
    expect(calls).toEqual([]);
    expect(onClose).not.toHaveBeenCalled();

    act(() => {
      getButtonByText(container, "Glimmer Knife").dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });
    act(() => {
      getButtonByText(container, "Confirm").dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });

    expect(queryChooser(container)).toBeNull();
    expect(calls).toEqual([
      {
        method: "transfigureDeckEntry",
        args: ["deck-1", "Enduring", "dream_journey:terminal_choose_card"],
      },
    ]);
    expect(onClose).toHaveBeenCalledTimes(1);

    act(() => {
      root.unmount();
    });
  });

  it("cancels a terminal chooser without committing branch mutations, then retries once", () => {
    const branchTemplateId = "branch_gain_essence";
    const terminalTemplateId = "terminal_choose_card";
    stubRewards.set(branchTemplateId, immediateEssenceReward(branchTemplateId, 7));
    stubRewards.set(
      terminalTemplateId,
      cardChooserReward(
        terminalTemplateId,
        cardChooserRequest("terminal:terminal_choose_card:0"),
      ),
    );
    const manifest = makeTwoNodeTreeManifest();
    const rootNode = manifest.tree?.nodes.find((node) => node.id === "node-1");
    const terminalBranch = rootNode?.branches[1];
    if (!terminalBranch?.terminal) throw new Error("missing terminal branch");
    terminalBranch.effects = [rewardEnvelope(branchTemplateId)];
    terminalBranch.terminal.effects = [rewardEnvelope(terminalTemplateId)];
    mockedGenerate.mockReturnValue(manifest);
    const onClose = vi.fn();
    const { mut, calls } = createRecordingMutations();

    const { container, root } = mount(
      <JourneyScreen
        context={contextWithDeck()}
        onClose={onClose}
        siteId={TEST_SITE_ID}
        mutations={mut}
      />,
    );

    act(() => {
      queryDreamImageControls(container)[1].dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });
    expect(queryChooser(container)?.textContent).toContain("Choose a card");
    act(() => {
      getButtonByText(container, "Cancel").dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });

    expect(queryChooser(container)).toBeNull();
    expect(queryDreamImageControls(container)).toHaveLength(2);
    expect(calls).toEqual([]);
    expect(onClose).not.toHaveBeenCalled();

    act(() => {
      queryDreamImageControls(container)[1].dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });
    act(() => {
      getButtonByText(container, "Glimmer Knife").dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });
    act(() => {
      getButtonByText(container, "Confirm").dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });

    expect(calls).toEqual([
      {
        method: "changeEssence",
        args: [7, "dream_journey:branch_gain_essence"],
      },
      {
        method: "transfigureDeckEntry",
        args: ["deck-1", "Enduring", "dream_journey:terminal_choose_card"],
      },
    ]);
    expect(onClose).toHaveBeenCalledTimes(1);

    act(() => {
      root.unmount();
    });
  });

  it("calls applyBranch on the chosen branch and advances when not terminal", () => {
    const manifest = makeTwoNodeTreeManifest();
    mockedGenerate.mockReturnValue(manifest);
    const onClose = vi.fn();
    const mut = createRecordingMutations().mut;
    const branchSpy = vi
      .spyOn(applyBranchModule, "applyBranch")
      .mockReturnValue({ done: true });

    const { container, root } = mount(
      <JourneyScreen
        context={dummyContext()}
        onClose={onClose}
        siteId={TEST_SITE_ID}
        mutations={mut}
      />,
    );

    const enterButtons = queryDreamImageControls(container);
    expect(enterButtons).toHaveLength(2);

    // Index 0 is the Advance branch (non-terminal, points at node-2).
    act(() => {
      enterButtons[0].dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(branchSpy).toHaveBeenCalledTimes(1);
    const [branchArg, metaArg] = branchSpy.mock.calls[0];
    // The first branch on the root node is the Advance branch.
    const rootNode = manifest.tree?.nodes.find((node) => node.id === "node-1");
    expect(branchArg).toBe(rootNode?.branches[0]);
    expect(metaArg).toEqual({
      siteId: TEST_SITE_ID,
      journeyId: manifest.journeyId,
      shapeId: manifest.shapeId,
    });
    expect(onClose).not.toHaveBeenCalled();
    // Screen advanced — node-2 has a single player_choice branch.
    expect(queryDreamImageControls(container)).toHaveLength(1);

    act(() => {
      root.unmount();
    });
    branchSpy.mockRestore();
  });

  it("applies the terminal then closes when a branch reaches a terminal", () => {
    const manifest = makeTwoNodeTreeManifest();
    mockedGenerate.mockReturnValue(manifest);
    const onClose = vi.fn();
    const mut = createRecordingMutations().mut;
    const branchSpy = vi
      .spyOn(applyBranchModule, "applyBranch")
      .mockReturnValue({ done: true });

    const { container, root } = mount(
      <JourneyScreen
        context={dummyContext()}
        onClose={onClose}
        siteId={TEST_SITE_ID}
        mutations={mut}
      />,
    );

    const enterButtons = queryDreamImageControls(container);
    expect(enterButtons).toHaveLength(2);

    // Index 1 is the Claim branch — it carries an inline terminal.
    act(() => {
      enterButtons[1].dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    // Two apply calls: one for the chosen branch, one for the terminal the
    // branch resolves into.
    expect(branchSpy).toHaveBeenCalledTimes(2);
    const rootNode = manifest.tree?.nodes.find((node) => node.id === "node-1");
    const claimBranch = rootNode?.branches[1];
    expect(branchSpy.mock.calls[0][0]).toBe(claimBranch);
    // The second call is on the terminal record itself.
    expect(branchSpy.mock.calls[1][0]).toBe(claimBranch?.terminal);
    expect(onClose).toHaveBeenCalledTimes(1);

    act(() => {
      root.unmount();
    });
    branchSpy.mockRestore();
  });
});
