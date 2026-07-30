import { spawn } from "node:child_process";
import {
  mkdirSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { chromium } from "@playwright/test";
import { DEV_EMULATOR_PROJECT_ID } from "./dev-with-emulator.mjs";
import { inspectJourneyPresentation } from "./lib/journey-presentation-oracle.mjs";

const FAILURE_TEXT =
  /action not applied|fold error|tutorial-authoritative|application error|something went wrong/i;
const SAFE_REHEARSAL_ACTION =
  /^(new journey|start tutorial|continue|next|got it|end turn|start challenge|choose|close how to play)$/i;

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function positiveInteger(name, fallback) {
  const raw = option(name, String(fallback));
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function json(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function waitForHttp(url, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Server is still starting.
    }
    await sleep(250);
  }
  throw new Error(`timed out waiting for ${url}`);
}

async function startServer(port, builtArtifact) {
  const output = [];
  let databasePort = null;
  let ready = false;
  let resolveReady;
  let rejectReady;
  const readyPromise = new Promise((resolveServer, rejectServer) => {
    resolveReady = resolveServer;
    rejectReady = rejectServer;
  });
  const child = spawn(
    process.execPath,
    [
      "scripts/dev-with-emulator.mjs",
      ...(builtArtifact ? ["--built-artifact"] : []),
      "--port",
      String(port),
    ],
    {
      cwd: process.cwd(),
      env: { ...process.env, VITE_FUZZ_TEST: "1" },
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const collect = (chunk) => {
    const text = chunk.toString();
    output.push(text);
    const match = text.match(/Firebase database emulator: 127\.0\.0\.1:(\d+)/);
    if (match !== null) databasePort = Number(match[1]);
    if (text.includes(`Local:   http://localhost:${String(port)}/`)) {
      ready = true;
      resolveReady();
    }
    process.stdout.write(text);
  };
  child.stdout.on("data", collect);
  child.stderr.on("data", collect);
  child.once("exit", (code, signal) => {
    if (!ready) {
      rejectReady(
        new Error(
          `development server exited before readiness (${String(
            code ?? signal ?? "unknown",
          )})`,
        ),
      );
    }
  });
  let readyTimeout;
  try {
    await Promise.race([
      readyPromise,
      new Promise((_, rejectTimeout) => {
        readyTimeout = setTimeout(
          () =>
            rejectTimeout(
              new Error("timed out waiting for the development server"),
            ),
          60_000,
        );
      }),
    ]);
  } finally {
    clearTimeout(readyTimeout);
  }
  await waitForHttp(`http://127.0.0.1:${port}`, 10_000);
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    databasePort: () => databasePort,
    output,
    stop: async () => {
      if (child.exitCode !== null) return;
      if (process.platform !== "win32" && child.pid !== undefined) {
        try {
          process.kill(-child.pid, "SIGTERM");
        } catch (error) {
          if (error.code !== "ESRCH") throw error;
        }
      } else {
        child.kill("SIGTERM");
      }
      await Promise.race([
        new Promise((resolveExit) => child.once("exit", resolveExit)),
        sleep(10_000),
      ]);
    },
  };
}

async function installCapture(page, label, records) {
  await page.exposeFunction("__questReportUiFailure", (failure) => {
    records.push({
      source: label,
      kind: "coop-bounce-toast",
      text: failure.text,
      at: failure.at,
    });
  });
  await page.addInitScript(() => {
    const seen = new Set();
    const capture = () => {
      for (const toast of document.querySelectorAll(
        "[data-coop-bounce-toast]",
      )) {
        const text = toast.textContent?.trim() ?? "";
        if (text === "" || seen.has(text)) continue;
        seen.add(text);
        void window.__questReportUiFailure({
          text,
          at: new Date().toISOString(),
        });
      }
    };
    const observe = () => {
      capture();
      new MutationObserver(capture).observe(document.documentElement, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    };
    if (document.documentElement === null) {
      window.addEventListener("DOMContentLoaded", observe, { once: true });
    } else {
      observe();
    }
  });
  page.on("console", (message) => {
    const record = {
      source: label,
      kind: `console:${message.type()}`,
      text: message.text(),
      at: new Date().toISOString(),
    };
    records.push(record);
  });
  page.on("pageerror", (error) => {
    records.push({
      source: label,
      kind: "pageerror",
      text: error.stack ?? error.message,
      at: new Date().toISOString(),
    });
  });
  page.on("requestfailed", (request) => {
    records.push({
      source: label,
      kind: "requestfailed",
      text: `${request.method()} ${request.url()}: ${
        request.failure()?.errorText ?? "unknown"
      }`,
      at: new Date().toISOString(),
    });
  });
}

async function assertBounceCaptureOracle(page, records) {
  await page.goto(
    "data:text/html," +
      encodeURIComponent(
        '<div data-coop-bounce-toast="">Action not applied: negative control.</div>',
      ),
  );
  const deadline = Date.now() + 5_000;
  while (
    !records.some((record) => record.kind === "coop-bounce-toast") &&
    Date.now() < deadline
  ) {
    await sleep(25);
  }
  if (!records.some((record) => record.kind === "coop-bounce-toast")) {
    throw new Error("bounce-toast capture oracle missed its negative control");
  }
  records.length = 0;
}

async function assertJourneyPresentationOracle(page) {
  await page.goto(
    "data:text/html," +
      encodeURIComponent(
        '<main data-journey-screen="site" style="opacity:0">' +
          "<button>Decline Offer</button></main>",
      ),
  );
  const report = await page.evaluate(inspectJourneyPresentation, "dreamscape");
  const codes = report.violations.map((violation) => violation.code);
  if (
    !codes.includes("expected_journey_screen_missing") ||
    !codes.includes("transparent_journey_screen_intercepts_input")
  ) {
    throw new Error(
      "journey-presentation oracle missed its stuck-screen negative control: " +
        JSON.stringify(report),
    );
  }
}

async function presentation(page) {
  const probe = await snapshot(page);
  if (probe === null) return null;
  if (probe.frontDoorPhase !== "journey") {
    return {
      expectedScreenType: probe.displayedState.journey.screen.type,
      screens: [],
      skippedForFrontDoorPhase: probe.frontDoorPhase,
      violations: [],
    };
  }
  return page.evaluate(
    inspectJourneyPresentation,
    probe.displayedState.journey.screen.type,
  );
}

async function waitForHealthyPresentation(page, label) {
  const deadline = Date.now() + 15_000;
  let report = null;
  while (Date.now() < deadline) {
    report = await presentation(page);
    if (report !== null && report.violations.length === 0) return;
    await sleep(50);
  }
  throw new Error(
    `${label} journey presentation did not match the displayed fold state: ` +
      JSON.stringify(report),
  );
}

async function waitForProbe(page) {
  await page.waitForFunction(
    () =>
      window.__questFuzzProbe !== undefined &&
      window.__questFuzzProbe.snapshot().confirmedHead !== null,
    null,
    { timeout: 60_000 },
  );
  await waitForHealthyPresentation(page, "client");
}

async function snapshot(page) {
  return page.evaluate(() => window.__questFuzzProbe?.snapshot() ?? null);
}

async function waitForConvergence(left, right) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const [a, b] = await Promise.all([snapshot(left), snapshot(right)]);
    if (
      a !== null &&
      b !== null &&
      a.confirmedHead === b.confirmedHead &&
      a.confirmedHash === b.confirmedHash
    ) {
      await Promise.all([
        waitForHealthyPresentation(left, "left client"),
        waitForHealthyPresentation(right, "right client"),
      ]);
      return;
    }
    await sleep(100);
  }
  throw new Error("two clients did not converge within 30 seconds");
}

async function waitForScreenType(page, screenType, label) {
  await page.waitForFunction(
    (expected) =>
      window.__questFuzzProbe?.snapshot().displayedState.journey.screen.type ===
      expected,
    screenType,
    { timeout: 60_000 },
  );
  const firstReport = await page.evaluate(
    inspectJourneyPresentation,
    screenType,
  );
  if (
    firstReport.violations.some(
      (violation) => violation.code === "expected_journey_screen_missing",
    )
  ) {
    throw new Error(
      `${label} did not mount ${screenType} in the fold-state render: ` +
        JSON.stringify(firstReport),
    );
  }
  await waitForHealthyPresentation(page, label);
}

async function clickRecorded(page, locator, label, actions) {
  const target =
    (await locator.getAttribute("aria-label")) ?? (await locator.innerText());
  await locator.click();
  actions.push({
    at: new Date().toISOString(),
    page: label,
    action: "click",
    target,
  });
}

async function avatarScenario(baseUrl, seed, publisher, host, actions) {
  const entryUrl =
    `${baseUrl}/?goto=tutorial-dream-avatar-select&seed=` +
    encodeURIComponent(`${seed}:avatar`);
  await publisher.goto(entryUrl);
  await waitForProbe(publisher);
  const url = publisher.url();
  const game = new URL(url).searchParams.get("game");
  if (game === null) throw new Error("avatar scenario did not create a room");
  await host.goto(url);
  await waitForProbe(host);
  await waitForConvergence(publisher, host);

  const choose = publisher.getByRole("button", { name: "Choose", exact: true });
  await choose.waitFor({ state: "visible", timeout: 30_000 });
  await clickRecorded(publisher, choose, "publisher", actions);
  await publisher.waitForFunction(
    () => window.__questFuzzProbe?.snapshot().screenType !== "journeyStart",
    null,
    { timeout: 60_000 },
  );
  await waitForConvergence(publisher, host);
  return { game, url };
}

async function dreamAuguryExitScenario(
  baseUrl,
  seed,
  publisher,
  host,
  actions,
) {
  const entryUrl =
    `${baseUrl}/?goto=dreamaugury&seed=` +
    encodeURIComponent(`${seed}:dream-augury-exit`);
  await publisher.goto(entryUrl);
  await waitForProbe(publisher);
  const url = publisher.url();
  const game = new URL(url).searchParams.get("game");
  if (game === null)
    throw new Error("Dream Augury scenario did not create a room");
  await host.goto(url);
  await waitForProbe(host);
  await waitForConvergence(publisher, host);

  const exit = publisher.locator(
    [
      '[data-testid="cumulus-dream-augury-decline"]',
      '[data-testid="cumulus-dream-augury-unavailable-exit"]',
    ].join(","),
  );
  await exit.waitFor({ state: "visible", timeout: 30_000 });
  await clickRecorded(publisher, exit, "publisher", actions);
  await waitForScreenType(publisher, "dreamscape", "publisher");
  await waitForConvergence(publisher, host);
  return { game, url };
}

async function battleScenario(baseUrl, seed, host, publisher, actions) {
  const entryUrl =
    `${baseUrl}/?goto=battle-playable&seed=` +
    encodeURIComponent(`${seed}:battle`);
  await host.goto(entryUrl);
  await waitForProbe(host);
  const url = host.url();
  const game = new URL(url).searchParams.get("game");
  if (game === null) throw new Error("battle scenario did not create a room");
  await host.waitForFunction(
    () => window.__questFuzzProbe?.snapshot().battleId !== null,
    null,
    { timeout: 60_000 },
  );
  await publisher.goto(url);
  await waitForProbe(publisher);
  await waitForConvergence(host, publisher);
  const before = await snapshot(host);
  if (before?.confirmedState.battle === null) {
    throw new Error("battle scenario has no authoritative battle");
  }

  const openInspector = host.getByRole("button", {
    name: "Open battle inspector",
  });
  if (await openInspector.isVisible().catch(() => false)) {
    await clickRecorded(host, openInspector, "host", actions);
  }
  const controlOpponent = host.getByRole("button", {
    name: "Control Opponent",
    exact: true,
  });
  await controlOpponent.waitFor({ state: "visible", timeout: 30_000 });
  await clickRecorded(host, controlOpponent, "host", actions);

  const reopenInspector = host.getByRole("button", {
    name: "Open battle inspector",
  });
  if (await reopenInspector.isVisible().catch(() => false)) {
    await clickRecorded(host, reopenInspector, "host", actions);
  }
  const increasePoints = host.getByRole("button", {
    name: /^Increase .+ points$/,
  }).first();
  await increasePoints.waitFor({ state: "visible", timeout: 30_000 });
  await clickRecorded(host, increasePoints, "host", actions);
  await waitForConvergence(host, publisher);

  const endBattleSection = host.getByText("End Battle", { exact: true });
  await endBattleSection.scrollIntoViewIfNeeded();
  await endBattleSection.waitFor({ state: "visible", timeout: 30_000 });
  await clickRecorded(host, endBattleSection, "host", actions);
  const skipToRewards = host.getByRole("button", {
    name: "Skip to Rewards",
    exact: true,
  });
  await skipToRewards.waitFor({ state: "visible", timeout: 30_000 });
  await clickRecorded(host, skipToRewards, "host", actions);
  await host.waitForFunction(
    () =>
      window.__questFuzzProbe?.snapshot().confirmedState.battle?.board.result ===
      "victory",
    null,
    { timeout: 60_000 },
  );

  const continueReward = host.getByRole("button", {
    name: "Continue",
    exact: true,
  });
  await continueReward.waitFor({ state: "visible", timeout: 30_000 });
  await clickRecorded(host, continueReward, "host", actions);
  await host.waitForFunction(
    () => {
      const probe = window.__questFuzzProbe?.snapshot();
      return probe?.battleId === null && probe.screenType === "atlas";
    },
    null,
    { timeout: 60_000 },
  );
  await waitForConvergence(host, publisher);

  const assertVictoryHandoff = async (page, label) => {
    const after = await snapshot(page);
    const battleInit = before.confirmedState.battle.init;
    const sourceNode =
      before.confirmedState.journey.atlas.nodes[battleInit.dreamscapeId];
    const afterJourney = after.confirmedState.journey;
    const availableForwardIds = sourceNode.forwardIds.filter(
      (nodeId) => afterJourney.atlas.nodes[nodeId]?.state === "available",
    );
    const expectedEssence = Math.min(
      before.confirmedState.journey.essenceCap,
      before.confirmedState.journey.essence + battleInit.essenceReward,
    );
    if (
      after.confirmedState.battle !== null ||
      afterJourney.screen.type !== "atlas" ||
      afterJourney.currentDreamscape !== null ||
      afterJourney.completionLevel !==
        before.confirmedState.journey.completionLevel + 1 ||
      afterJourney.essence !== expectedEssence ||
      afterJourney.atlas.nodes[battleInit.dreamscapeId]?.state !==
        "completed" ||
      !afterJourney.visitedSites.includes(battleInit.siteId) ||
      availableForwardIds.length === 0 ||
      availableForwardIds.some(
        (nodeId) => afterJourney.atlas.nodes[nodeId]?.dreamscapeId === null,
      )
    ) {
      throw new Error(`${label} observed an incomplete victory handoff`);
    }
  };
  await assertVictoryHandoff(host, "host");
  await assertVictoryHandoff(publisher, "publisher");

  await Promise.all([host.reload(), publisher.reload()]);
  actions.push({
    at: new Date().toISOString(),
    page: "both",
    action: "reload",
    target: "completed battle room",
  });
  await Promise.all([waitForProbe(host), waitForProbe(publisher)]);
  await waitForConvergence(host, publisher);
  await assertVictoryHandoff(host, "host after reload");
  await assertVictoryHandoff(publisher, "publisher after reload");
  return { game, url };
}

function currentTutorialAction(probe) {
  const tutorial = probe?.confirmedState.frontDoor.tutorial;
  if (
    tutorial === null ||
    tutorial === undefined ||
    tutorial.currentActionIndex === null
  ) {
    return null;
  }
  return tutorial.actions[tutorial.currentActionIndex] ?? null;
}

async function dragRecorded(page, source, target, label, actions) {
  const sourceId = await source.getAttribute("data-card-id");
  const targetId = await target.getAttribute("data-battle-slot-id");
  await source.dragTo(target);
  actions.push({
    at: new Date().toISOString(),
    page: label,
    action: "drag",
    target: `${sourceId ?? "card"} -> ${targetId ?? "slot"}`,
  });
}

async function closestEmptyFrontSlot(page, opposingCardId) {
  const opposing = page.locator(
    `[data-battle-rank="enemy-front"] [data-card-id="${opposingCardId}"]`,
  ).first();
  const opposingBox = await opposing.boundingBox();
  if (opposingBox === null) return null;
  const slots = page.locator(
    '[data-battle-rank="player-front"] [data-battle-slot-filled="false"]',
  );
  let closest = null;
  let closestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < (await slots.count()); index += 1) {
    const candidate = slots.nth(index);
    const box = await candidate.boundingBox();
    if (box === null) continue;
    const distance = Math.abs(
      box.x + box.width / 2 - (opposingBox.x + opposingBox.width / 2),
    );
    if (distance < closestDistance) {
      closest = candidate;
      closestDistance = distance;
    }
  }
  return closest;
}

async function driveTutorialGesture(page, probe, actions) {
  const action = currentTutorialAction(probe);
  if (
    action?.action === "end-turn" &&
    probe.confirmedState.frontDoor.tutorial?.playerCardPlay == null
  ) {
    const source = page
      .locator('[data-battle-mobile-row="near-hand"] [data-card-id]')
      .first();
    const target = page
      .locator(
        '[data-battle-rank="player-back"] [data-battle-slot-filled="false"]',
      )
      .first();
    if (
      (await source.isVisible().catch(() => false)) &&
      (await target.isVisible().catch(() => false))
    ) {
      await dragRecorded(page, source, target, "publisher", actions);
      return true;
    }
  }

  if (action?.action === "reposition-player-character") {
    const source = page
      .locator(
        `[data-battle-rank="player-back"] [data-card-id="${action.cardId}"]`,
      )
      .first();
    const target = await closestEmptyFrontSlot(page, action.opposingCardId);
    if (
      (await source.isVisible().catch(() => false)) &&
      target !== null &&
      (await target.isVisible().catch(() => false))
    ) {
      await dragRecorded(page, source, target, "publisher", actions);
      return true;
    }
  }

  if (
    probe?.battleId !== null &&
    probe?.frontDoorPhase === "tutorial"
  ) {
    const openInspector = page.getByRole("button", {
      name: "Open battle inspector",
    });
    if (await openInspector.isVisible().catch(() => false)) {
      await clickRecorded(page, openInspector, "publisher", actions);
      return true;
    }
    const skip = page.getByRole("button", {
      name: "Skip to Rewards",
      exact: true,
    });
    if (await skip.isVisible().catch(() => false)) {
      await clickRecorded(page, skip, "publisher", actions);
      return true;
    }
    const endBattle = page.getByRole("button", {
      name: /End Battle/,
    }).first();
    if (await endBattle.isVisible().catch(() => false)) {
      await clickRecorded(page, endBattle, "publisher", actions);
      return true;
    }
  }
  return false;
}

async function driveOpenDialog(page, actions) {
  const dialogs = page.getByRole("dialog");
  for (let dialogIndex = (await dialogs.count()) - 1; dialogIndex >= 0; dialogIndex -= 1) {
    const dialog = dialogs.nth(dialogIndex);
    if (!(await dialog.isVisible().catch(() => false))) continue;
    const preferred = dialog.getByRole("button", {
      name: /^(Confirm|Continue|Submit|Skip|Done|Resolve|Choose one)$/i,
    });
    for (let buttonIndex = 0; buttonIndex < (await preferred.count()); buttonIndex += 1) {
      const button = preferred.nth(buttonIndex);
      if (
        (await button.isVisible().catch(() => false)) &&
        (await button.isEnabled().catch(() => false))
      ) {
        await clickRecorded(page, button, "publisher", actions);
        return true;
      }
    }
  }
  return false;
}

async function driveBattlePrompt(page, actions) {
  const choice = page
    .locator("[data-battle-choice-prompt-controls]")
    .getByRole("button")
    .first();
  if (
    (await choice.isVisible().catch(() => false)) &&
    (await choice.isEnabled().catch(() => false))
  ) {
    await clickRecorded(page, choice, "publisher", actions);
    return true;
  }

  const submit = page.getByRole("button", {
    name: /^(Submit|Confirm|Continue|Resolve)$/i,
  }).last();
  if (
    (await submit.isVisible().catch(() => false)) &&
    (await submit.isEnabled().catch(() => false))
  ) {
    await clickRecorded(page, submit, "publisher", actions);
    return true;
  }

  const candidate = page
    .locator(
      '[data-battle-card-picker-candidate="true"]:not([data-battle-card-picker-selected="true"])',
    )
    .first();
  if (await candidate.isVisible().catch(() => false)) {
    await clickRecorded(page, candidate, "publisher", actions);
    return true;
  }
  return false;
}

async function rehearsalScenario(baseUrl, seed, publisher, host, actions) {
  const entryUrl =
    `${baseUrl}/main?tutorialSpeed=20&seed=` +
    encodeURIComponent(`${seed}:rehearsal`);
  await publisher.goto(entryUrl);
  await waitForProbe(publisher);
  const url = publisher.url();
  const game = new URL(url).searchParams.get("game");
  if (game === null) throw new Error("rehearsal did not create a room");
  await host.goto(url);
  await waitForProbe(host);
  const deadline = Date.now() + 5 * 60_000;

  while (Date.now() < deadline) {
    const state = await snapshot(publisher);
    const tutorial = state?.confirmedState.frontDoor.tutorial;
    if (
      state?.frontDoorPhase === "tutorial" &&
      state.battleId !== null &&
      tutorial?.currentActionIndex === null
    ) {
      await waitForConvergence(publisher, host);
      return { game, url };
    }
    if (await driveOpenDialog(publisher, actions)) {
      await sleep(250);
      continue;
    }
    if (await driveBattlePrompt(publisher, actions)) {
      await sleep(250);
      continue;
    }
    if (await driveTutorialGesture(publisher, state, actions)) {
      await sleep(250);
      continue;
    }
    const buttons = publisher.getByRole("button");
    const count = await buttons.count();
    let advanced = false;
    for (let index = 0; index < count; index += 1) {
      const button = buttons.nth(index);
      if (!(await button.isVisible()) || !(await button.isEnabled())) continue;
      const name =
        (await button.getAttribute("aria-label")) ?? (await button.innerText());
      if (SAFE_REHEARSAL_ACTION.test(name.trim())) {
        await clickRecorded(publisher, button, "publisher", actions);
        advanced = true;
        break;
      }
    }
    await sleep(advanced ? 250 : 500);
  }
  throw new Error(
    "tutorial rehearsal did not reach the shared live battle within 5 minutes",
  );
}

async function dumpRoom(databasePort, game) {
  if (databasePort === null || game === undefined) return null;
  const url =
    `http://127.0.0.1:${databasePort}/rooms/${game}.json` +
    `?ns=${DEV_EMULATOR_PROJECT_ID}`;
  try {
    const response = await fetch(url);
    return response.ok ? response.json() : { fetchStatus: response.status };
  } catch (error) {
    return {
      fetchError: error instanceof Error ? error.message : String(error),
    };
  }
}

function fatalRecords(records) {
  return records.filter(
    (record) =>
      record.kind === "pageerror" ||
      record.kind === "console:error" ||
      FAILURE_TEXT.test(record.text),
  );
}

async function assertNoFailureText(page, label) {
  const text = await page.locator("body").innerText();
  if (FAILURE_TEXT.test(text)) {
    throw new Error(`${label} rendered a failure message`);
  }
}

async function runBrowserIteration({
  browser,
  baseUrl,
  databasePort,
  artifactDir,
  profile,
  seed,
}) {
  const records = [];
  const actions = [];
  const publisherContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const hostContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  await publisherContext.tracing.start({ screenshots: true, snapshots: true });
  await hostContext.tracing.start({ screenshots: true, snapshots: true });
  const publisher = await publisherContext.newPage();
  const host = await hostContext.newPage();
  await installCapture(publisher, "publisher", records);
  await installCapture(host, "host", records);
  await assertBounceCaptureOracle(publisher, records);
  await assertJourneyPresentationOracle(publisher);
  const scenarios = [];
  let failure = null;

  try {
    if (profile === "rehearsal") {
      scenarios.push(
        await rehearsalScenario(baseUrl, seed, publisher, host, actions),
      );
      scenarios.push(
        await avatarScenario(baseUrl, seed, publisher, host, actions),
      );
      scenarios.push(
        await dreamAuguryExitScenario(baseUrl, seed, publisher, host, actions),
      );
      scenarios.push(
        await battleScenario(baseUrl, seed, host, publisher, actions),
      );
    } else {
      scenarios.push(
        await avatarScenario(baseUrl, seed, publisher, host, actions),
      );
      scenarios.push(
        await dreamAuguryExitScenario(baseUrl, seed, publisher, host, actions),
      );
      scenarios.push(
        await battleScenario(baseUrl, seed, host, publisher, actions),
      );
    }
    await assertNoFailureText(publisher, "publisher");
    await assertNoFailureText(host, "host");
    const fatal = fatalRecords(records);
    if (fatal.length > 0) {
      throw new Error(
        `captured fatal browser records:\n${fatal
          .map((record) => `${record.kind}: ${record.text}`)
          .join("\n")}`,
      );
    }
  } catch (caught) {
    failure = caught instanceof Error ? caught : new Error(String(caught));
  }

  const metadata = {
    profile,
    seed,
    baseUrl,
    scenarios,
    failed: failure !== null,
    error: failure?.stack ?? null,
    publisherUrl: publisher.url(),
    hostUrl: host.url(),
    publisherProbe: await snapshot(publisher).catch(() => null),
    hostProbe: await snapshot(host).catch(() => null),
    publisherPresentation: await presentation(publisher).catch(() => null),
    hostPresentation: await presentation(host).catch(() => null),
    createdAt: new Date().toISOString(),
  };
  json(resolve(artifactDir, "metadata.json"), metadata);
  json(resolve(artifactDir, "actions.json"), actions);
  json(resolve(artifactDir, "browser-records.json"), records);
  const rooms = new Set(
    [
      ...scenarios.map((scenario) => scenario.game),
      new URL(publisher.url()).searchParams.get("game"),
      new URL(host.url()).searchParams.get("game"),
    ].filter((game) => game !== null),
  );
  for (const game of rooms) {
    json(
      resolve(artifactDir, `room-${game}.json`),
      await dumpRoom(databasePort, game),
    );
  }
  await publisher.screenshot({
    path: resolve(artifactDir, "publisher-final.png"),
    fullPage: true,
  }).catch(() => undefined);
  await host.screenshot({
    path: resolve(artifactDir, "host-final.png"),
    fullPage: true,
  }).catch(() => undefined);
  if (failure !== null) {
    await publisherContext.tracing.stop({
      path: resolve(artifactDir, "publisher-trace.zip"),
    });
    await hostContext.tracing.stop({
      path: resolve(artifactDir, "host-trace.zip"),
    });
  } else {
    await publisherContext.tracing.stop();
    await hostContext.tracing.stop();
  }
  await publisherContext.close();
  await hostContext.close();
  if (failure !== null) throw failure;
}

async function main() {
  const profile = option("--profile", "smoke");
  if (!["smoke", "soak", "rehearsal"].includes(profile)) {
    throw new Error("--profile must be smoke, soak, or rehearsal");
  }
  const seed = positiveInteger("--seed", 20260729);
  const port = positiveInteger("--port", 5197);
  const runs = positiveInteger("--runs", profile === "soak" ? 1000 : 1);
  const builtArtifact = hasFlag("--built");
  const durationMinutes = Number(
    option("--duration-minutes", profile === "soak" ? "60" : "5"),
  );
  const outputRoot = resolve(
    option("--output", "artifacts/coop-fuzz"),
    `${profile}-${seed}-${new Date().toISOString().replaceAll(":", "-")}`,
  );
  mkdirSync(outputRoot, { recursive: true });

  const suppliedBaseUrl = option("--base-url", null);
  const server =
    suppliedBaseUrl === null
      ? await startServer(port, builtArtifact)
      : {
          baseUrl: suppliedBaseUrl,
          databasePort: () => null,
          output: [],
          stop: async () => {},
        };
  const browser = await chromium.launch();
  const deadline = Date.now() + durationMinutes * 60_000;
  let completed = 0;
  try {
    while (completed < runs && Date.now() < deadline) {
      const iterationSeed = seed + completed;
      const artifactDir = resolve(outputRoot, `run-${iterationSeed}`);
      mkdirSync(artifactDir, { recursive: true });
      await runBrowserIteration({
        browser,
        baseUrl: server.baseUrl,
        databasePort: server.databasePort(),
        artifactDir,
        profile,
        seed: iterationSeed,
      });
      completed += 1;
      console.log(`browser fuzz passed profile=${profile} seed=${iterationSeed}`);
    }
    json(resolve(outputRoot, "summary.json"), {
      profile,
      seed,
      completed,
      passed: true,
    });
  } catch (error) {
    json(resolve(outputRoot, "summary.json"), {
      profile,
      seed,
      completed,
      passed: false,
      error: error instanceof Error ? error.stack : String(error),
      serverOutput: server.output.join(""),
    });
    console.error(`artifacts: ${outputRoot}`);
    throw error;
  } finally {
    await browser.close();
    await server.stop();
  }
}

await main();
