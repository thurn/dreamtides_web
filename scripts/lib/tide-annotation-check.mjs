// Semantic consistency gate for tide identity annotations.
//
// The player-facing `displayName` / `displayDescription` / `shortName` of a tide
// are hand-authored and preserved across re-bakes by stable tide id, while the
// tide's card list is regenerated from draft-pick affinity on every bake. So when
// the affinity grow reshapes a tide, the label stays bolted to whatever archetype
// used to live at that id — producing blurbs that name the wrong tribe or mechanic
// (e.g. a Spirit Animal blurb on an all-Warrior deck). The freshness gates
// (check-tides4 / check-tides5) only prove the file matches a fresh bake; a WRONG
// label reproduces perfectly, so they are blind to this drift.
//
// This gate closes that gap. Each tide may carry a machine-checkable `claims`
// object — `{ tribe, mechanics }` — that the label is built around. The gate
// recomputes the tide's actual archetype signature from its current cards and
// verifies the claims still hold, so a content shift that invalidates a label
// fails loudly (re-review the label) instead of shipping silently. It also
// enforces that `displayName` is unique across tides (a duplicate name reads as
// two indistinguishable options on the player-facing tide screens).
//
// The check validates the RELATIONSHIP between a label's claims and its contents,
// never hardcoded card values — so editing a TOML never trips it on its own; only
// an archetype-level shift that leaves a label stale does.
import { readFileSync, existsSync } from "node:fs";

// Mechanic keyword -> the rules-text pattern that marks a card as expressing it.
// A claim's `mechanics` entries must each be a key here. These match Dreamtides
// rules text (dissolve = destroy, abandon = sacrifice, materialize = make token,
// figment = token, erode = mill, reclaim = flashback, ● = energy, ✦ = spark,
// ⍟ = points).
export const MECHANIC_PATTERNS = {
  abandon: /\babandon/i,
  dissolve: /\bdissolve/i,
  discard: /\bdiscard/i,
  copy: /\bcop(y|ies|ied)\b/i,
  reclaim: /\breclaim/i,
  prevent: /\b(prevent|negate|abolish|denial|deny)\b/i,
  figment: /\bfigment/i,
  ramp: /gain\s+\d*\s*●|maximum\s*●/i,
  points: /⍟/,
  recursion:
    /from your void to (play|your hand|hand)|return [^.]*from your void|materialize this character from your void/i,
  unstoppable: /\bunstoppable\b/i,
  foresee: /\bforesee\b/i,
};

// A card's tribe bucket: its subtype, or "events" for a typeless (event) card.
function bucketOf(card) {
  return typeof card.subtype === "string" && card.subtype !== ""
    ? card.subtype
    : "events";
}

/**
 * Compute a tide's archetype signature from its current cards: the count of each
 * tribe bucket (subtype or "events"), the dominant tribe and its count, and how
 * many cards express each known mechanic.
 */
export function tideSignature(tide) {
  const buckets = new Map();
  const mechanics = {};
  for (const key of Object.keys(MECHANIC_PATTERNS)) mechanics[key] = 0;
  for (const card of tide.cards ?? []) {
    const bucket = bucketOf(card);
    buckets.set(bucket, (buckets.get(bucket) ?? 0) + 1);
    const text = typeof card.text === "string" ? card.text : "";
    for (const [key, pattern] of Object.entries(MECHANIC_PATTERNS)) {
      if (pattern.test(text)) mechanics[key] += 1;
    }
  }
  let plurality = 0;
  let dominantTribe = "events";
  for (const [bucket, count] of buckets) {
    if (count > plurality) {
      plurality = count;
      dominantTribe = bucket;
    }
  }
  return { buckets, plurality, dominantTribe, mechanics };
}

/**
 * Verify one tide's `claims` against its actual contents. A tide with no `claims`
 * passes (claims are opt-in per tide). Returns `{ ok, problems }`.
 *
 * - `tribe`: the claimed bucket must hold at least `tribeRatio` of the deck's
 *   plurality (and at least `mechanicThreshold` cards) — lenient enough for a
 *   genuine two-tribe split, strict enough to catch a swapped-tribe label where
 *   the claimed tribe is essentially absent.
 * - `mechanics`: each claimed mechanic must appear in at least `mechanicThreshold`
 *   cards. The authoring threshold sits well above this, so ordinary card churn
 *   leaves margin and only an archetype-level shift trips the gate.
 */
export function checkTideClaims(
  tide,
  { mechanicThreshold = 3, tribeRatio = 0.6 } = {},
) {
  const problems = [];
  const claims = tide.claims;
  if (!claims || typeof claims !== "object") return { ok: true, problems };
  const sig = tideSignature(tide);

  if (typeof claims.tribe === "string") {
    // Two modes. A character tribe ("Warrior", "Spirit Animal", "Survivor", …) is
    // validated against the dominant CHARACTER bucket, ignoring the "events"
    // bucket — a sacrifice deck can hold more events than any single character
    // subtype yet still be a Survivor deck. "events" is validated as the overall
    // plurality, catching a character deck mislabeled as a spell deck.
    if (claims.tribe === "events") {
      const events = sig.buckets.get("events") ?? 0;
      if (events < sig.plurality) {
        problems.push(
          `claims tribe "events" but the deck's plurality type is "${sig.dominantTribe}" ` +
            `(${sig.plurality} cards vs ${events} events)`,
        );
      }
    } else {
      const claimedCount = sig.buckets.get(claims.tribe) ?? 0;
      let maxCharBucket = 0;
      let dominantChar = "events";
      for (const [bucket, count] of sig.buckets) {
        if (bucket !== "events" && count > maxCharBucket) {
          maxCharBucket = count;
          dominantChar = bucket;
        }
      }
      const floor = Math.max(mechanicThreshold, maxCharBucket * tribeRatio);
      if (claimedCount < floor) {
        problems.push(
          `claims tribe "${claims.tribe}" but only ${claimedCount} card(s) are that type ` +
            `(the dominant character type is "${dominantChar}" with ${maxCharBucket})`,
        );
      }
    }
  }

  if (claims.mechanics != null) {
    if (!Array.isArray(claims.mechanics)) {
      problems.push("`mechanics` must be an array of mechanic keys");
    } else {
      for (const mechanic of claims.mechanics) {
        const pattern = MECHANIC_PATTERNS[mechanic];
        if (!pattern) {
          problems.push(
            `claims unknown mechanic "${mechanic}" (known: ${Object.keys(MECHANIC_PATTERNS).join(", ")})`,
          );
          continue;
        }
        const count = sig.mechanics[mechanic] ?? 0;
        if (count < mechanicThreshold) {
          problems.push(
            `claims mechanic "${mechanic}" but only ${count} card(s) use it (need >= ${mechanicThreshold})`,
          );
        }
      }
    }
  }

  return { ok: problems.length === 0, problems };
}

/**
 * Check every tide annotation in a baked tides artifact (data/tides4.jsonc or
 * data/tides5.jsonc). Validates each tide's `claims` against its contents and
 * enforces `displayName` uniqueness across tides.
 *
 * @param {object} opts
 * @param {string} opts.artifactPath  absolute path to the .jsonc artifact
 * @param {boolean} [opts.requireClaims]  when true, a tide with no `claims` is a
 *   failure (used for tides4, where every tide should be anchored)
 * @returns {{ ok, artifactPath, failures, duplicateNames, missingClaims }}
 */
export function checkArtifactAnnotations({
  artifactPath,
  requireClaims = false,
  mechanicThreshold = 3,
  tribeRatio = 0.6,
}) {
  if (!existsSync(artifactPath)) {
    throw new Error(`${artifactPath} does not exist; bake it first.`);
  }
  const body = readFileSync(artifactPath, "utf8").replace(/^\s*\/\/.*$/gm, "");
  const parsed = JSON.parse(body);
  const tides = parsed.tides ?? [];

  const failures = [];
  const missingClaims = [];
  const nameToIds = new Map();

  for (const tide of tides) {
    if (typeof tide.displayName === "string" && tide.displayName !== "") {
      if (!nameToIds.has(tide.displayName)) nameToIds.set(tide.displayName, []);
      nameToIds.get(tide.displayName).push(tide.id);
    }
    if (requireClaims && (!tide.claims || typeof tide.claims !== "object")) {
      missingClaims.push(tide.id);
    }
    const result = checkTideClaims(tide, { mechanicThreshold, tribeRatio });
    if (!result.ok) {
      failures.push({
        tideId: tide.id,
        displayName: tide.displayName,
        problems: result.problems,
      });
    }
  }

  const duplicateNames = [...nameToIds.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([name, ids]) => ({ name, ids }));

  const ok =
    failures.length === 0 &&
    duplicateNames.length === 0 &&
    missingClaims.length === 0;

  return { ok, artifactPath, failures, duplicateNames, missingClaims };
}

/** The shared, actionable failure message for the CLI gate and the vitest test. */
export function formatAnnotationFailures(result) {
  const lines = [];
  lines.push("");
  lines.push(
    "════════════════════════════════════════════════════════════════════════",
  );
  lines.push("  Tide annotations are OUT OF SYNC with their deck contents.");
  lines.push(
    "════════════════════════════════════════════════════════════════════════",
  );
  lines.push("");
  lines.push(`Artifact: ${result.artifactPath}`);
  lines.push("");

  if (result.duplicateNames.length) {
    lines.push("Duplicate displayName (each must be unique across tides):");
    for (const { name, ids } of result.duplicateNames) {
      lines.push(`    • "${name}" used by: ${ids.join(", ")}`);
    }
    lines.push("");
  }

  if (result.failures.length) {
    lines.push("Label claims that no longer match the deck:");
    for (const { tideId, displayName, problems } of result.failures) {
      const label = displayName ? ` ("${displayName}")` : "";
      lines.push(`    • ${tideId}${label}:`);
      for (const problem of problems) lines.push(`        - ${problem}`);
    }
    lines.push("");
  }

  if (result.missingClaims.length) {
    lines.push("Tides with no `claims` (every tide should be anchored):");
    lines.push(`    ${result.missingClaims.join(", ")}`);
    lines.push("");
  }

  lines.push(
    "────────────────────────────────────────────────────────────────────────",
  );
  lines.push("  HOW TO FIX");
  lines.push(
    "────────────────────────────────────────────────────────────────────────",
  );
  lines.push(
    "A tide's `claims` ({ tribe, mechanics }) records the archetype its label is",
  );
  lines.push(
    "built around. This fires when the affinity grow reshaped a tide so its label",
  );
  lines.push("no longer fits. Re-pair the label to the deck:");
  lines.push("");
  lines.push(
    "  1. Inspect the tide's cards in data/tides4.jsonc (or the rendered",
  );
  lines.push("     docs/cards2/tides4_decklists.md).");
  lines.push(
    "  2. Update its displayName / displayDescription / shortName AND its `claims`",
  );
  lines.push(
    "     so both describe the deck's real dominant tribe and mechanics.",
  );
  lines.push(
    "  3. Re-bake:  npm run bake-tides4 && npm run bake-tides5 && npm run setup-assets",
  );
  lines.push("");
  lines.push(
    "The `claims` field is preserved across bakes by stable tide id, like the",
  );
  lines.push("other annotations.");
  lines.push(
    "════════════════════════════════════════════════════════════════════════",
  );
  lines.push("");
  return lines.join("\n");
}
