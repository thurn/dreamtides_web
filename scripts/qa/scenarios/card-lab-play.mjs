// One card-sweep run (scripts/qa/card-sweep.mjs, workflow § Card QA): opens
// the card-lab for `--arg card=<uuid> variant=<v> as=<player|enemy>`, plays
// the card through the UI (as the enemy, the lab opens on the AI's play),
// lets `qa.battle` answer each human prompt with its first legal choice and
// pass until the stack is empty, and returns a verdict:
//
// - `skip`: the card cannot take the variant;
// - `fail`: __caps errors, a rejected lab, a human decision with no visible
//   enabled control, the card not in its expected zone (a character in play,
//   an event in a void or the Banished zone), no `resolved` event for it, no
//   visible board change, or no settled board within `timeoutMs` (or the
//   driver's stall limit);
// - `pending`: none of those, for a card whose text is still pending (D36);
// - `pass`: none of those.
//
// It reads `window.__cardLab` (the scene's report) and `window.__engineProbe`
// (the debug panel's, so the URL carries `debug=1`). `capture=<name>` also
// captures the settled board.

/**
 * @typedef {{ card: string, avatar?: string, dreamsign?: string, side?: string, status: string, reason: string | null, detail: string | null, eligibleVariants: string[], entityKind: "card" | "dreamwell" | "avatar" | "dreamsign" | null, cardStatus: string | null, cardType: string | null, requestedMods: string | null, deckMods: Record<string, unknown> | null }} CardLabReport
 * @typedef {{ id: string, owner: string, zone: string, printing: { kind: string, cardId?: string } }} ProbeInstance
 * @typedef {{ kind: string, side: string, id: string, candidates?: string[] }} ProbePrompt
 * @typedef {{ seq: number, index: number, kind: string, instance: string | null, event: { kind: string, side?: string, card?: string, energyAdded?: number, active?: string, phase?: string, cause?: string, current?: number, max?: number, maxChange?: number } }} ProbeEvent
 * @typedef {{ slice: { committed: { instances: Record<string, ProbeInstance>, stack: unknown[], result: unknown, turn: { active: string, phase: string }, dreamwell: { next: number }, sides: Record<string, { currentEnergy: number, maxEnergy: number, avatar?: { id: string, exhausted: boolean } | null, dreamsigns?: { id: string }[] }> }, inFlight: unknown }, decision: { side: string } | null, pending: ProbePrompt | null, events: ProbeEvent[] }} EngineProbe
 * @typedef {Window & { __cardLab?: CardLabReport, __engineProbe?: EngineProbe }} LabWindow
 * @typedef {{ verdict: "pass" | "fail" | "pending" | "skip", notes: string, failureKinds: ("timeout" | "product" | "unknown")[], lab?: CardLabReport, screens?: string[] }} CardLabPlayResult
 */

/**
 * @param {import("../prelude.mjs").Qa} qa
 * @returns {Promise<CardLabPlayResult>}
 */
export default async function cardLabPlay(qa) {
  const { card, avatar, dreamsign, variant = "base", as: side = "player", mods } = qa.args;
  const deadline = Date.now() + Number(qa.args.timeoutMs ?? "60000");
  /** @type {string[]} */
  const failures = [];
  /** @type {CardLabPlayResult["failureKinds"]} */
  const failureKinds = [];
  const fail = (/** @type {string} */ message, /** @type {CardLabPlayResult["failureKinds"][number]} */ kind = "product") => {
    failures.push(message);
    failureKinds.push(kind);
  };
  /**
   * @param {CardLabPlayResult["verdict"]} verdict
   * @param {Omit<CardLabPlayResult, "verdict" | "notes" | "failureKinds"> & Record<string, unknown>} extra
   * @returns {CardLabPlayResult}
   */
  const outcome = (verdict, extra = {}) => ({ verdict, notes: failures.join("; "), failureKinds, ...extra });

  const caps = async () => {
    const buffer = await qa.caps();
    return buffer === null ? [] : [...buffer.errors, ...buffer.rejections, ...buffer.consoleErrors];
  };

  try {
    const identities = ["card", "avatar", "dreamsign"].filter(key => qa.args[key] !== undefined)
      .map(key => `${key}=${encodeURIComponent(qa.args[key])}`).join("&");
    await qa.open(`/?goto=card-lab&${identities}&variant=${encodeURIComponent(variant ?? "base")}&as=${encodeURIComponent(side ?? "player")}&seed=1&debug=1${mods === undefined ? "" : `&mods=${encodeURIComponent(mods)}`}`, qa.viewport, { allowErrors: true });
    const lab = await qa.waitFor("the card-lab report", () => /** @type {LabWindow} */ (window).__cardLab ?? null, null, { timeout: Math.max(1, deadline - Date.now()), allowErrors: true });
    if (lab.status !== "ready") {
      fail(`card-lab ${String(lab.reason)}${lab.detail === null ? "" : `: ${String(lab.detail)}`}`);
      return outcome(lab.reason === "ineligibleVariant" ? "skip" : "fail", { lab });
    }
    if (mods !== undefined && lab.requestedMods !== mods) fail("the card-lab modifier transport differs from the requested JSON");
    if (mods !== undefined) {
      /** @type {unknown} */
      const parsed = JSON.parse(mods);
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error("the card-lab accepted malformed modifier JSON");
      const requested = /** @type {Record<string, unknown>} */ (parsed);
      const change = typeof requested.typeChange === "object" && requested.typeChange !== null ? /** @type {Record<string, unknown>} */ (requested.typeChange) : null;
      const expected = { sparkBonus: requested.sparkBonus ?? 0, costReduction: requested.costReduction ?? 0, fast: requested.fast ?? false, reclaim: requested.reclaim ?? null, typeChange: change === null ? null : { cardType: change.cardType, subtype: change.subtype } };
      const effective = lab.deckMods ?? { sparkBonus: 0, costReduction: 0, fast: false, reclaim: null, typeChange: null };
      for (const [key, value] of Object.entries(expected)) if (JSON.stringify(effective[key]) !== JSON.stringify(value)) fail(`the card-lab modifier ${key} differs from its request`);
      if (change !== null && lab.cardType !== (change.cardType === "character" ? "Character" : "Event")) fail("the card-lab reports the wrong effective card type");
    }
    await qa.waitFor("the engine probe", () => (/** @type {LabWindow} */ (window).__engineProbe === undefined ? null : true), null, { timeout: Math.max(1, deadline - Date.now()) });
    await qa.waitVisible("[data-battle-mobile]", { timeout: Math.max(1000, deadline - Date.now()) });

    if (lab.entityKind === "avatar" || lab.entityKind === "dreamsign") {
      const entityKind = lab.entityKind;
      const requested = entityKind === "avatar" ? avatar : dreamsign;
      const readAvatar = () => qa.read(({ uuid, owner, domain }) => {
        const probe = /** @type {LabWindow} */ (window).__engineProbe;
        if (probe === undefined) throw new Error("the engine probe is gone");
        const state = probe.slice.committed;
        const other = owner === "player" ? "enemy" : "player";
        const selected = state.sides[owner];
        const opposite = state.sides[other];
        const emblem = domain === "avatar" ? selected.avatar ?? null : selected.dreamsigns?.[0] ?? null;
        const matches = emblem?.id === uuid && (domain === "avatar" || selected.dreamsigns?.length === 1);
        const oppositeEmpty = opposite.avatar == null && (domain === "avatar" || (opposite.dreamsigns?.length ?? 0) === 0 && selected.avatar == null);
        const exercise = probe.events.filter(({ event }) => {
          const source = "source" in event ? event.source : null;
          return (event.kind === "abilityResolved" || event.kind === "triggerResolved") &&
            typeof source === "object" && source !== null && "kind" in source && source.kind === domain && "side" in source && source.side === owner && matches &&
            (domain === "avatar" || "index" in source && source.index === 0 && selected.dreamsigns?.[source.index]?.id === uuid && (event.kind === "abilityResolved" ? "side" in event && event.side === owner : "controller" in event && event.controller === owner));
        });
        return { avatar: domain === "avatar" ? emblem : null, dreamsign: domain === "dreamsign" ? emblem : null, oppositeEmpty,
          matches, turn: state.turn, result: state.result,
          day: state.turn.active === owner && state.turn.phase === "day" || probe.events.some(({ event }) => event.kind === "phaseChanged" && event.active === owner && event.phase === "day"),
          stack: state.stack.length, pending: probe.pending, inFlight: probe.slice.inFlight !== null,
          decision: probe.decision, exercised: exercise.length > 0, exercise };
      }, { uuid: requested, owner: side, domain: entityKind }, { timeout: Math.max(1, deadline - Date.now()) });
      let last = await readAvatar();
      let answered = 0;
      let passes = 0;
      try {
        const run = await qa.battle.playUntil(async (battle) => {
          last = await readAvatar();
          const controls = last.decision?.side !== "player" || battle.canPass || last.result !== null;
          return last.pending === null && !last.inFlight && last.stack === 0 && controls &&
            (last.day || last.result !== null);
        }, { label: "the requested emblem's first Day", timeout: Math.max(1000, deadline - Date.now()), pollMs: 200,
          passWhen: () => !last.day || last.stack > 0 });
        answered = run.answers; passes = run.passes;
      } catch (error) {
        fail(error instanceof Error ? error.message : String(error), qa.isTimeout(error) ? "timeout" : "unknown");
        last = await readAvatar();
      }
      if (lab[entityKind] !== requested || lab.side !== side || !last.matches || !last.oppositeEmpty) fail("the emblem UUID or controller differs from the requested emblem");
      const errors = await caps();
      if (errors.length > 0) fail(`__caps: ${errors.join(" | ")}`);
      const screens = [];
      if (qa.args.capture !== undefined && qa.args.capture !== "") {
        await qa.capture(qa.args.capture); screens.push(`${qa.args.capture}.png`);
      }
      return outcome(failures.length > 0 ? "fail" : lab.cardStatus === "pending" ? "pending" : "pass", {
        lab, avatar: last.avatar, ...(entityKind === "dreamsign" ? { dreamsign: last.dreamsign } : {}), turn: last.turn, exercised: last.exercised, exercise: last.exercise, answered, passes, screens,
      });
    }

    if (lab.entityKind === "dreamwell") {
      const readDraw = () => qa.read(({ uuid, owner }) => {
        const probe = /** @type {LabWindow} */ (window).__engineProbe;
        if (probe === undefined) throw new Error("the engine probe is gone");
        const state = probe.slice.committed;
        const draw = probe.events.find(({ event }) => event.kind === "dreamwellDrawn" && event.card === uuid && event.side === owner);
        const afterDraw = probe.events.filter((record) => draw !== undefined &&
          (record.seq > draw.seq || (record.seq === draw.seq && record.index > draw.index)));
        return {
          observedDraw: probe.events.find(({ event }) => event.kind === "dreamwellDrawn")?.event ?? null,
          draw: draw?.event ?? null,
          day: afterDraw.find(({ event }) => event.kind === "phaseChanged" && event.active === owner && event.phase === "day")?.event ?? null,
          refresh: afterDraw.find(({ event }) => event.kind === "energyChanged" && event.side === owner && event.cause === "refresh")?.event ?? null,
          stack: state.stack.length, pending: probe.pending, inFlight: probe.slice.inFlight !== null,
          decision: probe.decision, result: state.result, turn: state.turn, energy: state.sides[owner], next: state.dreamwell.next,
        };
      }, { uuid: card, owner: side }, { timeout: Math.max(1, deadline - Date.now()) });
      let last = await readDraw();
      let answered = 0;
      let passes = 0;
      let timedOut = false;
      try {
        const run = await qa.battle.playUntil(async (battle) => {
          last = await readDraw();
          const controls = last.decision?.side !== "player" || battle.canPass || last.result !== null;
          const destination = last.day !== null || last.result !== null;
          const settled = last.draw !== null && destination && last.stack === 0 && last.pending === null && !last.inFlight && controls;
          return settled;
        }, {
          label: "the requested Dreamwell draw", timeout: Math.max(1000, deadline - Date.now()), pollMs: 200,
          passWhen: (battle) => last.draw === null || (battle.probe?.stack ?? 0) > 0,
        });
        answered = run.answers;
        passes = run.passes;
      } catch (error) {
        timedOut = qa.isTimeout(error);
        fail(error instanceof Error ? error.message : String(error), timedOut ? "timeout" : "unknown");
        last = await readDraw();
      }
      if (last.observedDraw !== null && (last.observedDraw.card !== card || last.observedDraw.side !== side)) fail("the observed Dreamwell draw has the wrong UUID or side");
      // An interrupted run cannot prove absent downstream evidence. Observed
      // contradictions and caps errors remain product failures, even on timeout.
      if (last.draw === null && !timedOut) fail("no requested UUID and side Dreamwell draw");
      if ((last.refresh === null && !timedOut) || (last.refresh !== null && last.refresh.maxChange !== last.draw?.energyAdded)) fail("no matching catalog energy refresh");
      if (last.next < 1 && (!timedOut || (last.draw !== null && last.pending === null && !last.inFlight && last.stack === 0))) fail("the shared Dreamwell did not advance");
      const errors = await caps();
      if (errors.length > 0) fail(`__caps: ${errors.join(" | ")}`);
      const screens = [];
      if (qa.args.capture !== undefined && qa.args.capture !== "") {
        await qa.capture(qa.args.capture);
        screens.push(`${qa.args.capture}.png`);
      }
      return outcome(failures.length > 0 ? "fail" : lab.cardStatus === "pending" ? "pending" : "pass", {
        lab, drawn: last.draw, day: last.day, refresh: last.refresh, turn: last.turn, energy: last.energy, answered, passes, screens,
      });
    }

    /** The probe as plain data: the lab card's instance, zones, decision, prompt, and events. */
    const read = () =>
      qa.read(
        ({ cardId, owner }) => {
          const probe = /** @type {LabWindow} */ (window).__engineProbe;
          if (probe === undefined) throw new Error("the engine probe is gone");
          const { committed, inFlight } = probe.slice;
          const instance = Object.values(committed.instances).find(
            (candidate) => candidate.owner === owner && candidate.printing.kind === "card" && candidate.printing.cardId === cardId,
          );
          return {
            instance: instance?.id ?? null,
            zone: instance?.zone ?? null,
            stack: committed.stack.length,
            inFlight: inFlight !== null,
            result: committed.result,
            decision: probe.decision,
            pending: probe.pending,
            events: probe.events,
          };
        },
        { cardId: card, owner: side },
        { timeout: Math.max(1, deadline - Date.now()) },
      );
    const start = await read();
    const before = (await qa.battle.state()).board;
    const labInstance = start.instance;
    if (labInstance === null) throw new Error("the lab card is not in the battle");
    qa.note("start", { zone: start.zone, decision: start.decision, pending: start.pending?.kind ?? null });

    if (side === "player") {
      // Play the card through the UI: tap it in the hand.
      await qa.waitVisible(`[data-battle-mobile-row="near-hand"] [data-battle-card-id="${labInstance}"]`, {
        timeout: Math.max(1000, deadline - Date.now()),
      });
      for (let attempt = 0; attempt < 5 && (await read()).zone === "hand"; attempt++) {
        await qa.battle.tap(`[data-battle-mobile-row="near-hand"] [data-battle-card-id="${labInstance}"]`);
        await qa.sleep(400);
      }
    }

    // The driver answers each human prompt with its first legal choice and
    // passes while the stack holds something, until the board settles: no
    // prompt, an empty stack, nothing in flight, the card out of the hand,
    // and a rendered, enabled control when the human owns the next decision,
    // for six reads in a row.
    let quiet = 0;
    let last = await read();
    let answered = 0;
    let passes = 0;
    try {
      const run = await qa.battle.playUntil(
        async (battle) => {
          last = await read();
          const controlReady = last.decision?.side !== "player" || battle.canPass || last.result !== null;
          const settled = last.pending === null && last.stack === 0 && !last.inFlight && last.zone !== "hand" && controlReady;
          quiet = settled ? quiet + 1 : 0;
          return quiet >= 6;
        },
        {
          label: "the card's resolution",
          timeout: Math.max(1000, deadline - Date.now()),
          pollMs: 200,
          passWhen: (battle) => (battle.probe?.stack ?? 0) > 0,
        },
      );
      answered = run.answers;
      passes = run.passes;
    } catch (error) {
      fail(error instanceof Error ? error.message : String(error), qa.isTimeout(error) ? "timeout" : "unknown");
      last = await read();
    }

    const human = last.decision?.side === "player" || last.pending?.side === "player";
    if (human && !(await qa.battle.state()).canPass && last.pending === null && last.result === null) {
      fail("the human decides with no visible, enabled control");
    }
    if (!last.events.some((event) => event.kind === "resolved" && event.instance === labInstance)) {
      fail("no resolved event for the card");
    }
    const expected = lab.cardType === "Character" ? ["play"] : ["void", "banished"];
    // The AI may activate a character after it resolves. A self-abandon cost
    // puts that same instance into the void before the board settles.
    const materialized = last.events.findIndex((event) => event.kind === "materialized" && event.instance === labInstance);
    const resolved = last.events.findIndex((event) => event.kind === "resolved" && event.instance === labInstance);
    const abandonedAfterResolution = last.events.some((event, index) =>
      resolved >= 0 && materialized > resolved && event.kind === "abandoned" && event.instance === labInstance && index > materialized && event.seq > last.events[materialized].seq,
    );
    if (lab.cardType === "Character" && resolved >= 0 && materialized > resolved && abandonedAfterResolution) expected.push("void");
    if (!expected.includes(String(last.zone))) fail(`the card is in ${String(last.zone)}, not ${expected.join(" or ")}`);
    await qa.sleep(600);
    if ((await qa.battle.state()).board === before) fail("no visible board change");
    const errors = await caps();
    if (errors.length > 0 && !failures.some((failure) => failure.includes("__caps"))) fail(`__caps: ${errors.join(" | ")}`);

    const screens = [];
    if (qa.args.capture !== undefined && qa.args.capture !== "") {
      await qa.capture(qa.args.capture);
      screens.push(`${qa.args.capture}.png`);
    }
    const verdict = failures.length > 0 ? "fail" : lab.cardStatus === "pending" ? "pending" : "pass";
    return outcome(verdict, {
      lab,
      zone: last.zone,
      answered,
      passes,
      events: [...new Set(last.events.map((event) => event.kind))],
      screens,
    });
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error), qa.isTimeout(error) ? "timeout" : "unknown");
    return outcome("fail");
  }
}
