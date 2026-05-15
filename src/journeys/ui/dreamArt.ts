/**
 * Browser port of the CLI dream-art matcher. Given a `JourneyManifest`, walks
 * each non-Leave option (or reward-bearing tree branch) and matches it to a
 * dream entry from the bundled art ledger, returning `{ imageId, dreamName,
 * imageUrl, rewardType, label }` for every assignment plus diagnostic flags.
 *
 * Two adaptations from the CLI (`/Users/dthurn/journeys/src/render/dreamArt.ts`):
 *
 *   1. Ledger loading is synchronous. The TOML lives at
 *      `src/journeys/data/reward-art-matches.toml` and is imported as a raw
 *      string via Vite's `?raw` query, parsed with smol-toml at module init,
 *      and cached. There is no async filesystem read.
 *
 *   2. Image URLs follow a known convention: every journey image is copied to
 *      `public/journeys/<imageId>.<ext>` by `scripts/setup-assets.mjs`. The
 *      build also writes `public/journeys/imageId-extension.json` so the
 *      runtime can resolve the per-id extension. Callers may pass an explicit
 *      `extensionMap`; otherwise the matcher falls back to a single shared
 *      default extension (`.jpg`, the on-disk format of the shutterstock
 *      cache). The UI layer is responsible for loading and supplying the
 *      extension map.
 *
 * Everything terminal-related from the CLI (sharp PNG resizing, OSC 1337
 * escapes, `supportsInlineImages`) is intentionally absent.
 *
 * Isolation contract: this module imports only from `src/journeys/` and from
 * its declared third-party deps.
 */

import { parse as parseToml } from "smol-toml";

import type {
  JourneyManifest,
  JourneyOption,
  JourneyTreeBranch,
} from "../journey/manifest";
import { REWARD_TYPE_BY_TEMPLATE_ID } from "../journey/rewardArtTypes";
import {
  drawInt,
  shuffleDeterministic,
  type DrawContext,
} from "../util/rng";

import ledgerToml from "../data/reward-art-matches.toml?raw";

/** A single ledger entry: one dream image annotated with its reward type. */
export type DreamEntry = {
  readonly imageId: string;
  readonly dreamName: string;
  readonly rewardType: string;
};

/** Per-imageId file extension as written by `scripts/setup-assets.mjs`. */
export type ExtensionMap = ReadonlyMap<string, string>;

/** Default extension for journey images when no extension map is supplied. */
const DEFAULT_IMAGE_EXTENSION = "jpg";

type LedgerToml = {
  readonly dreams?: readonly {
    readonly image_id?: unknown;
    readonly dream_name?: unknown;
    readonly reward_type?: unknown;
  }[];
};

/**
 * Parse the TOML string into a reward_type -> DreamEntry[] index. Exported so
 * tests can build small in-memory ledgers without touching the bundled one.
 */
export function parseLedgerToml(
  text: string,
): ReadonlyMap<string, readonly DreamEntry[]> {
  const parsed = parseToml(text) as LedgerToml;
  return buildLedgerIndex(extractEntries(parsed));
}

function extractEntries(parsed: LedgerToml): DreamEntry[] {
  const entries: DreamEntry[] = [];
  for (const raw of parsed.dreams ?? []) {
    if (
      typeof raw.image_id !== "string" ||
      typeof raw.dream_name !== "string" ||
      typeof raw.reward_type !== "string"
    ) {
      continue;
    }
    entries.push({
      imageId: raw.image_id,
      dreamName: raw.dream_name,
      rewardType: raw.reward_type,
    });
  }
  return entries;
}

/** Group dream entries by reward type, preserving insertion order. */
export function buildLedgerIndex(
  entries: readonly DreamEntry[],
): ReadonlyMap<string, readonly DreamEntry[]> {
  const index = new Map<string, DreamEntry[]>();
  for (const entry of entries) {
    const bucket = index.get(entry.rewardType);
    if (bucket) {
      bucket.push(entry);
    } else {
      index.set(entry.rewardType, [entry]);
    }
  }
  return index;
}

// Bundled ledger, lazily parsed on first access and cached for the lifetime of
// the module. Vite resolves `?raw` to the file's text at build time; under
// vitest it works the same way because vitest reuses Vite's transform pipeline.
let cachedBundledLedger:
  | ReadonlyMap<string, readonly DreamEntry[]>
  | undefined;

function bundledLedger(): ReadonlyMap<string, readonly DreamEntry[]> {
  if (!cachedBundledLedger) {
    cachedBundledLedger = parseLedgerToml(ledgerToml);
  }
  return cachedBundledLedger;
}

/** Test helper: clear the cached parse of the bundled ledger. */
export function _resetBundledLedgerCache(): void {
  cachedBundledLedger = undefined;
}

/** Final resolved dream art for one option or reward-bearing branch. */
export type DreamArtAssignment = {
  /** Display label, e.g. "Option 2" or "Branch level-2-take". */
  readonly label: string;
  readonly imageId: string;
  readonly dreamName: string;
  readonly rewardType: string;
  /** Public URL the browser can use to fetch the image. */
  readonly imageUrl: string;
};

/** Full output of `assignDreamArt`. */
export type DreamArtSelection = {
  readonly assignments: readonly DreamArtAssignment[];
  /**
   * Coverage gaps: reward template ids missing from the catalog, reward types
   * absent from the ledger, or ledger exhaustion. Suitable for surfacing in a
   * debug overlay; not blocking.
   */
  readonly reviewFlags: readonly string[];
  /**
   * Diagnostic notices for options/branches that had to borrow a dream from
   * outside their chosen reward type because every dream of that reward type
   * was already taken by an earlier item in the same journey. Image
   * uniqueness within the journey is still preserved.
   */
  readonly repeatFallbacks: readonly string[];
};

/** Options for `assignDreamArt`. All fields are optional. */
export type AssignDreamArtOptions = {
  /**
   * Override the bundled art ledger. Tests pass a hand-built map; runtime
   * code leaves this undefined to use the TOML shipped with the module.
   */
  readonly ledger?: ReadonlyMap<string, readonly DreamEntry[]>;
  /**
   * Map of `imageId -> file extension` (e.g. `"1234567890" -> "jpg"`). When
   * provided, image URLs use the per-id extension; otherwise the matcher
   * falls back to `DEFAULT_IMAGE_EXTENSION`. The build step writes this map
   * to `public/journeys/imageId-extension.json`.
   */
  readonly extensionMap?: ExtensionMap;
  /**
   * Override the URL prefix. Defaults to `/journeys/`. Useful for tests or
   * non-root deployments.
   */
  readonly urlPrefix?: string;
};

type OptionLike = {
  readonly label: string;
  readonly rewardTemplateIds: readonly string[];
};

function flatOptionsToConsider(manifest: JourneyManifest): OptionLike[] {
  return manifest.options
    .filter((option: JourneyOption) => option.pickBehavior !== "leave")
    .map((option) => ({
      label: `Option ${option.number}`,
      rewardTemplateIds: option.rewardTemplateIds ?? [],
    }));
}

function isLeaveBranch(branch: JourneyTreeBranch): boolean {
  if (branch.terminal?.outcome === "leave") return true;
  const trimmed = branch.text.trim();
  if (trimmed === "Leave." || trimmed === "Leave") return true;
  const label = branch.label.trim();
  return label === "Leave" || label === "Stop";
}

function treeBranchesToConsider(manifest: JourneyManifest): OptionLike[] {
  if (!manifest.tree) return [];
  const considered: OptionLike[] = [];
  for (const node of manifest.tree.nodes) {
    for (const branch of node.branches) {
      if (isLeaveBranch(branch)) continue;
      considered.push({
        label: `Branch ${branch.id}`,
        rewardTemplateIds: branch.rewardTemplateIds ?? [],
      });
    }
  }
  return considered;
}

function drawContextFor(manifest: JourneyManifest): DrawContext {
  return {
    seed: manifest.seed,
    contentVersion: manifest.versions.contentVersion,
    rootJourneyIndex: manifest.rootJourneyIndex,
  };
}

function collectUnusedDreams(
  ledger: ReadonlyMap<string, readonly DreamEntry[]>,
  usedImageIds: ReadonlySet<string>,
): DreamEntry[] {
  const out: DreamEntry[] = [];
  for (const entries of ledger.values()) {
    for (const entry of entries) {
      if (!usedImageIds.has(entry.imageId)) out.push(entry);
    }
  }
  return out;
}

function buildImageUrl(
  imageId: string,
  extensionMap: ExtensionMap | undefined,
  urlPrefix: string,
): string {
  const ext = extensionMap?.get(imageId) ?? DEFAULT_IMAGE_EXTENSION;
  return `${urlPrefix}${imageId}.${ext}`;
}

/**
 * Pick dream art for each non-Leave option / reward-bearing tree branch in
 * `manifest`. Pure function of the manifest plus the (deterministic) ledger:
 * called twice with the same arguments, returns identical assignments.
 *
 * Algorithm (ported from the CLI):
 *
 *   1. Build the candidate list. Tree manifests use every non-Leave branch;
 *      flat manifests use every non-leave option.
 *   2. Shuffle the candidates deterministically so contention for small
 *      candidate sets does not always favour option 1.
 *   3. For each candidate in shuffled order:
 *      a. If it carries no reward template ids (reward-less, e.g.
 *         `choose_your_loss` losses), borrow any unused dream from the ledger
 *         so the option still gets distinct art. No review flag is emitted
 *         because this is intended.
 *      b. Otherwise map every reward template id through
 *         `REWARD_TYPE_BY_TEMPLATE_ID`. If all map to undefined, emit a
 *         review flag and skip.
 *      c. Pick one reward type (deterministically random among the mapped
 *         set), look it up in the ledger, prefer an unused dream of that
 *         reward type, fall back to any unused dream across the ledger,
 *         record a `repeatFallbacks` notice when the fallback fires.
 *      d. Image uniqueness within the journey is enforced — no image is ever
 *         reused, even at the cost of crossing reward types.
 *   4. Restore the original (input) order before returning so the UI mapping
 *      to options/branches stays predictable.
 */
export function assignDreamArt(
  manifest: JourneyManifest,
  options: AssignDreamArtOptions = {},
): DreamArtSelection {
  const ledger = options.ledger ?? bundledLedger();
  const urlPrefix = options.urlPrefix ?? "/journeys/";
  const extensionMap = options.extensionMap;

  const considered: OptionLike[] = manifest.tree
    ? treeBranchesToConsider(manifest)
    : flatOptionsToConsider(manifest);
  if (considered.length === 0) {
    return { assignments: [], reviewFlags: [], repeatFallbacks: [] };
  }

  const draw = drawContextFor(manifest);
  const assignments: DreamArtAssignment[] = [];
  const reviewFlags: string[] = [];
  const repeatFallbacks: string[] = [];
  const usedImageIds = new Set<string>();

  const order = shuffleDeterministic(draw, "dreamArt:order", considered);

  for (const item of order) {
    if (item.rewardTemplateIds.length === 0) {
      // Reward-less options (e.g. choose_your_loss losses). Borrow any unused
      // dream so every option still gets distinct art.
      const unused = collectUnusedDreams(ledger, usedImageIds);
      if (unused.length === 0) {
        reviewFlags.push(
          `Journey ${manifest.journeyId} ${item.label}: ledger fully exhausted, no unused dream available`,
        );
        continue;
      }
      const chosen =
        unused.length === 1
          ? unused[0]
          : unused[
              drawInt(draw, `dreamArt:entry:${item.label}`, 0, unused.length - 1)
            ];
      usedImageIds.add(chosen.imageId);
      assignments.push({
        label: item.label,
        imageId: chosen.imageId,
        dreamName: chosen.dreamName,
        rewardType: chosen.rewardType,
        imageUrl: buildImageUrl(chosen.imageId, extensionMap, urlPrefix),
      });
      continue;
    }

    const rewardTypes = item.rewardTemplateIds
      .map((id) => REWARD_TYPE_BY_TEMPLATE_ID[id])
      .filter((rt): rt is string => typeof rt === "string");
    if (rewardTypes.length === 0) {
      reviewFlags.push(
        `Journey ${manifest.journeyId} ${item.label}: reward template ids not in catalog (${item.rewardTemplateIds.join(", ")})`,
      );
      continue;
    }

    const chosenRewardType =
      rewardTypes.length === 1
        ? rewardTypes[0]
        : rewardTypes[
            drawInt(
              draw,
              `dreamArt:rewardType:${item.label}`,
              0,
              rewardTypes.length - 1,
            )
          ];
    const allEntries = ledger.get(chosenRewardType) ?? [];
    if (allEntries.length === 0) {
      reviewFlags.push(
        `Journey ${manifest.journeyId} ${item.label}: no dreams in ledger for reward type "${chosenRewardType}"`,
      );
      continue;
    }

    const sameTypeUnused = allEntries.filter(
      (entry) => !usedImageIds.has(entry.imageId),
    );
    let pool: readonly DreamEntry[];
    let borrowedAcrossTypes = false;
    if (sameTypeUnused.length > 0) {
      pool = sameTypeUnused;
    } else {
      const crossTypeUnused = collectUnusedDreams(ledger, usedImageIds);
      if (crossTypeUnused.length === 0) {
        reviewFlags.push(
          `Journey ${manifest.journeyId} ${item.label}: ledger fully exhausted, no unused dream available`,
        );
        continue;
      }
      pool = crossTypeUnused;
      borrowedAcrossTypes = true;
    }

    const chosen =
      pool.length === 1
        ? pool[0]
        : pool[
            drawInt(draw, `dreamArt:entry:${item.label}`, 0, pool.length - 1)
          ];
    usedImageIds.add(chosen.imageId);
    if (borrowedAcrossTypes) {
      repeatFallbacks.push(
        `Journey ${manifest.journeyId} ${item.label}: borrowed dream "${chosen.dreamName}" (reward type "${chosen.rewardType}") — reward type "${chosenRewardType}" has only ${allEntries.length} dream(s) in the ledger`,
      );
    }
    assignments.push({
      label: item.label,
      imageId: chosen.imageId,
      dreamName: chosen.dreamName,
      rewardType: chosen.rewardType,
      imageUrl: buildImageUrl(chosen.imageId, extensionMap, urlPrefix),
    });
  }

  // Restore the original (non-shuffled) order so the visual mapping to
  // options/branches matches manifest order.
  const labelOrder = new Map(considered.map((item, index) => [item.label, index]));
  const ordered = [...assignments].sort(
    (left, right) =>
      (labelOrder.get(left.label) ?? 0) - (labelOrder.get(right.label) ?? 0),
  );

  return { assignments: ordered, reviewFlags, repeatFallbacks };
}
