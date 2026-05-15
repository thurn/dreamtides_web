// @vitest-environment jsdom

// UI tests for `JourneyScreen`.
//
// Six tests, one per non-redundant branch in the screen's state machine.
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
//   4. Tree advancement state. A regression where Enter Dream on a
//      non-terminal branch fails to update `currentNodeId` (the screen
//      either closes prematurely or rerenders the same node).
//   5. Terminal detection. A regression where Enter Dream on a branch whose
//      advancement reaches a terminal updates `currentNodeId` instead of
//      calling `onClose`.
//   6. Error handling. A regression where a thrown generator stack-traces
//      the screen instead of rendering the player-readable fallback.

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

import { JourneyScreen } from "./JourneyScreen";

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
        selectedTides: [],
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

function mount(element: ReactElement): { container: HTMLDivElement; root: Root } {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(element);
  });
  return { container, root };
}

function queryEnterDreamButtons(container: HTMLElement): HTMLButtonElement[] {
  return Array.from(container.querySelectorAll("button")).filter((button) =>
    button.textContent?.includes("Enter Dream"),
  );
}

function queryCloseButton(container: HTMLElement): HTMLButtonElement {
  const button = container.querySelector<HTMLButtonElement>(
    'button[aria-label="Close journey"]',
  );
  if (!button) throw new Error("Close button not rendered");
  return button;
}

beforeEach(() => {
  mockedGenerate.mockReset();
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("JourneyScreen", () => {
  it("renders one circle per option for a flat manifest", () => {
    mockedGenerate.mockReturnValue(makeFlatManifest(3));
    const onClose = vi.fn();

    const { container, root } = mount(
      <JourneyScreen context={dummyContext()} onClose={onClose} />,
    );

    const enterButtons = queryEnterDreamButtons(container);
    expect(enterButtons).toHaveLength(3);

    act(() => {
      root.unmount();
    });
  });

  it("disables Enter Dream for a locked option", () => {
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
      <JourneyScreen context={dummyContext()} onClose={onClose} />,
    );

    const enterButtons = queryEnterDreamButtons(container);
    expect(enterButtons).toHaveLength(2);
    expect(enterButtons[0].disabled).toBe(true);
    expect(enterButtons[1].disabled).toBe(false);

    act(() => {
      root.unmount();
    });
  });

  it("disables Close on choose_your_loss and enables it on other shapes", () => {
    const onCloseLoss = vi.fn();
    mockedGenerate.mockReturnValue(makeFlatManifest(1, "choose_your_loss"));
    const lossMount = mount(
      <JourneyScreen context={dummyContext()} onClose={onCloseLoss} />,
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
      <JourneyScreen context={dummyContext()} onClose={onCloseOther} />,
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

  it("advances currentNodeId when Enter Dream picks a non-terminal branch", () => {
    mockedGenerate.mockReturnValue(makeTwoNodeTreeManifest());
    const onClose = vi.fn();

    const { container, root } = mount(
      <JourneyScreen context={dummyContext()} onClose={onClose} />,
    );

    // Root node has two player_choice branches. After Enter Dream on the
    // non-terminal branch, the screen advances to node-2, which has a
    // single player_choice branch.
    let enterButtons = queryEnterDreamButtons(container);
    expect(enterButtons).toHaveLength(2);

    // Click the Advance branch (index 0). It points at node-2.
    act(() => {
      enterButtons[0].dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    // The screen should still be open (no terminal reached) and now render
    // exactly one branch — the single player_choice branch on node-2.
    expect(onClose).not.toHaveBeenCalled();
    enterButtons = queryEnterDreamButtons(container);
    expect(enterButtons).toHaveLength(1);

    act(() => {
      root.unmount();
    });
  });

  it("calls onClose when Enter Dream picks a terminal branch", () => {
    mockedGenerate.mockReturnValue(makeTwoNodeTreeManifest());
    const onClose = vi.fn();

    const { container, root } = mount(
      <JourneyScreen context={dummyContext()} onClose={onClose} />,
    );

    const enterButtons = queryEnterDreamButtons(container);
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

  it("renders the error fallback when generateNextJourney throws", () => {
    mockedGenerate.mockImplementation(() => {
      throw new Error("validation failure");
    });
    const onClose = vi.fn();

    const { container, root } = mount(
      <JourneyScreen context={dummyContext()} onClose={onClose} />,
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
});
