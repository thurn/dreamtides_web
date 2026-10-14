// @vitest-environment jsdom
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { renderInCumulus } from "../../cumulus/testing/render";
import { beginBattle, apply, DOLL, RED, clear } from "../../rules/journey/journey-on-gain-fixtures";
import type { FoldState } from "../../rules/fold-state";
import { parseClientId } from "../../types/identifiers";
import { makeActions } from "../../session/actions";
import type { GameActions } from "../../session/actions";
import type { EventDraft } from "../../eventlog/local-log";
import { runPolicy, type PolicyRequest } from "../../engine/policy/decide";
import type { PolicyResult } from "../../engine/policy/types";
import { registerBattleInitProvider } from "../../rules/battle/journey-battle";
import { fixtureBattleInitProvider, FIXTURE_POINTS_CARD_ID, FIXTURE_ENGINE } from "../../rules/replay/fixture-providers";
import { useEngineAi } from "./use-engine-ai";
const calls = vi.hoisted(() => ({ state: null as FoldState | null, actions: null as GameActions | null, hosts: [] as { decide: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn>; request: PolicyRequest | null; answer: ((value: PolicyResult) => void) | null }[] }));
vi.mock("../../session/hooks", () => ({ useGameState: () => calls.state, useActions: () => calls.actions, useClientId: () => parseClientId("actor-client") }));
vi.mock("../../engine/policy/host", async (importOriginal) => ({ ...await importOriginal<typeof import("../../engine/policy/host")>(), createWorkerPolicyHost: () => {
  const host = { request: null as PolicyRequest | null, answer: null as ((value: PolicyResult) => void) | null, dispose: vi.fn(), decide: vi.fn((request: PolicyRequest) => {
    host.request = request; return new Promise<PolicyResult>((resolve) => { host.answer = resolve; });
  }) }; calls.hosts.push(host); return host;
} }));
afterEach(() => { clear(); calls.hosts.length = 0; calls.state = null; calls.actions = null; vi.useRealTimers(); });
function Actor() { useEngineAi("random"); return null; }
function enemyTurn() {
  return beginBattle([RED], () => {
    const base = fixtureBattleInitProvider();
    registerBattleInitProvider({ ...base, beginBattle: (input) => {
      const start = base.beginBattle(input); return start === null ? null : { ...start, engineInit: { ...start.engineInit, startingSide: "enemy", decks: { ...start.engineInit.decks, enemy: Array.from({ length: 10 }, () => ({ cardId: FIXTURE_POINTS_CARD_ID })) } } };
    } });
  });
}
it("discards a late host answer while copy owns the fold and submits only after the preserved battle resumes", async () => {
  vi.useFakeTimers();
  const submitted: EventDraft[] = []; calls.actions = makeActions((draft) => { submitted.push(draft); return Promise.resolve(submitted.length); });
  const battle = enemyTurn(); calls.state = battle;
  const rendered = renderInCumulus(<Actor />), first = calls.hosts[0];
  expect(first.request).not.toBeNull(); expect(first.answer).not.toBeNull();
  const pending = apply(battle, "ADD_DREAMSIGN", { dreamsignId: DOLL }).state; calls.state = pending;
  rendered.rerender(<Actor />); expect(first.dispose).toHaveBeenCalledTimes(1);
  await act(async () => { first.answer!(runPolicy(FIXTURE_ENGINE, first.request!)); await Promise.resolve(); vi.runOnlyPendingTimers(); });
  expect(submitted).toEqual([]); expect(calls.hosts).toHaveLength(1);
  if (pending.journey.screen.type !== "journeyDreamsign" || pending.journey.screen.choice.kind !== "copy") throw new Error("missing permission");
  calls.state = apply(pending, "RESOLVE_DREAMSIGN_COPY", { sourceDreamsignId: DOLL, heldIndex: 1, choiceIndex: 0, permissionSeq: pending.journey.screen.choice.permissionSeq, targetHeldIndex: 0, expectedTargetDreamsignId: RED }).state;
  rendered.rerender(<Actor />); const resumed = calls.hosts[1]; expect(resumed.request).not.toBeNull();
  await act(async () => { resumed.answer!(runPolicy(FIXTURE_ENGINE, resumed.request!)); await Promise.resolve(); vi.runOnlyPendingTimers(); });
  expect(submitted).toHaveLength(1); expect(submitted[0]).toMatchObject({ type: "BATTLE_ACTION", payload: { side: "enemy" } });
  rendered.unmount(); expect(resumed.dispose).toHaveBeenCalledTimes(1);
});
it("creates no policy host when a copy with a real battle is restored before the actor mounts", () => {
  calls.actions = makeActions(() => Promise.resolve(1));
  calls.state = apply(beginBattle([RED]), "ADD_DREAMSIGN", { dreamsignId: DOLL }).state;
  expect(calls.state.battle).not.toBeNull();
  renderInCumulus(<Actor />); expect(calls.hosts).toHaveLength(0);
});
