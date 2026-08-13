import { readFileSync } from "node:fs";
import { join } from "node:path";

const affiliationId = "4b715cd0-8b41-4b82-9cef-c47b15e8992b";
const editedName = "Spirit Animals E2E";

describe("native affiliation editing", () => {
  it("persists one semantic UI edit to canonical RON and reloads it", async () => {
    const repository = process.env.TABULA_E2E_REPOSITORY_ROOT;
    const artifacts = process.env.TABULA_E2E_ARTIFACTS;
    if (!repository || !artifacts) throw new Error("Native E2E fixture environment is missing");
    const sourcePath = join(repository, "data", "affiliations.ron");
    const before = readFileSync(sourcePath, "utf8");

    const shell = await $(".app-shell");
    await shell.waitForDisplayed();
    await expect($(".file-identity")).toHaveText(expect.stringContaining(repository));
    await expect($$("[aria-invalid='true']")).toBeElementsArrayOfSize(0);

    const record = await $(`[data-record-id='${affiliationId}']`);
    await record.click();
    await expect($(".uuid-button")).toHaveText(affiliationId);

    const name = await $(".compact-fields input");
    await name.setValue(editedName);
    await expect(name).toHaveValue(editedName);

    const save = await $("//button[normalize-space(.)='Save changes']");
    await expect(save).toBeEnabled();
    await save.click();
    await expect($(".save-state")).toHaveText("All changes saved");

    const after = readFileSync(sourcePath, "utf8");
    expect(after).not.toBe(before);
    expect(after).toContain(`name: Tx("${editedName}"),`);
    const changedLines = before
      .split("\n")
      .filter((line, index) => line !== after.split("\n")[index]);
    expect(changedLines).toHaveLength(1);

    const reload = await $("button[aria-label='Reload from disk']");
    await reload.click();
    const sameRecord = await $(`[data-record-id='${affiliationId}']`);
    await sameRecord.click();
    await expect($(".compact-fields input")).toHaveValue(editedName);
    await browser.waitUntil(() => browser.execute(() => document.fonts.status === "loaded"));
    await expect(browser.execute(() => document.fonts.check("16px boxicons"))).resolves.toBe(true);
    const iconContent = await browser.execute(() => {
      const icon = document.querySelector<HTMLElement>(".bx");
      return icon ? getComputedStyle(icon, "::before").content.replaceAll('"', "") : "";
    });
    expect([...iconContent]).toHaveLength(1);
    await browser.saveScreenshot(join(artifacts, "native-save-reloaded.png"));
    await expect($$("[role='alert']")).toBeElementsArrayOfSize(0);
  });
});
