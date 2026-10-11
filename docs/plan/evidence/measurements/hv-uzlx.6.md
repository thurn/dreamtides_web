# hv-uzlx.6 validation evidence

Base: `bbdabee5fdd79672f390c5ce432e2bc674a90256`. D19 keeps test files under approximately 500 lines and permits splitting along subjects. These six files remain in the plan; the parent bead's exact Phase 6.1 `hv-33id.2` skip list names other tutorial-sandbox paths. Every resulting test and fixture is below 500 lines.

| Original file | Base lines | Resulting subject files (lines) |
| --- | ---: | --- |
| src/atlas/atlas-generator.test.ts | 783 | atlas-generator.test.ts (341); atlas-generator-graph.test.ts (166); atlas-generator-progress.test.ts (178); atlas-generator-sites.test.ts (111) |
| src/exploration/compound-action-plan.test.ts | 546 | compound-action-plan.test.ts (153); compound-action-plan-fixed-forms.test.ts (249) |
| src/data/tutorial-actions.test.ts | 517 | tutorial-actions.test.ts (364); tutorial-guidance.test.ts (169) |
| src/components/journey-chrome.test.tsx | 514 | journey-chrome.test.tsx (199); journey-utility-menu.test.tsx (352) |
| src/components/ScreenRouter.test.tsx | 509 | ScreenRouter.test.tsx (186); ScreenRouter-sites.test.tsx (220) |
| src/shop/shop-generator.test.ts | 504 | shop-generator.test.ts (183); shop-generator-inventory.test.ts (295) |

The Atlas files separate site composition, initial graph generation, progression/refolding, and revealed-site queries. Exploration separates uniform/purge-misfit planning from predicate/fixed-form/signature contracts. Tutorial data separates configuration parsing from site guidance, markup, and speech timing. Journey chrome separates chrome/menu rendering from utility view models and commands. ScreenRouter separates transitions/Augury from terminal and site dispatch. Shop separates pricing/runtime conversion from inventory generation. Five sibling fixtures hold the setup needed by multiple subject files; each test retains its own reset/cleanup hooks and direct mock registrations.

All 95 original `it`/`it.each` declarations occur exactly once, with identical source text, names, tables, complete bodies, and assertions. They expand to 106 executed cases both before and after. The retained scratch mapping contains the original line, destination line, and SHA-256 for each declaration: `body-conservation.json`, hash `abc596a2fcc2dff239faf8e3fc56da0cf7f65b9e313b00eadaf4531480c166d4`. `header-conservation.json` verifies exact runtime helper/constant/setup/mock/hook text. Scratch: `/tmp/hv-uzlx-6-checks/`. No tests are deleted or skipped.

The shared Exploration helper's existing distributive type alias constrains `kind` to `ExplorationCompoundActionPlanInput["kind"]`, the same closed discriminants as its input union. This preserves its inferred union while satisfying the semantic lint rule applied to fixture modules. All executable helper bodies stay exact. Initial direct typechecks and the first review exposed moved unused imports and this type-only lint issue; the final review validates the corrections.

Node files remain Node. Both chrome and router destinations retain their `jsdom` environment annotations and identical direct `vi.mock` registrations, which preserve Vitest's isolated-project classification. The fixtures register no mocks or hooks.

| Check | Wrapper wall time | Result | One-minute host load, before → after |
| --- | ---: | --- | --- |
| Focused baseline | 7.281 s | pass | 15.53 → 20.99 |
| Focused final | 7.561 s | pass | 10.52 → 9.59 |
| Review initial | 5.655 s | corrected lint findings | 9.59 → 9.3 |
| Review final | 22.62 s | pass | 6.91 → 7.64 |
| Knip | 3.666 s | pass | 7.64 → 7.64 |

Baseline: 106 cases / 6 files, Vitest 3.66 s. Final focused: 106 cases / 14 files, Vitest 4.81 s. Final review: 106 cases / 14 files, Vitest 4.35 s, with lint, both typechecks, and import-cycle checks passing. These are two-worker observations at changing host load, not a controlled suite-performance comparison. Wrapper times include workspace preparation and asset restoration; phase times can overlap.

The test delta is +8 files, -207 test lines, +2 jsdom files, and zero cases, plus five fixture modules totaling 483 lines. All commands are light checks outside the heavy lease. This source-only split requires no browser workflow, full review, fuzz, server, browser/provider, or long-lived process. Every owned command has returned; no runtime resource remains.
