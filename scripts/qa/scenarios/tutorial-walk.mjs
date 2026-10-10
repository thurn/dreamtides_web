// The tutorial from the front door to the tutorial Avatar offer, on desktop
// and mobile: the hv-33id.1 beats 01–31 (docs/plan/evidence/measurements/
// hv-33id.1.md). A fresh game (`/main?seed=1`, `--arg seed=<n>`) goes from
// the main menu through the loading screen's Begin into the scripted
// tutorial stage, the live tutorial battle to Victory, and New Journey to
// the tutorial Avatar offer.
//
// Three steps per viewport, each its own runner call on the same page:
//
// 0. Front door and scripted stage (beats 01–19): main menu, loading and
//    Begin, Mira's and the enemy's speech, the opponent's card reveal, the
//    three How to Play panels, the guided hand play and block, and the
//    hand-off to the live battle.
// 1. Live battle (beats 20–30): the player's guided turn (foresee, a card
//    with no valid target, support, Dusk, Night, the challenge result), then
//    the phase button whenever the player holds it until Victory. Beats the
//    enemy's choices raise (27 figment, 28 an enemy card play) are recorded
//    when they show and never required, so whichever policy plays the enemy
//    (`--arg ai=<policy>` adds `?ai=`), the walk reaches Victory.
// 2. Victory's New Journey to the tutorial Avatar offer (beat 31).
//
// Every beat reads the route, the phase, any visible guidance, and an empty
// `__caps`. Waits use test IDs, data attributes, and card UUIDs from
// `src/content/tutorial.ts`, never copy. Captures: 01, 19, 30, and 31.

/**
 * @typedef {{ beat: string, path: string, phase: string | null, guidance: string | null, sides: string, speech: string | null }} Beat
 * @typedef {{ beats: Beat[], speech: string | null, observed: string[] }} Carry
 */

/** @param {import("../prelude.mjs").Qa} qa */
async function tutorialWalk(qa) {
  const page = qa.page;
  const viewport = qa.viewportName;
  /** @type {Carry} */
  const carry = /** @type {Carry | null} */ (qa.carry) ?? { beats: [], speech: null, observed: [] };
  const phaseNext = "[data-battle-phase-next] button";
  const guidance = "[data-battle-tutorial-guidance]";
  const mira = "[data-testid=tutorial-welcome-dialogue][data-character-dialogue-visible=true]";
  const enemySpeech = "[data-tutorial-avatar-dialogue-owner=enemy]";
  const howToPlay = "[data-tutorial-how-to-play-content]";
  const howToPlayClose = "[data-glass-dialog-flowing-close] > button";
  // Card UUIDs of the authored tutorial (src/content/tutorial.ts).
  const cards = {
    markedDirewolf: "e83014d3-9d35-4e80-a1b3-9b25360ad2af",
    glimpseOfWhatWas: "2162742c-09d0-4e62-ae49-0f8f79b45adc",
    flashpointDetonation: "4408b942-09a0-4f4e-a403-10c708c6e3c5",
    nocturneStrummer: "5a980eff-6ec7-44d8-9977-b98e66bbc2c8",
  };

  /** The visible guidance bubble's kind, side, and trigger, or null. */
  const visibleGuidance = () =>
    page.evaluate((selector) => {
      const dom = /** @type {Window & { __qa?: import("../prelude.mjs").QaDom }} */ (window).__qa;
      const element = dom?.rendered({ selector }, 0.95) ?? null;
      if (element === null) return null;
      const [, kind = "", side = ""] = (element.getAttribute("data-presentation-id") ?? "").split(":");
      return { kind, side, trigger: element.getAttribute("data-trigger-id"), presentation: element.getAttribute("data-presentation-id") };
    }, guidance);

  /** Records a beat: the route, phase, guidance, and sides, after asserting an empty `__caps`. */
  const beat = async (/** @type {string} */ name, /** @type {{ capture?: boolean }} */ options = {}) => {
    await qa.assertCaps(`${viewport} ${name}`);
    const state = await page.evaluate(() => ({
      path: location.pathname,
      phase: document.querySelector("[data-battle-phase]")?.getAttribute("data-battle-phase") ?? null,
      sides: [...document.querySelectorAll("[role=group][aria-label]")]
        .map((element) => element.getAttribute("aria-label") ?? "")
        .filter((label) => /\d+ of \d+/.test(label))
        .join(" / "),
      speech: document.querySelector("[data-character-dialogue-visible=true], [data-tutorial-avatar-dialogue]")?.textContent?.replace(/\s+/g, " ").slice(0, 80) ?? null,
    }), null);
    const shown = await visibleGuidance();
    /** @type {Beat} */
    const entry = { beat: name, ...state, guidance: shown === null ? null : `${shown.kind}:${shown.side}:${String(shown.trigger)}` };
    carry.beats.push(entry);
    qa.note(name, entry);
    if (options.capture === true) {
      await qa.rest();
      await qa.capture(`tutorial-walk-${name}-${viewport}`);
    }
  };

  /**
   * Polls `predicate` until it returns a value other than null, undefined, or false.
   *
   * @template T
   * @param {string} label
   * @param {() => Promise<T | null | undefined | false>} predicate
   * @returns {Promise<T>}
   */
  const until = async (label, predicate, timeout = 30_000) => {
    const deadline = Date.now() + timeout;
    for (;;) {
      const value = await predicate();
      if (value !== null && value !== false && value !== undefined) return value;
      if (Date.now() > deadline) throw new Error(`tutorial-walk ${viewport}: timed out waiting for ${label}`);
      await qa.assertCaps(`${viewport} waiting for ${label}`);
      await qa.sleep(100);
    }
  };

  /** Waits for a fully visible speech bubble of `selector` whose text differs from `previous`; returns its text. */
  const nextSpeech = (/** @type {string} */ label, /** @type {string} */ selector, /** @type {string | null} */ previous, timeout = 30_000) =>
    until(label, () =>
      page.evaluate(({ target, before }) => {
        const dom = /** @type {Window & { __qa?: import("../prelude.mjs").QaDom }} */ (window).__qa;
        const element = dom?.rendered({ selector: target }, 0.95) ?? null;
        const text = element?.textContent?.replace(/\s+/g, " ").trim() ?? "";
        return text !== "" && text !== before ? text : null;
      }, { target: selector, before: previous }),
    timeout);

  /** Waits for visible guidance of `kind` (and `side`) whose presentation differs from `previous`. */
  const nextGuidance = (/** @type {string} */ kind, /** @type {string} */ side, /** @type {string | null} */ previous = null, timeout = 30_000) =>
    until(`${kind} guidance`, async () => {
      const shown = await visibleGuidance();
      return shown !== null && shown.kind === kind && shown.side === side && shown.presentation !== previous ? shown : null;
    }, timeout);

  /** Waits until no guidance bubble is visible; dismisses one that outstays `patience`. */
  const guidanceCleared = async (patience = 15_000) => {
    const deadline = Date.now() + patience;
    while ((await visibleGuidance()) !== null) {
      if (Date.now() > deadline) {
        qa.note("dismissed lingering guidance", await visibleGuidance());
        await qa.click("[data-testid=battle-tutorial-dismiss]");
      }
      await qa.sleep(150);
    }
  };

  /** A point on the battle card `id` that `elementFromPoint` resolves to it. */
  const cardPoint = (/** @type {string} */ id) =>
    page.evaluate((cardId) => {
      const element = document.querySelector(`[data-battle-card-id="${cardId}"]`);
      if (element === null) return null;
      const box = element.getBoundingClientRect();
      for (let y = Math.max(0, Math.floor(box.y)); y <= Math.min(innerHeight - 4, box.bottom); y += 6) {
        for (let x = Math.max(0, Math.floor(box.x)); x <= Math.min(innerWidth - 2, box.right); x += 4) {
          if (document.elementFromPoint(x, y)?.closest("[data-battle-card-id]")?.getAttribute("data-battle-card-id") === cardId) return { x: x + 2, y: y + 2 };
        }
      }
      return { x: box.x + box.width / 2, y: Math.min(box.y + box.height / 2, innerHeight - 6) };
    }, id);

  /** The battle card of card UUID `cardId` lowest on screen (the hand), or one whose id starts with `prefix`. */
  const handCard = (/** @type {string} */ cardId, prefix = "\u0000") =>
    until(`hand card ${cardId}`, () =>
      page.evaluate(({ uuid, idPrefix }) => {
        const matches = [...document.querySelectorAll("[data-battle-card-id]")].filter(
          (element) =>
            element.querySelector(`[data-card-id="${uuid}"]`) !== null ||
            (element.getAttribute("data-battle-card-id") ?? "").startsWith(idPrefix),
        );
        matches.sort((a, b) => b.getBoundingClientRect().y - a.getBoundingClientRect().y);
        return matches[0]?.getAttribute("data-battle-card-id") ?? null;
      }, { uuid: cardId, idPrefix: prefix }),
    15_000);

  /** Drags with the pointer in 20 moves, then rests it outside the viewport. */
  const drag = async (/** @type {{ x: number, y: number } | null} */ from, /** @type {{ x: number, y: number }} */ to) => {
    if (from === null) throw new Error(`tutorial-walk ${viewport}: no point to drag from`);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    for (let move = 1; move <= 20; move++) {
      await page.mouse.move(from.x + ((to.x - from.x) * move) / 20, from.y + ((to.y - from.y) * move) / 20);
      await qa.sleep(30);
    }
    await page.mouse.up();
    await qa.rest();
  };

  const slot = "[data-battle-mobile-drop-owner=player][data-battle-slot-id]";
  /** The empty player back slot nearest in x to `x` (the screen's centre by default). */
  const backSlot = (/** @type {number | null} */ x = null) =>
    page.evaluate(({ selector, nearX }) => {
      const centre = nearX ?? innerWidth / 2;
      const slots = [...document.querySelectorAll(`${selector}[data-battle-mobile-drop-rank=back]`)]
        .filter((element) => element.getAttribute("data-battle-slot-filled") !== "true")
        .map((element) => {
          const box = element.getBoundingClientRect();
          return { id: element.getAttribute("data-battle-slot-id"), x: box.x + box.width / 2, y: box.y + box.height / 2 };
        });
      slots.sort((a, b) => Math.abs(a.x - centre) - Math.abs(b.x - centre));
      return slots[0] ?? null;
    }, { selector: slot, nearX: x });

  /** The battle card whose centre lies in a player slot of `rank`, with its centre. */
  const cardInRank = (/** @type {"front" | "back"} */ rank) =>
    page.evaluate(({ selector }) => {
      const slots = [...document.querySelectorAll(selector)].map((element) => element.getBoundingClientRect());
      for (const card of document.querySelectorAll("[data-battle-card-id]")) {
        const box = card.getBoundingClientRect();
        const x = box.x + box.width / 2;
        const y = box.y + box.height / 2;
        if (slots.some((s) => x >= s.x && x <= s.right && y >= s.y && y <= s.bottom)) return { id: card.getAttribute("data-battle-card-id") ?? "", x };
      }
      return null;
    }, { selector: `${slot}[data-battle-mobile-drop-rank=${rank}]` });

  /** The middle of the battlefield, between the two front ranks. */
  const boardMiddle = () =>
    page.evaluate(() => {
      const enemy = document.querySelector("[data-battle-mobile-drop-owner=enemy][data-battle-mobile-drop-rank=front]")?.getBoundingClientRect();
      const player = document.querySelector("[data-battle-mobile-drop-owner=player][data-battle-mobile-drop-rank=front]")?.getBoundingClientRect();
      if (enemy === undefined || player === undefined) throw new Error("no front ranks");
      return { x: innerWidth / 2, y: (enemy.y + enemy.height + player.y) / 2 };
    }, null);

  const closeHowToPlay = async () => {
    await qa.click(howToPlayClose);
    await page.waitForFunction((selector) => document.querySelector(selector) === null, howToPlay, { timeout: 10_000 });
  };

  if (qa.step === 0) {
    const seed = qa.args.seed ?? "1";
    const ai = qa.args.ai === undefined ? "" : `&ai=${qa.args.ai}`;
    // 01 Any parameter besides a presentation one makes /main create a fresh game.
    await qa.open(`/main?seed=${seed}${ai}`);
    await qa.waitVisible("[data-testid=main-menu-action-new-journey]");
    await beat("01-main-menu", { capture: true });

    // 02 New Journey: the loading screen, whose Begin shows after its authored duration.
    await qa.click("[data-testid=main-menu-action-new-journey]");
    await qa.waitVisible("[data-testid=loading-begin]", { timeout: 20_000 });
    await beat("02-loading");

    // 03–06 Begin: Mira's two bubbles, the enemy's taunt, and the opponent's card reveal.
    await qa.click("[data-testid=loading-begin]");
    carry.speech = await nextSpeech("Mira's welcome", mira, null);
    await beat("03-mira-welcome");
    carry.speech = await nextSpeech("Mira's second bubble", mira, carry.speech);
    await beat("04-mira-nightmare");
    const taunt = await nextSpeech("the enemy's taunt", enemySpeech, null);
    await beat("05-enemy-taunt");
    await qa.waitVisible("[data-testid=tutorial-opponent-card-reveal]", { minOpacity: 0.5 });
    await beat("06-opponent-card-reveal");

    // 07–08 The materialize panel; then the guided hand card into the middle back slot.
    await qa.waitVisible(howToPlay);
    await beat("07-howto-materialize");
    await closeHowToPlay();
    await qa.sleep(1_200);
    const direwolf = await handCard(cards.markedDirewolf, "tutorial-player-deck");
    const middle = await backSlot();
    if (middle === null) throw new Error(`tutorial-walk ${viewport}: no empty back slot`);
    qa.note("guided play", { card: direwolf, slot: middle.id });
    await drag(await cardPoint(direwolf), middle);
    await qa.waitVisible(phaseNext, { timeout: 10_000 });
    await beat("08-player-card-played");

    // 09–12 End Turn: the Dreamwell panel, Mira's Dawn bubble, the enemy's challenge, the front-rank panel.
    await qa.click(phaseNext);
    await qa.waitVisible(howToPlay);
    await beat("09-howto-dreamwell");
    await closeHowToPlay();
    carry.speech = await nextSpeech("Mira's Dawn bubble", mira, carry.speech);
    await beat("10-mira-dawn-ability");
    await nextSpeech("the enemy's challenge", enemySpeech, taunt);
    await beat("11-enemy-challenge-speech");
    await qa.waitVisible(howToPlay);
    await beat("12-howto-front-rank");
    await closeHowToPlay();

    // 13–14 The guided block: drag the player's character to the highlighted front slot.
    await until("the guided slot highlight", () => page.evaluate(() => document.querySelector("[data-battle-guided-slot-highlight]")?.getAttribute("data-battle-guided-slot-id") ?? null, null), 15_000);
    await qa.sleep(1_200);
    await beat("13-guided-block");
    const guidedId = await page.evaluate(() => document.querySelector("[data-battle-guided-slot-highlight]")?.getAttribute("data-battle-guided-slot-id") ?? null, null);
    const blocker = await cardInRank("back");
    if (blocker === null || guidedId === null) throw new Error(`tutorial-walk ${viewport}: no blocker or guided slot`);
    const guidedSlot = await page.evaluate((selector) => {
      const box = document.querySelector(selector)?.getBoundingClientRect();
      return box === undefined ? null : { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    }, `${slot}[data-battle-slot-id="${guidedId}"]`);
    if (guidedSlot === null) throw new Error(`tutorial-walk ${viewport}: guided slot ${guidedId} not found`);
    qa.note("guided block", { blocker: blocker.id, slot: guidedId });
    await drag(await cardPoint(blocker.id), guidedSlot);
    await until("the challenge animation", () => page.evaluate(() => document.querySelector("[data-tutorial-challenge-animation]") !== null, null), 10_000);
    await beat("14-challenge-animation");

    // 15–18 Mira on dissolve and blocked scoring, the player's Dreamwell card, and Mira's event-card bubble.
    carry.speech = await nextSpeech("Mira's dissolve bubble", mira, carry.speech);
    await beat("15-mira-dissolve");
    carry.speech = await nextSpeech("Mira's blocked-scoring bubble", mira, carry.speech);
    await beat("16-mira-blocked-scoring");
    await until("the player's Dreamwell card", () => page.evaluate(() => document.querySelector("[data-tutorial-dreamwell-emergence]") !== null, null));
    await beat("17-player-dreamwell");
    carry.speech = await nextSpeech("Mira's event-card bubble", mira, carry.speech);
    await beat("18-mira-event-card");

    // 19 The hand-off to the live tutorial battle.
    await until("the live battle", () => page.evaluate(() => document.querySelector("[data-tutorial-live-battle]") !== null, null));
    await qa.waitVisible(phaseNext);
    await qa.sleep(1_000);
    await beat("19-live-handoff", { capture: true });
    return carry;
  }

  if (qa.step === 1) {
    // 20–21 Glimpse of What Was: the foresee guidance, then the Foresee prompt.
    await drag(await cardPoint(await handCard(cards.glimpseOfWhatWas)), await boardMiddle());
    const foresee = await nextGuidance("card-play", "player");
    await beat("20-mira-foresee");
    await qa.waitVisible("[data-testid=battle-foresee-confirm]", { timeout: 15_000 });
    await beat("21-foresee-prompt");
    await qa.click("[data-testid=battle-foresee-confirm]");
    await guidanceCleared();
    await qa.sleep(1_500);

    // 22 Flashpoint Detonation with no legal target: the no-valid-targets guidance.
    await drag(await cardPoint(await handCard(cards.flashpointDetonation)), await boardMiddle());
    await nextGuidance("card-no-valid-targets", "player", null, 10_000);
    await beat("22-mira-no-valid-targets");
    await guidanceCleared();
    const cancel = await page.evaluate(() => document.querySelector("[data-testid=tutorial-target-cancel]") !== null, null);
    if (cancel) await qa.click("[data-testid=tutorial-target-cancel]");
    await qa.sleep(800);

    // 23 Nocturne Strummer behind the Direwolf: the support guidance.
    const front = await cardInRank("front");
    if (front === null) throw new Error(`tutorial-walk ${viewport}: no player character in the front rank`);
    const behind = await backSlot(front.x);
    if (behind === null) throw new Error(`tutorial-walk ${viewport}: no back slot behind ${front.id}`);
    qa.note("support play", { front: front.id, slot: behind.id });
    await drag(await cardPoint(await handCard(cards.nocturneStrummer)), behind);
    await nextGuidance("card-play", "player", foresee.presentation, 10_000);
    await beat("23-mira-support");
    await guidanceCleared();

    // 24–26 End Turn: the Dusk and Night guidance; Start Challenge: the challenge result.
    await qa.click(phaseNext);
    await nextGuidance("opponent-reposition-opportunity", "player", null, 15_000);
    await beat("24-mira-dusk");
    await nextGuidance("player-night-phase", "player", null, 20_000);
    await beat("25-mira-night");
    await guidanceCleared();
    await qa.waitVisible(phaseNext, { timeout: 20_000 });
    await qa.click(phaseNext);
    const resolved = await nextGuidance("challenge-resolved", "player", null, 15_000);
    await beat("26-mira-challenge-resolved");

    // 27–30 Until Victory: press the phase button whenever the player holds it
    // and no guidance shows; record the guidance the enemy's turn raises. On
    // the authored enemy turn the guidance is 27 (figment) and 28 (the enemy's
    // card play), and the first press is 29 (Start Challenge against the
    // enemy's challenge), then End Turn and Start Challenge for Victory.
    const victory = "[data-testid=tutorial-battle-new-journey]";
    const deadline = Date.now() + Number(qa.args.liveTimeoutMs ?? "150000");
    let presses = 0;
    /** @type {string | null} */
    let lastPresentation = resolved.presentation;
    for (;;) {
      await qa.assertCaps(`${viewport} live battle`);
      const state = await page.evaluate(({ win, next }) => {
        const dom = /** @type {Window & { __qa?: import("../prelude.mjs").QaDom }} */ (window).__qa;
        const button = dom?.hitPoint({ selector: next }, 0.95) ?? null;
        const element = dom?.rendered({ selector: next }, 0.95) ?? null;
        return {
          victory: dom?.rendered({ selector: win }, 0.95) != null,
          press: button !== null && button.covered === null && element !== null && !element.hasAttribute("disabled") && element.getAttribute("aria-disabled") !== "true",
        };
      }, { win: victory, next: phaseNext });
      if (state.victory) break;
      const shown = await visibleGuidance();
      if (shown !== null) {
        if (shown.presentation !== lastPresentation) {
          lastPresentation = shown.presentation;
          const name = shown.kind === "figment-created" ? "27-mira-figment" : shown.side === "enemy" && shown.kind === "card-play" ? "28-mira-dissolved" : `guidance-${shown.kind}-${shown.side}`;
          carry.observed.push(name);
          await beat(name);
        }
        await guidanceCleared();
        continue;
      }
      if (Date.now() > deadline) throw new Error(`tutorial-walk ${viewport}: no Victory after ${String(presses)} phase presses`);
      if (state.press) {
        // A press the screen ignores while input is in flight is pressed again on the next pass.
        await qa.sleep(600);
        if ((await visibleGuidance()) !== null) continue;
        presses += 1;
        await beat(`live-press-${String(presses)}`);
        await qa.click(phaseNext);
        await qa.sleep(800);
        continue;
      }
      await qa.sleep(200);
    }
    qa.note("live presses", { presses, observed: carry.observed });
    await qa.waitVisible("[data-tutorial-victory-screen]");
    await qa.sleep(1_500);
    await beat("30-victory", { capture: true });
    return carry;
  }

  // 31 New Journey: the tutorial Avatar offer with its journeyStart guidance.
  await qa.click("[data-testid=tutorial-battle-new-journey]");
  await qa.waitVisible("[data-journey-screen=journeyStart]", { timeout: 20_000 });
  await qa.waitVisible("[data-testid=journey-start-tutorial-dialogue] [data-character-dialogue-visible=true], [data-testid=journey-start-tutorial-dialogue][data-character-dialogue-visible=true]", { timeout: 20_000 });
  await qa.sleep(1_000);
  await beat("31-journey-start", { capture: true });
  const offer = await page.evaluate(() => ({
    path: location.pathname,
    choices: document.querySelectorAll("[data-choose-avatar] button").length,
  }), null);
  if (offer.path !== "/") throw new Error(`tutorial-walk ${viewport}: the Avatar offer is at ${offer.path}, not /`);
  await qa.assertCaps(`${viewport} tutorial walk`);
  return {
    viewport,
    beats: carry.beats.length,
    checked: carry.beats.map((entry) => entry.beat),
    enemyTurnBeats: carry.observed,
    offer,
  };
}

export const viewports = ["desktop", "mobile"];

export default [tutorialWalk, tutorialWalk, tutorialWalk];
