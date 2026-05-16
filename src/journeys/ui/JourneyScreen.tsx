/**
 * The Dream Journey screen.
 *
 * Owns two pieces of UI state:
 *
 *   1. The memoized journey manifest produced by `generateNextJourney`. The
 *      memo keys on the `JourneyContext` so re-renders never re-run
 *      generation, and reloading the screen against an unchanged context
 *      produces a byte-identical manifest.
 *   2. `currentNodeId` — the node the player is currently looking at when
 *      the manifest is a decision tree. Flat manifests leave this `null`.
 *      `initializeTree` runs once on mount to skip past root-level
 *      random/automatic transitions to the first player-choice frontier.
 *
 * On Enter Dream:
 *   - Flat manifests (no `manifest.tree`): call `onClose()`.
 *   - Decision-tree, player-choice branch: call `advanceTree`. If the
 *     traversal lands on a terminal, call `onClose()`. Otherwise update
 *     `currentNodeId`.
 *
 * On Close:
 *   - Disabled when `manifest.shapeId === "choose_your_loss"` (the player is
 *     committed to one of the losses and cannot bail). Always enabled in the
 *     error fallback so the player is never stuck.
 *
 * Error fallback: if `generateNextJourney` throws (validation failure or any
 * runtime issue), the screen renders a single sentence plus an enabled Close
 * button. Defensive — expected to be unreachable in practice.
 *
 * Isolation contract: imports only from `src/journeys/` plus React. The
 * adapter layer at `src/journeys/adapter/` is responsible for building the
 * `JourneyContext` this screen receives.
 */

import { useCallback, useMemo, useState } from "react";

import { applyBranch } from "../apply/applyBranch";
import { applyOption } from "../apply/applyOption";
import type { ApplyMeta } from "../apply/applyShared";
import type { JourneyMutations } from "../apply/JourneyMutations";
import type { JourneyContext } from "../journey/context";
import { generateNextJourney } from "../journey/generate";
import type {
  JourneyManifest,
  JourneyOption,
  JourneyTreeBranch,
  JourneyTreeNode,
} from "../journey/manifest";
import type { DrawContext } from "../util/rng";
import { advanceTree, initializeTree } from "../util/tree";

import { CloseButton } from "./CloseButton";
import { JourneyOptionCircle } from "./JourneyOptionCircle";
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
}

type ManifestResult =
  | { readonly ok: true; readonly manifest: JourneyManifest }
  | { readonly ok: false; readonly error: unknown };

function drawContextFor(context: JourneyContext): DrawContext {
  return {
    seed: context.state.quest.seed,
    contentVersion: context.contentVersion,
    rootJourneyIndex: 0,
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

/** The Dream Journey screen. */
export function JourneyScreen({
  context,
  onClose,
  siteId,
  mutations,
  extensionMap,
}: JourneyScreenProps) {
  const manifestResult = useMemo<ManifestResult>(() => {
    try {
      const manifest = generateNextJourney({
        context,
        drawContext: drawContextFor(context),
      });
      return { ok: true, manifest };
    } catch (error) {
      return { ok: false, error };
    }
  }, [context]);

  if (!manifestResult.ok) {
    return <JourneyErrorFallback onClose={onClose} />;
  }

  return (
    <JourneyScreenInner
      manifest={manifestResult.manifest}
      context={context}
      onClose={onClose}
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
  siteId,
  mutations,
  extensionMap,
}: {
  readonly manifest: JourneyManifest;
  readonly context: JourneyContext;
  readonly onClose: () => void;
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

  const handleEnterFlat = useCallback(
    (option: JourneyOption) => {
      // Apply the option's costs / effects through the recording mutations
      // adapter. Wave 1 always returns `{ done: true }` so the screen closes
      // on the same click; Wave 2 will short-circuit here when a chooser is
      // required and wait for the player's resolution before closing.
      const result = applyOption(option, applyMeta, context, mutations);
      if (result.done) {
        onClose();
      }
    },
    [applyMeta, context, mutations, onClose],
  );

  const handleEnterBranch = useCallback(
    (branch: JourneyTreeBranch) => {
      if (!manifest.tree) {
        onClose();
        return;
      }

      // Apply the branch's own costs / effects first. Wave 1 always returns
      // `{ done: true }`; Wave 2 will defer the tree advance when the branch
      // needs a chooser.
      const branchResult = applyBranch(branch, applyMeta, context, mutations);
      if (!branchResult.done) {
        return;
      }

      const result = advanceTree(
        manifest.tree,
        branch.id,
        manifest.precommitted,
      );

      if (result.terminal !== null) {
        // The terminal carries its own costs / effects (failure penalties,
        // claim rewards). Apply them through the same dispatch path before
        // closing — the terminal record satisfies `ApplyableBranchLike`
        // structurally so no separate entry point is needed.
        applyBranch(result.terminal, applyMeta, context, mutations);
        onClose();
        return;
      }

      if (result.nextNode === null) {
        // Branch (or downstream automatic/random transition) reached a
        // dead-end without a terminal. The screen is done.
        onClose();
        return;
      }

      setCurrentNodeId(result.nextNode.id);
    },
    [applyMeta, context, manifest, mutations, onClose],
  );

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
      return <JourneyErrorFallback onClose={onClose} />;
    }

    return (
      <JourneyChrome
        closeDisabled={closeDisabled}
        onClose={closeDisabled ? noop : onClose}
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
    return <JourneyErrorFallback onClose={onClose} />;
  }

  return (
    <JourneyChrome
      closeDisabled={closeDisabled}
      onClose={closeDisabled ? noop : onClose}
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
    </JourneyChrome>
  );
}

/** Surrounding layout: close button + content slot. */
function JourneyChrome({
  closeDisabled,
  onClose,
  children,
}: {
  readonly closeDisabled: boolean;
  readonly onClose: () => void;
  readonly children: React.ReactNode;
}) {
  return (
    <div className="relative flex min-h-full flex-col items-center px-4 py-10 md:px-8">
      <CloseButton disabled={closeDisabled} onClick={onClose} />
      {children}
    </div>
  );
}

/** Defensive fallback when generation fails. Close is always enabled here. */
function JourneyErrorFallback({ onClose }: { readonly onClose: () => void }) {
  return (
    <div className="relative flex min-h-full flex-col items-center px-4 py-10 md:px-8">
      <CloseButton disabled={false} onClick={onClose} />
      <p
        className="mt-16 text-center text-base"
        style={{ color: "#e2e8f0" }}
      >
        This dream eludes you. Press × to leave.
      </p>
    </div>
  );
}

function noop(): void {
  /* close suppressed for choose_your_loss */
}
