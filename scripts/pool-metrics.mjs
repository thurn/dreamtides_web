// Evaluate the draft pools an algorithm generates against three target metrics,
// all measured on the SAME real-draft simulation: every Dreamcaller (all 32,
// each with its FULL signature) over many seeds. Neutral Dreamcallers (no
// signature) contribute their unsteered pools at their natural roster rate, so
// the aggregate reflects what players actually draft -- nothing is omitted or
// re-weighted. Each generated pool is one sample.
//
//   --metric adequacy    (default)  build-around support adequacy
//   --metric traps                  trap-card frequency
//   --metric diversity              card-utilization + theme spread
//   --metric dreamcaller            does the pool match its Dreamcaller's theme?
//   --compare                       run the chosen metric across every algorithm
//
// The four metrics answer four different questions about a pool generator:
//
// 1) ADEQUACY -- when a build-around payoff is in a pool, does the pool carry
//    enough of the support it references? A *build-around* (catalogued in
//    docs/cards2/buildarounds.md) does little on its own; it only becomes good
//    once the pool supplies its supporting pieces -- a tribe, a repeatable
//    action, or a board/void state. The headline is the mean adequacy over every
//    payoff instance, where adequacy = min(1, supportShare / demandTarget).
//
// 2) TRAPS -- how many cards in a pool are a *trap* to take: a build-around the
//    pool cannot support, so a player who picks it is stuck. A mean (adequacy)
//    washes traps out -- a pool with 50 supported payoffs and 3 dead traps still
//    averages ~94 -- so this reports a COUNT/RATE instead. Each payoff card
//    collapses to one adequacy = the MAX over its needed themes (a card is only a
//    trap if even its best-supportable theme is unsupported); the card is flagged
//    when that best adequacy < tau.
//
// 3) DIVERSITY -- an algorithm-level property of the whole run, not of one pool:
//    does the generator spread its output, or collapse onto the same few pools
//    every time? Two pillars:
//      A) Card utilization -- across all generated pools, do the draftable cards
//         appear at a fairly even rate, or do a handful of cards show up in every
//         pool while most never appear? Reported as coverage (fraction of the
//         draftable universe ever used), a normalized-entropy evenness score
//         (1 = perfectly even), plus the dead cards (never appear) and ubiquitous
//         cards (in nearly every pool).
//      B) Theme spread -- across the run, is each standalone archetype DRAFTABLE
//         at a healthy rate, or do pools only ever support the same one or two?
//         For each pool, a standalone theme is "buildable" when the pool carries
//         a payoff for it AND enough support to build around it (support share >=
//         `--buildable-share`). Reported as each archetype's buildable rate plus
//         the evenness of those rates -- collapse onto one archetype shows up as
//         low evenness, while a theme that is supported in every pool (e.g.
//         abandon) correctly reads as highly buildable rather than being hidden.
//         Only the standalone themes (see STANDALONE_THEMES) are scored this way;
//         the remaining (supporting) themes are tracked separately by how often
//         they show up at a useful support level, because a rich pool still wants
//         them present even though they are never a pool's whole identity.
//    The diversity headline blends the card-utilization and theme-spread evenness
//    scores.
//
// 4) DREAMCALLER -- does each pool actually deliver the theme its Dreamcaller was
//    built to play? Adequacy is theme-agnostic: a flawless abandon pool scores a
//    perfect adequacy even for a warrior Dreamcaller, because it only asks whether
//    the build-arounds that happened to land are supported. This metric instead
//    scores every pool against ITS OWN Dreamcaller's archetype, learned from the
//    decklist corpus: a card belongs to the archetype when it shows high lift and
//    presence in the real decks built around the Dreamcaller's signature (see the
//    metric configuration below). A theme whose learned support set is large
//    enough to fill the target share of a pool is "big5" and scored on density
//    toward that target; a smaller one rides a tempo/removal shell and is scored
//    on full-playset completeness instead. The headline is the mean per-pool
//    score over every learnable Dreamcaller. Dreamcallers with no signature, or
//    with too few signature decks to trust, are reported cold-start and skipped.
//
// The support classification lives in data/buildaround_support.json: per card,
// `needs` (themes it is a build-around payoff for, each with a demand tier 1/2/3)
// and `supports` (themes it provides support for). It was produced by a
// first-principles read of every card's printed text.
//
// Scoring of adequacy (one-sided -- only under-support is penalized):
//   payoff instance = (build-around card present in a pool, one theme it needs)
//   share    = supportCopies(theme) / poolSize     (the payoff's own copies are
//              excluded from its support tally)
//   target   = TIER_TARGET[tier]
//   adequacy = min(1, share / target)              in [0, 1]
//   headline = mean(adequacy) over all payoff instances, x100  (per-instance)
//
// Usage:
//   node scripts/pool-metrics.mjs                    # adequacy
//   node scripts/pool-metrics.mjs --metric traps
//   node scripts/pool-metrics.mjs --metric diversity
//   node scripts/pool-metrics.mjs --metric dreamcaller
//   node scripts/pool-metrics.mjs --metric dreamcaller --compare
//   node scripts/pool-metrics.mjs --compare          # all algos
//   node scripts/pool-metrics.mjs --metric diversity --compare
//   node scripts/pool-metrics.mjs --themes all       # adequacy only
//   node scripts/pool-metrics.mjs --seeds 500
//   node scripts/pool-metrics.mjs --variant idf4
//   node scripts/pool-metrics.mjs --dreamcaller "Kell Tarn"
//   node scripts/pool-metrics.mjs --json > result.json
// Shared flags: --seeds, --variant, --pool-size, --dreamcaller, --top, --json.
// Metric flags: --themes short|all (adequacy), --trap-tau N (traps),
//   --standalone-themes a,b,c / --buildable-share N / --present-share N /
//   --ubiquity N (diversity), --dc-lift N / --dc-presence N / --dc-target N
//   (dreamcaller).
// `--traps` is a back-compat alias for `--metric traps`.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { existsSync } from "node:fs";
import {
  buildPoolData,
  deserializeCorpus,
  generatePoolFromData,
  POOL_VARIANT_IDS,
  validateTideDecks,
  validateTideRelationships,
} from "../src/draft/pool/index.ts";
import { stripJsonComments, supportEntryByName } from "./lib/card-refs.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (p) => JSON.parse(readFileSync(resolve(ROOT, p), "utf8"));
// The committed embedding is JSONC (provenance header over JSON).
const readJsonc = (p) =>
  JSON.parse(stripJsonComments(readFileSync(resolve(ROOT, p), "utf8")));

// Demand-tier -> target support share (fraction of the whole pool, in copies).
// One tunable block. Anchored to the user's warrior example: a "+1 for each
// allied warrior" payoff wants ~3-4 warriors on board -> ~25% of the pool warrior
// (tier 3). Tier 2 is a repeated action / 2-3 threshold; tier 1 needs a single
// partner. Recalibrate here after reading the real numbers below.
export const TIER_TARGET = { 1: 0.1, 2: 0.18, 3: 0.25 };

// Matches src/data/quest-content.ts (POOL_TARGET_SIZE) so simulated pools are the
// size the game actually ships. Overridable with `--pool-size N` to study how the
// pool's size trades off against the metrics.
const POOL_TARGET_SIZE = 200;
const DEFAULT_SEEDS = 200;
// `--compare` runs every algorithm, so it defaults to far fewer seeds to keep the
// whole sweep tractable; override with `--seeds`.
const DEFAULT_COMPARE_SEEDS = 25;
const DEFAULT_TOP = 20;
// Default trap threshold: a payoff whose best-supportable theme sits under 35%
// of its demand target is a trap (picking it leaves the player stuck).
const DEFAULT_TRAP_TAU = 0.35;
// Diversity defaults: a standalone archetype is "buildable" in a pool once its
// support reaches this share (and a payoff is present) -- anchored to the tier-2
// demand target, i.e. enough support to actually build around; a supporting
// theme counts as merely "present" at a lower share; a card is "ubiquitous" once
// it appears in this fraction of pools.
const DEFAULT_BUILDABLE_SHARE = 0.18;
const DEFAULT_PRESENT_SHARE = 0.05;
const DEFAULT_UBIQUITY = 0.9;

// The standalone themes: the archetypes a pool can actually be built *around*.
// A pool's dominant theme is chosen from this set; the remaining metadata themes
// are supporting-only (they enable these archetypes but are never a pool's whole
// identity). Overridable with `--standalone-themes a,b,c`. `--themes short`
// (adequacy) scores exactly this focused set.
export const STANDALONE_THEMES = new Set([
  "survivors",
  "spirit-animals",
  "discard",
  "warriors",
  "abandon",
]);

// --- Dreamcaller-support metric configuration (label-free) ------------------
//
// The dreamcaller metric asks a different question from adequacy: not "are the
// build-arounds that happened to land in the pool supported?" but "does the pool
// actually carry the theme this Dreamcaller was built to play?" Adequacy is
// theme-agnostic (a flawless abandon pool scores perfectly for a warrior
// Dreamcaller); this metric scores each pool against its own Dreamcaller's
// archetype, so an off-theme pool fails no matter how internally coherent.
//
// The archetype is learned from the decklist corpus, calibrated entirely around
// each Dreamcaller's signature cards -- no hand labels:
//
//   1. A "signature deck" is a real decklist that runs at least DC_SIGNATURE_K
//      of the Dreamcaller's signature cards: a deck a player actually built
//      around this Dreamcaller's identity.
//   2. A card's LIFT is how much more often it appears in the signature decks
//      than in the corpus at large: P(card | signature deck) / P(card). Lift > 1
//      means the card belongs to what players actually play alongside the
//      signature; goodstuff that shows up everywhere lands at lift ~1 and is
//      excluded for free.
//   3. The ARCHETYPE-SUPPORT SET is the binary membership: cards with
//      lift >= DC_LIFT and presence (P(card | signature deck)) >= DC_PRESENCE.
//   4. A theme whose support set is large enough that a 2-of playset would fill
//      at least DC_TARGET of a pool is "big5" -- scored on on-theme density,
//      support-set copies / pool size ramped toward DC_TARGET. A smaller one
//      rides a tempo/removal shell and is scored on full-playset completeness:
//      the fraction of its support set present as a 2-of.
//
// Defaults below were verified across every canonical big-5 Dreamcaller, not
// just the tightest one. At presence 0.15, 14/15 big-5 signatures surface a
// support set large enough that a 50% pool share is reachable (median ceiling
// ~70%), so the size-derived big5/small classification agrees the canonical big
// 5 are big5 -- no hardcoded taxonomy needed. (Presence 0.20, tuned only on the
// unusually-concentrated spirit-animals signature, was too strict: it left ~half
// the big 5 unable to reach 50%. Presence 0.12 is too loose -- it pulls ~half
// the format into the survivors set.) Every counted card still clears the lift
// gate, so loosening presence widens recall without admitting true goodstuff
// (which sits at lift ~1).
export const DC_SIGNATURE_K = 2; // min signature cards for a deck to count
export const DC_LIFT = 1.3; // min lift to count as archetype support
export const DC_PRESENCE = 0.15; // min P(card | signature deck) to count
export const DC_TARGET = 0.5; // desired on-theme share of the pool
// A Dreamcaller with fewer signature decks than this has too little corpus
// evidence for a trustworthy support set; it is reported as cold-start and left
// out of the headline rather than scored against a noisy membership.
export const DC_MIN_DECKS = 30;
// A small theme wants a full set: this many copies (the pool-wide cap) of every
// card of the theme. Completeness = fraction of the theme's cards present at this
// many copies.
export const SMALL_THEME_COPIES = 2;

/**
 * The dominant theme a Dreamcaller's signature steers toward: the theme cited
 * most often across the signature cards' own `supports`/`needs`. This is the
 * Dreamcaller's intended build-around identity, read straight off the signature
 * (not from whatever incidental support share the grown pool ends up with).
 * Returns null for a neutral Dreamcaller (no signature, or none of its signature
 * cards carry a theme tag).
 */
export function dominantSignatureTheme(signatureCards, meta) {
  const tally = new Map();
  for (const name of signatureCards ?? []) {
    const entry = supportEntryByName(meta, name);
    if (!entry) continue;
    for (const t of entry.supports ?? []) tally.set(t, (tally.get(t) ?? 0) + 1);
    for (const n of entry.needs ?? []) tally.set(n.theme, (tally.get(n.theme) ?? 0) + 1);
  }
  let best = null;
  let bestCount = 0;
  for (const [t, c] of tally) {
    if (c > bestCount) {
      best = t;
      bestCount = c;
    }
  }
  return best;
}

const cap = (c) => Math.min(2, c);

/** Total copies in a pool (each card capped at 2). */
function poolSizeOf(counts) {
  let size = 0;
  for (const c of counts.values()) size += cap(c);
  return size;
}

/** Gross support copies available per theme across the whole pool (no self exclusion). */
function supportCopiesByTheme(counts, meta) {
  const supportCopies = new Map();
  for (const [name, raw] of counts) {
    const entry = supportEntryByName(meta, name);
    if (!entry) continue;
    const copies = cap(raw);
    for (const theme of entry.supports ?? []) {
      supportCopies.set(theme, (supportCopies.get(theme) ?? 0) + copies);
    }
  }
  return supportCopies;
}

/**
 * Score one generated pool against the support metadata. Returns one record per
 * *payoff instance*: a build-around present in the pool, for each theme it needs.
 *
 * @param counts Map<cardName, copies> (a 2-of is capped at 2 copies).
 * @param meta   { cards: Record<cardId,{name,needs,supports}>, themes };
 *   entries are looked up by current card name via `supportEntryByName`.
 * @param tierTarget tier -> target support share.
 * @param allowedThemes optional Set; when given, only emit instances whose theme
 *   is in it (support copies are still counted across every theme).
 */
export function scorePool(
  counts,
  meta,
  tierTarget = TIER_TARGET,
  allowedThemes = null,
) {
  const size = poolSizeOf(counts);
  const supportCopies = supportCopiesByTheme(counts, meta);

  const instances = [];
  if (size === 0) return instances;
  for (const [name, raw] of counts) {
    const entry = supportEntryByName(meta, name);
    if (!entry || !(entry.needs ?? []).length) continue;
    const copies = cap(raw);
    for (const need of entry.needs) {
      if (allowedThemes && !allowedThemes.has(need.theme)) continue;
      const target = tierTarget[need.tier];
      // Exclude the payoff's own copies, so a lone lord isn't self-supported.
      const self = (entry.supports ?? []).includes(need.theme) ? copies : 0;
      const sc = (supportCopies.get(need.theme) ?? 0) - self;
      const share = sc / size;
      const adequacy = target > 0 ? Math.min(1, share / target) : 1;
      instances.push({
        payoff: name,
        theme: need.theme,
        tier: need.tier,
        supportCopies: sc,
        poolSize: size,
        share,
        adequacy,
      });
    }
  }
  return instances;
}

/**
 * Collapse a pool's payoff instances to one adequacy per *card*: the MAX over
 * the themes that card needs (its best-supportable theme). A card is only a trap
 * if even its best theme is unsupported, so the max is the right collapse.
 *
 * @returns Map<cardName, bestAdequacy in [0,1]>.
 */
export function cardBestAdequacies(
  counts,
  meta,
  tierTarget = TIER_TARGET,
  allowedThemes = null,
) {
  const byCard = new Map();
  for (const inst of scorePool(counts, meta, tierTarget, allowedThemes)) {
    byCard.set(
      inst.payoff,
      Math.max(byCard.get(inst.payoff) ?? 0, inst.adequacy),
    );
  }
  return byCard;
}

/**
 * The payoff cards in a pool that are traps: their best-supportable theme is
 * still under `tau`. Built on top of `cardBestAdequacies`.
 *
 * @returns string[] of trap card names.
 */
export function trapCards(
  counts,
  meta,
  tierTarget = TIER_TARGET,
  tau = DEFAULT_TRAP_TAU,
  allowedThemes = null,
) {
  const traps = [];
  for (const [card, best] of cardBestAdequacies(
    counts,
    meta,
    tierTarget,
    allowedThemes,
  )) {
    if (best < tau) traps.push(card);
  }
  return traps;
}

// --- Diversity helpers (pure, unit-tested) ----------------------------------

/**
 * Per-theme support share in one pool: supportCopies(theme) / poolSize. This is
 * the gross share (no payoff self-exclusion); it measures how saturated the pool
 * is with each theme's support, which is what a pool's identity rides on.
 *
 * @returns Map<theme, share in [0,1]>.
 */
export function poolSupportShares(counts, meta) {
  const size = poolSizeOf(counts);
  const shares = new Map();
  if (size === 0) return shares;
  for (const [theme, copies] of supportCopiesByTheme(counts, meta)) {
    shares.set(theme, copies / size);
  }
  return shares;
}

/**
 * The themes a pool carries at least one build-around payoff for. A pool can
 * only be "about" a standalone archetype if it actually contains a payoff that
 * cares about it, so this set (intersected with the standalone themes) is the
 * candidate set for the pool's dominant theme.
 *
 * @returns Set<theme>.
 */
export function poolPayoffThemes(counts, meta) {
  const themes = new Set();
  for (const [name] of counts) {
    const entry = supportEntryByName(meta, name);
    if (!entry) continue;
    for (const need of entry.needs ?? []) themes.add(need.theme);
  }
  return themes;
}

/**
 * The standalone archetypes a pool can actually be drafted into: those the pool
 * carries a payoff for AND supports densely enough to build around (support share
 * >= `buildableShare`). This measures archetype *availability*, not which single
 * theme is most distinctive -- so a theme that is well supported in nearly every
 * pool (e.g. abandon, whose support is pervasive) correctly reads as broadly
 * buildable instead of being hidden behind a flashier tribe's spike.
 *
 * @param counts   Map<cardName, copies>.
 * @param meta     build-around support metadata.
 * @param standaloneThemes iterable of the standalone archetype themes.
 * @param buildableShare minimum support share to count as buildable.
 * @returns Set<theme> of the buildable standalone archetypes.
 */
export function buildableThemes(
  counts,
  meta,
  standaloneThemes,
  buildableShare = DEFAULT_BUILDABLE_SHARE,
) {
  const shares = poolSupportShares(counts, meta);
  const payoffs = poolPayoffThemes(counts, meta);
  const out = new Set();
  for (const t of standaloneThemes) {
    if (payoffs.has(t) && (shares.get(t) ?? 0) >= buildableShare) out.add(t);
  }
  return out;
}

/**
 * Normalized Shannon entropy of a non-negative distribution, in [0,1]. 1 means
 * perfectly even across `categories`; 0 means all mass on one category. Pass
 * `categories` >= values.length to fold absent categories (dead cards / themes
 * that never dominate) into the normalizer, so they lower the evenness.
 */
export function normalizedEntropy(values, categories = values.length) {
  let total = 0;
  for (const v of values) if (v > 0) total += v;
  if (total <= 0 || categories <= 1) return 0;
  let h = 0;
  for (const v of values) {
    if (v <= 0) continue;
    const p = v / total;
    h -= p * Math.log(p);
  }
  return h / Math.log(categories);
}

/**
 * Gini coefficient of a non-negative distribution, in [0,1]. 0 = perfectly even,
 * 1 = maximally concentrated. Reported alongside entropy as a second read on how
 * lopsided card utilization is.
 */
export function giniCoefficient(values) {
  const xs = values.filter((v) => v >= 0).sort((a, b) => a - b);
  const n = xs.length;
  let sum = 0;
  for (const v of xs) sum += v;
  if (n === 0 || sum === 0) return 0;
  let cum = 0;
  for (let i = 0; i < n; i++) cum += (i + 1) * xs[i];
  return (2 * cum) / (n * sum) - (n + 1) / n;
}

/**
 * The draftable card universe: every card name any variant can pull into a pool,
 * unioned across the generator's input lists. The denominator for utilization
 * coverage, and the set whose never-appearing members are "dead" cards.
 */
export function draftableUniverse(poolData) {
  const universe = new Set();
  for (const name of poolData.core ?? []) universe.add(name);
  for (const set of (poolData.archLists ?? new Map()).values()) {
    for (const name of set) universe.add(name);
  }
  for (const set of (poolData.draftLists ?? new Map()).values()) {
    for (const name of set) universe.add(name);
  }
  for (const deck of poolData.decklists ?? []) {
    for (const name of deck) universe.add(name);
  }
  // Draft-record packs are card ids; map them to current names for the universe.
  for (const rec of poolData.draftRecords ?? []) {
    for (const pack of rec.packs ?? []) {
      for (const id of pack) {
        universe.add(poolData.cardNameById?.get(id) ?? id);
      }
    }
  }
  return universe;
}

// --- Dreamcaller-support helpers (label-free, pure, unit-tested) ------------

/**
 * The decks in a corpus that are built around a signature: those running at
 * least `k` of the signature cards. These are the revealed-preference evidence
 * for what the Dreamcaller's archetype actually contains.
 *
 * @param decklists array of decks, each a string[] of card names.
 * @param signature the Dreamcaller's signature card names.
 * @returns the matching decks (each a Set<cardName> for O(1) membership).
 */
export function signatureDecks(decklists, signature, k = DC_SIGNATURE_K) {
  const sig = new Set(signature ?? []);
  if (sig.size === 0) return [];
  const out = [];
  for (const deck of decklists ?? []) {
    const cards = deck instanceof Set ? deck : new Set(deck);
    let hits = 0;
    for (const s of sig) if (cards.has(s)) hits += 1;
    if (hits >= k) out.push(cards);
  }
  return out;
}

/**
 * Lift of every card against a set of signature decks: how much more often the
 * card appears in those decks than in the whole corpus. The label-free measure
 * of "is this card part of the signature's archetype?"
 *
 *   lift(card) = P(card | signature deck) / P(card | corpus)
 *
 * A card present only in signature decks gets a high lift; goodstuff that is
 * everywhere lands near 1; a card absent from signature decks gets 0.
 *
 * @returns Map<cardName, { lift, presence, sigCount }>, where presence is
 *   P(card | signature deck) and sigCount is the raw signature-deck count.
 */
export function cardLifts(decklists, sigDecks) {
  const corpusN = (decklists ?? []).length;
  const sigN = sigDecks.length;
  const base = new Map();
  for (const deck of decklists ?? []) {
    const cards = deck instanceof Set ? deck : new Set(deck);
    for (const c of cards) base.set(c, (base.get(c) ?? 0) + 1);
  }
  const sigCount = new Map();
  for (const cards of sigDecks) {
    for (const c of cards) sigCount.set(c, (sigCount.get(c) ?? 0) + 1);
  }
  const out = new Map();
  if (corpusN === 0 || sigN === 0) return out;
  for (const [c, sc] of sigCount) {
    const presence = sc / sigN;
    const baseRate = (base.get(c) ?? 0) / corpusN;
    out.set(c, { lift: baseRate > 0 ? presence / baseRate : 0, presence, sigCount: sc });
  }
  return out;
}

/**
 * The binary archetype-support set for a signature: the cards whose lift and
 * presence both clear the thresholds. This is the data-driven replacement for a
 * hand-tagged theme -- the cards a pool needs to carry for this Dreamcaller.
 *
 * @returns { cards: Set<cardName>, sigDeckCount, lifts } -- the support set, how
 *   many signature decks backed it, and the full per-card lift map (for report).
 */
export function archetypeSupportSet(
  decklists,
  signature,
  { k = DC_SIGNATURE_K, lift = DC_LIFT, presence = DC_PRESENCE } = {},
) {
  const sigDecks = signatureDecks(decklists, signature, k);
  const lifts = cardLifts(decklists, sigDecks);
  const cards = new Set();
  for (const [c, m] of lifts) {
    if (m.lift >= lift && m.presence >= presence) cards.add(c);
  }
  return { cards, sigDeckCount: sigDecks.length, lifts };
}

/**
 * The share of a pool that is archetype support: copies (capped at 2) of the
 * cards in `supportCards`, over the pool size. The big5 density read -- "how
 * much of this pool is actually about the theme".
 *
 * @returns share in [0,1].
 */
export function supportSetShare(counts, supportCards) {
  const size = poolSizeOf(counts);
  if (size === 0) return 0;
  let on = 0;
  for (const [name, raw] of counts) {
    if (supportCards.has(name)) on += cap(raw);
  }
  return on / size;
}

/**
 * A small archetype's completeness in a pool: the fraction of its support set
 * present as a full 2-of playset. A small theme is not asked to fill 50% of the
 * pool (that is what makes it small), only to ship a complete playset. Vacuously
 * 1 when the support set is empty.
 *
 * @returns completeness in [0,1].
 */
export function supportSetCompleteness(counts, supportCards, copies = SMALL_THEME_COPIES) {
  if (supportCards.size === 0) return 1;
  let full = 0;
  for (const name of supportCards) {
    if ((counts.get(name) ?? 0) >= copies) full += 1;
  }
  return full / supportCards.size;
}

/**
 * Whether a learned archetype is "big5" (the pool can plausibly be built around
 * it: a 2-of playset of its support set would fill at least `target` of the
 * pool) or "small" (it cannot reach that density, so by definition it rides
 * along and is scored on completeness instead). The big5/small split the
 * hand-tagged metric assigned by label is here derived purely from support-set
 * size.
 *
 * @returns "big5" | "small".
 */
export function archetypeKind(supportSize, poolSize, target = DC_TARGET) {
  return (2 * supportSize) / poolSize >= target ? "big5" : "small";
}

// --- CLI plumbing -----------------------------------------------------------

function num(argv, flag, fallback) {
  const i = argv.indexOf(flag);
  if (i !== -1 && argv[i + 1] != null) return Number(argv[i + 1]);
  const eq = argv.find((a) => a.startsWith(`${flag}=`));
  return eq ? Number(eq.slice(flag.length + 1)) : fallback;
}
function str(argv, flag, fallback) {
  const i = argv.indexOf(flag);
  if (i !== -1 && argv[i + 1] != null) return argv[i + 1];
  const eq = argv.find((a) => a.startsWith(`${flag}=`));
  return eq ? eq.slice(flag.length + 1) : fallback;
}

// Every recognized CLI flag, split by whether it consumes the following token as
// a value. Used to validate argv (unknown flags are a hard error) and to skip a
// flag's value when scanning for stray arguments. Keep in sync with the flags the
// `num`/`str`/`includes` readers above actually consult.
const VALUE_FLAGS = new Set([
  "--metric",
  "--seeds",
  "--variant",
  "--pool-size",
  "--dreamcaller",
  "--top",
  "--themes",
  "--trap-tau",
  "--standalone-themes",
  "--buildable-share",
  "--present-share",
  "--ubiquity",
  "--dc-sig-k",
  "--dc-lift",
  "--dc-presence",
  "--dc-target",
  "--dc-min-decks",
]);
const BOOLEAN_FLAGS = new Set(["--compare", "--traps", "--json", "--help", "-h"]);

const HELP = `Usage: node scripts/pool-metrics.mjs [options]

Evaluate the draft pools an algorithm generates against one of four metrics,
measured on the real-draft simulation (every Dreamcaller, full signature, many
seeds). See the header comment in this file for what each metric measures.

Mode:
  --metric <name>        Which metric to run: adequacy (default) | traps |
                         diversity | dreamcaller.
  --traps                Back-compat alias for --metric traps.
  --compare              Run the chosen metric across every algorithm (defaults
                         to ${DEFAULT_COMPARE_SEEDS} seeds; override with --seeds).
  -h, --help             Show this help and exit.

Shared options (every metric):
  --seeds <n>            Seeds per Dreamcaller (default ${DEFAULT_SEEDS}; --compare default ${DEFAULT_COMPARE_SEEDS}).
  --variant <id>         Pool algorithm to evaluate (default idf3).
  --pool-size <n>        Target pool size in copies (default ${POOL_TARGET_SIZE}).
  --dreamcaller <name|id>  Restrict the simulation to a single Dreamcaller.
  --top <n>              How many rows to show in "top N" listings (default ${DEFAULT_TOP}).
  --json                 Emit the full result as JSON instead of a text report.

Adequacy options (--metric adequacy):
  --themes <short|all>   Score the standalone themes only (short, default) or
                         every theme (all).

Trap options (--metric traps):
  --trap-tau <n>         A payoff is a trap when its best-supportable theme is
                         under this fraction of its demand target (default ${DEFAULT_TRAP_TAU}).

Diversity options (--metric diversity):
  --standalone-themes <a,b,c>  Override the standalone archetype set.
  --buildable-share <n>  Support share at which a standalone theme is "buildable"
                         (default ${DEFAULT_BUILDABLE_SHARE}).
  --present-share <n>    Support share at which a supporting theme counts as
                         "present" (default ${DEFAULT_PRESENT_SHARE}).
  --ubiquity <n>         A card is "ubiquitous" once it appears in this fraction
                         of pools (default ${DEFAULT_UBIQUITY}).

Dreamcaller options (--metric dreamcaller; archetype support learned from decklists):
  --dc-sig-k <n>         Min signature cards a deck needs to count as a signature
                         deck (default ${DC_SIGNATURE_K}).
  --dc-lift <n>          Min lift for a card to count as archetype support (default ${DC_LIFT}).
  --dc-presence <n>      Min P(card | signature deck) for support (default ${DC_PRESENCE}).
  --dc-target <n>        Desired on-theme share of the pool; score = min(1, share/target)
                         (default ${DC_TARGET}).
  --dc-min-decks <n>     Below this many signature decks a Dreamcaller is cold-start
                         and left out of the headline (default ${DC_MIN_DECKS}).
`;

/**
 * Validate argv against the known flag set. Prints help and exits 0 on
 * --help/-h; exits 1 on any unrecognized flag or stray positional argument.
 * A value flag in `--flag value` form consumes the following token so it is not
 * mistaken for a positional.
 */
function validateArgv(argv) {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(HELP);
    process.exit(0);
  }
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i];
    if (tok.startsWith("-")) {
      const name = tok.startsWith("--") ? tok.split("=")[0] : tok;
      if (!VALUE_FLAGS.has(name) && !BOOLEAN_FLAGS.has(name)) {
        console.error(
          `Unrecognized flag "${tok}". Run with --help to see the available flags.`,
        );
        process.exit(1);
      }
      // `--flag value` (no `=`) consumes the next token as its value.
      if (VALUE_FLAGS.has(name) && !tok.includes("=")) i++;
    } else {
      console.error(
        `Unexpected argument "${tok}". Run with --help to see the available flags.`,
      );
      process.exit(1);
    }
  }
}

const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);

/** Mean/append accumulator keyed by an arbitrary string. */
function group() {
  const m = new Map();
  return {
    add(key, adequacy, share) {
      let g = m.get(key);
      if (!g) {
        g = { adequacies: [], shares: [] };
        m.set(key, g);
      }
      g.adequacies.push(adequacy);
      g.shares.push(share);
    },
    entries() {
      return [...m.entries()].map(([key, g]) => ({
        key,
        count: g.adequacies.length,
        meanAdequacy: mean(g.adequacies),
        meanShare: mean(g.shares),
      }));
    },
  };
}

/** Resolve the selected metric, honouring the `--traps` back-compat alias. */
function resolveMetric(argv) {
  if (argv.includes("--traps")) return "traps";
  const m = str(argv, "--metric", "adequacy");
  if (!["adequacy", "traps", "diversity", "dreamcaller"].includes(m)) {
    console.error(
      `--metric must be adequacy|traps|diversity|dreamcaller (got "${m}").`,
    );
    process.exit(1);
  }
  return m;
}

/** Load the shared inputs every metric reads, applying any `--dreamcaller` filter. */
function loadContext(argv) {
  const cards = readJson("public/cards_v2-data.json");
  const decklists = readJson("public/decklists-data.json");
  const draftRecords = readJson("public/draft-records-data.json");
  let dreamcallers = readJson("public/dreamcallers-v2-data.json");
  const meta = readJson("data/buildaround_support.json");

  const dcFilter = str(argv, "--dreamcaller", null);
  if (dcFilter) {
    const q = dcFilter.toLowerCase();
    dreamcallers = dreamcallers.filter(
      (d) => d.id === dcFilter || d.name.toLowerCase() === q,
    );
    if (!dreamcallers.length) {
      console.error(`No Dreamcaller matches "${dcFilter}".`);
      process.exit(1);
    }
  }
  // Pass every corpus so all variants (including `pickfit`) run their real
  // algorithm under `--compare` rather than falling back to default.
  const pickRecords =
    Array.isArray(draftRecords) && draftRecords.length
      ? draftRecords.map((r) => ({ packs: r.packIds, picks: r.pickIds }))
      : undefined;
  const poolData = buildPoolData(cards, decklists, pickRecords);
  // The `embedded` variant grows from the committed affinity corpus rather than
  // the records; load it (when baked) so it runs under `--compare`/`--variant
  // embedded`. Every other variant ignores `affinityCorpus`.
  const corpusPath = resolve(ROOT, "data/affinity_corpus.jsonc");
  if (existsSync(corpusPath)) {
    poolData.affinityCorpus = deserializeCorpus(readJsonc("data/affinity_corpus.jsonc"));
  }
  // The `tides` variant combines the committed tide decks; load them (when
  // baked) so it runs under `--compare`/`--variant tides`. Every other variant
  // ignores `tideDecks`.
  const tidesPath = resolve(ROOT, "data/tides.jsonc");
  if (existsSync(tidesPath)) {
    poolData.tideDecks = validateTideDecks(readJsonc("data/tides.jsonc"));
  }
  // The `tides2` variant combines its own tide decks and curated relationships;
  // load them (when present) so it runs under `--compare`/`--variant tides2`.
  const tides2Path = resolve(ROOT, "data/tides2.jsonc");
  if (existsSync(tides2Path)) {
    poolData.tides2Decks = validateTideDecks(readJsonc("data/tides2.jsonc"));
    const tides2RelPath = resolve(ROOT, "data/tides2_relationships.jsonc");
    if (existsSync(tides2RelPath)) {
      const tideIds = new Set(poolData.tides2Decks.tides.map((t) => t.id));
      poolData.tides2Relationships = validateTideRelationships(
        readJsonc("data/tides2_relationships.jsonc"),
        tideIds,
      );
    }
  }
  return { dreamcallers, meta, poolData, decklists };
}

/**
 * The real-draft simulation shared by every metric: every Dreamcaller, each with
 * its FULL signature, over `seeds` seeds. Yields one generated pool per
 * (Dreamcaller, seed). Neutral Dreamcallers (no signature) yield their unsteered
 * pools, so the stream is the natural roster-weighted draft distribution.
 */
function* simulateRealDrafts(ctx, { seeds, variant, poolSize }) {
  for (const dc of ctx.dreamcallers) {
    const signature = dc.signatureCards ?? [];
    for (let seed = 0; seed < seeds; seed++) {
      const pool = generatePoolFromData(
        ctx.poolData,
        seed >>> 0,
        undefined,
        variant,
        undefined,
        poolSize,
        signature,
        dc.id,
      );
      yield { dc, seed, pool };
    }
  }
}

// --- Metric: adequacy -------------------------------------------------------

function computeAdequacy(ctx, { seeds, poolSize, variant, allowedThemes }) {
  const all = []; // every payoff instance, tagged with its Dreamcaller
  const byTheme = group();
  const byDreamcaller = group();
  const byPayoff = group();
  const poolSizes = [];
  let poolsWithPayoffs = 0;

  // A pool is "steered" when its Dreamcaller has a build-around signature
  // identity; neutral Dreamcallers produce the unsteered floor. Computed from the
  // real signature -- no signature is omitted or rewritten.
  const steeredByDc = new Map();
  for (const dc of ctx.dreamcallers) {
    steeredByDc.set(
      dc.name,
      dominantSignatureTheme(dc.signatureCards, ctx.meta) !== null,
    );
  }

  for (const { dc, pool } of simulateRealDrafts(ctx, {
    seeds,
    variant,
    poolSize,
  })) {
    poolSizes.push(pool.size);
    const instances = scorePool(pool.counts, ctx.meta, TIER_TARGET, allowedThemes);
    if (instances.length) poolsWithPayoffs++;
    const steered = steeredByDc.get(dc.name) === true;
    for (const inst of instances) {
      all.push({ dreamcaller: dc.name, steered, ...inst });
      byTheme.add(inst.theme, inst.adequacy, inst.share);
      byDreamcaller.add(dc.name, inst.adequacy, inst.share);
      byPayoff.add(inst.payoff, inst.adequacy, inst.share);
    }
  }

  const headline = mean(all.map((i) => i.adequacy)) * 100;
  const totalPools = ctx.dreamcallers.length * seeds;
  return {
    variant,
    headline,
    totalPools,
    poolsWithPayoffs,
    meanPoolSize: mean(poolSizes),
    totalInstances: all.length,
    all,
    byTheme,
    byDreamcaller,
    byPayoff,
  };
}

function reportAdequacy(
  res,
  ctx,
  { seeds, poolSize, variant, themeMode, allowedThemes, top, asJson },
) {
  const totalPools = res.totalPools;
  const minAppear = Math.max(3, Math.ceil(0.02 * totalPools));
  const worstPayoffs = res.byPayoff
    .entries()
    .filter((e) => e.count >= minAppear)
    .sort((a, b) => a.meanAdequacy - b.meanAdequacy);

  if (asJson) {
    console.log(
      JSON.stringify(
        {
          metric: "adequacy",
          config: {
            variant,
            poolSize,
            seeds,
            dreamcallers: ctx.dreamcallers.length,
            themes: themeMode,
            scoredThemes: allowedThemes
              ? [...allowedThemes]
              : Object.keys(ctx.meta.themes),
            tierTarget: TIER_TARGET,
          },
          headline: res.headline,
          totalPools,
          poolsWithPayoffs: res.poolsWithPayoffs,
          meanPoolSize: res.meanPoolSize,
          totalInstances: res.totalInstances,
          byTheme: res.byTheme.entries().sort((a, b) => a.meanAdequacy - b.meanAdequacy),
          byDreamcaller: res.byDreamcaller
            .entries()
            .sort((a, b) => a.meanAdequacy - b.meanAdequacy),
          worstPayoffs,
          instances: res.all,
        },
        null,
        2,
      ),
    );
    return;
  }

  const pct = (x) => `${(x * 100).toFixed(1)}%`;
  const themeName = (k) => ctx.meta.themes[k]?.name ?? k;
  const themeLabel =
    themeMode === "short"
      ? `standalone themes (${[...allowedThemes].length})`
      : `all themes (${Object.keys(ctx.meta.themes).length})`;
  console.log(
    `Adequacy metric (${variant}, pool size ${poolSize}, ${themeLabel}, ${seeds} seeds x ${ctx.dreamcallers.length} Dreamcallers = ${totalPools} pools)`,
  );
  console.log(
    `Tier targets: 1=${pct(TIER_TARGET[1])}  2=${pct(TIER_TARGET[2])}  3=${pct(TIER_TARGET[3])}   mean pool size ${res.meanPoolSize.toFixed(0)} copies`,
  );
  console.log("");
  console.log(`  ===  HEADLINE SCORE: ${res.headline.toFixed(1)} / 100  ===`);
  console.log(
    `  (mean adequacy over ${res.totalInstances} payoff instances; ${res.poolsWithPayoffs}/${totalPools} pools contained a build-around)`,
  );
  if (allowedThemes) {
    const steeredInst = res.all.filter((i) => i.steered);
    const neutralInst = res.all.filter((i) => !i.steered);
    const steeredDc = new Set(steeredInst.map((i) => i.dreamcaller)).size;
    console.log(
      `  steered (${steeredDc} Dreamcallers with a signature identity): ${(mean(steeredInst.map((i) => i.adequacy)) * 100).toFixed(1)}` +
        `   neutral pools: ${(mean(neutralInst.map((i) => i.adequacy)) * 100).toFixed(1)}`,
    );
  }

  console.log("\nBy theme (mean adequacy, worst first):");
  console.log(`  ${"theme".padEnd(26)} ${"adeq".padStart(6)} ${"support".padStart(8)} ${"instances".padStart(10)}`);
  for (const e of res.byTheme.entries().sort((a, b) => a.meanAdequacy - b.meanAdequacy)) {
    console.log(
      `  ${themeName(e.key).padEnd(26)} ${(e.meanAdequacy * 100).toFixed(0).padStart(5)}% ${pct(e.meanShare).padStart(8)} ${String(e.count).padStart(10)}`,
    );
  }

  console.log(`\nBy Dreamcaller (mean adequacy, worst first):`);
  for (const e of res.byDreamcaller.entries().sort((a, b) => a.meanAdequacy - b.meanAdequacy)) {
    console.log(
      `  ${e.key.padEnd(20)} ${(e.meanAdequacy * 100).toFixed(0).padStart(5)}%   (${e.count} instances)`,
    );
  }

  console.log(
    `\nWorst-supported build-arounds (mean adequacy, appears >= ${minAppear} pools), top ${top}:`,
  );
  for (const e of worstPayoffs.slice(0, top)) {
    console.log(
      `  ${(e.meanAdequacy * 100).toFixed(0).padStart(4)}%  support ${pct(e.meanShare).padStart(6)}  x${String(e.count).padStart(5)}  ${e.key}`,
    );
  }
}

function runAdequacy(argv) {
  const ctx = loadContext(argv);
  const seeds = num(argv, "--seeds", DEFAULT_SEEDS);
  const poolSize = num(argv, "--pool-size", POOL_TARGET_SIZE);
  const variant = str(argv, "--variant", "idf3");
  const top = num(argv, "--top", DEFAULT_TOP);
  const asJson = argv.includes("--json");
  const themeMode = str(argv, "--themes", "short");
  if (themeMode !== "short" && themeMode !== "all") {
    console.error(`--themes must be "short" or "all" (got "${themeMode}").`);
    process.exit(1);
  }
  const allowedThemes = themeMode === "short" ? STANDALONE_THEMES : null;
  const res = computeAdequacy(ctx, { seeds, poolSize, variant, allowedThemes });
  reportAdequacy(res, ctx, {
    seeds,
    poolSize,
    variant,
    themeMode,
    allowedThemes,
    top,
    asJson,
  });
}

// --- Metric: traps ----------------------------------------------------------

function computeTraps(ctx, { seeds, poolSize, variant, tau }) {
  const trapsPerPool = [];
  const poolSizes = [];
  let poolsWithTrap = 0;
  const dcTraps = new Map();
  const trapCardPools = new Map();

  for (const dc of ctx.dreamcallers) {
    dcTraps.set(dc.name, { traps: 0, poolsWithTrap: 0, pools: 0 });
  }

  for (const { dc, pool } of simulateRealDrafts(ctx, {
    seeds,
    variant,
    poolSize,
  })) {
    const dcStat = dcTraps.get(dc.name);
    poolSizes.push(pool.size);
    const traps = trapCards(pool.counts, ctx.meta, TIER_TARGET, tau, null);
    trapsPerPool.push(traps.length);
    dcStat.pools += 1;
    dcStat.traps += traps.length;
    if (traps.length) {
      poolsWithTrap += 1;
      dcStat.poolsWithTrap += 1;
    }
    for (const card of traps) {
      trapCardPools.set(card, (trapCardPools.get(card) ?? 0) + 1);
    }
  }

  const totalPools = ctx.dreamcallers.length * seeds;
  return {
    variant,
    totalPools,
    expectedTrapsPerPool: mean(trapsPerPool),
    poolsWithTrapPct: totalPools ? poolsWithTrap / totalPools : 0,
    meanPoolSize: mean(poolSizes),
    dcTraps,
    trapCardPools,
  };
}

function reportTraps(res, ctx, { seeds, poolSize, variant, tau, top, asJson }) {
  const totalPools = res.totalPools;
  const byDreamcaller = [...res.dcTraps.entries()]
    .map(([name, s]) => ({
      dreamcaller: name,
      trapsPerPool: s.pools ? s.traps / s.pools : 0,
      poolsWithTrapPct: s.pools ? s.poolsWithTrap / s.pools : 0,
      pools: s.pools,
    }))
    .sort((a, b) => b.trapsPerPool - a.trapsPerPool);

  const worstTrapCards = [...res.trapCardPools.entries()]
    .map(([card, pools]) => ({ card, pools, pct: totalPools ? pools / totalPools : 0 }))
    .sort((a, b) => b.pools - a.pools);

  if (asJson) {
    console.log(
      JSON.stringify(
        {
          metric: "traps",
          config: { variant, poolSize, tau, seeds, dreamcallers: ctx.dreamcallers.length, totalPools },
          expectedTrapsPerPool: res.expectedTrapsPerPool,
          poolsWithTrapPct: res.poolsWithTrapPct,
          meanPoolSize: res.meanPoolSize,
          byDreamcaller,
          worstTrapCards,
        },
        null,
        2,
      ),
    );
    return;
  }

  const tauPct = Math.round(tau * 100);
  console.log(
    `Trap metric (${variant}, pool size ${poolSize}, tau=${tau}, real-draft pools, ${seeds} seeds x ${ctx.dreamcallers.length} Dreamcallers = ${totalPools} pools)`,
  );
  console.log(
    `  (a trap = a build-around whose best-supported theme is under ${tauPct}% of its demand target)`,
  );
  console.log("");
  console.log(
    `  ===  EXPECTED TRAP CARDS PER POOL: ${res.expectedTrapsPerPool.toFixed(2)}  ===`,
  );
  console.log(
    `  pools carrying >=1 trap card: ${(res.poolsWithTrapPct * 100).toFixed(0)}%   (mean pool size ${res.meanPoolSize.toFixed(0)} copies)`,
  );

  console.log(`\nBy Dreamcaller (most traps per pool first):`);
  for (const e of byDreamcaller) {
    console.log(
      `  ${e.dreamcaller.padEnd(20)} ${e.trapsPerPool.toFixed(2).padStart(5)}   (${(e.poolsWithTrapPct * 100).toFixed(0)}%)`,
    );
  }

  console.log(
    `\nWorst trap cards (pools where the card was a trap, of ${totalPools}), top ${top}:`,
  );
  for (const e of worstTrapCards.slice(0, top)) {
    console.log(
      `  ${String(e.pools).padStart(5)}  ${(e.pct * 100).toFixed(0).padStart(3)}%  ${e.card}`,
    );
  }
}

function runTraps(argv) {
  const ctx = loadContext(argv);
  const seeds = num(argv, "--seeds", DEFAULT_SEEDS);
  const poolSize = num(argv, "--pool-size", POOL_TARGET_SIZE);
  const variant = str(argv, "--variant", "idf3");
  const top = num(argv, "--top", DEFAULT_TOP);
  const asJson = argv.includes("--json");
  const tau = num(argv, "--trap-tau", DEFAULT_TRAP_TAU);
  const res = computeTraps(ctx, { seeds, poolSize, variant, tau });
  reportTraps(res, ctx, { seeds, poolSize, variant, tau, top, asJson });
}

// --- Metric: diversity ------------------------------------------------------

function computeDiversity(
  ctx,
  { seeds, poolSize, variant, standalone, buildableShare, presentShare, ubiquity },
) {
  const universe = draftableUniverse(ctx.poolData);
  const standaloneSet = standalone;
  const standaloneArr = [...standaloneSet];
  const supportingThemes = Object.keys(ctx.meta.themes).filter(
    (t) => !standaloneSet.has(t),
  );

  // Single pass: simulate every pool, accumulating card appearances, per-archetype
  // buildable counts (payoff present AND support >= buildableShare), and supporting
  // theme presence (support >= presentShare).
  const cardAppearances = new Map();
  const buildableHist = new Map(); // standalone theme -> pools where buildable
  for (const t of standaloneSet) buildableHist.set(t, 0);
  const supportPresence = new Map(); // supporting theme -> pools where present
  let buildableArchetypeSum = 0; // total (theme, pool) buildable hits
  let poolsBuildable = 0; // pools buildable for >= 1 archetype
  let appearedOutsideUniverse = 0;
  let totalPools = 0;

  for (const { pool } of simulateRealDrafts(ctx, { seeds, variant, poolSize })) {
    totalPools += 1;
    const shares = poolSupportShares(pool.counts, ctx.meta);
    for (const t of supportingThemes) {
      if ((shares.get(t) ?? 0) >= presentShare) {
        supportPresence.set(t, (supportPresence.get(t) ?? 0) + 1);
      }
    }
    const buildable = buildableThemes(
      pool.counts,
      ctx.meta,
      standaloneSet,
      buildableShare,
    );
    for (const t of buildable) buildableHist.set(t, buildableHist.get(t) + 1);
    buildableArchetypeSum += buildable.size;
    if (buildable.size > 0) poolsBuildable += 1;
    for (const card of pool.counts.keys()) {
      cardAppearances.set(card, (cardAppearances.get(card) ?? 0) + 1);
      if (!universe.has(card)) appearedOutsideUniverse += 1;
    }
  }

  // Card utilization over the draftable universe.
  const universeArr = [...universe];
  const apps = universeArr.map((c) => cardAppearances.get(c) ?? 0);
  const usedCount = apps.filter((x) => x > 0).length;
  const coverage = universe.size ? usedCount / universe.size : 0;
  const cardEvenness = normalizedEntropy(apps, universe.size);
  const cardGini = giniCoefficient(apps);
  const deadCards = universeArr.filter((c) => !(cardAppearances.get(c) > 0));
  const ubiquityCut = ubiquity * totalPools;
  const ubiquitousCards = universeArr
    .map((c) => ({ card: c, pools: cardAppearances.get(c) ?? 0 }))
    .filter((e) => e.pools >= ubiquityCut)
    .sort((a, b) => b.pools - a.pools);

  // Most- and least-used cards (among cards that appear at least once).
  const usedRanked = [...cardAppearances.entries()]
    .filter(([card]) => universe.has(card))
    .map(([card, pools]) => ({ card, pools, pct: pools / totalPools }))
    .sort((a, b) => b.pools - a.pools);

  // Theme spread: each standalone archetype's buildable rate, and the evenness of
  // those rates (1 = every archetype buildable equally often, low = collapse onto
  // one). Evenness is the normalized entropy of the buildable-count vector.
  const buildableRates = standaloneArr
    .map((t) => ({
      theme: t,
      pools: buildableHist.get(t) ?? 0,
      rate: totalPools ? (buildableHist.get(t) ?? 0) / totalPools : 0,
    }))
    .sort((a, b) => b.rate - a.rate);
  const themeEvenness = normalizedEntropy(
    standaloneArr.map((t) => buildableHist.get(t) ?? 0),
    standaloneArr.length,
  );
  const meanBuildableRate = mean(buildableRates.map((e) => e.rate));
  const meanBuildableArchetypes = totalPools ? buildableArchetypeSum / totalPools : 0;
  const poolsBuildablePct = totalPools ? poolsBuildable / totalPools : 0;

  const supportingRates = supportingThemes
    .map((t) => ({
      theme: t,
      pools: supportPresence.get(t) ?? 0,
      rate: totalPools ? (supportPresence.get(t) ?? 0) / totalPools : 0,
    }))
    .sort((a, b) => b.rate - a.rate);
  const meanSupportingPresence = mean(supportingRates.map((e) => e.rate));

  const headline = 100 * 0.5 * (cardEvenness + themeEvenness);

  return {
    variant,
    totalPools,
    universeSize: universe.size,
    appearedOutsideUniverse,
    headline,
    coverage,
    usedCount,
    cardEvenness,
    cardGini,
    deadCards,
    ubiquitousCards,
    usedRanked,
    themeEvenness,
    buildableRates,
    meanBuildableRate,
    meanBuildableArchetypes,
    poolsBuildablePct,
    supportingRates,
    meanSupportingPresence,
  };
}

function reportDiversity(
  res,
  ctx,
  { seeds, poolSize, variant, standalone, buildableShare, presentShare, ubiquity, top, asJson },
) {
  if (asJson) {
    console.log(
      JSON.stringify(
        {
          metric: "diversity",
          config: {
            variant,
            poolSize,
            seeds,
            dreamcallers: ctx.dreamcallers.length,
            standaloneThemes: [...standalone],
            buildableShare,
            presentShare,
            ubiquity,
          },
          headline: res.headline,
          totalPools: res.totalPools,
          universeSize: res.universeSize,
          cardUtilization: {
            coverage: res.coverage,
            usedCount: res.usedCount,
            evenness: res.cardEvenness,
            gini: res.cardGini,
            deadCardCount: res.deadCards.length,
            deadCards: res.deadCards,
            ubiquitousCards: res.ubiquitousCards,
            mostUsed: res.usedRanked.slice(0, top),
            leastUsed: res.usedRanked.slice(-top).reverse(),
          },
          themeSpread: {
            evenness: res.themeEvenness,
            meanBuildableRate: res.meanBuildableRate,
            meanBuildableArchetypes: res.meanBuildableArchetypes,
            poolsBuildablePct: res.poolsBuildablePct,
            buildableRates: res.buildableRates,
          },
          supportingThemePresence: {
            meanPresence: res.meanSupportingPresence,
            rates: res.supportingRates,
          },
        },
        null,
        2,
      ),
    );
    return;
  }

  const pctd = (x) => `${(x * 100).toFixed(0)}%`;
  const themeName = (k) => ctx.meta.themes[k]?.name ?? k;
  console.log(
    `Diversity metric (${variant}, pool size ${poolSize}, ${seeds} seeds x ${ctx.dreamcallers.length} Dreamcallers = ${res.totalPools} pools)`,
  );
  console.log(`Standalone themes (${standalone.size}): ${[...standalone].join(", ")}`);
  console.log("");
  console.log(`  ===  DIVERSITY HEADLINE: ${res.headline.toFixed(1)} / 100  ===`);
  console.log(
    `  (blend of card-utilization evenness ${(res.cardEvenness * 100).toFixed(0)} and theme-spread evenness ${(res.themeEvenness * 100).toFixed(0)})`,
  );

  console.log("\n-- Card utilization --");
  console.log(
    `  coverage ${pctd(res.coverage)} (${res.usedCount}/${res.universeSize} draftable cards ever appear)`,
  );
  console.log(
    `  evenness ${(res.cardEvenness * 100).toFixed(0)}/100   gini ${res.cardGini.toFixed(2)}   dead cards ${res.deadCards.length}   ubiquitous (>= ${pctd(ubiquity)} of pools) ${res.ubiquitousCards.length}`,
  );
  if (res.ubiquitousCards.length) {
    console.log(`  most ubiquitous:`);
    for (const e of res.ubiquitousCards.slice(0, top)) {
      console.log(`    ${pctd(e.pools / res.totalPools).padStart(4)}  ${e.card}`);
    }
  }
  if (res.deadCards.length) {
    console.log(
      `  dead cards (never drafted), showing ${Math.min(top, res.deadCards.length)} of ${res.deadCards.length}:`,
    );
    for (const c of res.deadCards.slice(0, top)) console.log(`    ${c}`);
  }

  console.log("\n-- Theme spread (how often each standalone archetype is draftable) --");
  console.log(
    `  evenness ${(res.themeEvenness * 100).toFixed(0)}/100   mean buildable rate ${pctd(res.meanBuildableRate)}   archetypes buildable/pool ${res.meanBuildableArchetypes.toFixed(2)}   pools buildable for >=1 ${pctd(res.poolsBuildablePct)}`,
  );
  console.log(
    `  (buildable = a payoff is present AND support share >= ${pctd(buildableShare)} of the pool)`,
  );
  console.log(`  ${"archetype".padEnd(20)} ${"buildable".padStart(10)}`);
  for (const e of res.buildableRates) {
    console.log(
      `  ${themeName(e.theme).padEnd(20)} ${pctd(e.rate).padStart(7)}  (${e.pools})`,
    );
  }

  console.log("\n-- Supporting-theme presence (want these frequent, never dominant) --");
  console.log(
    `  mean presence ${pctd(res.meanSupportingPresence)} (share >= ${pctd(presentShare)} of pool)`,
  );
  console.log(`  ${"theme".padEnd(24)} ${"present".padStart(8)}`);
  for (const e of res.supportingRates) {
    console.log(`  ${themeName(e.theme).padEnd(24)} ${pctd(e.rate).padStart(7)}`);
  }
}

/** Parse `--standalone-themes a,b,c` into a validated Set; default STANDALONE_THEMES. */
function parseStandaloneThemes(argv, meta) {
  const raw = str(argv, "--standalone-themes", null);
  if (!raw) return STANDALONE_THEMES;
  const themes = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const t of themes) {
    if (!meta.themes[t]) {
      console.error(
        `--standalone-themes: "${t}" is not a known theme. Known: ${Object.keys(meta.themes).join(", ")}`,
      );
      process.exit(1);
    }
  }
  return new Set(themes);
}

function runDiversity(argv) {
  const ctx = loadContext(argv);
  const seeds = num(argv, "--seeds", DEFAULT_SEEDS);
  const poolSize = num(argv, "--pool-size", POOL_TARGET_SIZE);
  const variant = str(argv, "--variant", "idf3");
  const top = num(argv, "--top", DEFAULT_TOP);
  const asJson = argv.includes("--json");
  const standalone = parseStandaloneThemes(argv, ctx.meta);
  const buildableShare = num(argv, "--buildable-share", DEFAULT_BUILDABLE_SHARE);
  const presentShare = num(argv, "--present-share", DEFAULT_PRESENT_SHARE);
  const ubiquity = num(argv, "--ubiquity", DEFAULT_UBIQUITY);
  const res = computeDiversity(ctx, {
    seeds,
    poolSize,
    variant,
    standalone,
    buildableShare,
    presentShare,
    ubiquity,
  });
  reportDiversity(res, ctx, {
    seeds,
    poolSize,
    variant,
    standalone,
    buildableShare,
    presentShare,
    ubiquity,
    top,
    asJson,
  });
}

// --- Metric: dreamcaller (label-free, learned from decklists) ---------------

function computeDreamcaller(
  ctx,
  { seeds, poolSize, variant, k, lift, presence, target, minDecks },
) {
  // Build each Dreamcaller's archetype-support set ONCE from the decklist corpus
  // (it does not depend on the generated pools). A Dreamcaller with no signature,
  // or with too few signature decks to trust, is set cold-start and skipped.
  const supportByDc = new Map();
  const coldStart = [];
  for (const dc of ctx.dreamcallers) {
    const sig = dc.signatureCards ?? [];
    if (!sig.length) continue; // neutral: no identity to learn
    const set = archetypeSupportSet(ctx.decklists, sig, { k, lift, presence });
    if (set.sigDeckCount < minDecks || set.cards.size === 0) {
      coldStart.push({ name: dc.name, sigDeckCount: set.sigDeckCount, support: set.cards.size });
      continue;
    }
    // big5 (scored on density toward `target`, kept at 50%) vs small (cannot
    // reach `target`, so rides along and is scored on full-playset
    // completeness) -- derived purely from the learned support-set size.
    set.kind = archetypeKind(set.cards.size, poolSize, target);
    supportByDc.set(dc.name, set);
  }

  const byDreamcaller = group();
  const poolScores = [];
  // Per-Dreamcaller running tallies: the scored measure (share for big5,
  // completeness for small) and how often the pool fully delivered the theme
  // (big5 hit `target` density; small shipped a complete playset).
  const dcStat = new Map(); // name -> { kind, measures:[], hits, pools }

  for (const { dc, pool } of simulateRealDrafts(ctx, { seeds, variant, poolSize })) {
    const set = supportByDc.get(dc.name);
    if (!set) continue; // neutral or cold-start
    let measure;
    let score;
    let hit;
    if (set.kind === "big5") {
      measure = supportSetShare(pool.counts, set.cards);
      score = target > 0 ? Math.min(1, measure / target) : measure >= 1 ? 1 : 0;
      hit = measure >= target;
    } else {
      measure = supportSetCompleteness(pool.counts, set.cards);
      score = measure; // completeness is already 0..1
      hit = measure >= 1;
    }
    poolScores.push(score);
    byDreamcaller.add(dc.name, score, measure);
    let s = dcStat.get(dc.name);
    if (!s) {
      s = { kind: set.kind, measures: [], hits: 0, pools: 0 };
      dcStat.set(dc.name, s);
    }
    s.measures.push(measure);
    s.pools += 1;
    if (hit) s.hits += 1;
  }

  const headline = mean(poolScores) * 100;
  return {
    variant,
    headline,
    target,
    scoredDreamcallers: supportByDc.size,
    totalDreamcallers: ctx.dreamcallers.length,
    scoredPools: poolScores.length,
    supportByDc,
    coldStart,
    byDreamcaller,
    dcStat,
  };
}

function reportDreamcaller(
  res,
  ctx,
  { seeds, poolSize, variant, k, lift, presence, target, minDecks, top, asJson },
) {
  const dcRows = res.byDreamcaller
    .entries()
    .map((e) => {
      const set = res.supportByDc.get(e.key);
      const s = res.dcStat.get(e.key) ?? { kind: set?.kind, hits: 0, pools: 0 };
      return {
        dreamcaller: e.key,
        kind: s.kind ?? set?.kind ?? "?",
        meanScore: e.meanAdequacy,
        meanMeasure: e.meanShare, // share (big5) or completeness (small)
        supportCards: set?.cards.size ?? 0,
        sigDecks: set?.sigDeckCount ?? 0,
        hitRate: s.pools ? s.hits / s.pools : 0,
        pools: e.count,
      };
    })
    .sort((a, b) => a.meanScore - b.meanScore);

  if (asJson) {
    console.log(
      JSON.stringify(
        {
          metric: "dreamcaller",
          config: {
            variant,
            poolSize,
            seeds,
            dreamcallers: ctx.dreamcallers.length,
            scoredDreamcallers: res.scoredDreamcallers,
            signatureK: k,
            lift,
            presence,
            target,
            minDecks,
          },
          headline: res.headline,
          scoredPools: res.scoredPools,
          byDreamcaller: dcRows,
          coldStart: res.coldStart,
        },
        null,
        2,
      ),
    );
    return;
  }

  const pct = (x) => `${(x * 100).toFixed(0)}%`;
  console.log(
    `Dreamcaller metric (${variant}, pool size ${poolSize}, ${seeds} seeds x ${res.scoredDreamcallers}/${res.totalDreamcallers} learnable Dreamcallers = ${res.scoredPools} pools)`,
  );
  console.log(
    `  archetype support is learned from the decklist corpus: a card counts when it appears in`,
  );
  console.log(
    `  >=${k}-signature decks with lift >= ${lift} and presence >= ${pct(presence)}. A theme whose support`,
  );
  console.log(
    `  set could fill >= ${pct(target)} of the pool is big5 (scored on density toward ${pct(target)}); a smaller`,
  );
  console.log(
    `  one is a small theme (scored on full-2-of-playset completeness).`,
  );
  console.log("");
  console.log(`  ===  DREAMCALLER HEADLINE: ${res.headline.toFixed(1)} / 100  ===`);
  console.log(
    `  (mean per-pool on-theme score; on-theme = the Dreamcaller's signature-learned support set)`,
  );

  console.log(
    `\nBy Dreamcaller (mean score, worst first). big5 = density toward ${pct(target)};` +
      ` small = full-2-of-playset completeness:`,
  );
  console.log(
    `  ${"dreamcaller".padEnd(20)} ${"kind".padEnd(6)} ${"score".padStart(6)} ${"measure".padStart(8)} ${"deliver".padStart(8)} ${"support".padStart(8)} ${"sigDecks".padStart(9)}`,
  );
  for (const r of dcRows) {
    // measure column: support share for big5, playset completeness for small.
    const measure = r.kind === "big5" ? `${pct(r.meanMeasure)} sh` : `${pct(r.meanMeasure)} set`;
    // deliver column: how often a pool fully delivered (big5 hit target density;
    // small shipped a complete playset).
    console.log(
      `  ${r.dreamcaller.padEnd(20)} ${r.kind.padEnd(6)} ${(r.meanScore * 100).toFixed(0).padStart(5)}% ${measure.padStart(8)} ${pct(r.hitRate).padStart(8)} ${String(r.supportCards).padStart(8)} ${String(r.sigDecks).padStart(9)}`,
    );
  }

  if (res.coldStart.length) {
    console.log(
      `\nCold-start (skipped: < ${minDecks} signature decks or empty support set), ${res.coldStart.length}:`,
    );
    for (const c of res.coldStart.slice(0, top)) {
      console.log(
        `  ${c.name.padEnd(20)} ${String(c.sigDeckCount).padStart(4)} signature decks, ${c.support} support cards`,
      );
    }
  }
}

function runDreamcaller(argv) {
  const ctx = loadContext(argv);
  const seeds = num(argv, "--seeds", DEFAULT_SEEDS);
  const poolSize = num(argv, "--pool-size", POOL_TARGET_SIZE);
  const variant = str(argv, "--variant", "idf3");
  const top = num(argv, "--top", DEFAULT_TOP);
  const asJson = argv.includes("--json");
  const k = num(argv, "--dc-sig-k", DC_SIGNATURE_K);
  const lift = num(argv, "--dc-lift", DC_LIFT);
  const presence = num(argv, "--dc-presence", DC_PRESENCE);
  const target = num(argv, "--dc-target", DC_TARGET);
  const minDecks = num(argv, "--dc-min-decks", DC_MIN_DECKS);
  const res = computeDreamcaller(ctx, {
    seeds,
    poolSize,
    variant,
    k,
    lift,
    presence,
    target,
    minDecks,
  });
  reportDreamcaller(res, ctx, {
    seeds,
    poolSize,
    variant,
    k,
    lift,
    presence,
    target,
    minDecks,
    top,
    asJson,
  });
}

// --- Mode: compare across every algorithm -----------------------------------

function runCompare(argv, metric) {
  const ctx = loadContext(argv);
  const seeds = num(argv, "--seeds", DEFAULT_COMPARE_SEEDS);
  const poolSize = num(argv, "--pool-size", POOL_TARGET_SIZE);
  const asJson = argv.includes("--json");
  const variants = POOL_VARIANT_IDS;

  // Metric-specific config shared across variants.
  const themeMode = str(argv, "--themes", "short");
  const allowedThemes = themeMode === "short" ? STANDALONE_THEMES : null;
  const tau = num(argv, "--trap-tau", DEFAULT_TRAP_TAU);
  const standalone = parseStandaloneThemes(argv, ctx.meta);
  const buildableShare = num(argv, "--buildable-share", DEFAULT_BUILDABLE_SHARE);
  const presentShare = num(argv, "--present-share", DEFAULT_PRESENT_SHARE);
  const ubiquity = num(argv, "--ubiquity", DEFAULT_UBIQUITY);
  const dcK = num(argv, "--dc-sig-k", DC_SIGNATURE_K);
  const dcLift = num(argv, "--dc-lift", DC_LIFT);
  const dcPresence = num(argv, "--dc-presence", DC_PRESENCE);
  const dcTarget = num(argv, "--dc-target", DC_TARGET);
  const dcMinDecks = num(argv, "--dc-min-decks", DC_MIN_DECKS);

  const rows = [];
  for (const variant of variants) {
    if (!asJson) process.stderr.write(`  running ${metric} for ${variant}...\n`);
    if (metric === "adequacy") {
      const r = computeAdequacy(ctx, { seeds, poolSize, variant, allowedThemes });
      rows.push({
        variant,
        headline: r.headline,
        poolsWithPayoffsPct: r.totalPools ? r.poolsWithPayoffs / r.totalPools : 0,
        meanPoolSize: r.meanPoolSize,
      });
    } else if (metric === "dreamcaller") {
      const r = computeDreamcaller(ctx, {
        seeds,
        poolSize,
        variant,
        k: dcK,
        lift: dcLift,
        presence: dcPresence,
        target: dcTarget,
        minDecks: dcMinDecks,
      });
      rows.push({
        variant,
        headline: r.headline,
        scoredDreamcallers: r.scoredDreamcallers,
        coldStart: r.coldStart.length,
      });
    } else if (metric === "traps") {
      const r = computeTraps(ctx, { seeds, poolSize, variant, tau });
      rows.push({
        variant,
        expectedTrapsPerPool: r.expectedTrapsPerPool,
        poolsWithTrapPct: r.poolsWithTrapPct,
      });
    } else {
      const r = computeDiversity(ctx, {
        seeds,
        poolSize,
        variant,
        standalone,
        buildableShare,
        presentShare,
        ubiquity,
      });
      rows.push({
        variant,
        headline: r.headline,
        cardEvenness: r.cardEvenness,
        coverage: r.coverage,
        themeEvenness: r.themeEvenness,
        meanBuildableRate: r.meanBuildableRate,
        deadCards: r.deadCards.length,
      });
    }
  }

  if (asJson) {
    console.log(
      JSON.stringify(
        { metric, config: { seeds, poolSize, dreamcallers: ctx.dreamcallers.length }, rows },
        null,
        2,
      ),
    );
    return;
  }

  const totalPools = ctx.dreamcallers.length * seeds;
  console.log(
    `Compare: ${metric} across ${variants.length} algorithms (${seeds} seeds x ${ctx.dreamcallers.length} Dreamcallers = ${totalPools} pools each)`,
  );
  console.log("");
  const pctd = (x) => `${(x * 100).toFixed(0)}%`;
  if (metric === "adequacy") {
    rows.sort((a, b) => b.headline - a.headline);
    console.log(`  ${"algorithm".padEnd(12)} ${"adequacy".padStart(9)} ${"w/payoff".padStart(9)} ${"poolSize".padStart(9)}`);
    for (const r of rows) {
      console.log(
        `  ${r.variant.padEnd(12)} ${r.headline.toFixed(1).padStart(9)} ${pctd(r.poolsWithPayoffsPct).padStart(9)} ${r.meanPoolSize.toFixed(0).padStart(9)}`,
      );
    }
  } else if (metric === "dreamcaller") {
    rows.sort((a, b) => b.headline - a.headline);
    console.log(
      `  ${"algorithm".padEnd(12)} ${"dc".padStart(8)} ${"scored".padStart(7)} ${"cold".padStart(5)}`,
    );
    for (const r of rows) {
      console.log(
        `  ${r.variant.padEnd(12)} ${r.headline.toFixed(1).padStart(8)} ${String(r.scoredDreamcallers).padStart(7)} ${String(r.coldStart).padStart(5)}`,
      );
    }
  } else if (metric === "traps") {
    rows.sort((a, b) => a.expectedTrapsPerPool - b.expectedTrapsPerPool);
    console.log(`  ${"algorithm".padEnd(12)} ${"traps/pool".padStart(11)} ${"pools w/trap".padStart(13)}`);
    for (const r of rows) {
      console.log(
        `  ${r.variant.padEnd(12)} ${r.expectedTrapsPerPool.toFixed(2).padStart(11)} ${pctd(r.poolsWithTrapPct).padStart(13)}`,
      );
    }
  } else {
    rows.sort((a, b) => b.headline - a.headline);
    console.log(
      `  ${"algorithm".padEnd(12)} ${"diversity".padStart(10)} ${"cardEven".padStart(9)} ${"coverage".padStart(9)} ${"themeEven".padStart(10)} ${"build%".padStart(7)} ${"dead".padStart(5)}`,
    );
    for (const r of rows) {
      console.log(
        `  ${r.variant.padEnd(12)} ${r.headline.toFixed(1).padStart(10)} ${(r.cardEvenness * 100).toFixed(0).padStart(9)} ${pctd(r.coverage).padStart(9)} ${(r.themeEvenness * 100).toFixed(0).padStart(10)} ${pctd(r.meanBuildableRate).padStart(7)} ${String(r.deadCards).padStart(5)}`,
      );
    }
  }
}

function run() {
  const argv = process.argv.slice(2);
  validateArgv(argv);
  const metric = resolveMetric(argv);
  if (argv.includes("--compare")) {
    runCompare(argv, metric);
    return;
  }
  if (metric === "traps") return runTraps(argv);
  if (metric === "diversity") return runDiversity(argv);
  if (metric === "dreamcaller") return runDreamcaller(argv);
  return runAdequacy(argv);
}

// Only run when invoked directly (not when imported by the test).
const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) run();
