// One card-sweep run (scripts/qa/card-sweep.mjs, workflow § Card QA): opens
// the card-lab for `--arg card=<uuid> variant=<v> as=<player|enemy>`, plays
// the card through the UI (as the enemy, the lab opens on the AI's play),
// answers each human prompt with its first legal choice, passes until the
// stack is empty, and returns a verdict:
//
// - `skip`: the card cannot take the variant;
// - `fail`: __caps errors, a rejected lab, a human decision with no visible
//   enabled control, the card not in its expected zone (a character in play,
//   an event in a void or the Banished zone), no `resolved` event for it, no
//   visible board change, or no settled board within `timeoutMs`;
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
 * @typedef {Window & { __cardLab?: CardLabReport, __engineProbe?: EngineProbe, __qa?: import("../prelude.mjs").QaDom }} LabWindow
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

  await qa.open(`/?goto=card-lab&card=${card}&variant=${variant}&as=${side}&seed=1&debug=1`, qa.viewports.desktop, {
    allowErrors: true,
  });
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
    /** The board as the human sees it: each rendered card and the zone or rank it sits in. */
    const board = () =>
      page.evaluate(
        () =>
          [...document.querySelectorAll("[data-battle-card-id]")]
            .map((element) => {
              const rank = element.closest("[data-battle-rank]")?.getAttribute("data-battle-rank");
              const row = element.closest("[data-battle-mobile-row]")?.getAttribute("data-battle-mobile-row");
              return `${String(element.getAttribute("data-battle-card-id"))}@${String(rank ?? row ?? element.getAttribute("data-battle-card-zone"))}`;
            })
            .sort()
            .join(","),
        null,
      );
    /** Taps the first point of `selector` that hits it (cards overlap in a fanned hand). */
    /** @param {string} selector */
    const tap = async (selector) => {
      const point = await page.evaluate((target) => {
        const element = document.querySelector(target);
        if (element === null) return null;
        const box = element.getBoundingClientRect();
        for (const fy of [0.5, 0.3, 0.7, 0.15]) {
          for (let x = Math.max(1, box.left + 4); x < Math.min(innerWidth - 1, box.right); x += 4) {
            const y = Math.min(innerHeight - 2, box.top + box.height * fy);
            const hit = document.elementFromPoint(x, y);
            if (hit !== null && element.contains(hit)) return { x, y };
          }
        }
        return null;
      }, selector);
      if (point === null) return false;
      await page.mouse.click(point.x, point.y);
      await qa.rest();
      return true;
    };
    /** Whether a control is rendered, in the viewport, and enabled. */
    /** @param {string} selector */
    const enabled = (selector) =>
      page.evaluate((target) => {
        const element = /** @type {LabWindow} */ (window).__qa?.rendered({ selector: target }, 0.95) ?? null;
        return element !== null && element.getAttribute("aria-disabled") !== "true" && !element.hasAttribute("disabled");
      }, selector);

    const start = await read();
    const before = await board();
    const labInstance = start.instance;
    if (labInstance === null) throw new Error("the lab card is not in the battle");
    qa.note("start", { zone: start.zone, decision: start.decision, pending: start.pending?.kind ?? null });

    if (side === "player") {
      // Play the card through the UI: tap it in the hand.
      await qa.waitVisible(`[data-battle-mobile-row="near-hand"] [data-battle-card-id="${labInstance}"]`, {
        timeout: Math.max(1000, deadline - Date.now()),
      });
      for (let attempt = 0; attempt < 5 && (await read()).zone === "hand"; attempt++) {
        await tap(`[data-battle-mobile-row="near-hand"] [data-battle-card-id="${labInstance}"]`);
        await qa.sleep(400);
      }
    }

    let answered = 0;
    let passes = 0;
    let quiet = 0;
    let last = await read();
    for (;;) {
      if (Date.now() > deadline) {
        failures.push(`timed out (zone ${String(last.zone)}, stack ${String(last.stack)}, pending ${String(last.pending?.kind ?? null)})`);
        break;
      }
      const errors = await caps();
      if (errors.length > 0) {
        failures.push(`__caps: ${errors.join(" | ")}`);
        break;
      }
      last = await read();
      const prompt = last.pending;
      if (prompt !== null && prompt.side === "player") {
        quiet = 0;
        // The first legal choice, through the prompt host's surface for its kind.
        let acted = false;
        if (prompt.kind === "chooseTargets" || prompt.kind === "chooseCards") {
          const [first] = prompt.candidates ?? [];
          if (first !== undefined) {
            acted =
              (await enabled(`[data-testid="battle-card-picker-candidate-${first}"]`) &&
                (await tap(`[data-testid="battle-card-picker-candidate-${first}"]`))) ||
              (await tap(`[data-battlefield-card][data-battle-card-id="${first}"]`)) ||
              (await tap(`[data-battle-card-id="${first}"]`));
            await qa.sleep(250);
          }
          if (await enabled('[data-testid="battle-card-picker-submit"]')) {
            await qa.click('[data-testid="battle-card-picker-submit"]');
            acted = true;
          } else if (!acted && (await enabled('[data-testid="battle-card-picker-skip"]'))) {
            await qa.click('[data-testid="battle-card-picker-skip"]');
            acted = true;
          }
        } else {
          /** @type {Record<string, string>} */
          const controls = {
            chooseMode: '[data-testid="battle-choice-prompt-option-0"]',
            confirm: '[data-testid="battle-choice-prompt-option-0"]',
            payOrDecline: '[data-testid="battle-choice-prompt-option-0"]',
            chooseNumber: '[data-testid="battle-number-picker-submit"]',
            arrange: '[data-testid="battle-arrange-confirm"]',
          };
          const control = controls[prompt.kind];
          if (control !== undefined && (await enabled(control))) {
            await qa.click(control);
            acted = true;
          }
        }
        if (!acted) {
          // The prompt may still be waiting on presentation; it must show a control before the deadline.
          await qa.sleep(250);
          continue;
        }
        answered += 1;
        await page.waitForFunction((id) => /** @type {LabWindow} */ (window).__engineProbe?.pending?.id !== id, prompt.id, { timeout: 10_000 }).catch(() => undefined);
        continue;
      }
      if (prompt === null && last.decision?.side === "player" && last.stack > 0) {
        quiet = 0;
        const pass = "[data-battle-phase-next] button";
        if (await enabled(pass)) {
          await qa.click(pass);
          passes += 1;
          await qa.sleep(300);
        } else {
          await qa.sleep(250);
        }
        continue;
      }
      const settled = prompt === null && last.stack === 0 && !last.inFlight && last.zone !== "hand";
      quiet = settled ? quiet + 1 : 0;
      if (quiet >= 6) break;
      await qa.sleep(200);
    }

    const human = last.decision?.side === "player" || last.pending?.side === "player";
    if (human && !(await enabled("[data-battle-phase-next] button")) && last.pending === null && last.result === null) {
      failures.push("the human decides with no visible, enabled control");
    }
    if (!last.events.some((event) => event.kind === "resolved" && event.instance === labInstance)) {
      failures.push("no resolved event for the card");
    }
    const expected = lab.cardType === "Character" ? ["play"] : ["void", "banished"];
    if (!expected.includes(String(last.zone))) failures.push(`the card is in ${String(last.zone)}, not ${expected.join(" or ")}`);
    await qa.sleep(600);
    if ((await board()) === before) failures.push("no visible board change");
    const errors = await caps();
    if (errors.length > 0 && !failures.some((failure) => failure.startsWith("__caps"))) failures.push(`__caps: ${errors.join(" | ")}`);

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
