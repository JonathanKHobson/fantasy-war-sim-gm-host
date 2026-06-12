import test from "node:test";
import assert from "node:assert/strict";

import { chromium } from "@playwright/test";

import { LocalHostService } from "../../electron/local-host-service.mjs";

test("player room opens the hosted simulator in a new tab without hitting Not found", async () => {
  const service = new LocalHostService({ port: 0 });
  const status = await service.start();
  const browser = await chromium.launch({ headless: true });

  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`${status.localPlayerUrl}?code=${encodeURIComponent(status.sessionCode)}`, { waitUntil: "domcontentloaded" });

    await page.locator("#playerName").fill("Dana");
    await page.locator("#joinButton").click();
    await page.getByText("You joined the shared room.", { exact: false }).waitFor({ state: "visible" });

    const popupPromise = page.waitForEvent("popup");
    await page.locator("#openSimulatorButton").click();
    const popup = await popupPromise;

    await popup.waitForLoadState("domcontentloaded");
    await popup.getByText("Connected to the live shared simulator.", { exact: false }).waitFor({ state: "visible" });
    await popup.locator("#simulatorFrame").waitFor({ state: "visible" });

    const frameHandle = await popup.locator("#simulatorFrame").elementHandle();
    assert.ok(frameHandle, "simulator iframe handle should exist");

    const simulatorFrame = await frameHandle.contentFrame();
    assert.ok(simulatorFrame, "simulator iframe content should load");
    await simulatorFrame.waitForLoadState("domcontentloaded");

    const bodyText = (await simulatorFrame.locator("body").innerText()).trim();
    assert.notEqual(bodyText, "Not found");
    await expectVisibleText(simulatorFrame, /Fantasy War Sim/i);

    await context.close();
  } finally {
    await browser.close();
    await service.stop();
  }
});

async function expectVisibleText(frame, pattern) {
  const text = await frame.locator("body").innerText();
  assert.match(text, pattern);
}
