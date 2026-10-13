import { describe, expect, it } from "vitest";
import type { Side } from "../../engine";
import type { DreamwellCardModel } from "../../cumulus/components/battle/DreamwellCard";
import { SYNTHETIC } from "../../engine/testing/synthetic-cards";
import { enginePromptHeading, enginePromptModeTexts, enginePromptOptionLabel } from "../../runtime/battle-prompt-messages";
import { parseAvatarId, parseBattleCardId, parseBattleId, parseDreamwellCardId, parseOpponentId, parsePromptId } from "../../types/identifiers";
import { buildEngineBattleScreenModel, enginePrintedKeywords, type EngineBattleViewInput } from "./engine-battle-view-model";
import { board, cards, engine } from "./engine-battle-view-model.fixtures";
import { buildPromptHost, type PendingEnginePrompt, type PromptHostInput } from "./prompt-host-view-model";

const avatarIds = {
  player: parseAvatarId("11111111-1111-4111-8111-111111111111"),
  enemy: parseAvatarId("22222222-2222-4222-8222-222222222222"),
};
const staleId = parseAvatarId("33333333-3333-4333-8333-333333333333");
const metadata = (): NonNullable<PromptHostInput["avatars"]> => ({
  player: { avatar: { name: "Synthetic Near", imageNumber: "001" }, avatarProfile: { id: avatarIds.player, ability: "Choose one: gather amber or scatter cobalt." } },
  enemy: { avatar: { name: "Synthetic Far", imageNumber: "002" }, avatarProfile: { id: avatarIds.enemy, ability: "Choose one: gather silver or scatter ochre." } },
});
function payment(sourceSide: Side, answering: Side = "player"): PendingEnginePrompt {
  return { id: parsePromptId("1:0:0"), kind: "payOrDecline", side: answering, energy: 1, payable: true, cancellable: false,
    purpose: { source: { kind: "avatar", side: sourceSide, id: avatarIds[sourceSide] }, role: "opponentUnlessPays", cardId: null, ability: 0 } };
}
function input(prompt: PendingEnginePrompt | null = payment("enemy"), human: Side = "player"): EngineBattleViewInput {
  const { state } = board({});
  return { battleId: parseBattleId("public-avatar-source"), human, view: engine.view(state, human), legal: [], prompt, playing: null,
    decision: null, presented: true, notice: null, cards, catalog: engine.catalog, printedKeywords: enginePrintedKeywords(engine.catalog),
    avatars: metadata(), opponentName: "Synthetic Opponent", essenceReward: 0, resultDismissed: false };
}
function hostInput(source: EngineBattleViewInput): PromptHostInput {
  return { ...source, instances: new Map(Object.values(source.view.instances).map(instance => [parseBattleCardId(instance.id), instance])),
    loopOffer: null, cardView: instance => ({ id: parseBattleCardId(instance.id), model: cards(instance),
      exhausted: instance.status.exhausted, figment: instance.printing.kind !== "card", storedTime: instance.status.counters, showPlayableOutline: false }) };
}
function heading(prompt: PendingEnginePrompt, sourceName: string | null) {
  return enginePromptHeading({ kind: prompt.kind, role: prompt.purpose.role, min: 1, max: 1, sourceName });
}
function answers(model: ReturnType<typeof buildEngineBattleScreenModel>) {
  if (model.prompt.surface.kind !== "choice") throw new Error("Expected public choice surface");
  return model.prompt.surface.options.map(option => option.select);
}

describe("public Avatar prompt attribution", () => {
  it.each([ ["player", "player"], ["player", "enemy"], ["enemy", "player"], ["enemy", "enemy"] ] as const)(
    "resolves source %s independently of answering human %s through the main public builder", (sourceSide, human) => {
      const prompt = payment(sourceSide, human), fixture = input(prompt, human);
      const model = buildEngineBattleScreenModel(fixture);
      expect(model.prompt.host?.heading).toEqual(heading(prompt, fixture.avatars[sourceSide].avatar?.name ?? null));
      expect(model.view.prompt.host?.heading).toEqual(model.prompt.host?.heading);
      expect(model.prompt.sourceCard).toBeNull();
      expect(answers(model)).toEqual([{ kind: "answer", answer: true }, { kind: "answer", answer: false }]);
    });

  it.each(["mismatched", "opponent-id", "no-profile", "no-visual", "unavailable", "wrong-side"] as const)(
    "omits attribution with %s metadata, preserving answers", scenario => {
      const prompt = payment("enemy"), fixture = input(prompt), available = metadata();
      let enemy = available.enemy;
      if (scenario === "mismatched") enemy = { ...enemy, avatarProfile: { id: staleId, ability: "Synthetic unrelated ability" } };
      if (scenario === "opponent-id") enemy = { ...enemy, avatarProfile: { id: parseOpponentId("synthetic-opponent"), ability: "Synthetic unrelated ability" } };
      if (scenario === "no-profile") enemy = { avatar: enemy.avatar };
      if (scenario === "no-visual") enemy = { ...enemy, avatar: null };
      if (scenario === "unavailable") enemy = { ...enemy, avatarProfile: { id: avatarIds.enemy, ability: "Synthetic unavailable ability", unavailable: true } };
      if (scenario === "wrong-side") enemy = available.player;
      const model = buildEngineBattleScreenModel({ ...fixture, avatars: { player: { ...available.player, avatarProfile: { id: avatarIds.enemy, ability: "Synthetic decoy" } }, enemy } });
      expect(model.prompt.host?.heading).toEqual(heading(prompt, null));
      expect(model.prompt.sourceCard).toBeNull();
      expect(answers(model)).toEqual([{ kind: "answer", answer: true }, { kind: "answer", answer: false }]);
    });

  it("keeps the optional direct-host input unidentified by default", () => {
    const prompt = payment("enemy"), direct = hostInput(input(prompt));
    const { avatars: _avatars, ...legacy } = direct;
    expect(buildPromptHost(legacy).host?.heading).toEqual(heading(prompt, null));
  });

  it("identifies equal display names by source UUID and selects only that source's mode text", () => {
    const base = metadata(), sameName = "Synthetic Shared";
    const avatars = { player: { ...base.player, avatar: { ...base.player.avatar!, name: sameName } }, enemy: { ...base.enemy, avatar: { ...base.enemy.avatar!, name: sameName } } };
    for (const sourceSide of ["player", "enemy"] as const) {
      const original = payment(sourceSide);
      const prompt: PendingEnginePrompt = { id: original.id, side: original.side, kind: "chooseMode", cancellable: false,
        purpose: { ...original.purpose, role: "chooseOne" }, options: [{ mode: 0, legal: true }, { mode: 1, legal: true }] };
      const model = buildEngineBattleScreenModel({ ...input(prompt), avatars });
      if (model.prompt.surface.kind !== "choice") throw new Error("Expected modal source choices");
      const texts = enginePromptModeTexts(avatars[sourceSide].avatarProfile!.ability, 2)!;
      expect(model.prompt.host?.heading).toEqual(heading(prompt, sameName));
      expect(model.prompt.surface.options.map(option => option.label)).toEqual(texts.map((text, index) => enginePromptOptionLabel({ kind: "mode", index, text })));
      expect(model.prompt.sourceCard).toBeNull();
    }
  });

  it("does not attribute rules or a masked private source to an available Avatar", () => {
    for (const privateTo of [undefined, "player"] as const) {
      const original = payment("enemy");
      const prompt: PendingEnginePrompt = { ...original, ...(privateTo === undefined ? {} : { privateTo }), purpose: { ...original.purpose, source: null } };
      expect(buildEngineBattleScreenModel(input(prompt)).prompt.host?.heading).toEqual(heading(prompt, null));
    }
  });

  it("keeps waiting, private waiting, held, and absent prompts free of source banners", () => {
    const original = payment("enemy", "enemy");
    for (const privateTo of [undefined, "enemy"] as const) {
      const prompt: PendingEnginePrompt = { ...original, ...(privateTo === undefined ? {} : { privateTo }) };
      const model = buildEngineBattleScreenModel(input(prompt));
      expect(model.prompt.surface.kind).toBe("waiting");
      expect(model.prompt.host?.heading ?? null).toBeNull();
      expect(model.prompt.sourceCard).toBeNull();
    }
    const held = buildEngineBattleScreenModel({ ...input(), presented: false });
    expect(held.prompt.surface.kind).toBe("held");
    expect(held.prompt.host?.heading ?? null).toBeNull();
    expect(held.prompt.sourceCard).toBeNull();
    expect(buildEngineBattleScreenModel(input(null)).prompt.host?.heading ?? null).toBeNull();
  });

  it("preserves physical-card and Dreamwell attribution when Avatar metadata is supplied", () => {
    const { state, ids } = board({ player: { hand: [SYNTHETIC.vanilla1.id] } });
    const original = payment("enemy"), instanceId = ids.player.hand[0];
    const cardPrompt: PendingEnginePrompt = { ...original, purpose: { ...original.purpose, source: instanceId } };
    const direct = hostInput({ ...input(cardPrompt), view: engine.view(state, "player") });
    const { avatars: _avatars, ...legacy } = direct;
    const baseline = buildPromptHost(legacy), enhanced = buildPromptHost(direct);
    expect(enhanced.host).toEqual(baseline.host);
    expect(enhanced.sourceCard).toEqual(baseline.sourceCard);
    expect(enhanced.sourceCard?.id).toBe(parseBattleCardId(instanceId));
    const wellId = parseDreamwellCardId("44444444-4444-4444-8444-444444444444");
    const well: DreamwellCardModel = { cardId: wellId, displaySnapshot: { id: wellId, name: "Synthetic Well", renderedText: "Synthetic well text", energyAdded: 0, imageNumber: 0 } };
    const wellPrompt: PendingEnginePrompt = { ...original, purpose: { ...original.purpose, source: { kind: "dreamwell", side: "enemy", id: wellId } } };
    const wellInput = { ...hostInput(input(wellPrompt)), dreamwellCard: () => well };
    const { avatars: _otherAvatars, ...wellLegacy } = wellInput;
    expect(buildPromptHost(wellInput).host).toEqual(buildPromptHost(wellLegacy).host);
    expect(buildPromptHost(wellInput).host?.heading).toEqual(heading(wellPrompt, well.displaySnapshot.name));
    expect(buildPromptHost(wellInput).sourceCard).toBeNull();
  });

  it("rebuilds saved public purpose read-only and omits a stale source after metadata changes", () => {
    const prompt = payment("enemy"), fixture = input(prompt);
    const snapshot = JSON.stringify(fixture);
    Object.freeze(prompt.purpose.source); Object.freeze(prompt.purpose); Object.freeze(prompt);
    Object.freeze(fixture.avatars.enemy.avatarProfile); Object.freeze(fixture.avatars.enemy.avatar); Object.freeze(fixture.avatars.enemy);
    const first = buildEngineBattleScreenModel(fixture);
    const replayed = JSON.parse(JSON.stringify(prompt)) as PendingEnginePrompt;
    const second = buildEngineBattleScreenModel({ ...fixture, prompt: replayed });
    expect(second.prompt.host).toEqual(first.prompt.host);
    expect(answers(second)).toEqual(answers(first));
    expect(JSON.stringify(fixture)).toBe(snapshot);
    const changed = { ...fixture, avatars: { ...fixture.avatars, enemy: { ...fixture.avatars.enemy, avatarProfile: { id: staleId, ability: "Synthetic replacement" } } } };
    expect(buildEngineBattleScreenModel(changed).prompt.host?.heading).toEqual(heading(prompt, null));
    expect(buildEngineBattleScreenModel(fixture).prompt.host).toEqual(first.prompt.host);
  });
});
