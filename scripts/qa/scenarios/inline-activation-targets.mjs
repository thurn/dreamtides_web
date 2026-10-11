// A normal UI activation on the existing synthetic costs fixture.
// --arg negative=1 records the prior observer false-negative before its fix.
export const viewports = ["desktop", "mobile"];

/** @param {import("../prelude.mjs").Qa} qa */
export default async function inlineActivationTargets(qa) {
  await qa.open("/?goto=prompt-lab-costs&seed=1&debug=1");
  await qa.waitFor("the synthetic battle probe", () => "__engineProbe" in window, null);
  await qa.waitVisible("[data-battle-mobile]");
  await qa.battle.waitFor((battle) => battle.canPass && battle.window === "main");
  const read = () => qa.read(() => {
    const probe = /** @type {Window & { __engineProbe?: { slice: import("../../../src/engine/fold/slice").BattleSlice, pending: (import("../../../src/engine").Prompt & {id: import("../../../src/types/identifiers").PromptId}) | null } }} */ (window).__engineProbe;
    if (probe === undefined) throw new Error("missing synthetic probe");
    return { state: probe.slice.committed, pending: probe.pending, inFlight: probe.slice.inFlight !== null };
  }, null);
  const initial = await read();
  const source = initial.state.sides.player.backRank[1];
  const targets = initial.state.sides.enemy.backRank.filter((id) => id !== null);
  if (source === null || source === undefined || targets.length !== 2) throw new Error("synthetic fixture physical identities missing");
  const sourcePrinting = initial.state.instances[source]?.printing;
  if (sourcePrinting?.kind !== "card" || sourcePrinting.cardId !== "5e5e5e5e-0000-4000-8000-000000000139") throw new Error("synthetic activated source printing mismatch");
  const selector = (/** @type {string} */ id) => `[data-battlefield-card][data-battle-card-id="${id}"]`;
  const activate = async () => {
    if (!(await qa.battle.tap(selector(source)))) throw new Error("activated source has no hit point");
    await qa.battle.playUntil(async () => (await read()).pending?.kind === "chooseTargets",
      { label: "activated target selection", passWhen: () => false });
    await qa.waitFor("visible inline target banner and actual legal cards", ({ ids }) => {
      const probe = /** @type {Window & { __engineProbe?: { pending: { id: string, kind: string } | null } }} */ (window).__engineProbe;
      const banner = document.querySelector("[data-battle-prompt-banner]");
      const dom = /** @type {Window & { __qa?: { rendered: (target: {selector: string}, opacity: number) => Element | null } }} */ (window).__qa;
      return probe?.pending?.kind === "chooseTargets" &&
        dom?.rendered({ selector: "[data-battle-prompt-banner]" }, 0.95) !== null &&
        banner?.getAttribute("data-battle-prompt-id") === probe.pending.id &&
        ids.every((id) => dom?.rendered({ selector: `[data-battlefield-card][data-battle-card-id="${id}"]` }, 0.95) !== null);
    }, { ids: targets });
  };
  const geometry = () => qa.read(({ ids }) => ids.map((id) => {
    const card = document.querySelector(`[data-battlefield-card][data-battle-card-id="${id}"]`);
    const box = card?.getBoundingClientRect();
    const hit = box === undefined ? null : document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
    return { id, role: card?.getAttribute("role"), rank: card?.closest("[data-battle-rank]")?.getAttribute("data-battle-rank"),
      width: box?.width ?? 0, height: box?.height ?? 0, hit: card !== null && hit !== null && card.contains(hit) };
  }), { ids: targets });
  await activate();
  const before = await read();
  const observed = await qa.battle.state();
  const boxes = await geometry();
  if (boxes.some((box) => box.role !== "button" || box.width <= 0 || box.height <= 0 || !box.hit)) throw new Error("inline legal target controls are not actionable");
  const pending = before.pending;
  if (pending?.kind !== "chooseTargets" || pending.side !== "player") throw new Error("wrong activated target protocol");
  const stageAbsent = await qa.read(() => document.querySelector("[data-battle-targeting-card-stage]") === null, null);
  if (!stageAbsent) throw new Error("activation unexpectedly has a play-source stage");

  if (qa.args.negative === "1") {
    if (observed.prompt?.surface !== null || observed.prompt.answerable) throw new Error("negative observation did not reproduce the false-negative");
    await qa.capture(`inline-target-baseline-${qa.viewportName}`);
    const target = pending.candidates[0];
    if (target === undefined || !(await qa.battle.tap(selector(target)))) throw new Error("normal target tap failed");
    await qa.battle.playUntil(async () => (await read()).state.instances[target]?.zone === "void",
      { label: "real effect despite observer false-negative", passWhen: (battle) => (battle.probe?.stack ?? 0) > 0 });
    await qa.assertCaps("negative observer evidence");
    return { negative: true, source, sourcePrinting: sourcePrinting.cardId, target, pendingId: pending.id,
      observed: observed.prompt, stageAbsent, geometry: boxes, realEffect: "target in void" };
  }
  if (observed.prompt?.surface !== "target" || !observed.prompt.answerable || observed.prompt.id !== pending.id) throw new Error("inline activation must be answerable");
  await qa.capture(`inline-target-final-${qa.viewportName}`);
  const cancelGeometry = await qa.read(() => {
    const button = document.querySelector("[data-testid=battle-prompt-cancel]");
    const box = button?.getBoundingClientRect();
    const hit = box === undefined ? null : document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
    return { x: box?.x ?? -1, y: box?.y ?? -1, width: box?.width ?? 0, height: box?.height ?? 0,
      inViewport: box !== undefined && box.x >= 0 && box.y >= 0 && box.right <= innerWidth && box.bottom <= innerHeight,
      hit: button !== null && hit !== null && button.contains(hit) };
  }, null);
  if (!cancelGeometry.inViewport || !cancelGeometry.hit || cancelGeometry.width <= 0 || cancelGeometry.height <= 0) throw new Error("Cancel centre is not actionable");
  await qa.click("[data-testid=battle-prompt-cancel]");
  await qa.battle.waitFor((battle) => battle.prompt === null && battle.canPass);
  const cancelled = await read();
  if (cancelled.pending !== null || cancelled.inFlight ||
      JSON.stringify(cancelled.state.sides.player.hand) !== JSON.stringify(initial.state.sides.player.hand) ||
      cancelled.state.sides.player.currentEnergy !== initial.state.sides.player.currentEnergy ||
      targets.some((id) => cancelled.state.instances[id]?.zone !== "play")) throw new Error("cancel must preserve costs and targets");

  await activate();
  const ready = await qa.battle.state();
  const next = (await read()).pending;
  if (next?.kind !== "chooseTargets" || ready.prompt?.surface !== "target" || !ready.prompt.answerable) throw new Error("retried activation not answerable");
  const candidate = ready.prompt.candidates[0];
  const selected = targets.find((id) => id === candidate);
  if (selected === undefined) throw new Error("driver chose a nonlegal physical target");
  const cursor = await qa.battle.eventCursor();
  if (!(await qa.battle.answer(ready))) throw new Error("normal driver target answer failed");
  await qa.battle.playUntil(async () => (await read()).state.instances[selected]?.zone === "void",
    { label: "activated ability resolves", passWhen: (battle) => (battle.probe?.stack ?? 0) > 0 });
  const final = await read();
  const dissolved = await qa.battle.events(cursor, { match: { kind: "dissolved", instance: selected } });
  if (dissolved.events.length !== 1 || final.state.sides.player.hand.length !== initial.state.sides.player.hand.length - 1 ||
      targets.filter((id) => id !== selected).some((id) => final.state.instances[id]?.zone !== "play")) throw new Error("expected physical effect and one discard cost missing");
  await qa.assertCaps("inline target cancel and answer");
  return { negative: false, source, sourcePrinting: sourcePrinting.cardId, pendingId: pending.id, observed: observed.prompt,
    selected, selectedPrinting: final.state.instances[selected]?.printing, dissolved: dissolved.events,
    cancelled: true, cancelGeometry, handBefore: initial.state.sides.player.hand, handAfter: final.state.sides.player.hand,
    stageAbsent, geometry: boxes };
}
