# First-Class Cumulus Component Promotions — Implementation Plan

**Status:** Proposed

**Audience:** Journey prototype and Cumulus maintainers

**Scope:** Promote ten proven product-screen patterns into strict, documented Cumulus components and migrate every current consumer

## Goal

Promote the following surfaces into the public Cumulus catalog:

1. `SiteLayout`
2. `DreamsignReplacementDialog`
3. `TransfigurationDetailPanel`
4. `TransfigurationPickerPanel`
5. `BattleForeseeEditor`
6. `ExplorationChoice`
7. `CardChangePair`
8. `BattlefieldCard`
9. `BattlePhaseIndicator`
10. `ViewportTutorialDialogue`

The work is a component-boundary redesign, not a file-moving exercise. Each promoted component must have a small UI-only API, an explicit presentation model, semantic callbacks, deterministic component tests, a live `/cumulus` demo, generated reference documentation, and real product adoption. Current screen-local implementations should be substantially simplified as their visual and interaction responsibilities move into the catalog.

## Related Information

- [Cumulus design-system doctrine](../../journey_prototype/cumulus_design_system.md)
- [Cumulus screen composition](../../journey_prototype/cumulus_screen_composition.md)
- [Journey screen host and chrome system](../../../src/cumulus/docs/systems/journey-screen-host-chrome.tsx)
- [Entity reveal coordinator system](../../../src/cumulus/docs/systems/entity-reveal-coordinator.tsx)
- [Cumulus component registry](../../../src/cumulus/docs/registry.ts)
- [Cumulus strict API contract](../../../scripts/cumulus-strict-api.contract.test.mjs)
- [Cumulus container allowlist](../../../eslint-rules/cumulus-containers.js)
- [Journey prototype QA scenes](../../journey_prototype/qa_scenes.md)

## Current-State Findings

The ten candidates fall into four coherent families.

| Family | Candidate | Current implementation | Existing product adoption |
| --- | --- | --- | --- |
| Site composition | `SiteLayout` | `GuideGallerySiteLayout` under `src/cumulus/screens/`, plus a parallel Dreamsign Revelation composition | Augury, Shop, Dreamsign Bazaar, Duplication, Exploration, Gamble, Purge, Random Site, Transfiguration, and Dreamsign Revelation |
| Site workflows | `DreamsignReplacementDialog`, `TransfigurationPickerPanel`, `TransfigurationDetailPanel`, `ExplorationChoice`, `CardChangePair` | Shared or repeated screen-local functions | Multiple site screens and reward presentations |
| Battle surfaces | `BattleForeseeEditor`, `BattlefieldCard`, `BattlePhaseIndicator` | Screen-local implementations in battle screens | Playable battle and tutorial battle |
| Tutorial placement | `ViewportTutorialDialogue` | Shared screen utility with document-wide selector knowledge | Draft, Purge, and battle tutorial guidance |

`SiteLayout` is the common full-viewport site stage for the routed site family. It owns scene art, atmosphere, guide art, dialogue, safe-area geometry, responsive stage composition, and journey-HUD clearance. Its content remains screen-supplied. Glass is a property of the supplied content, so Revelation can use the same stage without a glass gallery.

Draft and Battle retain dedicated stages. Essence and Reward remain inline dreamscape interactions. Those four surfaces are outside the `SiteLayout` migration.

## Architecture

### Component tier

The promoted source files live under `src/cumulus/components/`:

```text
components/
  battle/
    BattlefieldCard.tsx
    BattleForeseeEditor.tsx
    BattlePhaseIndicator.tsx
  card/
    CardChangePair.tsx
    TransfigurationDetailPanel.tsx
    TransfigurationPickerPanel.tsx
  controls/
    ExplorationChoice.tsx
  layout/
    SiteLayout.tsx
  overlay/
    DreamsignReplacementDialog.tsx
    ViewportTutorialDialogue.tsx
```

Components may import Cumulus components, primitives, presentation helpers, localization runtime, immutable display types, and UUID identity types. They must not import screens, screen adapters, journey state, reducers, coop actions, battle rules, encounter resolution, or domain services.

### Screen and builder tiers

- Builders and adapters resolve catalog data, legality, affordability, target selection, battle state, encounter mechanics, and localized presentation models.
- Screens coordinate workflow state, product sequencing, navigation, logging, overlays, and animation phases that span multiple components.
- Components own rendering, accessibility, responsive presentation, input normalization, and local interaction state that exists only to operate the visible control.
- Callbacks emit stable identities or complete UI edit results. They do not perform journey mutations.

### Public API rules

All ten APIs follow these rules:

- Every prop and nested model field has JSDoc suitable for generated documentation.
- IDs are stable UUIDs or prepared instance IDs. Card and Dreamsign identity never depends on a display name.
- Primary actions use `onPress`; collection actions use specific forms such as `onCardPress` or `onDreamsignPress`; controlled values use `onChange`.
- Mutually exclusive modes are discriminated unions or named variants, not collections of loosely related booleans.
- The API exposes no `style`, `className`, `CSSProperties`, raw color, raw image URL, arbitrary glyph class, numeric visual knob, or undocumented test-selector prop.
- The API accepts no `ReactNode` or `ReactElement` slot except `SiteLayout`, whose purpose is to host screen-specific content.
- Components receive resolved display snapshots and prepared availability. They do not look up entities or recalculate business rules.
- Components never accept indexes as identity and never return mutable domain objects from callbacks.
- Responsive layout is component-owned. Product callers do not pass `"mobile" | "desktop"` into the promoted APIs.
- Product-specific diagnostics stay on the screen wrapper unless a stable semantic data attribute belongs to the component contract.

### Locked API enforcement

The implementation must make API discipline executable:

- Add a component-tier import-boundary check that rejects imports from screen, adapter, state, coop-action, and battle-rule modules.
- Extend `scripts/cumulus-strict-api.contract.test.mjs` with exact public prop-name assertions for the ten components.
- Keep `SiteLayout` as the sole new member of `eslint-rules/cumulus-containers.js`.
- Add compile-time fixtures for discriminated unions and callback payloads where react-docgen cannot prove the complete contract.
- Require a deliberate contract-test change for every future public prop addition.

## Non-Goals

- Changing encounter, battle, Transfiguration, Dreamsign-capacity, or site-resolution rules.
- Rewriting the screen/builder/adapter architecture.
- Consolidating every reward animation into one choreography system.
- Promoting object-travel animation in this work item.
- Redesigning Draft, Battle, Essence, or Reward around `SiteLayout`.
- Adding visible copy beyond copy already supplied by the relevant flow.
- Preserving screen-local API shapes when a smaller component contract is available.

## Global Test and Documentation Standard

Every component task includes all of the following before its product migration is considered complete:

1. A focused jsdom component test beside the source.
2. Synthetic UUID-backed fixtures with complete resolved display snapshots.
3. Tests for semantic callback payloads, disabled behavior, keyboard activation, and relevant controlled state.
4. Tests for named variants and extreme content geometry without assertions on exact player-facing strings.
5. A demo module under `src/cumulus/docs/demos/` with meaningful interactive state.
6. A registry entry with one-sentence `callout`, supporting `details`, usage snippets, and related UI-system links.
7. Generated metadata and reference documentation.
8. At least one real product consumer in the same change.
9. Focused browser QA on the component page and affected product workflow.
10. An empty captured browser error buffer.

Generated Markdown is output. Edit component JSDoc, demo entries, and UI-system sources, then regenerate.

## Task 1 — Establish the Promotion Guardrails and Characterization Matrix

**Files:**

- Modify: `scripts/cumulus-strict-api.contract.test.mjs`
- Add: `scripts/cumulus-component-boundaries.contract.test.mjs`
- Modify: `eslint-rules/cumulus-containers.js`
- Modify as required: review/test command registration
- Add focused characterization tests beside current screen-local implementations where coverage is missing

### Required work

- Establish the exact intended public prop-name manifest for all ten components. Add each manifest assertion atomically with its component so every intermediate task remains green; once present, the assertion should fail on both added and missing props.
- Add a source-boundary contract for `src/cumulus/components/**` that rejects imports from:
  - `src/cumulus/screens/**`
  - `src/screens/**`
  - `src/state/**`
  - `src/coop/**` action/state modules
  - battle engines, encounter resolvers, reducers, and journey mutation services
- Permit presentation types from `src/types/**`, localization runtime, immutable catalog display data, Cumulus primitives/components, and narrowly scoped component-internal helpers.
- Replace the container allowlist entry for `GuideGallerySiteLayout` with `SiteLayout` when Task 2 lands. Do not grant a container exemption to another promoted component.
- Add type-level fixtures that prove invalid combinations do not compile: unsupported layout recipes, incomplete Transfiguration states, an invalid Foresee result shape, and a Battlefield drag callback on a passive card. Use runtime tests to reject Foresee IDs outside the supplied card set.
- Capture current observable behavior before extraction:
  - Site composition geometry at desktop and narrow widths.
  - Dreamsign replacement identity routing.
  - Transfiguration picker/detail disabled and confirmation behavior.
  - Foresee order/void/count behavior.
  - Exploration quick-press versus hold-to-read behavior.
  - Battlefield card press/drag suppression and status overlays.
  - Phase-indicator orientation.
  - Tutorial dialogue obstacle and anchor placement.
- Treat characterization tests as migration protection. Rewrite them around stable component contracts as each task lands.

### Acceptance criteria

- A component importing a screen or business engine fails a focused contract test.
- A new arbitrary slot or styling prop fails the existing strict API suite.
- `SiteLayout` is the only new raw-content container exemption.
- The guardrails run through the normal diff-aware review path.

## Task 2 — Promote `SiteLayout` and Migrate the Routed Site Family

**Files:**

- Add: `src/cumulus/components/layout/SiteLayout.tsx`
- Add: `src/cumulus/components/layout/SiteLayout.test.tsx`
- Add: `src/cumulus/docs/demos/site-layout.tsx`
- Modify: `src/cumulus/docs/registry.ts`
- Modify: `eslint-rules/cumulus-containers.js`
- Modify: `docs/journey_prototype/cumulus_screen_composition.md`
- Migrate: `src/cumulus/screens/AugurySiteScreen.tsx`
- Migrate: `src/cumulus/screens/CardShopSiteScreen.tsx`
- Migrate: `src/cumulus/screens/DreamsignBazaarSiteScreen.tsx`
- Migrate: `src/cumulus/screens/DreamsignRevelationScreen.tsx`
- Migrate: `src/cumulus/screens/DuplicationSiteScreen.tsx`
- Migrate: `src/cumulus/screens/ExplorationSiteScreen.tsx`
- Migrate: `src/cumulus/screens/GambleSiteScreen.tsx`
- Migrate: `src/cumulus/screens/PurgeSiteScreen.tsx`
- Migrate: `src/cumulus/screens/RandomSiteScreen.tsx`
- Migrate: `src/cumulus/screens/TransfigurationSiteScreen.tsx`
- Delete after migration: `src/cumulus/screens/GuideGallerySiteLayout.tsx`
- Consolidate or delete after migration: `src/cumulus/screens/guide-gallery-geometry.ts`

### Target API

The intended contract is structurally equivalent to:

```ts
type SiteLayoutComposition =
  | "balanced-gallery"
  | "content-led-gallery"
  | "balanced-dialogue"
  | "balanced-revelation"
  | "content-led-revelation"
  | "balanced-expanded-revelation"
  | "content-led-expanded-revelation";

interface SiteLayoutGuide {
  id: string;
  name: LocalizedString;
  line: LocalizedString;
  art: ArtRef;
  presence: "speaking" | "portrait-only";
}

interface SiteLayoutProps {
  siteId: string;
  scene: ArtRef | null;
  atmosphere: "warm" | "violet";
  guide: SiteLayoutGuide;
  composition: SiteLayoutComposition;
  children: ReactElement;
}
```

The final names may be tuned during implementation, but the constraints are fixed: one named composition recipe, one typed guide model, one scene, one atmosphere role, and one genuine content slot. The API must not retain independent desktop/mobile switches, region-size switches, speech visibility booleans, render callbacks, overlay children, or per-element test IDs.

### Required work

- Move full-viewport ownership, scene resolution, Motes, safe areas, guide art, speech bubble, HUD clearance, and responsive composition into `SiteLayout`.
- Collapse the current desktop/mobile option cross-product into named recipes corresponding to proven compositions. Each recipe owns both breakpoints and intermediate-width behavior.
- Put guide visibility into the `presence` union so portrait-only states cannot accidentally retain an accessible hidden speech bubble.
- Make screen content responsive within its allocated region. Replace `renderGallery(layout)` and downstream `layout` props with container-aware or internally responsive content.
- Render overlays as screen siblings above `SiteLayout`; the content slot is reserved for the site body.
- Migrate Dreamsign Revelation onto the same scene/guide/safe-area composition using a Revelation recipe. Its offer presentation remains glass-free.
- Preserve router-owned journey chrome. `SiteLayout` must not render the JourneyStatusBar or utility menu.
- Keep Draft and Battle on their dedicated stages and Essence/Reward inline.
- Use stable component-owned data attributes for composition and guide presence; keep screen-specific QA selectors on screen content wrappers.
- Update the screen-composition document to define the routed site family and the four explicit exceptions.

### Tests

- Render every composition recipe at representative desktop and narrow widths.
- Assert stage, content region, guide, speech, and safe-area relationships through DOM geometry.
- Exercise speaking and portrait-only guide states.
- Prove a null scene uses the existing fallback presentation without changing the stage contract.
- Prove content receives exactly one mounted region and overlays remain independent siblings.
- Add route-level regression tests for Dreamsign Revelation and one standard gallery site.

### Demo and documentation

- Provide controls for composition, guide presence, scene presence, and atmosphere.
- Demonstrate gallery, dialogue, and glass-free Revelation content.
- Link to `journey-screen-host-chrome`.
- Document that content chooses its own material and that floating panels hug content.
- Use product screens only as nonexclusive examples.

### Browser QA

- `/cumulus#/site-layout` at desktop, narrow mobile, and an intermediate showcase width.
- `?goto=shop`, `?goto=augury`, `?goto=dreamsign-revelation`, `?goto=random-site`, and one `?goto=gamble&gambleGame=...` route.
- Measure guide/content overlap, speech-pointer alignment, HUD clearance, safe-area clearance, and intermediate-width composition.

## Task 3 — Promote `DreamsignReplacementDialog` and Remove the Bazaar Fork

**Files:**

- Add: `src/cumulus/components/overlay/DreamsignReplacementDialog.tsx`
- Add: `src/cumulus/components/overlay/DreamsignReplacementDialog.test.tsx`
- Add: `src/cumulus/docs/demos/dreamsign-replacement-dialog.tsx`
- Modify: `src/cumulus/docs/registry.ts`
- Migrate: `src/cumulus/screens/DreamscapeScreen.tsx`
- Migrate: `src/cumulus/screens/DreamsignBazaarSiteScreen.tsx`
- Migrate: `src/cumulus/screens/DreamsignRevelationScreen.tsx`
- Migrate: `src/cumulus/screens/GambleSiteScreen.tsx`
- Modify builders that prepare replacement display models
- Delete after migration: `src/cumulus/screens/DreamsignReplacementDialog.tsx`

### Target API

```ts
interface DreamsignReplacementModel {
  incoming: LocalizedDreamsign;
  held: readonly LocalizedDreamsign[];
  capacity: number;
  dismissLabel: LocalizedString;
  closeLabel: LocalizedString;
}

interface DreamsignReplacementDialogProps {
  model: DreamsignReplacementModel;
  onDreamsignPress: (dreamsignId: string) => void;
  onDismiss: () => void;
}
```

### Required work

- Compose `GlassDialog`, `Dreamsign`, and `GlassButton` inside the component.
- Resolve all Dreamsign identities by UUID before rendering and route only UUIDs through `onDreamsignPress`.
- Keep capacity pluralization and dialog presentation local; keep capacity rules, pending acquisition, and the replacement mutation in builders/adapters.
- Replace the Bazaar screen-local fork and its index callback with the same UUID API.
- Preserve differing dismissal copy through the structured model rather than adding product-mode booleans.
- Keep the dialog fully informative when a held Dreamsign is unavailable; selection availability, if required by future rules, must be explicit prepared display data.
- Remove consumer-specific dimensions and modal materials from the screens.

### Tests

- Route the exact held Dreamsign UUID for pointer and keyboard activation.
- Prove dismissal works from both the close control and labeled dismiss action.
- Cover one and many capacity values structurally without asserting authored copy.
- Cover empty, one-item, and maximum-density held collections.
- Assert every rendered Dreamsign remains registered with the reveal coordinator.

### Demo and documentation

- Offer incoming/held count controls and an interaction log showing the selected UUID.
- Document replacement semantics, UUID identity, and the difference between reading a Dreamsign and selecting it.
- Link to the Entity Reveals UI system.

### Browser QA

- `/cumulus#/dreamsign-replacement-dialog` at desktop and mobile.
- `?goto=reward-at-cap`, `?goto=dreamsign-revelation`, and `?goto=dreamsignbazaar` through the replacement branch.

## Task 4 — Promote `TransfigurationPickerPanel`

**Files:**

- Add: `src/cumulus/components/card/TransfigurationPickerPanel.tsx`
- Add: `src/cumulus/components/card/TransfigurationPickerPanel.test.tsx`
- Add: `src/cumulus/docs/demos/transfiguration-picker-panel.tsx`
- Modify: `src/cumulus/docs/registry.ts`
- Migrate: `src/cumulus/screens/TransfigurationSiteScreen.tsx`
- Migrate: `src/cumulus/screens/ExplorationSiteScreen.tsx`
- Modify: `src/screens/cumulus_adapters/transfiguration-view-model.ts`
- Modify: `src/screens/cumulus_adapters/exploration-view-model.ts`

### Target API

```ts
type TransfigurationPickerState =
  | { kind: "loading" }
  | {
      kind: "ready";
      presentation: "offer" | "open-deck";
      cards: readonly TransfigurationPickerCard[];
    };

interface TransfigurationPickerPanelProps {
  state: TransfigurationPickerState;
  onCardPress: (entryId: string) => void;
  onDismiss: () => void;
}
```

`TransfigurationPickerCard` contains a deck-entry ID, resolved `GameCardModel`, and a closed availability state such as `available`, `unavailable`, or `reforged`. It does not contain eligibility rules.

### Required work

- Build on `CardPickerPanel`; keep Transfiguration-specific title, status, captions, and decline placement inside the promoted component.
- Replace `ready`, `isEnhanced`, and `layout` booleans with the discriminated state and named presentation.
- Make responsive header/footer action placement component-owned.
- Map domain candidate availability and reforged form display in the two builders.
- Emit only the selected deck-entry ID.
- Keep the picker free of Essence calculation and form-selection logic.

### Tests

- Cover loading, empty-ready, offer, and open-deck states.
- Prove unavailable/reforged cards remain readable and do not activate.
- Prove the exact entry ID reaches `onCardPress`.
- Assert action placement changes responsively without a caller layout prop.

### Demo and documentation

- Toggle loading/ready, offer/open-deck, card count, and candidate availability.
- Document when to use the Transfiguration-specific panel instead of generic `CardPickerPanel`.

### Browser QA

- `/cumulus#/transfiguration-picker-panel`.
- `?goto=transfiguration`, `?goto=transfiguration-enhanced`, and an Exploration Transfiguration follow-up.

## Task 5 — Promote `TransfigurationDetailPanel`

**Files:**

- Add: `src/cumulus/components/card/TransfigurationDetailPanel.tsx`
- Add: `src/cumulus/components/card/TransfigurationDetailPanel.test.tsx`
- Add: `src/cumulus/docs/demos/transfiguration-detail-panel.tsx`
- Modify: `src/cumulus/docs/registry.ts`
- Migrate: `src/cumulus/screens/TransfigurationSiteScreen.tsx`
- Migrate: `src/cumulus/screens/ExplorationSiteScreen.tsx`
- Migrate: `src/cumulus/screens/GambleSiteScreen.tsx`
- Modify the corresponding view-model builders

### Target API

```ts
type TransfigurationDetailNavigation =
  | { kind: "fixed" }
  | { kind: "reselectable"; onBack: () => void };

interface TransfigurationDetailPanelProps {
  candidate: TransfigurationDetailCandidate;
  value: TransfigurationType | null;
  status: "idle" | "submitting" | "accepted";
  quote: "show-cost" | "included";
  navigation: TransfigurationDetailNavigation;
  onChange: (type: TransfigurationType) => void;
  onConfirm: (type: TransfigurationType) => void;
}
```

### Required work

- Compose `GlassPanel`, `GameCard`, `TransfigurationButton`, and `GlassButton`.
- Accept resolved form presentations, quoted costs, and affordability in the candidate model.
- Replace the optional `onBack`, confirming/accepted boolean combination, layout prop, and cost boolean with closed unions.
- Emit the selected `TransfigurationType` on confirmation. Do not return the complete form object to the caller.
- Keep selection controlled so product workflows can persist or reset it intentionally.
- Own responsive arrangement, action-width reservation, disabled presentation, and canonical Transfiguration copy.
- Leave price computation, payment, mutation, and already-accepted determination in builders/adapters.

### Tests

- Cover every status and both navigation variants.
- Prove only an affordable selected form can confirm.
- Prove `onChange` and `onConfirm` emit the form type.
- Cover three-plus forms and long localized form names at desktop and narrow widths.
- Prove `included` suppresses the quoted action cost without changing the form data.

### Demo and documentation

- Expose selected form, status, quote, and navigation as interactive controls.
- Document the boundary between prepared form quotes and the panel's presentation state.

### Browser QA

- `/cumulus#/transfiguration-detail-panel`.
- Transfiguration, Exploration, and Gamble workflows that host the panel.

## Task 6 — Promote `CardChangePair` and Converge Repeated Before/After Surfaces

**Files:**

- Add: `src/cumulus/components/card/CardChangePair.tsx`
- Add: `src/cumulus/components/card/CardChangePair.test.tsx`
- Add: `src/cumulus/docs/demos/card-change-pair.tsx`
- Modify: `src/cumulus/docs/registry.ts`
- Migrate: `src/cumulus/screens/AugurySiteScreen.tsx`
- Migrate: repeated pair presentations in `src/cumulus/screens/ExplorationSiteScreen.tsx`
- Modify relevant Augury and Exploration view-model builders

### Target API

```ts
type CardChangeKind =
  | "replacement"
  | "copy"
  | "transfiguration"
  | "keyword"
  | "card-type";

interface CardChangePairModel {
  changeId: string;
  kind: CardChangeKind;
  before: { entryId: string; card: GameCardModel };
  after: { entryId: string; card: GameCardModel };
}

interface CardChangePairProps {
  model: CardChangePairModel;
  reveal: "before" | "complete";
}
```

### Required work

- Own the paired card geometry, canonical arrow, `GlassPanel` material, semantic selection treatments, and accessible group description.
- Use the change kind only to select a Cumulus visual recipe and accessibility template. Do not infer or apply a card mutation.
- Keep choreography timing and list staggering in the screen. The component accepts a controlled reveal phase and honors reduced motion internally.
- Remove caller-provided viewport layout, card width, gap, arrow, selection, and test-ID knobs.
- Map replacement, copy, Transfiguration, keyword, and card-type results into one prepared model in the builders.
- Preserve both entry IDs and card UUIDs as semantic attributes for diagnostics.
- Leave multi-step compound reward sequencing in Exploration.

### Tests

- Cover all five change kinds and both reveal phases.
- Assert selection semantics on before/after `GameCard` instances.
- Assert UUID and entry-ID stability when display names collide.
- Cover long names, dense rules text, and narrow containers without clipping.
- Confirm reduced motion produces the complete state immediately.

### Demo and documentation

- Provide change-kind and reveal-phase controls using UUID-backed card fixtures.
- Document that the component displays a resolved change and never performs one.
- Link to Entity Reveals because both cards remain fully inspectable.

### Browser QA

- `/cumulus#/card-change-pair`.
- Augury detail plus representative Exploration replacement and Transfiguration outcomes.

## Task 7 — Promote `ExplorationChoice` as a Reveal-Aware Semantic Action

**Files:**

- Add: `src/cumulus/components/controls/ExplorationChoice.tsx`
- Add: `src/cumulus/components/controls/ExplorationChoice.test.tsx`
- Add component-internal presentation types/helpers as needed
- Add: `src/cumulus/docs/demos/exploration-choice.tsx`
- Modify: `src/cumulus/docs/registry.ts`
- Migrate: `src/cumulus/screens/ExplorationSiteScreen.tsx`
- Modify: `src/screens/cumulus_adapters/exploration-view-model.ts`

### Target API

```ts
type ExplorationChoicePart =
  | { kind: "text"; value: LocalizedString }
  | { kind: "rules"; value: LocalizedString }
  | { kind: "entity"; entity: ExplorationChoiceEntity };

interface ExplorationChoiceModel {
  actionId: string;
  label: LocalizedString;
  description: readonly ExplorationChoicePart[];
  disclosure?: LocalizedString;
  availability: "available" | "unavailable";
  preview?: ExplorationChoiceEntity;
}

interface ExplorationChoiceProps {
  model: ExplorationChoiceModel;
  onPress: (actionId: string) => void;
}
```

`ExplorationChoiceEntity` is a closed UUID-backed display union for the entities the choice can reveal. It contains presentation data only.

### Required work

- Move the row layout, label/effect typography, arrow, disabled treatment, inline entity labels, and reveal-aware gesture handling into the component.
- Replace substring searching in the component path with an ordered prepared `description` sequence. The builder resolves authored placeholders into text, rules, and entity parts.
- Integrate with the Entity Reveal Coordinator so quick press activates, touch hold reads, keyboard activation works, and unavailable choices remain readable.
- Export `onPress(actionId)` and remove `onActivate` from the public boundary.
- Keep action mechanics, target derivation, automatic selection, fallback choice construction, and reducer payloads in the builder/screen.
- Keep `effectKind` and mechanics diagnostics on the screen wrapper or adapter logs rather than in the component API.
- Reuse existing Cumulus rich/rules-text renderers for text parts.

### Tests

- Cover plain, rules, inline-entity, and preview-entity descriptions.
- Prove quick mouse/touch/keyboard activation emits the action ID exactly once.
- Prove hold-to-read does not emit the action.
- Prove unavailable choices expose reveals without activating.
- Prove repeated entity labels are rendered in authored order without name-based identity.
- Cover long localized label/effect content and multiple inline entities.

### Demo and documentation

- Demonstrate plain, card-preview, Dreamsign-preview, and unavailable variants.
- Include an interaction log and reveal instructions.
- Link to Entity Reveals and explain that builders prepare the ordered description parts.

### Browser QA

- `/cumulus#/exploration-choice` with mouse, keyboard, and touch emulation.
- `?goto=exploration` with a choice containing a preview entity and one with inline entities.

## Task 8 — Promote `BattleForeseeEditor` as a Complete UI-Only Edit Workflow

**Files:**

- Add: `src/cumulus/components/battle/BattleForeseeEditor.tsx`
- Add: `src/cumulus/components/battle/BattleForeseeEditor.test.tsx`
- Add internal reorder helpers/tests as needed
- Add: `src/cumulus/docs/demos/battle-foresee-editor.tsx`
- Modify: `src/cumulus/docs/registry.ts`
- Migrate: `src/battle/components/CumulusBattleForeseeOverlay.tsx`
- Migrate: `src/cumulus/screens/TutorialBattleScreen.tsx`
- Modify battle/tutorial view-model builders
- Delete after migration: `src/cumulus/screens/BattleForeseeOverlay.tsx`
- Move and rewrite: `src/cumulus/screens/BattleForeseeOverlay.test.tsx`

### Target API

```ts
interface BattleForeseeEditorModel {
  cards: readonly { battleCardId: string; card: GameCardModel }[];
  allowedCounts: readonly number[];
  initialCount: number;
  source?: DreamwellCardModel;
}

interface BattleForeseeResult {
  viewedCardIds: readonly string[];
  orderedCardIds: readonly string[];
  voidCardIds: readonly string[];
}

interface BattleForeseeEditorProps {
  model: BattleForeseeEditorModel;
  onConfirm: (result: BattleForeseeResult) => void;
}
```

### Required work

- Keep the staged card count, deck order, and void list as component-local edit state.
- Accept prepared `allowedCounts` rather than deriving effect limits from battle rules.
- Validate the model at the boundary: counts are ordered and valid, all result IDs come from the supplied card set, and deck/void partitions are disjoint.
- Compose `GlassDialog`, `GameCard`, optional `DreamwellCard`, and existing Cumulus controls.
- Keep the dialog commit-gated with one explicit confirmation path.
- Preserve pointer capture rather than native HTML drag.
- Add full keyboard editing: focusable card controls, move-before/move-after, move-to-deck, and move-to-void actions with clear accessibility state.
- Reset staged state when the authoritative model identity changes.
- Keep battle effect resolution, authoritative deck mutation, logging, and tutorial progression in their existing owners.

### Tests

- Port the existing Foresee tests to the component tier.
- Cover count increase/decrease, deck reordering, void movement, and complete result emission.
- Exercise pointer and keyboard paths for equivalent results.
- Prove input arrays are not mutated.
- Prove duplicate display names cannot confuse battle-instance IDs.
- Cover zero-card and one-card defensive states even if builders normally prevent them.
- Cover model replacement while mounted.

### Demo and documentation

- Use real UUID-backed card snapshots and an optional Dreamwell source.
- Show the staged result live beneath the demo without coupling it to battle state.
- Document that the component edits a prepared prefix and emits one complete result.

### Browser QA

- `/cumulus#/battle-foresee-editor` at desktop and mobile with pointer and keyboard edits.
- `?goto=battle-playable` and `?goto=tutorial-battle` through Foresee prompts.

## Task 9 — Promote `BattlefieldCard` and Isolate Battle-Board Semantics

**Files:**

- Add: `src/cumulus/components/battle/BattlefieldCard.tsx`
- Add: `src/cumulus/components/battle/BattlefieldCard.test.tsx`
- Add component-local gesture/status helpers and tests as needed
- Add: `src/cumulus/docs/demos/battlefield-card.tsx`
- Modify: `src/cumulus/docs/registry.ts`
- Migrate: `src/cumulus/screens/MobileBattleScreen.tsx`
- Migrate tutorial battle consumers
- Modify: `src/screens/cumulus_adapters/mobile-battle-view-model.ts`
- Modify: `src/screens/cumulus_adapters/tutorial-battle-view-model.ts`

### Target API

The public props should be a discriminated interaction union so passive cards cannot receive drag callbacks:

```ts
type BattlefieldCardInteraction =
  | { kind: "passive" }
  | { kind: "pressable"; onPress: (battleCardId: string) => void }
  | {
      kind: "draggable";
      onPress?: (battleCardId: string) => void;
      onDragStart: (battleCardId: string) => void;
      onDragEnd: (battleCardId: string) => void;
      onDrop: (drop: BattlefieldCardDrop) => void;
    };

interface BattlefieldCardProps {
  model: BattlefieldCardModel;
  interaction: BattlefieldCardInteraction;
}
```

`BattlefieldCardModel` contains battle-instance ID, resolved `GameCardModel`, exhausted state, stored-memory count, figment state, semantic selection, optional challenge marker, optional score announcement, and a named motion mode. It contains no legality calculation.

### Required work

- Extract `FaceUpCard` and `BattleCardStatusIndicators` into one component.
- Own `GameCard` battlefield presentation, exhaustion, memory badge, figment treatment, selection layering, challenge marker, score announcement, press suppression, and pointer-drag visuals.
- Emit semantic pointer results with battle-instance identity. The board continues to map a drop point to a lane, target, or action.
- Keep playable/selectable/targetable decisions in the battle view-model builder and express their result through prepared selection and interaction variants.
- Keep debug context-menu/double-tap behavior outside the public component API. A screen wrapper may layer developer-only behavior around the component.
- Replace product strings such as `zone` with board-owned wrappers and semantic component attributes.
- Preserve the complete `GameCard` reveal during battlefield presentation.
- Consolidate gesture thresholds with existing Cumulus pointer constants and document quick press versus deliberate drag.

### Tests

- Cover passive, pressable, and draggable unions.
- Cover pointer slop, click suppression after drag, cancellation, pointer capture, and one callback per completed gesture.
- Cover exhaustion/selection layering, memory counts, figment, challenge marker, and score announcement.
- Prove the emitted battle-instance ID is independent of card UUID and display name.
- Exercise keyboard press on pressable/draggable cards.
- Assert `GameCard` remains the semantic source and reveal owner.

### Demo and documentation

- Provide interactive controls for status, selection, interaction, challenge marker, and score announcement.
- Show emitted press/drag/drop intents without a battle engine.
- Link to Entity Reveals.
- Document that board geometry and battle legality belong to the caller.

### Browser QA

- `/cumulus#/battlefield-card` in passive, selected, exhausted, and dragging states.
- `?goto=battle-playable` and `?goto=tutorial-battle` at desktop and narrow widths.
- Measure hit targets, dragged-card containment, badge clipping, reveal placement, and inspector-rail interaction.

## Task 10 — Promote `BattlePhaseIndicator`

**Files:**

- Add: `src/cumulus/components/battle/BattlePhaseIndicator.tsx`
- Add: `src/cumulus/components/battle/BattlePhaseIndicator.test.tsx`
- Add: `src/cumulus/docs/demos/battle-phase-indicator.tsx`
- Modify: `src/cumulus/docs/registry.ts`
- Migrate: `src/cumulus/screens/MobileBattleScreen.tsx`
- Migrate tutorial battle consumers
- Move the presentation-level battle phase type to a neutral type or the component module

### Target API

```ts
interface BattlePhaseIndicatorProps {
  phase: "dawn" | "day" | "dusk" | "night" | "challenge";
  side: "near" | "far";
}
```

### Required work

- Own the phase-to-track position map, light/comet treatment, orientation, reduced-motion behavior, and localized accessible description.
- Remove `owner` when it serves only as a test selector; the containing battle status region owns player identity.
- Keep phase progression, active player selection, timers, and turn advancement in battle state.
- Use a stable `data-battle-phase` and `data-battle-side` contract for diagnostics.
- Ensure the indicator composes with both playable and tutorial status bars.

### Tests

- Cover all five phases on both sides.
- Assert near/far geometry and orientation from semantic attributes and style relationships.
- Assert a nonempty accessible name without pinning authored copy.
- Cover reduced motion and rapid controlled phase changes.

### Demo and documentation

- Provide phase and side controls plus an animated cycle action.
- Document that this is a controlled indicator, not a phase state machine.

### Browser QA

- `/cumulus#/battle-phase-indicator`.
- Playable and tutorial battle phase transitions at desktop and mobile widths.

## Task 11 — Promote `ViewportTutorialDialogue` and Document Tutorial Placement as a UI System

**Files:**

- Add: `src/cumulus/components/overlay/ViewportTutorialDialogue.tsx`
- Add: `src/cumulus/components/overlay/ViewportTutorialDialogue.test.tsx`
- Add: `src/cumulus/components/overlay/tutorial-placement.tsx`
- Move/refactor: `src/cumulus/screens/card-tutorial-dialogue-placement.ts`
- Add or move pure placement tests beside the component helper
- Add: `src/cumulus/docs/demos/viewport-tutorial-dialogue.tsx`
- Add: `src/cumulus/docs/systems/tutorial-dialogue-placement.tsx`
- Modify: `src/cumulus/docs/systems/registry.ts`
- Modify: `src/cumulus/docs/registry.ts`
- Migrate: `src/cumulus/screens/DraftScreen.tsx`
- Migrate: `src/cumulus/screens/PurgeSiteScreen.tsx`
- Migrate: `src/cumulus/screens/BattleTutorialGuidance.tsx`
- Modify tutorial view-model builders to emit named placement preferences
- Delete after migration: `src/cumulus/screens/ViewportTutorialDialogue.tsx`

### Target API

```ts
type TutorialDialoguePlacement =
  | { kind: "floating"; avoidance: "cards-and-chrome" }
  | { kind: "anchored"; anchorId: TutorialPlacementAnchorId };

interface ViewportTutorialDialogueProps {
  presentationId: string;
  dialogue: CharacterDialogueModel;
  context: "battle" | "card" | "site";
  placement: TutorialDialoguePlacement;
  visible: boolean;
  diagnostics?: { triggerId?: string; messageIndex?: number };
}
```

### Required work

- Remove `horizontalOffset`, `verticalOffset`, and `bubbleWidth` numeric visual knobs from the public model.
- Replace document-wide selector discovery with a Cumulus placement coordinator:
  - semantic anchors register by `TutorialPlacementAnchorId`;
  - obstacles register their measured element/ref and role;
  - the dialogue reads only the coordinator snapshot;
  - registration and cleanup are safe across route transitions and Strict Mode.
- Keep pure rectangle placement functions deterministic and separately tested.
- Define a small set of named placement preferences only when actual compositions require them.
- Keep `CharacterDialogue` as the visible paired portrait/bubble component.
- Observe the dialogue, registered anchors, registered obstacles, viewport, and safe-area changes. Batch placement updates to avoid resize loops.
- Preserve aria-live behavior and hide unpositioned content until the first valid measurement.
- Keep tutorial sequencing, trigger selection, persistence, and message indexing in tutorial state/builders.
- Add a UI-system page because registration lifecycle, collision avoidance, anchoring, and host responsibilities span multiple components.

### Tests

- Unit-test pure placement with empty, crowded, anchored, clipped, and narrow viewport fixtures.
- Test registration, resize observation, cleanup, route replacement, and duplicate anchor IDs.
- Prove the component does not query product selectors or all GameCards from `document`.
- Cover floating and anchored placement, visible/hidden aria-live state, and safe-area clearance.
- Cover long dialogue copy and obstacle movement without overlap.

### Demo and documentation

- Build a live stage with movable card and chrome obstacles plus a registered site anchor.
- Allow switching floating/anchored, context, visibility, and obstacle configurations.
- Link the component to the new Tutorial Dialogue Placement system page.
- Explain component, host, anchor, obstacle, and tutorial-state responsibilities in the system page.

### Browser QA

- `/cumulus#/viewport-tutorial-dialogue` and `/cumulus#/systems/tutorial-dialogue-placement`.
- `?goto=draft`, a Purge tutorial path, `?goto=tutorial-battle`, and `?goto=tutorial-battle1`.
- Measure collisions against cards, status bars, menus, guide dialogue, and safe areas at desktop and mobile widths.

## Task 12 — Catalog Integration, Product Cleanup, and Final Verification

**Files:**

- Modify: `src/cumulus/docs/registry.ts`
- Modify: `src/cumulus/docs/systems/registry.ts`
- Modify generated Cumulus metadata and reference files
- Modify relevant screen/view-model tests
- Modify Cumulus integrity baselines only when the verified count changes
- Delete obsolete screen-local helpers, types, and tests after their consumers migrate

### Catalog review

- Confirm all ten components appear under `/cumulus` with stable hash routes.
- Confirm registry order groups related controls, card workflows, battle surfaces, overlays, and layout coherently.
- Give every component:
  - one concise blurb;
  - exactly one sentence in `callout` when present;
  - supporting `details` paragraphs;
  - accurate prop descriptions and defaults;
  - one or more useful usage snippets;
  - real consumer counts;
  - relevant UI-system links.
- Ensure each demo renders the real component and resolved models. Product-screen facsimiles are not acceptable substitutes.
- Ensure demos use UUID identity and data-derived fixtures where practical.

### Source cleanup

- Delete `GuideGallerySiteLayout`, screen-local Dreamsign replacement UI, screen-local Transfiguration panels, Exploration choice/pair renderers, Battle Foresee overlay, `FaceUpCard`, battle status indicator helpers, and screen-local tutorial dialogue placement after all imports move.
- Move shared presentation types with their components and keep business view models in adapters.
- Remove layout props and test-ID plumbing made obsolete by component-owned responsive behavior and stable semantic attributes.
- Search for duplicate local functions and stale imports by all prior names.
- Confirm no card/Dreamsign maps, sets, comparisons, or callback payloads are keyed by display name.

### Automated verification

Run focused tests during each task, then run:

```bash
npm run cumulus-metadata
npm run cumulus-docs
npm run review
```

Run `npm run review:full` because this promotion changes cross-cutting component architecture, strict API enforcement, and many product screens. Regenerate repository artifacts through the canonical regeneration command before the final review.

### Browser and visual verification

- Start a dedicated Vite server on a non-5173 port and use a unique `agent-browser` session.
- Assert `location.href` and `window.innerWidth` before every capture.
- Inspect the `/cumulus` overview, each of the ten component pages, every related UI-system page, and affected product routes.
- Use one desktop capture, one narrow/mobile capture, and one changed interaction state for each materially distinct risk. Reuse captures when one route proves several adjacent low-risk components.
- Expand the matrix for `SiteLayout`, `BattlefieldCard`, and tutorial placement because they govern responsive geometry and cross-component coordination.
- Inspect the captured error buffer for render errors, unhandled rejections, and console errors.
- Verify controls remain visible, focusable, readable, and free of clipping or overlap.
- Verify reveal-enabled entities through mouse hover, keyboard focus, quick touch, and touch hold.
- Perform one final cold visual review of the complete change using a fresh-context reviewer, as required for high-aesthetic-risk Cumulus work.
- Request one independent code review for the major cross-cutting implementation and resolve verified findings before the final commit.

### Final acceptance criteria

- All ten components live under `src/cumulus/components/` and appear on `/cumulus`.
- Every component has focused tests, interactive demos, generated reference documentation, and real product adoption.
- Screen-local predecessors and forks are deleted.
- Product screens contain orchestration and composition, not the promoted components' rendering details.
- Builders/adapters own all business-rule and display-model preparation.
- Public APIs expose only semantic named variants, resolved models, stable identities, and UI intent callbacks.
- `SiteLayout` is the only new container escape-hatch entry.
- Strict API and import-boundary checks protect the promoted contracts.
- Existing product workflows preserve their state transitions and logged outcomes.
- Focused checks, diff-aware review, full review, browser workflows, responsive geometry checks, error-buffer inspection, cold visual review, and independent review all pass.
- The implementation is committed once as one detailed local commit and submitted to Tollgate as a speculative candidate.

## Recommended Execution Order

Execute the tasks in the order written. The guardrails establish the architectural boundary first. `SiteLayout` then removes the largest shared screen-level dependency. The site workflow components follow while their consumers are already being simplified. Battle components land together after their shared view-model boundary is explicit. Tutorial placement lands after the container and overlay conventions are established. Catalog integration and cross-route QA close the work as one coherent design-system promotion.
