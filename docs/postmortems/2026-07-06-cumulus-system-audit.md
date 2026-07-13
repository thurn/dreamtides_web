# Cumulus Design System Audit — July 2026

**Date:** 2026-07-06
**Scope:** the four screen efforts shipped over the past week, in priority
order: deck viewer (`DesktopDeckViewer` / `MobileDeckViewer`), Dream Atlas
(`AtlasScreen` + `components/atlas/`), Dreamscape (`DreamscapeScreen` +
`SiteNode` + `QuestStatusBar`), and Dreamcaller select (`quest-start-*`).
**Question:** the screens moved fast; the system did not step back with them.
What new patterns does the system need, what existing patterns should go, and
what should change in the core token and component offerings?
**Method:** five parallel audit passes (one per screen area plus a
catalog-wide usage inventory), each grounded in file:line evidence, followed
by hand verification of every load-bearing claim (grep/read in the current
tree at `2732d2dd`).

---

## Summary

The catalog describes the system as it was mocked up; the four screens
describe the game as it is. Of the 18 documented components, **10 are
healthy, 6 have exactly one consumer, and 2 (StatTile, TidePill) render
nowhere in production** — while roughly ten undocumented modules
(`DreamcallerPortrait` ~19 consumers, `HoverPopover` 13, `GlowIcon` 8,
`rich-text` 8, the glass recipes, `tide-spec`) are the actual load-bearing
system. The drift concentrates in three places:

1. **The button offering is one button short of reality.** Production grew a
   second, glass button language (icon discs on the deck viewers, the
   dreamscape gear, the carousel chevrons) that the catalog doesn't name, so
   every screen hand-rolls it — five declarations, three sizes, two
   different materials.
2. **The glass material — the deck viewer's defining pattern — has no docs,
   no tokens, and three literal sources of truth**, one of which diverges.
   The token actually *named* `--surface-glass` is an opaque hex, and that
   name collision has already produced a mismatched control.
3. **The catalog is not honest about adoption.** Docs-only components carry
   confident present-tense blurbs; demos showcase states production forbids
   and omit the states that dominate it; "the ONE X" doctrine comments are
   validated by convention, not by grep.

What worked should be said too: the tide-disc consolidation from the 07-05
postmortem verifiably landed (one `TIDE_DISC_PX`, zero screen-local copies),
the GroupPanel material split converged, the glass icon chrome converged
after four commits of churn, and the `AtlasPreview` fork was retired into the
InfoCard press-reveal engine. The convergence trigger works when the author
knows they forked. The drift below is the kind that trigger can't see:
doc drift, doctrine drift, and duplication inside the system's own files.

---

## 1. The button suite

`Button.tsx:1-8` states the doctrine: one button, the beveled purple sprite;
"low-emphasis... actions are plain pressable TEXT / ICON affordances...
never a second button color." Production has outgrown this. There is now a
clear second button language — the **glass button** — and because the
catalog doesn't offer it, every screen improvised:

| Control | Where | Size / glyph | Material |
|---|---|---|---|
| Desktop deck close | `DesktopDeckViewer.tsx:343-359` | 40px / 22px | `glassIconButtonChrome()` (real blur glass) |
| Mobile deck close | `MobileDeckViewer.tsx:370-390` | 48px / 26px | `glassIconButtonChrome()` |
| Dreamscape/Atlas gear | `DreamscapeQuestMenu.tsx:121-122, 286-297` | 48px / 26px | `glassIconButtonChrome()` |
| Carousel chevrons | `quest-start-mobile.tsx:220-259` (`EdgeChevron`) | 40px / 22px | **opaque** `--surface-glass` + `--border-soft` — a different material for the same idea |
| Dreamsigns-panel close | `QuestStatusBar.tsx:398-417` | 34px / raw `<i>` | a third recipe: `--radius-control`, `rgba(255,255,255,0.05)`, no blur, no `GlowIcon` |

The chrome function exists (`control-treatment.ts:122-124`) but it is a style
recipe, not a component: each call site re-declares width/height/fontSize by
hand, and two of the five never found the recipe at all. The absence has a
second-order cost the deck viewer demonstrates: with no glass button in the
catalog, the only glass *interactive* things an agent can reach for are
`Select` and `SegmentedControl` — hence a `SegmentedControl` pressed into
service as a two-item `↑`/`↓` toggle (`DesktopDeckViewer.tsx:603-613`) with
layout-glue compensating so "the pair reads as one sort control." Some
controls in the deck viewer should just be buttons.

**Recommendation — offer a full button suite (new components, rung 4):**

- **`Button`** stays the purple sprite: the primary/commit action. Rewrite
  its doctrine comment to name the suite instead of denying it.
- **`IconButton`** — the glass disc: `glassIconButtonChrome()` promoted to a
  component with a `Glyph` prop and an enumerated size (`sm` = 40/22,
  `md` = 48/26 — exactly the two observed tuples), press feedback via
  `usePress`. Fold all five call sites onto it; the QuestStatusBar close and
  `EdgeChevron` are bug-fixes as much as migrations.
- **`GlassButton`** (label variant) — the same glass material with a text
  label, for secondary actions that need a real button shape but must not
  compete with the purple commit. This is the variant the deck viewer's
  chrome wanted and the "plain text affordance" doctrine failed to supply.
- Document the decision tree in the demos: purple sprite = commit / primary;
  glass label = secondary chrome action; glass icon = compact chrome action;
  plain pressable text = tertiary/inline.

## 2. The glass material

The frosted, backdrop-blurred surface is the deck viewer's defining pattern
and the InfoCard shell's material — a major new system pattern with **zero
catalog presence** and no token backing. Current state:

- `glass-surface.ts:33-45` (`glassSurfaceStyle()`) and
  `control-treatment.ts:61-74` (`glassTrack()`) are **byte-identical,
  independently maintained copies** of the same fill / sheen /
  `blur(22px) saturate(1.5)` / rim / 3-layer shadow literals. The second
  file's own comment admits the inline copy. This is the exact
  hand-mirrored-constants failure mode the 07-05 postmortem documented for
  the tide disc, living inside the system's own `components/` directory.
- `InfoCard.tsx:84-85` overrides the fill with a third value
  (`rgba(18,14,28,0.5)` violet-black vs the shared `rgba(14,14,16,0.54)`)
  — so the desktop deck viewer renders **two different glass tints on the
  same screen** (backdrop + close button vs the Dreamcaller reveal popover).
- The tokens literally named `--surface-glass` / `--surface-glass-strong`
  (`cumulus-tokens.css:151-152`) are **opaque hex chrome with no blur** — and
  the name collision already misled a call site (`EdgeChevron` above).
- `GlassBackdrop()` — the full-screen frosted backdrop — is a
  **character-for-character 15-line copy** in both deck viewers
  (`DesktopDeckViewer.tsx:271-286`, `MobileDeckViewer.tsx:295-310`), as is
  their `GridPlaceholder`.
- `CardView.tsx:1448-1554` blurs its textbox via `--cv-textbox-blur`, a
  token owned by the legacy `src/index.css:384`, not by Cumulus.

**Recommendation — make glass a first-class, singly-declared material:**

- Collapse `glassTrack()` into an import of the one recipe; parameterize
  only radius. Express the recipe's values as semantic tokens
  (`--glass-fill`, `--glass-blur`, `--glass-sheen`, `--glass-rim`,
  `--glass-shadow`) so "the ONE glass material" is enforced by the token
  system rather than by comment.
- Decide InfoCard's violet fill: either unify onto the shared fill or name
  it (`--glass-fill-popover`) and document why reveals read warmer.
- Rename the opaque `--surface-glass*` tokens to what they are
  (`--surface-chrome*`), eliminating the collision.
- Extract the shared `GlassBackdrop` (and `GridPlaceholder`) into one
  module both deck viewers import.
- Add a **Materials** docs page: liquid glass (what wears it: InfoCard,
  deck-viewer backdrop, controls, icon buttons) vs the solid `GroupPanel`
  card vs solid chrome — with the blur-preservation constraint from
  `c903242a` noted. This is the missing "background blur strategy" chapter.
- Move `--cv-textbox-blur` into `cumulus-tokens.css` (the production bridge
  family already exists for exactly this).

## 3. Catalog honesty — deletions and doc repairs

### Delete

- **`StatTile`** — zero consumers anywhere (its motivating use case, "deck
  stats," shipped without it). Delete component, demo, and registry entry.
- **`TidePill`** — zero production renders; only its re-exported `Tide`
  *type* is imported (`quest-start-view-model.ts:11`). Move the type into
  `tide-spec.ts` and delete the component and demo.
- **`SiteNode`'s visited state** — production filters visited sites out
  before `SiteNode` ever mounts (`DreamscapeScreen.tsx:112-113`; asserted
  by `DreamscapeScreen.test.tsx:103`). The 0.42 dim, the green check badge,
  and the "Already visited." reveal note (`SiteNode.tsx:75-77, 133,
  231-235`) are unreachable. Delete the branch and the demo's visited
  fixture — this is the "states that will never exist in prod" item, and
  the checkmark/disabled look goes with it.
- **`AtlasNode` dead surface**: `eyebrow` is `null` in all three
  `buildNodeCard` branches (`atlas-view-model.ts:324, 348, 372`), so the
  InfoCard `meta` wiring is dead; `forgone` and `isReachable: false` are
  always coincident in production (`atlas-generator.ts:1610-1623`) and
  share one CSS rule (`atlas.css:139-150`) — collapse them to the single
  "unreachable" concept they are, or document `forgone` as data-only.

### Repair the demos — they must show production

- The atlas demo's `n-forgone` fixture (`docs/demos/atlas-node.tsx:116-128`)
  renders bright with an icon and badge; every real forgone node is forced
  blank and faded (`atlas-view-model.ts:398-432`). No demo row sets
  `isReachable: false` at all, `badgeScale: 1.5` (the mobile default) is
  never demoed, and the demo's node sizes (96/112) exist nowhere in
  production (132/150 desktop, 200/224 mobile — export and import
  `ATLAS_LAYOUT_*` instead of re-typing numbers).
- **Demos must mount the production integration surface.** The atlas demo
  shows a bare `AtlasNode` with a faked hover boolean; production always
  renders through `AtlasNodeReveal` → InfoCard press-reveal, which has no
  catalog entry. The `site-node` demo already does this right (live
  press-reveal wired) — make that the standard. Same for `TideDisc`: its
  demo shows a bare disc, production only ever renders it inside an
  `InfoCard.PressInfo` reveal (`quest-start-shared.tsx:65-73`) — the demo
  should show the disc-with-reveal as the canonical usage.
- The atlas mockup (`docs/mockups/atlas-map.tsx`) is stale in orientation
  (horizontal; production is vertical bottom-up), chrome (title block the
  real screen explicitly omits), and math (its own scale-to-fit copy).
  Rebuild it from the real `AtlasMap` or label it archived.
- The locked-battle site demo fixture puts the lock *note* text into the
  `blurb` slot, rendering near-duplicate sentences no real site shows
  (`docs/demos/site-node.tsx:71` vs `SiteNode.tsx:71-79`).

### ResourceChip: give it a real job or fold it

`ResourceChip`'s blurb claims "every essence, energy, spark, points, or
counter number routes through it." Reality: **one** consumer
(`quest-start-shared.tsx:398`); the role it claims is actually held by the
legacy `EssenceValue` (10 consumers, all outside Cumulus), whose own comment
defers to ResourceChip. Meanwhile `Button.tsx:71-77` hand-mirrors
ResourceChip's glyph table (`COST_ICON_CLASSES` vs `SPECS`) instead of
importing a shared spec, and ResourceChip carries open numeric `size` and
`gap` props — exactly the knobs the customization ladder bans, grandfathered
from the original port.

**Recommendation:** keep ResourceChip as the one economy mark, but (a)
extract the kind→glyph/color table into a shared `economy-spec.ts` that
Button imports too, (b) replace the numeric `size`/`gap` knobs with
enumerated variants, (c) rewrite the blurb to say what is true today and
name the plan: legacy screens migrate from `EssenceValue` onto it as they
Cumulus-ify, then `EssenceValue` is deleted. What it is *for* is the answer
to the user-facing question: the HUD/quest-economy number-with-mark —
Dreamcaller starting essence today, shop prices and reward values as those
screens migrate.

### Document the workhorses

The undocumented de-facto system (consumer counts from the inventory pass):
`DreamcallerPortrait` (~19), `HoverPopover` (13), `HoverZoomCard` (8),
`GlowIcon` (8), `rich-text` (8), `GlossaryDefinitionCard` (6),
`CardTermDefinitions` (5), `tide-spec` (4), `PipBadge` (3), plus the glass
modules from §2. This overlaps pre-existing-issue "Cumulus readiness gaps"
item 1 — the counts above are the priority order. `AtlasMap` (not the bare
node/edge) is arguably the documentable atlas surface.

**Adoption signal, generated:** the docs generator should compute and print
a real-consumer count on the index and each reference page (imports outside
`src/cumulus/docs/` and tests). StatTile and TidePill would have been visibly
"0 consumers" for weeks; ghost components stop being representable. This is
mechanical and belongs in `npm run cumulus-docs`.

## 4. Token layer revisions

- **37 semantic tokens have zero references** outside the token file and its
  generated mirror. Highlights, verified by hand: `--card-aspect` (the real
  source of truth is `card-aspect.ts`'s TS constants), the entire `--cat-*`
  category-color set, `--glow-*` family members, `--space-0`,
  `--tide-earthy`, `--control-h`/`--control-h-sm` (52/40px — matching no
  real control; `Button` uses 42/50/62). Prune each or wire it up;
  a token that nothing reads is documentation that lies.
- **The tide palette bypasses the token system entirely**: the five real
  tide colors are hex literals in `tide-spec.ts:39-45`, hand-mirroring
  `src/components/tide-visuals.ts` across the isolation boundary, while the
  only tide token (`--tide-earthy`) is dead. Either move the palette into
  `--tide-*` tokens both sides read, or delete the dead token and document
  `tide-spec.ts` as the palette's home.
- **The dark "disc" gradient exists in four variants across four files**:
  `atlas.css:206` and `:243` (`#2a2040/#14101f`, twice in one file),
  `InfoCard.tsx:168-171` (`SITE_DISC`, `#23212b/#0a0910` — whose comment
  falsely claims SiteNode shares it), and `site-node.css`
  (`#1a1525/#0b0815/#060410`). One `--badge-disc-gradient` token (or shared
  constant), and fix or fulfill the `SITE_DISC` comment.
- **`atlas.css` is a token/literal mix**: edge gradients and glow rgbas
  (`rgba(168,85,247,0.6)` ×2, `rgba(250,204,21,0.5)` ×2) sit raw in a file
  that correctly uses `--dt-*` tokens elsewhere. Promote the repeated ones.
- **Press feedback is forked from the primitive**: `Pressable.tsx` declares
  itself "the ONE press-feedback primitive" (`HOVER_SCALE` 1.03), but
  `AtlasNode` hand-rolls a 1.07 hover scale with no press-down
  (`atlas.css:152-153`) and `SiteNode` a 1.08 (`SiteNode.tsx:178`). Route
  the visual feedback through `usePress`, or add a tokenized, documented
  node-scale exception — two more hand-agreed constants is the worst state.

## 5. Convergence debt — the fold-back list

Forks that stabilized without the promote-or-file decision:

- **Dreamcaller portrait, three renderings**: `DreamcallerPortrait` offers
  `hero`/`panel`/`thumb`, none full-bleed, so quest-start built
  `StandingFigure` (`quest-start-desktop.tsx:65-146`) and
  `FullBleedPortrait` (`quest-start-mobile.tsx:33-103`) — re-deriving the
  component's fallback treatment verbatim: the identical backdrop gradient
  string appears character-for-character three times
  (`DreamcallerPortrait.tsx:48/124`, `quest-start-desktop.tsx:97`) and the
  monogram fallback three times. Add a `standing`/`fullBleed` variant (or at
  minimum share the fallback logic), and note that InfoCard's new
  `fullBleed` variant and quest-start's figure-plus-riding-card composition
  are the same idiom built twice in the same week.
- **`QsbSignObject`** (`QuestStatusBar.tsx:112-198`) re-implements the
  shared `Dreamsign` object for the status-bar strip. Fold onto `Dreamsign`.
- **`DreamscapeMotes`** (`SiteNode.tsx:258-292`) is a second, bespoke
  particle field alongside the canonical `Motes`. Consolidate (a tint/mode)
  or document why they can't share.
- **Scale-to-fit math** duplicated between `AtlasMap.tsx:71-82` and the
  atlas mockup — extract `useScaleToFit`.
- **`HOVER_TARGET_WIDTH_PX`** (`DesktopDeckViewer.tsx:139-143`) is
  comment-synced to `HoverZoomCard`'s internal `MAX_SCALE`; derive it from
  an exported constant instead.
- **Deck filter models**: desktop (`SegmentedControl` type +` Select`
  subtype) and mobile (one unioned `Select`) maintain two parallel filter
  modules for the same data. Likely legitimate platform divergence — but it
  is undocumented, and mobile silently drops the card count the desktop
  header shows (a content-parity gap that reads as an accident). Decide and
  write it down.
- **Misfiled modules**: `SiteNode`, `site-node.css`, and
  `dreamscape-scatter.ts` are dreamscape-screen components living in
  `components/atlas/`. Move to `components/dreamscape/`.

## 6. Why this keeps happening

The 07-05 postmortem added a convergence trigger for *requested divergence*,
and it demonstrably works — every fork the author knew about got folded or
filed. The drift in this audit is the kind that trigger cannot see:

1. **Doc drift.** Demos and blurbs are written once, at component birth, in
   confident present tense — and nothing re-checks them against production.
   The fix is mechanical where possible (generated adoption counts, §3;
   demo fixtures importing production constants, §3) and conventional where
   not (demos mount the production integration surface).
2. **Doctrine drift.** "The ONE button," "the ONE glass material," "shared
   by SiteNode" — doctrine comments are claims about the whole tree,
   validated only at write time. When a new sibling lands (a second glass
   fill, a fifth icon button), no step re-greps the claim. Treat a doctrine
   comment as an assertion: when a push touches the concept a doctrine
   names, verify the claim still holds or update it.
3. **Duplication inside the system itself.** The lint suite guards product
   screens against escaping the system; it does not guard `src/cumulus/`
   against duplicating itself (`glassTrack`, the disc gradients, the
   Button/ResourceChip glyph tables). The glass tokens in §2 fix the worst
   instance structurally; the rest is this audit's checklist.
4. **No stepping-back cadence.** Four screens shipped in a week; each
   session optimized its screen. This document is the first
   whole-system pass — the cheap version of keeping it: rerun this audit
   (the five-pass structure at the top) after each multi-screen push, or
   monthly, whichever comes first.

---

## 7. Proposed lint and integrity checks

The existing suite (`no-hardcoded-values`, `no-untokenized-lengths`,
`no-escape-hatch-props`, `no-raw-interactive-elements`,
`valid-token-references`, the boundary and adapter rules) guards the
*product* tier against leaving the system, and it held — the 07-05
postmortem verified it under pressure. But every failure in this audit
lives where that suite deliberately doesn't look: inside the exempt
`src/cumulus/components/` tier, or in cross-file properties a single-file
ESLint rule cannot see. Two batches follow — each entry names the finding
it would have caught.

### New ESLint rules (single-file)

- **`no-inline-glass`** — a raw `backdropFilter` / `blur(Npx)` /
  `saturate(N)` literal may appear only in the one glass material module;
  every other file spreads the exported style. Would have caught:
  `glassTrack()`'s byte-identical copy of `glassSurfaceStyle()` (§2).
  CardView's token-driven `blur(var(--cv-textbox-blur))` passes once that
  token moves into Cumulus.
- **`no-raw-icon-classes`** — Boxicons class strings (`bxf`, `bx-*`) may
  appear only in `glyph.ts`; everything else renders a `Glyph` through
  `GlowIcon`/`PipBadge`. Would have caught: QuestStatusBar's raw
  `<i className="bxf bx-x">` close button (§1) and the duplicated
  `Button`/`ResourceChip` icon tables (§3, by forcing the shared economy
  spec into the registry). A generation-time companion check that every
  registered glyph class exists in the vendored stylesheet would close the
  blank-icon class already filed in pre-existing-issues (`bx-refresh`).
- **`no-adhoc-press-scale`** — a `scale(` inside a transform outside
  `Pressable.tsx` must reference the exported `HOVER_SCALE`/`PRESS_SCALE`
  constants, with a companion check for `transform: scale(` in
  `src/cumulus/**/*.css`. Would have caught: `AtlasNode`'s 1.07 and
  `SiteNode`'s 1.08 hand-rolled hover scales (§4).
- **`no-numeric-style-props`** — an exported component props interface in
  `src/cumulus/components/` may not declare a number-typed visual knob
  (`size`, `gap`, `scale`, `padding`, `radius`, `blur`, `opacity`);
  variants are enumerated. This is the component-API complement of
  `no-escape-hatch-props`, which today catches `className`/`style` shapes
  but not open numbers. Would have caught: `ResourceChip`'s grandfathered
  `size`/`gap` (§3). The box-measure carve-out is untouched — that
  applies to caller wrappers, not component APIs.
- **Extend `no-raw-interactive-elements` into the components tier** — a
  `role="button"` div or raw `<button>` with hand-rolled key handling
  outside `Pressable.tsx` errors. Would have caught: `AtlasNode`'s raw
  `role="button"` div with manual Enter/Space handling (§4).
- **Extend `valid-token-references` with ownership** — a `var(--x)` inside
  `src/cumulus/` must resolve to a token *defined in* `cumulus-tokens.css`,
  not merely to some stylesheet in the app. Would have caught:
  `--cv-textbox-blur`, defined only in the legacy `src/index.css` (§2).

### Project-level integrity checks (cross-file)

ESLint sees one file at a time; these run as unit tests or inside
`npm run regenerate-assets`, where cross-file state is cheap.

- **`no-orphan-tokens`** — every semantic token in `cumulus-tokens.css` has
  at least one reference outside the token file and its generated mirror.
  Would have flagged all 37 dead tokens (§4) at the moment each became
  orphaned, forcing the delete-or-wire decision when context was fresh.
- **`no-ghost-components`** — every docs-registry entry has at least one
  real consumer (imports outside `src/cumulus/docs/` and tests), with an
  explicit `status: "incubating"` field in the demo entry as the sanctioned
  escape for a component documented deliberately ahead of adoption —
  rendered as a visible badge in the catalog rather than silently passing.
  Would have caught: `StatTile` and `TidePill` (§3). The adoption-count
  generator from §3 supplies the data; this check is its enforcement arm.
- **Duplicate-literal detector** — an identical visual literal (color,
  gradient, shadow, filter string above a trivial length) declared in more
  than one file under `src/cumulus/` errors, printing both declaration sites.
  This is the general form of the audit's worst finding and of the tide-disc
  postmortem's triplicated diameter: it would have caught `glassTrack()`'s
  copied recipe, the four dark-disc gradients, and the thrice-pasted
  Dreamcaller monogram gradient (§2, §4, §5). Cheap to implement as a test
  over source text; a minimum-length threshold keeps `#fff`-class noise out.

Suggested landing order: the integrity trio first (duplicate-literal
detector, `no-orphan-tokens`, `no-ghost-components`) — those three catch
everything that actually bit this week — then `no-raw-icon-classes` and
`no-numeric-style-props`, which close recurring classes, then the rest as
touch-ups when their files are next open.

Two classes stay deliberately unlinted: doctrine comments ("the ONE X")
are prose claims — §6's re-grep-on-touch convention is the right tool —
and demo fixtures re-typing production constants is better solved by
importing the constants (§3) than by a rule. The `no-name-keyed-cards`
rule already proposed in pre-existing-issues is a separate, still-open
concern.

---

## Action items

Priority 1 — the system offerings the next screen will need:

- [ ] Promote the button suite: `IconButton` (glass disc, `sm`/`md`),
      `GlassButton` (label), rewrite `Button.tsx`'s doctrine, migrate the
      five bespoke call sites, document the decision tree. (§1)
- [ ] Consolidate glass: one recipe module, `--glass-*` tokens, resolve
      InfoCard's fill, rename opaque `--surface-glass*` → `--surface-chrome*`,
      dedupe `GlassBackdrop`/`GridPlaceholder`, add the Materials docs page. (§2)
- [ ] Delete `StatTile` and `TidePill` (move the `Tide` type to
      `tide-spec.ts`); delete `SiteNode`'s visited branch and demo fixture;
      collapse `forgone`/unreachable and the dead `eyebrow` wiring. (§3)
- [ ] Add generated adoption counts to `npm run cumulus-docs`. (§3)

Priority 2 — honesty and convergence:

- [ ] Fix the atlas demos/mockup to production shapes (forced-blank forgone,
      unreachable row, `badgeScale`, real sizes via `ATLAS_LAYOUT_*`,
      press-reveal mounted); fix the site-node locked fixture. (§3)
- [ ] ResourceChip: shared economy glyph spec (Button imports it),
      enumerated sizes, honest blurb, named `EssenceValue` migration plan. (§3)
- [ ] Fold `QsbSignObject` → `Dreamsign`; add the `DreamcallerPortrait`
      full-bleed/standing variant (or file the divergence); consolidate
      `DreamscapeMotes` → `Motes`. (§5)
- [ ] Document the workhorses in adoption order (`DreamcallerPortrait`,
      `HoverPopover`, `HoverZoomCard`, `GlowIcon`, `rich-text`, …). (§3)
- [ ] Land the integrity-check trio: duplicate-literal detector,
      `no-orphan-tokens`, `no-ghost-components`; then the new ESLint rules
      in §7's suggested order. (§7)

Priority 3 — token and structure hygiene:

- [ ] Prune or wire the 37 dead tokens; decide the tide-palette home;
      add the disc-gradient token; tokenize `atlas.css`'s repeated raw
      colors; move `--cv-textbox-blur` into Cumulus. (§4)
- [ ] Route `AtlasNode`/`SiteNode` press feedback through `usePress` or add
      a tokenized node-scale. (§4)
- [ ] Move `SiteNode`/`site-node.css`/`dreamscape-scatter.ts` to
      `components/dreamscape/`; extract `useScaleToFit`; derive
      `HOVER_TARGET_WIDTH_PX` from `HoverZoomCard`'s exported scale. (§5)
- [ ] Decide and document the deck-viewer platform divergences (filter
      models, mobile card count, size control). (§5)

---

# Addendum — 2026-07-07

**Scope:** the twelve commits after the audit's cut (`2732d2dd` →
`70bb0bcd`): the InfoCard mobile-scale sequence (`f3ab3d62`, `6bf5ac88`,
`2fd0ed91`, `72e8c7bb`, `273b8287`), the starting-deck modal glass rework
(`3f7fb5c6`, `5fe63499`), the device-frame / safe-area subsystem
(`5c487047`), and the Cumulus draft screen (`dc0365cb`, `117d2d7e`,
`70bb0bcd`).
**Method:** the same structure as above — four parallel area passes plus a
fifth pass re-verifying every load-bearing claim in the original audit
against the current tree, followed by hand verification of every claim the
conclusions below rest on.

## A1. Re-verification: every original finding is still open

No action item from the original audit was completed by the last-24h work,
and two findings gained new instances:

- **A sixth bespoke glass icon button, at a third size.**
  `StartingDeckModal.tsx:182-200` hand-declares the close disc —
  `CLOSE_BUTTON_PX = 44` (`:37`), `fontSize: 22` (`:194`), layout
  boilerplate re-typed — with `glassIconButtonChrome()` spread at `:196`.
  44px matches neither observed tuple (40/22, 48/26); the proposed
  `IconButton` size enum now has a third diameter to absorb. The `GlowIcon`
  close-glyph line is byte-identical across three files
  (`StartingDeckModal.tsx:199`, `DesktopDeckViewer.tsx:359`,
  `MobileDeckViewer.tsx:388`).
- **The SegmentedControl-as-sort-toggle spread rather than converged**: the
  refined desktop deck filter bar (`85512102`) now mounts three
  SegmentedControls (`DesktopDeckViewer.tsx:556, 603, 618`), the middle one
  still the two-item `↑`/`↓` toggle with its layout-glue comment.
- Spot re-verification confirmed unchanged: the byte-identical
  `glassSurfaceStyle()`/`glassTrack()` pair, the opaque `--surface-glass*`
  tokens (now at `cumulus-tokens.css:183-184`), both `GlassBackdrop` copies,
  `StatTile`/`TidePill` at zero consumers, the dead-token set (with a
  correction: `--glow-danger` is live via `leave-site-button.css:27` and
  `--glow-accent-soft` via `DesktopDeckViewer.tsx`/`QuestStatusBar.tsx`;
  the other four `--glow-*` are orphaned), the four dark-disc gradients, the
  1.07/1.08 hand-rolled hover scales, and all §5 convergence debt.
- One nuance to the §3 catalog claim: the generic `InfoCard.PressInfo`
  engine does have a demo entry (`docs/demos/info-card.tsx:107-120`); the
  still-true narrow claim is that the atlas demo fakes a `hovered` boolean
  and `AtlasNodeReveal` — the production integration surface — has no
  catalog entry.

## A2. The safe-area / device-frame subsystem: day-one drift

`5c487047` built a well-designed runtime channel — device geometry lives
only in `scripts/screenshot-devices.mjs`, `device-frame.ts` republishes the
`deviceFrame` URL param as CSS custom properties before first paint, and
the `cumulus-tokens.css:53-71` comment defends the `:root` placement. The
device-screenshots SKILL states the doctrine plainly: app code reads
`var(--safe-area-inset-*)`, never `env()` directly. And yet, in the same
set of commits:

- **Three competing mechanisms for "clear the notch" coexist.** (1) The
  sanctioned injectable channel (`MobileDeckViewer.tsx:343`,
  `StartingDeckModal.tsx:168`, `DreamscapeQuestMenu.tsx:265-270`,
  `QuestStatusBar.tsx:634`, `battle.css:2435`). (2) Raw
  `env(safe-area-inset-top)` — `DraftScreen.tsx:74`, a day-one violation of
  the subsystem's own doctrine: `env()` resolves to 0 inside the screenshot
  iframe, so the draft screen silently ignores the injected inset and
  device-frame simulation has no effect on the newest screen. (3) The
  static design floors `--safe-top`/`--safe-bottom` (59/34px), used
  exclusively by both quest-start screens and mixed with mechanism (1)
  inside `MobileDeckViewer.tsx` (`:187` vs `:343`). `--safe-top`'s 59px
  numerically coincides with the derived iPhone-16 top inset
  (`screenshot-devices.mjs` 11+37+11); nothing ties them together.
- **`--display-cutout-right` is born fully orphaned** — declared, mirrored,
  documented, written at runtime (`device-frame.ts:65`), read by nothing.
  `--display-cutout-left`/`-width` are devtool-only (`DeviceFrameDemo`).
  The §4 dead-token disease, reproduced on day one of a new family.
- **`device-frame.ts` hand-mirrors the token names as string literals**
  (`SAFE_AREA_VARS` `:55-60`, `CUTOUT_VARS` `:62-68`) instead of importing
  from `tokens.ts`; a token rename breaks the injector with no type error.
- **The docs split brains**: the device-screenshots SKILL is accurate; the
  cumulus `tokens.md` has bare generated rows for the new tokens and no
  narrative chapter stating the one sanctioned mechanism — which is
  plausibly *why* DraftScreen and quest-start each picked a different one.
  `DeviceFrameDemo` is reachable only via `?demo=device-frame`, registered
  in neither `qa-scenes.ts` nor `qa_scenes.md`.

## A3. StartingDeckModal: the boundary failure, not a material failure

The glass work itself is what the system wants: the modal imports the
shared recipes (`StartingDeckModal.tsx:12-13`) and spreads
`glassSurfaceStyle()` — no fourth copy of the literals, no new
`GlassBackdrop` clone. The failures are placement and offering:

- It is a **legacy-tier file wearing full Cumulus chrome**, importing eight
  Cumulus modules — two of them material internals
  (`glass-surface`, `control-treatment`) — from `src/components/`, where
  `eslint.config.js:64` scopes precisely zero Cumulus rules. Its magic
  numbers (`zIndex: 60`, `min(900px, 90vw)`, `CLOSE_BUTTON_PX = 44`) pass
  unexamined. No lint rule in the current suite, nor in §7's proposed set,
  polices this reach-in direction (see A6).
- **"Glass panel + titled header + corner glass close disc" is now a
  rule-of-three** (DesktopDeckViewer, MobileDeckViewer, StartingDeckModal),
  each re-deriving the panel/backdrop/header/disc scaffolding. The missing
  offering has a name: a `GlassDialog` shell.
- Safe-area handling is correct in mechanism (token channel, no raw
  `env()`) but stylistically mixed — raw `var(--safe-area-inset-top)` and
  `token("--gutter")` composed in one expression (`:168`).
- The `glass-surface.ts:10` doctrine comment enumerates its consumers and
  the list is stale (names InfoCard and MobileDeckViewer; omits
  DesktopDeckViewer and StartingDeckModal) — doctrine drift, §6's exact
  failure mode, recurring while the audit that named it sat in the tree.

## A4. DraftScreen: the system mostly worked

The first screen built after the audit is strong evidence *for* the
catalog: token usage is clean throughout, card aspect comes from the
exported constants, there are no raw interactive elements, no icon
classes, no glass literals — none of §7's proposed rules would fire on it.
The predicted button-suite gap did not bite because the screen needs no
chrome buttons. Pack identity is `cardNumber` end-to-end with names
resolved only at the display edge. The residue is at the seams:

- **Hamburger clearance went through three hand-guessed formulas in three
  commits**, none reading the menu's real geometry
  (`DreamscapeQuestMenu.tsx` `menuBtnSize = 48`, `menuEdgeInset = 18`).
  The `117d2d7e` fix briefly resurrected the dead `--control-h` token as a
  wrong proxy (52px for a 48px button); `70bb0bcd` deleted that and now
  over-reserves via the `--safe-top` floor, clearing the menu by
  coincidence. Cross-file layout invariants held by hand — §5's hazard —
  and no single-file lint rule can see it.
- The raw-`env()` read (A2) is this screen's one doctrine violation.
- **Born undocumented**: no docs/skill/qa-scene presence for the screen,
  the floating pick counter, or the pack grid — the pre-existing
  "no ?goto= scene for Draft" gap outlived the screen's own migration.
- The adapter carries real bootstrap/effect weight (justified, shared with
  the legacy path via `draft-site-bootstrap.ts`) but stretches the
  "adapters are thin wiring" convention; worth stating in the convention
  doc rather than leaving as vibes.

## A5. InfoCard: settled well, resolved nothing

The five-commit scaling sequence landed in a good place: width and type
scale are separate baked constants (`MOBILE_WIDTH_FRACTION = 0.45`,
`MOBILE_TEXT_SCALE = 0.666`, `InfoCard.tsx:106,110`) exposed as pure
helpers, driven by viewport — not caller props; the tweak panel was
removed without a trace; the above-only placement logic lives once in the
shared `computePopoverPosition` engine and every reveal surface routes
through it. Three findings stand:

- **The violet fill hardened instead of resolving.** It is now a named
  constant (`INFO_CARD_GLASS_FILL`, `InfoCard.tsx:88`) *and* a test
  assertion (`InfoCard.test.ts:77` expects `rgba(18,14,28,0.5)`) — the
  audit's "decide: unify or name it" recommendation is still open, and the
  test raises the cost of deciding late.
- **Three unshared mobile thresholds now exist**: InfoCard's implicit
  ~551px (`CARD_W / MOBILE_WIDTH_FRACTION`), `DESKTOP_MIN_WIDTH = 900`
  (`use-is-desktop.ts:13`), and CardView's re-typed `899.98px`
  (`CardView.tsx:586`). The latter two are the same boundary declared
  twice; the first is a deliberate content-driven cutoff that nothing
  documents.
- **The new behavior is invisible in the catalog**: neither the mobile
  scale nor the above-only placement contract appears in `info-card.md` or
  the demo — omission drift rather than false claims.

## A6. The lint gap the incident exposed: the reach-in direction

§7's proposed rules all watch Cumulus's own tier or Cumulus escaping outward.
StartingDeckModal demonstrates the third direction: **legacy code reaching
inward** for design-system internals and assembling Cumulus-styled UI where
no rule looks. Notably, the authoring agent followed the material doctrine
it could see (imported the recipe rather than copying literals) and
violated only the boundary that exists as prose — confirming §6's thesis
that write-time mechanical checks are the only guardrails that hold.
Additions to the §7 program:

- **`no-cumulus-internals-outside-cumulus`** — move the material recipes
  (`glass-surface.ts`, `control-treatment.ts`, future materials) to
  `src/cumulus/internal/` and ban `cumulus/internal` imports outside
  `src/cumulus/` via `no-restricted-imports` (the config already uses that
  machinery at `eslint.config.js:100`). Rendering public Cumulus components
  from legacy screens stays legal — that is the migration story (~20
  legacy files do it today); wearing Cumulus materials outside the linted
  tier does not. Would have errored on `StartingDeckModal.tsx:12-13` at
  write time.
- **Recipes go fully private once the button suite lands** — after
  `IconButton`/`GlassButton`/`GlassDialog` exist, nothing outside
  `src/cumulus/components/` imports the recipes at all, and the boundary
  simplifies to "materials have no public export."
- **`no-raw-safe-area-env`** — raw `env(safe-area-inset-*)` legal only in
  `cumulus-tokens.css`; everything else reads the token channel. Would have
  caught `DraftScreen.tsx:74`. Natural sibling of `no-inline-glass`.
- **A legacy-tier ratchet** (project-level integrity test): the set of
  legacy files touching Cumulus internals is pinned at zero, and new files
  under `src/components/` are flagged toward the Cumulus tier.
- `device-frame.ts` importing its token names from `tokens.ts` (A2) closes
  the string-literal mirror; no lint rule needed once the import exists.

## Revised action items

The full revised program — new components (`IconButton`, `GlassButton`,
`GlassDialog`, `economy-spec`), removals, token work, migrations
(including StartingDeckModal into the Cumulus tier), enforcement rails, and
sequencing — is specified in
`docs/superpowers/specs/2026-07-07-cumulus-system-revisions-design.md`. That
spec supersedes the action-item checklist above; items there carry these
decisions, made 2026-07-07: plan scope is the complete P1-P3 set plus this
addendum's findings; `IconButton` ships two sizes (40/22, 48/26) and the
44px disc rounds to `md`; StartingDeckModal migrates to a Cumulus
screen/overlay; InfoCard's fill becomes the named `--glass-fill-popover`
token; `--safe-top`/`--safe-bottom` remain as documented design floors;
execution is serial phases on one worktree.
