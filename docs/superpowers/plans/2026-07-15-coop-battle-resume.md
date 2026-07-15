# Coop Battle Resume Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the folded battle slice the sole authority for whether the playable battle or the pre-battle reveal renders, including after reload.

**Architecture:** Build the opposing-Dreamcaller preview deterministically from quest state and loaded content without creating fold battle state. The reveal appends `BEGIN_BATTLE`; once that event folds, every client renders the playable surface from `FoldState.battle`. QA preview scenes load only quest state, while the dedicated playable scene may load a battle slice.

**Tech Stack:** React 19, TypeScript, Vitest, Firebase RTDB event log, `agent-browser`.

## Global Constraints

- Coop game flow is derived from the room event-log fold; React `useState` and `useRef` do not gate it.
- Clients write intent events only through `src/coop/actions.ts`.
- Card identity remains UUID-based outside display-only resolution.
- Tests do not assert mutable TOML production defaults or algorithm choices.
- Run `npm run lint`, `npm run typecheck`, and `npm test`, then browser-QA the exact reload scenario.

---

### Task 1: Derive Battle Routing From Fold State

**Files:**
- Modify: `src/components/BattleSiteRoute.tsx`
- Modify: `src/components/BattleSiteRoute.test.tsx`
- Modify: `src/coop/providers/battle-init-provider.ts`
- Test: `src/coop/providers/battle-init-provider.test.ts`
- Modify: `src/state/coop-quest-context.tsx`
- Test: `src/runtime/qa-scenes.test.ts`

**Interfaces:**
- Produces: `createBattlePreview(content: QuestContent, quest: QuestState, siteId: string): BattleInit | null`.
- `BattleSiteRoute` renders the preview only when `FoldState.battle === null`; its Begin callback appends `BEGIN_BATTLE`.
- `BattleSiteRoute` renders `PlayableBattleScreen` whenever `FoldState.battle !== null`, including first mount and reload.

- [x] **Step 1: Write and run the reload regression test**

Representative assertion:

```ts
expect(screen("cumulus-playable")).not.toBeNull();
expect(screen("cumulus-battle-start")).toBeNull();
```

Run: `npx vitest run src/components/BattleSiteRoute.test.tsx`

Expected: FAIL because the local `begunEntryKey` starts empty on mount.

- [x] **Step 2: Add deterministic preview coverage**

Assert that the preview `BattleInit` equals the `init` produced by the registered `BEGIN_BATTLE` provider for the same quest, site, and content.

- [x] **Step 3: Implement fold-derived route selection**

Remove the local begin gate and eager mount effect. Build the deterministic preview while the fold has no battle, append `BEGIN_BATTLE` from the reveal button, and render a short preparing state only while the optimistic/confirmed fold catches up.

- [x] **Step 4: Correct QA bootstrap semantics**

Load battle preview scenes with quest state only. Include a battle slice only for `battle-playable`, preserving its direct-board contract.

- [x] **Step 5: Run focused verification**

Run: `npx vitest run src/components/BattleSiteRoute.test.tsx src/coop/providers/battle-init-provider.test.ts src/runtime/qa-scenes.test.ts`

Expected: all focused tests pass.

- [x] **Step 6: Run full verification and exact browser QA**

Run: `npm run lint`, `npm run typecheck`, and `npm test`.

In an isolated browser session, open a preview scene, click Begin, advance the battle, reload the exact room URL, and assert the playable board renders without the Begin Battle control. Inspect the error buffer and capture a full-viewport 2x screenshot.

- [x] **Step 7: Commit and push**

Commit the implementation, tests, plan, and any regenerated tracked artifacts with a detailed message, then immediately push `wt/coop-battle-resume-20260715`.
