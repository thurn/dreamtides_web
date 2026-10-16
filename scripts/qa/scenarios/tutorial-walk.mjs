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
// `src/content/tutorial.ts`, never copy. Captures: 01, 19, the live guidance at 20, 30, and 31.

/**
 * @typedef {{ battleId: string, gameId: string, source: import("../../../src/rules/battle/fold").TutorialGuidanceSource, effectiveDurations: (number | null)[], delays: number[], messageIndex: number }} GuidanceMetadata
 * @typedef {{ beat: string, path: string, phase: string | null, guidance: string | null, sides: string, speech: string | null }} Beat
 * @typedef {{ beats: Beat[], speech: string | null, observed: string[], battle?: { gameId: string, battleId: string, beginSeq: number }, victory?: { seq: number, ended: import("../prelude.mjs").GameLogRow, applied: import("../prelude.mjs").GameLogRow } }} Carry
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

  // Authored trigger UUIDs distinguish concepts sharing the same native source kind.
  const triggers = {
    noTargets: "277d95c1-e7a7-4d5a-9ee7-a5d26869bf75",
    dusk: "9a5b5f0b-8e0b-437e-b04c-d12ab6e6071c",
    night: "abe76c76-63ad-481e-9f22-559f33f845b8",
  };

  /** Read an active message, joining its opaque identity to native metadata. */
  const visibleGuidance = async () => {
    const shown = await page.evaluate((selector) => {
      const dom = /** @type {Window & { __qa?: import("../prelude.mjs").QaDom }} */ (window).__qa;
      const dialogue = dom?.rendered({ selector: `${selector}:not([aria-hidden=true]) [data-testid=battle-tutorial-dialogue]` }, 0.95) ?? null;
      const element = dialogue?.closest(selector);
      if (element === null || element === undefined) return null;
      return {
        trigger: element.getAttribute("data-trigger-id"),
        presentation: element.getAttribute("data-presentation-id"),
        messageIndex: Number(element.getAttribute("data-message-index")),
        cardId: element.querySelector("[data-battle-tutorial-source] [data-card-id]")?.getAttribute("data-card-id") ?? null,
      };
    }, guidance);
    if (shown === null) return null;
    const records = await qa.gameLog.rows();
    const recorded = records.findLast((row) => row.event === "battle_tutorial_guidance_presented" &&
      row.presentationId === shown.presentation && row.messageIndex === shown.messageIndex &&
      Array.isArray(row.triggerIds) && row.triggerIds[shown.messageIndex] === shown.trigger);
    if (recorded === undefined) return null; // The persisted log can trail the render.
    const metadata = /** @type {GuidanceMetadata} */ (/** @type {unknown} */ (recorded));
    if (carry.battle !== undefined && (metadata.battleId !== carry.battle.battleId || metadata.gameId !== carry.battle.gameId)) {
      throw new Error(`tutorial-walk ${viewport}: guidance belongs to another battle or game`);
    }
    const source = metadata.source;
    if ((source.kind === "card" || source.kind === "figment") && shown.cardId !== source.cardId) {
      throw new Error(`tutorial-walk ${viewport}: guidance printing UUID differs from its native source`);
    }
    const kind = source.kind === "card" ? (shown.trigger === triggers.noTargets ? "card-no-valid-targets" : "card-play") :
      source.kind === "figment" ? "figment-created" : source.kind === "dreamwell" ? "dreamwell-resolve" :
      source.kind === "challenge" ? "challenge-resolved" : shown.trigger === triggers.dusk ? "opponent-reposition-opportunity" :
      shown.trigger === triggers.night ? "player-night-phase" : source.kind;
    return { ...shown, kind, side: "side" in source ? source.side : source.activeSide, metadata };
  };

  /** Records a beat: the route, phase, guidance, and sides, after asserting an empty `__caps`. */
  const beat = async (/** @type {string} */ name, /** @type {{ capture?: boolean }} */ options = {}) => {
    await qa.assertCaps(`${viewport} ${name}`);
    const state = await page.evaluate(() => ({
      path: location.pathname,
      sides: [...document.querySelectorAll("[role=group][aria-label]")]
        .map((element) => element.getAttribute("aria-label") ?? "")
        .filter((label) => /\d+ of \d+/.test(label))
        .join(" / "),
      speech: document.querySelector("[data-character-dialogue-visible=true], [data-tutorial-avatar-dialogue]")?.textContent?.replace(/\s+/g, " ").slice(0, 80) ?? null,
    }), null);
    const shown = await visibleGuidance();
    const { phase } = await qa.battle.state();
    if (shown !== null) {
      const geometry = await page.evaluate((id) => {
        const root = [...document.querySelectorAll("[data-battle-tutorial-guidance]")].find((element) => element.getAttribute("data-presentation-id") === id);
        const elements = root?.querySelectorAll("[data-testid=battle-tutorial-dialogue], [data-battle-tutorial-source]") ?? [];
        return [...elements].map((element) => {
          const rect = element.getBoundingClientRect();
          if (rect.width <= 0 || rect.height <= 0 || rect.left < -1 || rect.top < -1 || rect.right > innerWidth + 1 || rect.bottom > innerHeight + 1) {
            throw new Error("tutorial guidance geometry clips the viewport");
          }
          return { surface: element.getAttribute("data-testid") ?? "source", x: rect.x, y: rect.y, width: rect.width, height: rect.height };
        });
      }, shown.presentation);
      qa.note("guidance source and geometry", { shown, geometry });
    }
    /** @type {Beat} */
    const entry = { beat: name, ...state, phase, guidance: shown === null ? null : `${shown.kind}:${shown.side}:${String(shown.trigger)}` };
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

  /** Complete each exact native message by its authored timer or manual control. */
  const guidanceCleared = async () => {
    for (;;) {
      const head = await visibleGuidance();
      if (head === null) return;
      const { metadata, messageIndex, presentation, trigger } = head;
      const duration = metadata.effectiveDurations[messageIndex];
      const delay = metadata.delays[messageIndex];
      const reason = duration === null ? "manual" : "timer";
      if (duration !== null && (!Number.isFinite(duration) || duration < 0 || !Number.isFinite(delay) || delay < 0)) {
        throw new Error(`tutorial-walk ${viewport}: invalid authored timing for ${presentation}`);
      }
      if (reason === "manual") {
        // Re-check the whole identity before an ordinary UI click.
        const current = await visibleGuidance();
        if (current?.presentation === presentation && current.messageIndex === messageIndex) {
          await qa.click(`${guidance}[data-presentation-id="${presentation}"][data-message-index="${messageIndex}"] [data-testid=battle-tutorial-dismiss]`);
        }
      }
      const intentKey = `battle-tutorial:${presentation}:${messageIndex}`;
      const completion = await qa.gameLog.waitFor("exact native guidance completion", (rows) => {
        const request = rows.findLast((row) => row.event === "battle_tutorial_guidance_advance_requested" &&
          row.presentationId === presentation && row.messageIndex === messageIndex && row.triggerId === trigger && row.reason === reason);
        const applied = rows.findLast((row) => row.event === "game_event" && row.type === "COMPLETE_TUTORIAL_BATTLE_PRESENTATION" &&
          row.outcome === "applied" && row.intentKey === intentKey);
        return request !== undefined && applied !== undefined ? { request, applied } : null;
      }, { timeout: reason === "manual" ? 15_000 : (delay + (duration ?? 0)) * 1_000 + 15_000 });
      await qa.waitFor("exact guidance message leaves the screen", ({ id, index }) =>
        ![...document.querySelectorAll("[data-battle-tutorial-guidance]:not([aria-hidden=true])")].some((element) =>
          element.getAttribute("data-presentation-id") === id && Number(element.getAttribute("data-message-index")) === index),
      { id: presentation, index: messageIndex });
      qa.note("authored guidance completed", { head, reason, completion });
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
      throw new Error(`tutorial-walk: physical card ${cardId} has no exposed hit point`);
    }, id);

  /** Select a physical player-hand copy by its printing UUID. */
  const handCard = (/** @type {string} */ cardId) =>
    until(`hand card ${cardId}`, () =>
      page.evaluate((uuid) => {
        const matches = [...document.querySelectorAll("[data-battle-hand-owner=player] [data-battle-card-id]")].filter(
          (element) =>
            element.querySelector(`[data-card-id="${uuid}"]`) !== null,
        );
        matches.sort((a, b) => b.getBoundingClientRect().y - a.getBoundingClientRect().y);
        return matches[0]?.getAttribute("data-battle-card-id") ?? null;
      }, cardId),
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
    const direwolf = await handCard(cards.markedDirewolf);
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
    const identity = await page.evaluate(() => ({
      gameId: new URLSearchParams(location.search).get("game"),
      battleId: document.querySelector("[data-battle-mobile]")?.getAttribute("data-battle-mobile") ?? null,
    }), null);
    if (identity.gameId === null || identity.battleId === null) throw new Error(`tutorial-walk ${viewport}: missing live battle identity`);
    const begun = await qa.gameLog.waitFor("committed live tutorial handoff", (rows) => rows.findLast((row) =>
      row.event === "game_event" && row.type === "BEGIN_TUTORIAL_BATTLE" && row.outcome === "applied" && row.gameId === identity.gameId && typeof row.seq === "number"));
    carry.battle = { gameId: identity.gameId, battleId: identity.battleId, beginSeq: Number(begun.seq) };
    qa.note("live battle identity", carry.battle);
    await beat("19-live-handoff", { capture: true });
    return carry;
  }

  if (qa.step === 1) {
    // 20–21 Glimpse of What Was: the foresee guidance, then the Foresee prompt.
    await drag(await cardPoint(await handCard(cards.glimpseOfWhatWas)), await boardMiddle());
    const foresee = await nextGuidance("card-play", "player");
    await beat("20-mira-foresee", { capture: true });
    await guidanceCleared();
    await until("the player arrangement prompt", async () => {
      const battle = await qa.battle.state();
      return battle.prompt?.answerable === true && ["foresee", "arrange"].includes(battle.prompt.surface ?? "") ? battle.prompt : null;
    }, 15_000);
    await beat("21-foresee-prompt");
    if (!await qa.battle.answer()) throw new Error(`tutorial-walk ${viewport}: arrangement prompt is not answerable`);
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
    await guidanceCleared();
    await nextGuidance("player-night-phase", "player", null, 20_000);
    await beat("25-mira-night");
    await guidanceCleared();
    await qa.waitVisible(phaseNext, { timeout: 20_000 });
    await qa.click(phaseNext);
    const resolved = await nextGuidance("challenge-resolved", "player", null, 15_000);
    await beat("26-mira-challenge-resolved");

    // 27–30 Pass through the normal battle driver. Enemy teaching beats are
    // optional observations of the selected AI policy, never required actions.
    const victory = "[data-testid=tutorial-battle-new-journey]";
    let presses = 0;
    /** @type {string | null} */
    let lastPresentation = resolved.presentation;
    await qa.battle.playUntil(() => qa.isVisible(victory), {
      label: "the live tutorial battle",
      timeout: Number(qa.args.liveTimeoutMs ?? "150000"),
      before: async (battle) => {
        await qa.assertCaps(`${viewport} live battle`);
        const shown = await visibleGuidance();
        if (shown !== null) {
          if (shown.presentation !== lastPresentation) {
            lastPresentation = shown.presentation;
            const name = shown.kind === "figment-created" ? "27-mira-figment" : shown.side === "enemy" && shown.kind === "card-play" ? "28-mira-dissolved" : `guidance-${shown.kind}-${shown.side}`;
            carry.observed.push(name);
            await beat(name);
          }
          await guidanceCleared();
          return true;
        }
        if (!battle.canPass) return false;
        // Guidance that shows as the button frees takes the press.
        await qa.sleep(600);
        if ((await visibleGuidance()) !== null) return true;
        presses += 1;
        await beat(`live-press-${String(presses)}`);
        return false;
      },
    });
    qa.note("live presses", { presses, observed: carry.observed });
    const identity = carry.battle;
    if (identity === undefined) throw new Error(`tutorial-walk ${viewport}: missing live battle identity`);
    await qa.waitFor("current tutorial battle has its committed terminal state", (battleId) =>
      document.querySelector("[data-battle-mobile]")?.getAttribute("data-battle-mobile") === battleId &&
      document.querySelector("[data-tutorial-battle-state=terminal]") !== null, identity.battleId);
    carry.victory = await qa.gameLog.waitFor("committed player Victory", (rows, log) => {
      if (log.gameId !== identity.gameId) return null;
      const start = rows.findLastIndex((row) => row.event === "game_event" && row.seq === identity.beginSeq && row.type === "BEGIN_TUTORIAL_BATTLE" && row.outcome === "applied");
      if (start < 0 || rows.slice(start + 1).some((row) => row.event === "game_event" && row.outcome === "applied" && ["BEGIN_BATTLE", "BEGIN_TUTORIAL_BATTLE", "RESTART_TUTORIAL_BATTLE"].includes(String(row.type)))) return null;
      rows = rows.slice(start + 1);
      const index = rows.findLastIndex((row) => {
        const result = /** @type {{ kind?: string, winner?: string } | null} */ (row.result);
        return row.event === "engine.battleEnded" && result?.kind === "victory" && result.winner === "player" && row.gameId === identity.gameId && typeof row.seq === "number";
      });
      if (index < 0) return null;
      // LocalGameProvider emits engine records only for applied commits.
      // Their logger counter is separate from the event log's sequence.
      const applied = rows.slice(0, index).findLast((row) => row.event === "game_event" &&
        ["BATTLE_ACTION", "BATTLE_ANSWER"].includes(String(row.type)) && row.outcome === "applied");
      return applied !== undefined && typeof applied.seq === "number" ? { seq: applied.seq, ended: rows[index], applied } : null;
    });
    qa.note("committed player Victory", carry.victory);
    await qa.waitVisible("[data-tutorial-victory-screen]");
    await qa.waitFor("Victory action animation settled", () => document.querySelector("[data-tutorial-victory-action-settled]") !== null, null);
    await qa.waitVisible(victory);
    await beat("30-victory", { capture: true });
    return carry;
  }

  // 31 New Journey: the tutorial Avatar offer with its journeyStart guidance.
  if (carry.victory === undefined) throw new Error(`tutorial-walk ${viewport}: missing committed player Victory`);
  const victorySeq = carry.victory.seq;
  await qa.click("[data-testid=tutorial-battle-new-journey]");
  await qa.waitVisible("[data-journey-screen=journeyStart]", { timeout: 20_000 });
  await qa.waitVisible("[data-testid=journey-start-tutorial-dialogue] [data-character-dialogue-visible=true], [data-testid=journey-start-tutorial-dialogue][data-character-dialogue-visible=true]", { timeout: 20_000 });
  await qa.sleep(1_000);
  await beat("31-journey-start", { capture: true });
  const offer = await page.evaluate(() => ({
    path: location.pathname,
    avatars: [...document.querySelectorAll("[data-choose-avatar]")].map((element) => ({
      id: element.getAttribute("data-choose-avatar"),
      enabled: element.querySelector("button:not(:disabled)") !== null,
    })),
  }), null);
  if (offer.path !== "/") throw new Error(`tutorial-walk ${viewport}: the Avatar offer is at ${offer.path}, not /`);
  const offerLog = await qa.gameLog.waitFor("committed tutorial exit and Avatar offer", (rows) => {
    const exit = rows.findLast((row) => row.event === "game_event" && row.type === "EXIT_TUTORIAL_BATTLE" && row.outcome === "applied" && row.intentKey === `tutorial-battle:${carry.battle?.battleId}:exit` && row.gameId === carry.battle?.gameId && typeof row.seq === "number" && row.seq > victorySeq);
    const shown = rows.findLast((row) => row.event === "avatar_offer_shown");
    return exit !== undefined && shown !== undefined && Array.isArray(shown.avatarIds) ? { exit, shown, avatarIds: shown.avatarIds } : null;
  });
  if (offer.avatars.length !== 1 || !offer.avatars[0].enabled || offer.avatars[0].id !== offerLog.avatarIds[0] || offerLog.avatarIds.length !== 1) {
    throw new Error(`tutorial-walk ${viewport}: tutorial Avatar offer does not match native UUID options`);
  }
  qa.note("committed tutorial Avatar offer", { offer, offerLog });
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
