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
 * @typedef {{ card: string, status: string, reason: string | null, detail: string | null, eligibleVariants: string[], cardStatus: string | null, cardType: string | null }} CardLabReport
 * @typedef {{ id: string, owner: string, zone: string, printing: { kind: string, cardId?: string } }} ProbeInstance
 * @typedef {{ kind: string, side: string, id: string, candidates?: string[] }} ProbePrompt
 * @typedef {{ seq: number, kind: string, instance: string | null }} ProbeEvent
 * @typedef {{ slice: { committed: { instances: Record<string, ProbeInstance>, stack: unknown[], result: unknown }, inFlight: unknown }, decision: { side: string } | null, pending: ProbePrompt | null, events: ProbeEvent[] }} EngineProbe
 * @typedef {Window & { __cardLab?: CardLabReport, __engineProbe?: EngineProbe }} LabWindow
 * @typedef {{ verdict: "pass" | "fail" | "pending" | "skip", notes: string, lab?: CardLabReport, screens?: string[] }} CardLabPlayResult
 */

/**
 * @param {import("../prelude.mjs").Qa} qa
 * @returns {Promise<CardLabPlayResult>}
 */
export default async function cardLabPlay(qa) {
  const page = qa.page;
  const { card, variant, as: side } = qa.args;
  const deadline = Date.now() + Number(qa.args.timeoutMs ?? "60000");
  /** @type {string[]} */
  const failures = [];
  /**
   * @param {CardLabPlayResult["verdict"]} verdict
   * @param {Omit<CardLabPlayResult, "verdict" | "notes"> & Record<string, unknown>} extra
   * @returns {CardLabPlayResult}
   */
  const outcome = (verdict, extra = {}) => ({ verdict, notes: failures.join("; "), ...extra });

  await qa.open(`/?goto=card-lab&card=${card}&variant=${variant}&as=${side}&seed=1&debug=1`, qa.viewport, { allowErrors: true });
  /**
   * @template T
   * @param {string} label
   * @param {() => T | null | false} predicate
   * @returns {Promise<T>}
   */
  const wait = async (label, predicate) => {
    for (;;) {
      const value = await page.evaluate(predicate, null);
      if (value !== null && value !== false) return /** @type {T} */ (value);
      if (Date.now() > deadline) throw new Error(`timed out waiting for ${label}`);
      await qa.sleep(150);
    }
  };
  const caps = async () => {
    const buffer = await qa.caps();
    return buffer === null ? [] : [...buffer.errors, ...buffer.rejections, ...buffer.consoleErrors];
  };

  try {
    const lab = await wait("the card-lab report", () => /** @type {LabWindow} */ (window).__cardLab ?? null);
    if (lab.status !== "ready") {
      failures.push(`card-lab ${String(lab.reason)}${lab.detail === null ? "" : `: ${String(lab.detail)}`}`);
      return outcome(lab.reason === "ineligibleVariant" ? "skip" : "fail", { lab });
    }
    await wait("the engine probe", () => (/** @type {LabWindow} */ (window).__engineProbe === undefined ? null : true));
    await qa.waitVisible("[data-battle-mobile]", { timeout: Math.max(1000, deadline - Date.now()) });

    /** The probe as plain data: the lab card's instance, zones, decision, prompt, and events. */
    const read = () =>
      page.evaluate(
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
      failures.push(error instanceof Error ? error.message : String(error));
      last = await read();
    }

    const human = last.decision?.side === "player" || last.pending?.side === "player";
    if (human && !(await qa.battle.state()).canPass && last.pending === null && last.result === null) {
      failures.push("the human decides with no visible, enabled control");
    }
    if (!last.events.some((event) => event.kind === "resolved" && event.instance === labInstance)) {
      failures.push("no resolved event for the card");
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
    if (!expected.includes(String(last.zone))) failures.push(`the card is in ${String(last.zone)}, not ${expected.join(" or ")}`);
    await qa.sleep(600);
    if ((await qa.battle.state()).board === before) failures.push("no visible board change");
    const errors = await caps();
    if (errors.length > 0 && !failures.some((failure) => failure.includes("__caps"))) failures.push(`__caps: ${errors.join(" | ")}`);

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
    failures.push(error instanceof Error ? error.message : String(error));
    return outcome("fail");
  }
}
