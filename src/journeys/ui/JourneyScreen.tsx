/**
 * The Dream Journey screen.
 *
 * Owns four pieces of UI state:
 *
 *   1. The memoized journey manifest produced by `generateNextJourney`. The
 *      memo keys on the `JourneyContext` and current reroll index so
 *      re-renders never re-run generation, reloading the screen against an
 *      unchanged context produces the initial byte-identical manifest, and
 *      pressing reroll advances to the next deterministic root journey.
 *   2. `currentNodeId` — the node the player is currently looking at when
 *      the manifest is a decision tree. Flat manifests leave this `null`.
 *      `initializeTree` runs once on mount to skip past root-level
 *      random/automatic transitions to the first player-choice frontier.
 *   3. Chooser state: the pending request plus the resolution map gathered
 *      during the active Enter Dream attempt.
 *   4. Commit target state: the option, branch, and terminal records involved
 *      in the active apply attempt, so chooser confirmation can re-enter the
 *      same apply path with the updated resolution map.
 *
 * On Enter Dream:
 *   - Flat manifests apply the selected option. If a chooser is required,
 *     the screen renders the chooser and waits to commit until confirmation.
 *   - Non-terminal tree branches apply the selected branch, then advance to
 *     the next player-choice node or close at a dead-end.
 *   - Terminal tree branches gather chooser requirements for the branch and
 *     terminal before committing either record, then commit branch and terminal
 *     in sequence and close.
 *
 * On Close:
 *   - Disabled when `manifest.shapeId === "choose_your_loss"` (the player is
 *     committed to one of the losses and cannot bail). Always enabled in the
 *     error fallback so the player is never stuck.
 *
 * On Reroll:
 *   - Increment the root journey index while keeping the same quest/content
 *     context. The inner journey body remounts so tree position and hover
 *     state restart on the fresh manifest.
 *
 * Error fallback: if `generateNextJourney` throws (validation failure or any
 * runtime issue), the screen renders a single sentence plus an enabled Close
 * button. Defensive — expected to be unreachable in practice.
 *
 * Isolation contract: imports only from `src/journeys/` plus React. The
 * adapter layer at `src/journeys/adapter/` is responsible for building the
 * `JourneyContext` this screen receives.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import { applyBranch, planBranch } from "../apply/applyBranch";
import { applyOption } from "../apply/applyOption";
import type { ApplyMeta } from "../apply/applyShared";
import type { ChooserRequest, ChooserResolution } from "../apply/chooserPlan";
import type { JourneyMutations } from "../apply/JourneyMutations";
import { logJourneyChooserCancelled } from "../logging";
import type { JourneyContext } from "../journey/context";
import {
  JourneyDebugHarnessError,
  generateNextJourneyWithDebugHarness,
  type JourneyDebugForcing,
  type JourneyDebugHarnessAttempt,
} from "../journey/debugHarness";
import {
  findDeckEntriesByPredicate,
  projectedDeckEntries,
} from "../journey/shared/deckEntries";
import type {
  JourneyManifest,
  JourneyOption,
  JourneyTreeBranch,
  JourneyTreeNode,
  JourneyTreeTerminal,
} from "../journey/manifest";
import type { DrawContext } from "../util/rng";
import { advanceTree, initializeTree } from "../util/tree";

import { CloseButton } from "./CloseButton";
import { JourneyOptionCircle } from "./JourneyOptionCircle";
import { CardChooser } from "./chooser/CardChooser";
import { DreamsignChooser } from "./chooser/DreamsignChooser";
import { TransfigurationChooser } from "./chooser/TransfigurationChooser";
import {
  assignDreamArt,
  isLeaveBranch,
  type DreamArtAssignment,
  type ExtensionMap,
} from "./dreamArt";

/** Props for `JourneyScreen`. */
export interface JourneyScreenProps {
  /** Journey context produced by the adapter layer. */
  readonly context: JourneyContext;
  /** Called to dismiss the screen and return to the site router. */
  readonly onClose: () => void;
  /**
   * The site this journey belongs to. Threaded into every `applyOption` /
   * `applyBranch` call so per-template apply logs can be tied back to the
   * originating dreamscape site.
   */
  readonly siteId: string;
  /**
   * Effect-application API. The screen calls `applyOption` / `applyBranch`
   * through this when the player picks an option (Wave 1 = synchronous,
   * Wave 2 = two-phase with choosers).
   */
  readonly mutations: JourneyMutations;
  /**
   * Optional per-id image-extension map (loaded from
   * `public/journeys/imageId-extension.json` at runtime). When absent the
   * dream-art matcher falls back to a single shared default extension.
   */
  readonly extensionMap?: ExtensionMap;
  readonly debugForcing?: JourneyDebugForcing;
}

type ManifestResult =
  | {
      readonly ok: true;
      readonly manifest: JourneyManifest;
      readonly attempts: readonly JourneyDebugHarnessAttempt[];
    }
  | { readonly ok: false; readonly error: unknown };

function drawContextForReroll(
  context: JourneyContext,
  rootJourneyIndex: number,
): DrawContext {
  return {
    seed: context.state.quest.seed,
    contentVersion: context.contentVersion,
    rootJourneyIndex,
  };
}

/** Look up an option by number; returns `null` if missing. */
function findOptionByNumber(
  manifest: JourneyManifest,
  number: number,
): JourneyOption | null {
  return manifest.options.find((option) => option.number === number) ?? null;
}

/** Look up a tree node by id; returns `null` if missing. */
function findNodeById(
  manifest: JourneyManifest,
  nodeId: string,
): JourneyTreeNode | null {
  if (!manifest.tree) return null;
  return manifest.tree.nodes.find((node) => node.id === nodeId) ?? null;
}

function indexAssignments(
  assignments: readonly DreamArtAssignment[],
): ReadonlyMap<string, DreamArtAssignment> {
  return new Map(assignments.map((assignment) => [assignment.label, assignment]));
}

type CardChooserRequest = Extract<ChooserRequest, { kind: "card" }>;
type DreamsignChooserRequest = Extract<ChooserRequest, { kind: "dreamsign" }>;

function cardRulesText(
  card: JourneyContext["content"]["cards"][number],
): string | undefined {
  const candidate =
    card.raw.rulesText ?? card.raw.renderedText ?? card.raw.text ?? card.raw.description;
  if (typeof candidate !== "string" || candidate.trim().length === 0) {
    return undefined;
  }
  return candidate.length > 160 ? `${candidate.slice(0, 157)}...` : candidate;
}

function buildCardChooserCandidates(
  request: CardChooserRequest,
  context: JourneyContext,
) {
  const cardsById = new Map(context.content.cards.map((card) => [card.id, card]));
  const starterOnly = request.deckFilter?.starterOnly === true;
  const explicitEntryIds =
    request.deckFilter?.entryIds === undefined ? null : new Set(request.deckFilter.entryIds);

  if (request.poolKind === "deck") {
    const predicateEntryIds = deckPredicateEntryIds(request, context);
    return projectedDeckEntries(context).flatMap((entry) => {
      if (
        (starterOnly && entry.card.rarity !== "Starter") ||
        (explicitEntryIds !== null && !explicitEntryIds.has(entry.entryId)) ||
        (predicateEntryIds !== null && !predicateEntryIds.has(entry.entryId))
      ) {
        return [];
      }
      return [
        {
          entryId: entry.entryId,
          cardId: entry.card.id,
          name: entry.card.name,
          rulesText: cardRulesText(entry.card),
        },
      ];
    });
  }

  const cardIds =
    request.poolKind === "rolled" && request.rolledCardIds !== undefined
      ? request.rolledCardIds
      : request.rolledCardIds ?? context.content.cards.map((card) => card.id);

  return cardIds.flatMap((cardId, index) => {
    const card = cardsById.get(cardId);
    if (!card || (starterOnly && card.rarity !== "Starter")) return [];
    return [
      {
        entryId: `${request.poolKind}:${card.id}:${String(index)}`,
        cardId: card.id,
        name: card.name,
        rulesText: cardRulesText(card),
      },
    ];
  });
}

function deckPredicateEntryIds(
  request: CardChooserRequest,
  context: JourneyContext,
): ReadonlySet<string> | null {
  const predicateId = request.deckFilter?.predicateId;
  if (request.poolKind !== "deck" || predicateId === undefined) {
    return null;
  }

  return new Set(findDeckEntriesByPredicate(context, predicateId));
}

function buildDreamsignChooserCandidates(
  request: DreamsignChooserRequest,
  context: JourneyContext,
) {
  const dreamsignsById = new Map(
    context.content.dreamsigns.map((dreamsign) => [dreamsign.id, dreamsign]),
  );

  if (request.poolKind === "active") {
    return context.state.quest.activeDreamsigns.map((entry, index) => {
      const dreamsign = dreamsignsById.get(entry.dreamsignId);
      return {
        index,
        id: entry.dreamsignId,
        name: dreamsign?.name ?? entry.dreamsignId,
        description: dreamsign?.renderedText ?? "",
      };
    });
  }

  const dreamsignIds =
    request.poolKind === "rolled" && request.rolledDreamsignIds !== undefined
      ? request.rolledDreamsignIds
      : request.rolledDreamsignIds ??
        context.state.quest.dreamsignPoolIds ??
        context.content.dreamsigns.map((dreamsign) => dreamsign.id);

  return dreamsignIds.flatMap((dreamsignId, index) => {
    const dreamsign = dreamsignsById.get(dreamsignId);
    if (!dreamsign) return [];
    return [
      {
        index,
        id: dreamsign.id,
        name: dreamsign.name,
        description: dreamsign.renderedText,
      },
    ];
  });
}

/** The Dream Journey screen. */
export function JourneyScreen({
  context,
  onClose,
  siteId,
  mutations,
  extensionMap,
  debugForcing,
}: JourneyScreenProps) {
  const [rerollIndex, setRerollIndex] = useState(0);
  const handleReroll = useCallback(() => {
    setRerollIndex((current) => current + 1);
  }, []);

  const manifestResult = useMemo<ManifestResult>(() => {
    try {
      const result = generateNextJourneyWithDebugHarness({
        context,
        drawContext: drawContextForReroll(context, rerollIndex),
        debugForcing,
      });
      return { ok: true, manifest: result.manifest, attempts: result.attempts };
    } catch (error) {
      return { ok: false, error };
    }
  }, [context, debugForcing, rerollIndex]);

  useEffect(() => {
    if (manifestResult.ok) {
      if (manifestResult.attempts.length > 0) {
        const selectedAttempt =
          manifestResult.attempts[manifestResult.attempts.length - 1];
        console.info("[journeys/debug-harness] generated forced journey", {
          debugForcing,
          journeyId: manifestResult.manifest.journeyId,
          shapeId: manifestResult.manifest.shapeId,
          selectedAttempt,
          attempts: manifestResult.attempts,
        });
      }
      return;
    }

    if (manifestResult.error instanceof JourneyDebugHarnessError) {
      console.error(manifestResult.error.message, {
        attempts: manifestResult.error.attempts,
      });
    }
  }, [debugForcing, manifestResult]);

  if (!manifestResult.ok) {
    return (
      <JourneyErrorFallback
        error={manifestResult.error}
        onClose={onClose}
        onReroll={handleReroll}
      />
    );
  }

  return (
    <JourneyScreenInner
      key={`${manifestResult.manifest.journeyId}:${manifestResult.manifest.rootJourneyIndex}`}
      manifest={manifestResult.manifest}
      context={context}
      onClose={onClose}
      onReroll={handleReroll}
      siteId={siteId}
      mutations={mutations}
      extensionMap={extensionMap}
    />
  );
}

/** Inner body that assumes a successful manifest. */
function JourneyScreenInner({
  manifest,
  context,
  onClose,
  onReroll,
  siteId,
  mutations,
  extensionMap,
}: {
  readonly manifest: JourneyManifest;
  readonly context: JourneyContext;
  readonly onClose: () => void;
  readonly onReroll: () => void;
  readonly siteId: string;
  readonly mutations: JourneyMutations;
  readonly extensionMap?: ExtensionMap;
}) {
  // Resolve the initial player-choice node for tree manifests. The traversal
  // may have to skip over a non-player-choice root (random / automatic
  // transitions), which is why we cannot just use `tree.rootNodeId` directly.
  const initialNodeId = useMemo<string | null>(() => {
    if (!manifest.tree) return null;
    const { nextNode } = initializeTree(manifest.tree, manifest.precommitted);
    return nextNode?.id ?? null;
  }, [manifest]);

  const [currentNodeId, setCurrentNodeId] = useState<string | null>(initialNodeId);
  const [hoveredOptionKey, setHoveredOptionKey] = useState<string | null>(null);
  const [resolutions, setResolutions] = useState<
    Map<string, ChooserResolution>
  >(() => new Map());
  const [pendingChooser, setPendingChooser] = useState<ChooserRequest | null>(
    null,
  );
  const [committedOption, setCommittedOption] = useState<JourneyOption | null>(
    null,
  );
  const [committedBranch, setCommittedBranch] =
    useState<JourneyTreeBranch | null>(null);
  const [committedTerminal, setCommittedTerminal] =
    useState<JourneyTreeTerminal | null>(null);

  const dreamArt = useMemo(
    () => assignDreamArt(manifest, { extensionMap }),
    [manifest, extensionMap],
  );
  const assignmentByLabel = useMemo(
    () => indexAssignments(dreamArt.assignments),
    [dreamArt.assignments],
  );

  const closeDisabled = manifest.shapeId === "choose_your_loss";

  const applyMeta = useMemo<ApplyMeta>(
    () => ({
      siteId,
      journeyId: manifest.journeyId,
      shapeId: manifest.shapeId,
    }),
    [manifest.journeyId, manifest.shapeId, siteId],
  );

  const clearCommittedApply = useCallback(() => {
    setPendingChooser(null);
    setCommittedOption(null);
    setCommittedBranch(null);
    setCommittedTerminal(null);
    setResolutions(new Map());
  }, []);

  const finishAndClose = useCallback(() => {
    clearCommittedApply();
    onClose();
  }, [clearCommittedApply, onClose]);

  const commitTerminal = useCallback(
    (
      terminal: JourneyTreeTerminal,
      resolutionMap: ReadonlyMap<string, ChooserResolution>,
    ) => {
      const terminalResult = applyBranch(
        terminal,
        applyMeta,
        context,
        mutations,
        resolutionMap,
      );
      if (!terminalResult.done) {
        setCommittedOption(null);
        setCommittedBranch(null);
        setCommittedTerminal(terminal);
        setPendingChooser(terminalResult.needsChoice);
        return;
      }
      finishAndClose();
    },
    [applyMeta, context, finishAndClose, mutations],
  );

  const planNextChoice = useCallback(
    (
      branch: JourneyTreeBranch,
      resolutionMap: ReadonlyMap<string, ChooserResolution>,
      terminal: JourneyTreeTerminal | null,
    ): boolean => {
      const branchChoice = planBranch(branch, context, resolutionMap).find(
        (request) => !resolutionMap.has(request.requestId),
      );
      if (branchChoice !== undefined) {
        setCommittedOption(null);
        setCommittedBranch(branch);
        setCommittedTerminal(terminal);
        setPendingChooser(branchChoice);
        return true;
      }

      if (terminal !== null) {
        const terminalChoice = planBranch(terminal, context, resolutionMap).find(
          (request) => !resolutionMap.has(request.requestId),
        );
        if (terminalChoice !== undefined) {
          setCommittedOption(null);
          setCommittedBranch(branch);
          setCommittedTerminal(terminal);
          setPendingChooser(terminalChoice);
          return true;
        }
      }

      return false;
    },
    [context],
  );

  const continueAfterBranchCommit = useCallback(
    (
      branch: JourneyTreeBranch,
      resolutionMap: ReadonlyMap<string, ChooserResolution>,
    ) => {
      if (!manifest.tree) {
        finishAndClose();
        return;
      }

      const result = advanceTree(
        manifest.tree,
        branch.id,
        manifest.precommitted,
      );

      if (result.terminal !== null) {
        commitTerminal(result.terminal, resolutionMap);
        return;
      }

      if (result.nextNode === null) {
        finishAndClose();
        return;
      }

      setCurrentNodeId(result.nextNode.id);
      clearCommittedApply();
    },
    [clearCommittedApply, commitTerminal, finishAndClose, manifest],
  );

  const applyOptionCommit = useCallback(
    (
      option: JourneyOption,
      resolutionMap: ReadonlyMap<string, ChooserResolution>,
    ) => {
      const result = applyOption(
        option,
        applyMeta,
        context,
        mutations,
        resolutionMap,
      );
      if (!result.done) {
        setPendingChooser(result.needsChoice);
        return;
      }
      finishAndClose();
    },
    [applyMeta, context, finishAndClose, mutations],
  );

  const applyBranchCommit = useCallback(
    (
      branch: JourneyTreeBranch,
      resolutionMap: ReadonlyMap<string, ChooserResolution>,
    ) => {
      if (manifest.tree) {
        const result = advanceTree(
          manifest.tree,
          branch.id,
          manifest.precommitted,
        );
        if (result.terminal !== null) {
          if (planNextChoice(branch, resolutionMap, result.terminal)) {
            return;
          }

          const branchResult = applyBranch(
            branch,
            applyMeta,
            context,
            mutations,
            resolutionMap,
          );
          if (!branchResult.done) {
            setPendingChooser(branchResult.needsChoice);
            return;
          }
          commitTerminal(result.terminal, resolutionMap);
          return;
        }
      }

      const branchResult = applyBranch(
        branch,
        applyMeta,
        context,
        mutations,
        resolutionMap,
      );
      if (!branchResult.done) {
        setPendingChooser(branchResult.needsChoice);
        return;
      }
      continueAfterBranchCommit(branch, resolutionMap);
    },
    [
      applyMeta,
      commitTerminal,
      context,
      continueAfterBranchCommit,
      manifest,
      mutations,
      planNextChoice,
    ],
  );

  const handleEnterFlat = useCallback(
    (option: JourneyOption) => {
      const freshResolutions = new Map<string, ChooserResolution>();
      setResolutions(freshResolutions);
      setPendingChooser(null);
      setCommittedOption(option);
      setCommittedBranch(null);
      setCommittedTerminal(null);
      applyOptionCommit(option, freshResolutions);
    },
    [applyOptionCommit],
  );

  const handleEnterBranch = useCallback(
    (branch: JourneyTreeBranch) => {
      const freshResolutions = new Map<string, ChooserResolution>();
      setResolutions(freshResolutions);
      setPendingChooser(null);
      setCommittedOption(null);
      setCommittedBranch(branch);
      setCommittedTerminal(null);
      applyBranchCommit(branch, freshResolutions);
    },
    [applyBranchCommit],
  );

  const handleChooserResolve = useCallback(
    (resolution: ChooserResolution) => {
      if (pendingChooser === null) return;
      const nextResolutions = new Map(resolutions);
      nextResolutions.set(pendingChooser.requestId, resolution);
      setResolutions(nextResolutions);

      if (committedOption !== null) {
        applyOptionCommit(committedOption, nextResolutions);
        return;
      }

      if (committedBranch !== null) {
        applyBranchCommit(committedBranch, nextResolutions);
        return;
      }

      if (committedTerminal !== null) {
        commitTerminal(committedTerminal, nextResolutions);
      }
    },
    [
      applyBranchCommit,
      applyOptionCommit,
      commitTerminal,
      committedBranch,
      committedOption,
      committedTerminal,
      pendingChooser,
      resolutions,
    ],
  );

  const handleChooserCancel = useCallback(() => {
    if (pendingChooser !== null) {
      logJourneyChooserCancelled({
        siteId,
        journeyId: manifest.journeyId,
        requestId: pendingChooser.requestId,
      });
    }
    clearCommittedApply();
  }, [clearCommittedApply, manifest.journeyId, pendingChooser, siteId]);

  const chooser =
    pendingChooser !== null ? (
      <JourneyChooser
        request={pendingChooser}
        context={context}
        onResolve={handleChooserResolve}
        onCancel={handleChooserCancel}
      />
    ) : null;

  // ---- Render branches for tree manifests ----------------------------------
  if (manifest.tree) {
    const currentNode =
      currentNodeId !== null ? findNodeById(manifest, currentNodeId) : null;
    // Drop leave-branches and non-player-choice branches: leaves are journey
    // bookkeeping (the CloseButton is the player-facing affordance), and
    // automatic/random branches are not rendered as circles.
    const branches =
      currentNode?.branches.filter(
        (branch) => branch.kind === "player_choice" && !isLeaveBranch(branch),
      ) ?? [];

    // Every rendered branch must have a dream-art assignment. A gap is an
    // invariant violation — render the error fallback instead of placeholder
    // visuals.
    const branchesHaveArt = branches.every((branch) =>
      assignmentByLabel.has(`Branch ${branch.id}`),
    );
    if (!branchesHaveArt) {
      return (
        <JourneyErrorFallback
          error={new Error("Missing Journey tree node.")}
          onClose={onClose}
          onReroll={onReroll}
        />
      );
    }

    return (
      <JourneyChrome
        closeDisabled={closeDisabled}
        onClose={closeDisabled ? noop : onClose}
        onReroll={onReroll}
      >
        <div className="flex max-w-5xl flex-wrap items-start justify-center gap-6">
          {branches.map((branch) => {
            const assignment = assignmentByLabel.get(`Branch ${branch.id}`);
            // Non-null asserted by the `branchesHaveArt` guard above; narrow
            // here so the props match the tightened circle contract.
            if (!assignment) return null;
            const key = `branch-${branch.id}`;
            return (
              <JourneyOptionCircle
                key={key}
                imageUrl={assignment.imageUrl}
                dreamName={assignment.dreamName}
                text={branch.text}
                locked={branch.locked}
                hovered={hoveredOptionKey === key}
                onMouseEnter={() => setHoveredOptionKey(key)}
                onMouseLeave={() =>
                  setHoveredOptionKey((current) => (current === key ? null : current))
                }
                onEnterDream={() => handleEnterBranch(branch)}
              />
            );
          })}
        </div>
        {chooser}
      </JourneyChrome>
    );
  }

  // ---- Render options for flat manifests -----------------------------------
  // Drop auto-leave options: every shape except `choose_your_loss` appends a
  // `pickBehavior === "leave"` option, but the CloseButton is the player's
  // leave affordance — the leave option must not render as a circle.
  const renderedOptions = manifest.options.filter(
    (option) => option.pickBehavior !== "leave",
  );

  // Every rendered option must have a dream-art assignment. A gap means the
  // ledger or matcher is out of sync with the manifest — surface the error
  // fallback instead of debug-tier placeholder visuals.
  const optionsHaveArt = renderedOptions.every((option) =>
    assignmentByLabel.has(`Option ${option.number}`),
  );
  if (!optionsHaveArt) {
    return (
      <JourneyErrorFallback
        error={new Error("Journey art assignment failed.")}
        onClose={onClose}
        onReroll={onReroll}
      />
    );
  }

  return (
    <JourneyChrome
      closeDisabled={closeDisabled}
      onClose={closeDisabled ? noop : onClose}
      onReroll={onReroll}
    >
      <div className="flex max-w-5xl flex-wrap items-start justify-center gap-6">
        {renderedOptions.map((option) => {
          const assignment = assignmentByLabel.get(`Option ${option.number}`);
          if (!assignment) return null;
          const key = `option-${String(option.number)}`;
          // Defensive: prefer the option's own number when looking up via
          // `findOptionByNumber` to keep the prop wiring symmetric with the
          // tree branch.
          const resolved =
            findOptionByNumber(manifest, option.number) ?? option;
          return (
            <JourneyOptionCircle
              key={key}
              imageUrl={assignment.imageUrl}
              dreamName={assignment.dreamName}
              text={resolved.text}
              locked={resolved.locked}
              hovered={hoveredOptionKey === key}
              onMouseEnter={() => setHoveredOptionKey(key)}
              onMouseLeave={() =>
                setHoveredOptionKey((current) => (current === key ? null : current))
              }
              onEnterDream={() => handleEnterFlat(resolved)}
            />
          );
        })}
      </div>
      {chooser}
    </JourneyChrome>
  );
}

function JourneyChooser({
  request,
  context,
  onResolve,
  onCancel,
}: {
  readonly request: ChooserRequest;
  readonly context: JourneyContext;
  readonly onResolve: (resolution: ChooserResolution) => void;
  readonly onCancel: () => void;
}) {
  switch (request.kind) {
    case "card":
      return (
        <CardChooser
          request={request}
          candidates={buildCardChooserCandidates(request, context)}
          onResolve={onResolve}
          onCancel={onCancel}
        />
      );
    case "dreamsign":
      return (
        <DreamsignChooser
          request={request}
          candidates={buildDreamsignChooserCandidates(request, context)}
          onResolve={onResolve}
          onCancel={onCancel}
        />
      );
    case "transfiguration":
      return (
        <TransfigurationChooser
          request={request}
          onResolve={onResolve}
          onCancel={onCancel}
        />
      );
  }
}

/** Surrounding layout: close button + screen heading + content slot. */
function JourneyChrome({
  closeDisabled,
  onClose,
  onReroll,
  children,
}: {
  readonly closeDisabled: boolean;
  readonly onClose: () => void;
  readonly onReroll: () => void;
  readonly children: React.ReactNode;
}) {
  return (
    <div className="relative flex min-h-full flex-col items-center px-4 py-10 md:px-8">
      <CloseButton disabled={closeDisabled} onClick={onClose} />
      <RerollButton onClick={onReroll} />
      <JourneyScreenHeading />
      {children}
    </div>
  );
}

/**
 * Primary screen heading. Sits above the dream options so the player has a
 * clear top-of-screen prompt explaining the choice they are being asked to
 * make. White text with a soft drop-shadow keeps the heading readable over
 * variable dreamscape backgrounds without introducing a heavy panel that
 * would compete visually with the option circles below.
 */
function JourneyScreenHeading() {
  // `px-16` reserves horizontal room for the absolutely-positioned close and
  // reroll buttons at `left-4` / `top-4` / `top-16`, so the heading never
  // overlaps them at narrow viewport widths.
  return (
    <h1
      className="mb-6 px-16 text-center text-2xl font-bold tracking-wide md:mb-8 md:px-4 md:text-4xl lg:text-5xl"
      style={{
        color: "#ffffff",
        textShadow:
          "0 2px 12px rgba(0, 0, 0, 0.85), 0 0 24px rgba(0, 0, 0, 0.65)",
      }}
    >
      Choose a dream to enter
    </h1>
  );
}

/** Defensive fallback when generation fails. Close is always enabled here. */
function JourneyErrorFallback({
  error,
  onClose,
  onReroll,
}: {
  readonly error: unknown;
  readonly onClose: () => void;
  readonly onReroll: () => void;
}) {
  const detail = error instanceof JourneyDebugHarnessError ? error.message : null;

  return (
    <div className="relative flex min-h-full flex-col items-center px-4 py-10 md:px-8">
      <CloseButton disabled={false} onClick={onClose} />
      <RerollButton onClick={onReroll} />
      <div className="mt-16 max-w-2xl text-center" style={{ color: "#e2e8f0" }}>
        <p className="text-base">This dream eludes you. Press × to leave.</p>
        {detail ? (
          <p
            className="mt-4 rounded border px-4 py-3 text-sm"
            style={{
              borderColor: "rgba(248, 113, 113, 0.45)",
              backgroundColor: "rgba(127, 29, 29, 0.3)",
              color: "#fecaca",
            }}
          >
            {detail}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function RerollButton({ onClick }: { readonly onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label="Reroll journey"
      title="Reroll journey"
      onClick={onClick}
      className="absolute left-4 top-16 flex h-10 w-10 items-center justify-center rounded-full text-2xl leading-none transition-opacity"
      style={{
        backgroundColor: "#4b5563",
        color: "#ffffff",
        border: "1px solid rgba(255, 255, 255, 0.15)",
        boxShadow: "0 0 10px rgba(75, 85, 99, 0.35)",
        cursor: "pointer",
      }}
    >
      <i className="bx bx-refresh" aria-hidden="true" />
    </button>
  );
}

function noop(): void {
  /* close suppressed for choose_your_loss */
}
