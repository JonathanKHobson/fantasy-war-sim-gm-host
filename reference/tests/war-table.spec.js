const { test, expect } = require("@playwright/test");

const LOCAL_APP_URL = "http://127.0.0.1:4173/fantasy-war-sim.html";

function appUrl(testInfo) {
  if (testInfo.project.name.includes("hosted")) {
    return process.env.WAR_TABLE_HOSTED_URL;
  }
  return LOCAL_APP_URL;
}

async function gotoApp(page, testInfo) {
  await page.addInitScript(() => {
    window.localStorage.clear();
  });
  await page.goto(appUrl(testInfo), { waitUntil: "domcontentloaded" });
}

async function historyLength(page) {
  return page.evaluate(() => {
    const raw = window.localStorage.getItem("warTableState");
    const parsed = raw ? JSON.parse(raw) : {};
    return Array.isArray(parsed.battleHistory) ? parsed.battleHistory.length : 0;
  });
}

async function readSavedState(page) {
  return page.evaluate(() => JSON.parse(window.localStorage.getItem("warTableState")));
}

async function currentWeatherTag(page) {
  return page.evaluate(() => normalizeWeatherV2(state.weather || DEFAULT_WEATHER).tag);
}

function parseDiceCount(text) {
  const matches = String(text || "").match(/(\d+)d/gi) || [];
  return matches.reduce((sum, token) => sum + Number(token.replace(/d/i, "")), 0);
}

async function currentPoolState(page) {
  return page.evaluate(() => {
    const ahPreview = resolveAssistHinderEffects(state, { mode: "preview" });
    const att = computePool("attacker", state, { ahBySide: ahPreview.bySide, mode: "preview" });
    const def = computePool("defender", state, { ahBySide: ahPreview.bySide, mode: "preview" });
    return {
      dicePoolMode: state.settings.dicePoolMode,
      allowOverCap: state.settings.allowOverCap,
      attacker: {
        totalDice: att.totalDice,
        usableDice: att.usableDice,
        maxCommit: att.maxCommit,
        diceToRollDefault: att.diceToRollDefault,
        diceSidesDisplay: att.diceSidesDisplay
      },
      defender: {
        totalDice: def.totalDice,
        usableDice: def.usableDice,
        maxCommit: def.maxCommit,
        diceToRollDefault: def.diceToRollDefault,
        diceSidesDisplay: def.diceSidesDisplay
      }
    };
  });
}

async function currentPoolComputation(page) {
  return page.evaluate(() => {
    const ahPreview = resolveAssistHinderEffects(state, { mode: "preview" });
    const att = computePool("attacker", state, { ahBySide: ahPreview.bySide, mode: "preview" });
    const def = computePool("defender", state, { ahBySide: ahPreview.bySide, mode: "preview" });
    const pick = (comp) => ({
      usableDice: comp.usableDice,
      postUsableCapModifierTotal: comp.postUsableCapModifierTotal,
      effectiveAdv: comp.effectiveAdv,
      effectiveDisadv: comp.effectiveDisadv,
      warRoomEffects: comp.warRoomEffects,
      warRoomSummary: comp.warRoomSummary
    });
    return {
      attacker: pick(att),
      defender: pick(def)
    };
  });
}

async function prepareManualBattle(page, config = {}) {
  const {
    attackerClass = "cavalry",
    defenderClass = "pikes",
    attackerSize = "150",
    attackerStr = "50",
    defenderSize = "100",
    defenderStr = "40"
  } = config;
  await page.click("#prefillExample");
  await page.selectOption("#attackerClass", attackerClass);
  await page.selectOption("#defenderClass", defenderClass);
  await page.fill("#attackerSize", attackerSize);
  await page.fill("#attackerStr", attackerStr);
  await page.fill("#defenderSize", defenderSize);
  await page.fill("#defenderStr", defenderStr);
}

async function setCheckboxValue(page, selector, checked) {
  await page.locator(selector).evaluate((el, value) => {
    el.checked = value;
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }, checked);
}

async function setSelectValue(page, selector, value) {
  await page.locator(selector).evaluate((el, nextValue) => {
    el.value = nextValue;
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
}

async function forceFixedRolls(page, rollValue = 3) {
  await page.evaluate((nextRollValue) => {
    window.__origRollPool = window.__origRollPool || rollPool;
    rollPool = (diceSidesList, count) => {
      const sides = Number(diceSidesList?.[0]) || 6;
      const committed = Math.max(0, Number(count) || 0);
      return {
        committed,
        rolls: Array.from({ length: committed }, () => ({ roll: nextRollValue, sides })),
        total: committed * nextRollValue
      };
    };
  }, rollValue);
}

async function forceQueuedRolls(page, attackerRolls, defenderRolls) {
  await page.evaluate(({ nextAttackerRolls, nextDefenderRolls }) => {
    window.__origRollPool = window.__origRollPool || rollPool;
    const queue = [nextAttackerRolls.slice(), nextDefenderRolls.slice()];
    rollPool = (diceSidesList, count) => {
      const sides = Number(diceSidesList?.[0]) || 6;
      const committed = Math.max(0, Number(count) || 0);
      const nextRolls = queue.shift() || [];
      const values = nextRolls.slice(0, committed);
      while (values.length < committed) values.push(1);
      const rolls = values.map((roll) => ({ roll: Number(roll) || 1, sides }));
      return {
        committed,
        rolls,
        total: rolls.reduce((sum, entry) => sum + entry.roll, 0)
      };
    };
  }, { nextAttackerRolls: attackerRolls, nextDefenderRolls: defenderRolls });
}

async function forceSpecialRuleRolls(page, map) {
  await page.evaluate((nextMap) => {
    window.__warTableSpecialRuleRolls = Object.fromEntries(
      Object.entries(nextMap || {}).map(([key, values]) => [key, Array.isArray(values) ? values.slice() : []])
    );
  }, map);
}

async function forceRollDie(page, rollValue = 1) {
  await page.evaluate((nextRollValue) => {
    window.__origRollDie = window.__origRollDie || rollDie;
    rollDie = (sides) => Math.max(1, Math.min(Number(sides) || 6, Number(nextRollValue) || 1));
  }, rollValue);
}

async function forceAdvanceWeatherSequence(page, sequence) {
  await page.evaluate((steps) => {
    window.__origAdvanceWeatherAfterBattle = window.__origAdvanceWeatherAfterBattle || advanceWeatherAfterBattle;
    const queue = Array.isArray(steps) ? steps.slice() : [];
    advanceWeatherAfterBattle = (ws) => {
      if (!queue.length) return window.__origAdvanceWeatherAfterBattle(ws);
      const next = queue.shift() || {};
      const weather = normalizeWeatherV2(Object.assign({}, ws || {}, next.weather || {}));
      return { ws: weather, meta: Object.assign({
        advanced: true,
        phenomenaTriggered: weather.tag === "PHENOMENA" && !!weather.phenomena,
        intensityBefore: Number(ws?.intensity || weather.intensity || 1),
        intensityAfter: Number(weather.intensity || 1),
        driftDelta: Number(weather.intensity || 1) - Number(ws?.intensity || weather.intensity || 1),
        lockRemainingBefore: Number(ws?.phenomenaLockRemaining || 0),
        lockRemainingAfter: Number(weather.phenomenaLockRemaining || 0)
      }, next.meta || {}) };
    };
  }, sequence);
}

async function setNearbyState(page, sideKey, payload = {}) {
  await page.evaluate(({ nextSideKey, nextPayload }) => {
    const side = state[nextSideKey];
    if (!side) return;
    const assistNearby = Array.isArray(nextPayload.assistNearby) ? nextPayload.assistNearby : null;
    const hinderNearby = Array.isArray(nextPayload.hinderNearby) ? nextPayload.hinderNearby : null;
    if (assistNearby) side.assistNearby = assistNearby.map((entry) => sanitizeNearbyEntry(entry)).filter(Boolean);
    if (hinderNearby) side.hinderNearby = hinderNearby.map((entry) => sanitizeNearbyEntry(entry)).filter(Boolean);
    if (nextPayload.assistContext) {
      side.assistContext = normalizeAssistContext(Object.assign({}, side.assistContext, nextPayload.assistContext));
    }
    persistAssistDraft();
    render();
  }, { nextSideKey: sideKey, nextPayload: payload });
}

async function seedSavedArmies(page, armies) {
  await page.evaluate((records) => {
    state.saved.armies = records
      .map((record) => sanitizeArmyRecord(record))
      .filter(Boolean);
    recomputeFactions(state.saved);
    persist(state.saved);
    refreshArmyFactionAndLoaders({ useArmyFilter: false });
    render();
  }, armies);
}

async function seedWarState(page, war) {
  await page.evaluate((nextWar) => {
    state.saved.war = normalizeWarState(nextWar);
    persist(state.saved);
    render();
  }, war);
}

async function setPhenomenaWeather(page, phenomena = "ASHFALL", intensity = 2) {
  await page.evaluate(({ phenomenon, nextIntensity }) => {
    const ws = normalizeWeatherV2({
      ...state.weather,
      tag: "PHENOMENA",
      phenomena: phenomenon,
      intensity: nextIntensity,
      lockWeather: true,
      autoAdvance: false,
      source: "manual"
    });
    if (phenomenon === "ELEMENTAL_DISTURBANCE") {
      ws.elementalSubtype = normalizeElementalSubtype(ws.elementalSubtype) || Object.assign({}, ELEMENTAL_SUBTYPE_POOL[0]);
    }
    if (phenomenon === "WILD_MAGIC_STORM") {
      ws.wildMagicEvent = rollWildMagicEvent(ws.intensity);
    }
    state.weather = normalizeWeatherV2(ws);
    state.saved.weather = normalizeWeatherV2(ws);
    persistWeather(state.weather);
    persist(state.saved);
    render();
  }, { phenomenon: phenomena, nextIntensity: intensity });
}

async function setBattleWeather(page, config = {}) {
  const {
    tag = "CLEAR",
    hour = 12,
    intensity = 1,
    autoAdvance = false,
    lockWeather = false
  } = config;
  await page.evaluate(({ nextTag, nextHour, nextIntensity, nextAutoAdvance, nextLockWeather }) => {
    const ws = normalizeWeatherV2({
      ...state.weather,
      tag: nextTag,
      hour: nextHour,
      intensity: nextIntensity,
      autoAdvance: nextAutoAdvance,
      lockWeather: nextLockWeather,
      phenomena: null,
      phenomenaLockRemaining: 0,
      elementalSubtype: null,
      wildMagicEvent: null,
      source: "manual"
    });
    state.weather = ws;
    state.saved.weather = ws;
    persistWeather(ws);
    persist(state.saved);
    render();
  }, {
    nextTag: tag,
    nextHour: hour,
    nextIntensity: intensity,
    nextAutoAdvance: autoAdvance,
    nextLockWeather: lockWeather
  });
}

async function diceDisplay(page, sideKey) {
  return page.evaluate((nextSideKey) => {
    return nextSideKey === "attacker"
      ? (state._computed.att?.diceSidesDisplay || "")
      : (state._computed.def?.diceSidesDisplay || "");
  }, sideKey);
}

function buildHistoryRecord({
  ts,
  sessionId,
  sessionLabel,
  sessionStartedAt,
  turnNumber,
  battleIndexInTurn,
  attackerName = "Iron Vanguard",
  defenderName = "Stonewall Guard",
  attackerClass = "Cavalry",
  defenderClass = "Pikes"
}) {
  return {
    ts,
    sessionId,
    sessionLabel,
    sessionStartedAt,
    turnNumber,
    battleIndexInTurn,
    mode: "risk",
    winner: battleIndexInTurn % 2 === 0 ? "defender" : "attacker",
    summary: "Seeded history battle",
    losses: { attacker: 5, defender: 7 },
    updatedSizes: { attacker: 145, defender: 93 },
    attacker: {
      name: attackerName,
      class: attackerClass,
      size: 150,
      str: 120,
      pool: "10d6",
      doctrines: []
    },
    defender: {
      name: defenderName,
      class: defenderClass,
      size: 100,
      str: 80,
      pool: "8d6",
      doctrines: []
    },
    rolls: {
      attacker: [{ roll: 6, sides: 6 }],
      defender: [{ roll: 4, sides: 6 }],
      totals: { attacker: 6, defender: 4 }
    },
    assistHinder: {
      attacker: { summary: [], assistNearby: [], hinderNearby: [] },
      defender: { summary: [], assistNearby: [], hinderNearby: [] },
      rollOps: [],
      transferRolls: []
    },
    directContextSummary: { attacker: [], defender: [] },
    phenomenaSummary: { attacker: [], defender: [] },
    comparisons: []
  };
}

async function seedHistory(page, records, runtimeSession = null) {
  await page.evaluate(({ nextRecords, nextRuntimeSession }) => {
    state.saved.battleHistory = nextRecords;
    persist(state.saved);
    if (nextRuntimeSession) {
      runtimeSessionId = nextRuntimeSession.sessionId;
      runtimeSessionStartedAt = nextRuntimeSession.sessionStartedAt;
      runtimeSessionLabel = nextRuntimeSession.sessionLabel;
      runtimeBattleTurn = nextRuntimeSession.turnNumber;
    }
    renderHistoryList();
    render();
  }, { nextRecords: records, nextRuntimeSession: runtimeSession });
}

test.beforeEach(async ({ page }, testInfo) => {
  await gotoApp(page, testInfo);
});

test("War Report staging does not append history until Start Battle Roll", async ({ page }, testInfo) => {
  await prepareManualBattle(page);
  await expect(page.locator("#warReportBattleAgainBtn")).toHaveText("Start Battle Roll");

  await page.click("#battleBtn");
  await expect(page.locator("#warReportModal")).toHaveAttribute("open", "");
  await expect(page.getByTestId("war-report-staging-notice")).toContainText("No round has run yet");
  await expect.poll(() => historyLength(page)).toBe(0);

  await page.click("#warReportBattleAgainBtn");
  await expect.poll(() => historyLength(page)).toBe(1);
  await expect(page.locator("#warReportOutcome")).toBeVisible();
});

test("Empty History shows plain-language placeholder copy", async ({ page }) => {
  await page.click('.tab[data-tab="history"]');
  await expect(page.locator("#historyList")).toContainText("Battle history will appear here");
  await expect(page.locator("#historyList")).not.toContainText("Runtime-only");
  await expect(page.locator("#historyList")).not.toContainText("persisted");
  await expect.poll(() => historyLength(page)).toBe(0);
});

test("Fresh load shows setup guidance instead of an error-styled not-ready block", async ({ page }) => {
  await expect(page.locator("#battleBtn")).toBeDisabled();
  await expect(page.locator("#validationMsg")).toBeVisible();
  await expect(page.locator("#validationMsg")).toContainText("Set up both armies to enable Battle.");
  await expect(page.locator("#validationMsg")).toContainText("Load Example");
  await expect(page.locator("#validationMsg")).not.toContainText("Not ready");
  await expect(page.locator("#validationMsg")).toHaveClass("alert");
  await expect(page.locator("#validationMsg")).toHaveAttribute("role", "status");
  await expect(page.locator("#validationMsg")).toHaveAttribute("aria-live", "polite");
});

test("Validation and modal error surfaces expose accessible live-region semantics", async ({ page }) => {
  await expect(page.locator("#validationMsg")).toHaveAttribute("role", "status");
  await expect(page.locator("#validationMsg")).toHaveAttribute("aria-live", "polite");

  await page.click('.tab[data-tab="armies"]');
  await page.click("#newArmyBtn");
  await page.click("#armyModalSave");
  await expect(page.locator("#armyModalError")).toContainText("Army name is required.");
  await expect(page.locator("#armyModalError")).toHaveAttribute("role", "alert");
  await expect(page.locator("#armyModalError")).toHaveAttribute("aria-live", "assertive");
});

test("Head provides an icon without a favicon.ico console 404", async ({ page }, testInfo) => {
  const errors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  await page.goto(appUrl(testInfo), { waitUntil: "domcontentloaded" });

  await expect(page.locator('head link[rel="icon"]')).toHaveCount(1);
  expect(errors.filter((text) => text.includes("favicon.ico"))).toHaveLength(0);
});

test("Header keeps a single-row desktop contract and stacks intentionally below the breakpoint", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.reload({ waitUntil: "domcontentloaded" });

  await expect(page.locator("#buildLabelHeader")).toHaveText("2026-03-08-three-pool-scale-p1");
  const desktopLayout = await page.evaluate(() => {
    const brand = document.querySelector(".brand");
    const nav = document.querySelector("#mainNav");
    const tabs = Array.from(document.querySelectorAll("#mainNav .tab"));
    const firstTabTop = tabs[0].getBoundingClientRect().top;
    const settingsTop = tabs[tabs.length - 1].getBoundingClientRect().top;
    const brandRect = brand.getBoundingClientRect();
    const navRect = nav.getBoundingClientRect();
    const navStyle = window.getComputedStyle(nav);
    return {
      sameHeaderRow: Math.abs(brandRect.top - navRect.top) < 6,
      navSingleRow: Math.abs(firstTabTop - settingsTop) < 6,
      navWrap: navStyle.flexWrap
    };
  });

  expect(desktopLayout.sameHeaderRow).toBe(true);
  expect(desktopLayout.navSingleRow).toBe(true);
  expect(desktopLayout.navWrap).toBe("nowrap");

  await page.setViewportSize({ width: 1024, height: 900 });
  await page.reload({ waitUntil: "domcontentloaded" });

  const stackedLayout = await page.evaluate(() => {
    const brand = document.querySelector(".brand");
    const nav = document.querySelector("#mainNav");
    const brandRect = brand.getBoundingClientRect();
    const navRect = nav.getBoundingClientRect();
    const navStyle = window.getComputedStyle(nav);
    const pillStyle = window.getComputedStyle(document.querySelector(".brand .pill"));
    return {
      navBelowBrand: navRect.top >= brandRect.bottom - 1,
      navWrap: navStyle.flexWrap,
      pillWhiteSpace: pillStyle.whiteSpace
    };
  });

  expect(stackedLayout.navBelowBrand).toBe(true);
  expect(stackedLayout.navWrap).toBe("wrap");
  expect(stackedLayout.pillWhiteSpace).toBe("normal");
});

test("Reset clears battle setup but preserves settings", async ({ page }) => {
  await prepareManualBattle(page);
  await setSelectValue(page, "#allowOverCap", "yes");
  await page.click("#resetBtn");
  await expect(page.getByTestId("dirty-guard-modal")).toBeVisible();
  await page.getByTestId("dirty-guard-secondary").click();

  await expect(page.locator("#attackerSize")).toHaveValue("");
  await expect(page.locator("#defenderSize")).toHaveValue("");
  await expect(page.locator("#allowOverCap")).toHaveValue("yes");
});

test("Dice pool mode defaults to three-pool, persists when saved, normalizes old imports, and discards unsaved changes", async ({ page }) => {
  await page.click('.tab[data-tab="settings"]');
  await expect(page.locator("#dicePoolMode")).toHaveValue("threePool");

  await setSelectValue(page, "#dicePoolMode", "legacy");
  await page.click("#saveWeatherSettings");
  const savedMode = await page.evaluate(() => JSON.parse(window.localStorage.getItem("warTableState")).settings.dicePoolMode);
  expect(savedMode).toBe("legacy");

  const exportedState = await page.evaluate(() => JSON.parse(window.localStorage.getItem("warTableState")));
  delete exportedState.settings.dicePoolMode;
  await page.evaluate((payload) => {
    doImportAll(payload);
  }, exportedState);
  await expect(page.locator("#dicePoolMode")).toHaveValue("threePool");

  await setSelectValue(page, "#dicePoolMode", "legacy");
  await page.click('.tab[data-tab="battle"]');
  await expect(page.getByTestId("dirty-guard-modal")).toBeVisible();
  await page.getByTestId("dirty-guard-secondary").click();
  await page.click('.tab[data-tab="settings"]');
  await expect(page.locator("#dicePoolMode")).toHaveValue("threePool");
});

test("Battle loss preset stays enabled in both modes and explains shared tie scope", async ({ page }) => {
  await page.click('.tab[data-tab="settings"]');
  await expect(page.locator("#resolutionMode")).toHaveValue("risk");
  await expect(page.locator("#quickLossPreset")).toHaveValue("rulesAsWritten");
  await expect(page.locator("#quickLossPreset")).toBeEnabled();
  await expect(page.locator('label:has(#quickLossPreset)')).toContainText("Battle loss preset");
  await expect(page.locator('label:has(#quickLossPreset) .help')).toContainText("Applies to Compare-style and Quick Total ties");
  await expect(page.locator('label:has(#quickLossPreset) .help')).toContainText("Current tie rule: Rules as Written");
  await expect(page.locator('label:has(#quickLossPreset) .help')).toContainText("Compare-style non-tie wins still use the normal 10/20 difference rule");
  await expect(page.locator("#battleTieHint")).toContainText("Active tie preset: Rules as Written");

  await setSelectValue(page, "#resolutionMode", "quick");
  await expect(page.locator("#quickLossPreset")).toBeEnabled();
  await expect(page.locator('label:has(#quickLossPreset) .help')).toContainText("Applies to Compare-style and Quick Total ties");
  await expect(page.locator("#battleTieHint")).toContainText("Active tie preset: Rules as Written");
});

test("Shared preset drives quick total and compare-style ties without changing compare-style non-tie differences", async ({ page }) => {
  const outcomes = await page.evaluate(() => {
    const evaluateQuick = (preset) => {
      state.settings.quickLossPreset = preset;
      return resolveQuick(
        { size: 20 },
        { size: 20 },
        { total: 12, rolls: [] },
        { total: 12, rolls: [] }
      );
    };
    const evaluateRiskTie = (preset) => {
      state.settings.quickLossPreset = preset;
      return resolveRisk(
        { size: 20 },
        { size: 20 },
        { rolls: [{ roll: 6, sides: 6 }], total: 6 },
        { rolls: [{ roll: 6, sides: 6 }], total: 6 }
      );
    };
    state.settings.quickLossPreset = "flat20";
    const riskDiffOne = resolveRisk(
      { size: 30 },
      { size: 30 },
      { rolls: [{ roll: 6, sides: 6 }], total: 6 },
      { rolls: [{ roll: 5, sides: 6 }], total: 5 }
    );
    const riskDiffThree = resolveRisk(
      { size: 30 },
      { size: 30 },
      { rolls: [{ roll: 6, sides: 6 }], total: 6 },
      { rolls: [{ roll: 3, sides: 6 }], total: 3 }
    );
    return {
      rulesAsWritten: evaluateQuick("rulesAsWritten"),
      standard: evaluateQuick("standard"),
      flat10: evaluateQuick("flat10"),
      flat20: evaluateQuick("flat20"),
      riskRulesAsWritten: evaluateRiskTie("rulesAsWritten"),
      riskStandard: evaluateRiskTie("standard"),
      riskFlat10: evaluateRiskTie("flat10"),
      riskFlat20: evaluateRiskTie("flat20"),
      riskDiffOne,
      riskDiffThree
    };
  });

  expect(outcomes.rulesAsWritten.winner).toBe("defender");
  expect(outcomes.rulesAsWritten.attLoss).toBe(5);
  expect(outcomes.rulesAsWritten.defLoss).toBe(0);
  expect(outcomes.rulesAsWritten.summary).toContain("Quick Total tie");

  expect(outcomes.standard.attLoss).toBe(5);
  expect(outcomes.standard.defLoss).toBe(5);
  expect(outcomes.flat10.attLoss).toBe(0);
  expect(outcomes.flat10.defLoss).toBe(0);
  expect(outcomes.flat20.attLoss).toBe(10);
  expect(outcomes.flat20.defLoss).toBe(10);

  expect(outcomes.riskRulesAsWritten.winner).toBe("defender");
  expect(outcomes.riskRulesAsWritten.comparisons[0].loss).toBe("Tie: Att -5, Def 0");
  expect(outcomes.riskRulesAsWritten.attLoss).toBe(5);
  expect(outcomes.riskRulesAsWritten.defLoss).toBe(0);
  expect(outcomes.riskStandard.comparisons[0].loss).toBe("Tie: Att -5, Def -5");
  expect(outcomes.riskFlat10.comparisons[0].loss).toBe("Tie: Att 0, Def 0");
  expect(outcomes.riskFlat20.comparisons[0].loss).toBe("Tie: Att -10, Def -10");

  expect(outcomes.riskDiffOne.defLoss).toBe(10);
  expect(outcomes.riskDiffThree.defLoss).toBe(20);
});

test("Quick Total standard preset still loads safely from saved state", async ({ page }) => {
  await page.evaluate(() => {
    const saved = JSON.parse(window.localStorage.getItem("warTableState"));
    saved.settings.quickLossPreset = "standard";
    doImportAll(saved);
  });
  await page.click('.tab[data-tab="settings"]');
  await expect(page.locator("#quickLossPreset")).toHaveValue("standard");
});

test("Unsupported quick preset normalizes back to rules-as-written on import", async ({ page }) => {
  const exportedState = await page.evaluate(() => JSON.parse(window.localStorage.getItem("warTableState")));
  exportedState.settings.quickLossPreset = "nonsense";
  await page.evaluate((payload) => {
    doImportAll(payload);
  }, exportedState);
  await page.click('.tab[data-tab="settings"]');
  await expect(page.locator("#quickLossPreset")).toHaveValue("rulesAsWritten");
});

test("Quick Total rules-as-written tie applies through battle result, War Report, and history", async ({ page }) => {
  await page.click('.tab[data-tab="settings"]');
  await setSelectValue(page, "#resolutionMode", "quick");
  await setSelectValue(page, "#quickLossPreset", "rulesAsWritten");
  await setSelectValue(page, "#showWarReportModal", "yes");
  await page.click("#saveWeatherSettings");
  await page.click('.tab[data-tab="battle"]');

  await prepareManualBattle(page, {
    attackerClass: "swords",
    defenderClass: "swords",
    attackerSize: "20",
    attackerStr: "10",
    defenderSize: "20",
    defenderStr: "10"
  });
  await forceFixedRolls(page, 4);

  await page.click("#battleBtn");
  await expect(page.locator("#warReportModal")).toHaveAttribute("open", "");
  await expect(page.getByTestId("war-report-staging-notice")).toBeVisible();

  await page.click("#warReportBattleAgainBtn");
  await expect(page.locator("#resultArea")).toBeVisible();
  await expect(page.locator("#resultSummary")).toContainText("Quick Total tie");
  await expect(page.locator("#resultSummary")).toContainText("Rules as Written applied: Att -5 / Def 0.");
  await expect(page.locator("#riskDetails")).toBeHidden();
  await expect(page.locator("#warReportOutcomeMeta")).toContainText("Rules as Written applied: Att -5 / Def 0.");
  await expect(page.locator("#warReportCompareWrap")).toBeHidden();
  await expect(page.locator("#warReportAttCol")).toContainText("-5");
  await expect(page.locator("#warReportDefCol")).toContainText("0");

  const stored = await page.evaluate(() => {
    const raw = JSON.parse(window.localStorage.getItem("warTableState"));
    return raw.battleHistory[0];
  });
  expect(stored.mode).toBe("quick");
  expect(stored.losses.attacker).toBe(5);
  expect(stored.losses.defender).toBe(0);
  expect(stored.summary).toContain("Rules as Written applied: Att -5 / Def 0.");

  await page.click("#warReportClose");
  await page.click('.tab[data-tab="history"]');
  await expect(page.locator(".historyCard .historySummary").first()).toContainText("Losses: Att -5 • Def 0");
});

test("Quick Total standard tie applies through the live battle flow", async ({ page }) => {
  await page.click('.tab[data-tab="settings"]');
  await setSelectValue(page, "#resolutionMode", "quick");
  await setSelectValue(page, "#quickLossPreset", "standard");
  await setSelectValue(page, "#showWarReportModal", "no");
  await page.click("#saveWeatherSettings");
  await page.click('.tab[data-tab="battle"]');

  await prepareManualBattle(page, {
    attackerClass: "swords",
    defenderClass: "swords",
    attackerSize: "20",
    attackerStr: "10",
    defenderSize: "20",
    defenderStr: "10"
  });
  await forceFixedRolls(page, 4);

  await page.click("#battleBtn");
  await expect(page.locator("#resultArea")).toBeVisible();
  await expect(page.locator("#resultSummary")).toContainText("Quick Total tie");
  await expect(page.locator("#resultSummary")).toContainText("Standard applied: Att -5 / Def -5.");
  await expect(page.locator("#riskDetails")).toBeHidden();

  const stored = await page.evaluate(() => {
    const raw = JSON.parse(window.localStorage.getItem("warTableState"));
    return raw.battleHistory[0];
  });
  expect(stored.losses.attacker).toBe(5);
  expect(stored.losses.defender).toBe(5);
});

test("Compare-style uses the selected preset for tie rows while keeping non-tie difference losses", async ({ page }) => {
  await page.click('.tab[data-tab="settings"]');
  await setSelectValue(page, "#resolutionMode", "risk");
  await setSelectValue(page, "#quickLossPreset", "rulesAsWritten");
  await setSelectValue(page, "#showWarReportModal", "yes");
  await page.click("#saveWeatherSettings");
  await page.click('.tab[data-tab="battle"]');

  await prepareManualBattle(page);
  await forceQueuedRolls(
    page,
    [6, 5, 5, 5, 4, 4, 3, 1, 1, 1],
    [6, 6, 6, 6, 5, 4, 2, 1]
  );

  await page.click("#battleBtn");
  await expect(page.locator("#warReportModal")).toHaveAttribute("open", "");
  await page.click("#warReportBattleAgainBtn");

  await expect(page.locator("#resultArea")).toBeVisible();
  await expect(page.locator("#resultSummary")).toContainText("Compare-style: 8 comparisons");
  await expect(page.locator("#resultSummary")).toContainText("Losses: Att -55 • Def -10");
  await expect(page.locator("#riskCompareBody")).toContainText("Tie: Att -5, Def 0");
  await expect(page.locator("#riskCompareBody")).toContainText("Attacker −10");
  await expect(page.locator("#riskCompareBody")).toContainText("Defender −10");
  await expect(page.locator("#warReportCompareBody")).toContainText("Tie: Att -5, Def 0");
  await expect(page.locator("#warReportCompareBody")).toContainText("Attacker −10");
  await expect(page.locator("#warReportCompareBody")).toContainText("Defender −10");

  await page.click("#warReportClose");
  await page.click('.tab[data-tab="history"]');
  await expect(page.locator(".historyCard .historySummary").first()).toContainText("Losses: Att -55 • Def -10");
});

test("Settings tab uses a responsive two-column grid without changing settings behavior", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.click('.tab[data-tab="settings"]');

  const desktopLayout = await page.evaluate(() => {
    const settingsTab = document.querySelector("#tab-settings");
    const grid = settingsTab.querySelector(".settingsGrid");
    const cardByTitle = (title) => Array.from(grid.querySelectorAll(".card")).find((card) => {
      const heading = card.querySelector(".cardHead h2");
      return heading && heading.textContent.trim() === title;
    });
    const help = cardByTitle("Help & Wiki");
    const weather = cardByTitle("Weather & Season");
    const battle = cardByTitle("Battle Rules");
    const saveRow = grid.querySelector(".settingsActions");
    const helpRect = help.getBoundingClientRect();
    const weatherRect = weather.getBoundingClientRect();
    const battleRect = battle.getBoundingClientRect();
    const saveRect = saveRow.getBoundingClientRect();
    const gridRect = grid.getBoundingClientRect();
    const gridStyle = window.getComputedStyle(grid);
    return {
      gridColumns: gridStyle.gridTemplateColumns,
      helpSpansGrid: Math.abs(helpRect.left - gridRect.left) < 1 && Math.abs(helpRect.right - gridRect.right) < 1,
      weatherAndBattleShareRow: Math.abs(weatherRect.top - battleRect.top) < 2,
      weatherBeforeBattle: weatherRect.left < battleRect.left,
      saveSpansGrid: Math.abs(saveRect.left - gridRect.left) < 1 && Math.abs(saveRect.right - gridRect.right) < 1,
      saveBelowCards: saveRect.top >= Math.max(weatherRect.bottom, battleRect.bottom) - 1,
      noHorizontalOverflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1
    };
  });

  expect(desktopLayout.gridColumns.split(" ").length).toBe(2);
  expect(desktopLayout.helpSpansGrid).toBe(true);
  expect(desktopLayout.weatherAndBattleShareRow).toBe(true);
  expect(desktopLayout.weatherBeforeBattle).toBe(true);
  expect(desktopLayout.saveSpansGrid).toBe(true);
  expect(desktopLayout.saveBelowCards).toBe(true);
  expect(desktopLayout.noHorizontalOverflow).toBe(true);

  await page.selectOption("#settingsSeason", "winter");
  await page.click("#saveWeatherSettings");
  const savedSeason = await page.evaluate(() => JSON.parse(window.localStorage.getItem("warTableState")).weather.season);
  expect(savedSeason).toBe("winter");

  await page.setViewportSize({ width: 900, height: 1100 });
  const mobileLayout = await page.evaluate(() => {
    const grid = document.querySelector("#tab-settings .settingsGrid");
    const cardByTitle = (title) => Array.from(grid.querySelectorAll(".card")).find((card) => {
      const heading = card.querySelector(".cardHead h2");
      return heading && heading.textContent.trim() === title;
    });
    const help = cardByTitle("Help & Wiki").getBoundingClientRect();
    const weather = cardByTitle("Weather & Season").getBoundingClientRect();
    const battle = cardByTitle("Battle Rules").getBoundingClientRect();
    const gridStyle = window.getComputedStyle(grid);
    return {
      gridColumns: gridStyle.gridTemplateColumns,
      helpAboveWeather: weather.top >= help.bottom - 1,
      battleBelowWeather: battle.top >= weather.bottom - 1,
      stackedLeftAlignment: Math.abs(weather.left - battle.left) < 2,
      noHorizontalOverflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1
    };
  });

  expect(mobileLayout.gridColumns.split(" ").length).toBe(1);
  expect(mobileLayout.helpAboveWeather).toBe(true);
  expect(mobileLayout.battleBelowWeather).toBe(true);
  expect(mobileLayout.stackedLeftAlignment).toBe(true);
  expect(mobileLayout.noHorizontalOverflow).toBe(true);
});

test("Three-pool math uses total dice, usable dice, and dice-to-roll caps separately", async ({ page }) => {
  await prepareManualBattle(page, {
    attackerClass: "swords",
    defenderClass: "swords",
    attackerSize: "200",
    attackerStr: "120",
    defenderSize: "50",
    defenderStr: "10"
  });

  let snapshot = await currentPoolState(page);
  const baselineUsable = snapshot.attacker.usableDice;

  await page.evaluate(() => {
    state.attacker.manualDiceDelta = -3;
    render();
  });
  snapshot = await currentPoolState(page);
  expect(snapshot.dicePoolMode).toBe("threePool");
  expect(snapshot.attacker.totalDice).toBe(16);
  expect(snapshot.attacker.usableDice).toBe(baselineUsable - 3);
  expect(snapshot.attacker.maxCommit).toBe(Math.min(baselineUsable - 3, 10));
  await expect(page.locator("#attackerPoolBadge")).toContainText(`Usable dice: ${baselineUsable - 3}d6`);
  await expect(page.locator("#attackerPoolFinal")).toHaveText(`${Math.min(baselineUsable - 3, 10)}d6`);

  await page.evaluate(() => {
    state.attacker.manualDiceDelta = 3;
    render();
  });
  snapshot = await currentPoolState(page);
  expect(snapshot.attacker.totalDice).toBe(16);
  expect(snapshot.attacker.usableDice).toBe(baselineUsable + 3);
  expect(snapshot.attacker.maxCommit).toBe(10);
  await expect(page.locator("#attackerPoolBadge")).toContainText(`Usable dice: ${baselineUsable + 3}d6`);
  await expect(page.locator("#attackerPoolFinal")).toHaveText("10d6");

  await setSelectValue(page, "#allowOverCap", "yes");
  snapshot = await currentPoolState(page);
  expect(snapshot.allowOverCap).toBe(true);
  expect(snapshot.attacker.maxCommit).toBe(baselineUsable + 3);
  await expect(page.locator("#attackerPoolFinal")).toHaveText(`${baselineUsable + 3}d6`);
});

test("Cap override bypasses both cap layers in three-pool mode", async ({ page }) => {
  await prepareManualBattle(page, {
    attackerClass: "swords",
    defenderClass: "swords",
    attackerSize: "200",
    attackerStr: "120",
    defenderSize: "50",
    defenderStr: "10"
  });

  const baseline = await currentPoolState(page);
  await setCheckboxValue(page, "#attackerCapOverride", true);
  const snapshot = await currentPoolState(page);
  expect(snapshot.attacker.totalDice).toBe(16);
  expect(snapshot.attacker.usableDice).toBe(baseline.attacker.usableDice + 4);
  expect(snapshot.attacker.maxCommit).toBe(baseline.attacker.usableDice + 4);
  await expect(page.locator("#attackerPoolFinal")).toHaveText(`${baseline.attacker.usableDice + 4}d6`);
});

test("Legacy mode preserves the shipped direct-cap behavior", async ({ page }) => {
  await prepareManualBattle(page, {
    attackerClass: "swords",
    defenderClass: "swords",
    attackerSize: "200",
    attackerStr: "120",
    defenderSize: "50",
    defenderStr: "10"
  });

  await setSelectValue(page, "#dicePoolMode", "legacy");
  await page.evaluate(() => {
    state.attacker.manualDiceDelta = 3;
    render();
  });

  let snapshot = await currentPoolState(page);
  expect(snapshot.dicePoolMode).toBe("legacy");
  expect(snapshot.attacker.usableDice).toBe(10);
  expect(snapshot.attacker.maxCommit).toBe(10);
  await expect(page.locator("#attackerPoolFinal")).toHaveText("10d6");

  await setSelectValue(page, "#allowOverCap", "yes");
  snapshot = await currentPoolState(page);
  expect(snapshot.attacker.usableDice).toBe(13);
  expect(snapshot.attacker.maxCommit).toBe(13);
  await expect(page.locator("#attackerPoolFinal")).toHaveText("13d6");
});

test("Battle and War Report surfaces use the new usable-dice and dice-rolled labels", async ({ page }) => {
  await prepareManualBattle(page);
  await expect(page.locator("#attAdvancedSetupDetails")).toContainText("Manual override");
  await expect(page.locator("body")).not.toContainText("Dice to commit");
  await expect(page.locator("body")).not.toContainText("Committed dice");
  await expect(page.locator("#attackerPoolBadge")).toContainText("Usable dice:");
  await expect(page.locator("#attackerCapBadge")).toHaveText("Dice to roll cap: 10");

  await page.click("#battleBtn");
  await expect(page.locator("#warReportModal")).toHaveAttribute("open", "");
  await expect(page.locator("#warReportStageAttCol")).toContainText("Total dice");
  await expect(page.locator("#warReportStageAttCol")).toContainText("Usable dice");
  await expect(page.locator("#warReportStageAttCol")).toContainText("Dice rolled");
});

test("New Session clears setup, resets battle and weather turn labels, and shows a new placeholder", async ({ page }) => {
  await prepareManualBattle(page);
  await page.click("#turnBtn");
  await expect(page.locator("#conditionsSummary")).toContainText("Battle Turn 2");

  await page.click("#newBattleSessionBtn");
  await expect(page.getByTestId("dirty-guard-modal")).toBeVisible();
  await page.getByTestId("dirty-guard-secondary").click();

  await expect(page.locator("#attackerSize")).toHaveValue("");
  await expect(page.locator("#defenderSize")).toHaveValue("");
  await expect(page.locator("#conditionsSummary")).toContainText("Battle Turn 1");
  await expect(page.locator("#turnSeasonLabel")).toContainText("Weather Turn 1");
  await page.click('.tab[data-tab="history"]');
  await expect(page.locator("#historyList")).toContainText("Battle history will appear here");
});

test("Dirty army guard appears before destructive battle actions", async ({ page }) => {
  await prepareManualBattle(page);
  await page.fill("#attackerArmyNameDraft", "Unsaved Vanguard");
  await page.click("#swapSides");
  await expect(page.getByTestId("dirty-guard-modal")).toBeVisible();
  await expect(page.getByTestId("dirty-guard-primary")).toContainText("Save");
  await expect(page.getByTestId("dirty-guard-secondary")).toContainText("Discard");
});

test("Settings dirty guard focuses Stay by default", async ({ page }) => {
  await page.click('.tab[data-tab="settings"]');
  await page.fill("#settingsTurnsPerSeason", "7");
  await page.click('.tab[data-tab="battle"]');
  await expect(page.getByTestId("dirty-guard-modal")).toBeVisible();
  await expect(page.getByTestId("dirty-guard-cancel")).toContainText("Stay");
  await expect(page.getByTestId("dirty-guard-cancel")).toBeFocused();
});

test("Ticketed direct-context mechanics change the active pool and breakdown", async ({ page }) => {
  await prepareManualBattle(page, {
    attackerClass: "swords",
    defenderClass: "rebels",
    attackerSize: "50",
    attackerStr: "30",
    defenderSize: "50",
    defenderStr: "30"
  });
  const rebelBaseline = parseDiceCount(await page.locator("#defenderPoolBadge").innerText());
  await setCheckboxValue(page, "#defCtxHomeTerritory", true);
  const rebelAfter = parseDiceCount(await page.locator("#defenderPoolBadge").innerText());
  expect(rebelAfter).toBe(rebelBaseline + 1);
  await expect(page.locator("#defenderBreakdown")).toContainText("Rebels in home territory");

  await prepareManualBattle(page, {
    attackerClass: "swords",
    defenderClass: "forest-fey",
    attackerSize: "50",
    attackerStr: "30",
    defenderSize: "50",
    defenderStr: "30"
  });
  const feyBaseline = parseDiceCount(await page.locator("#defenderPoolBadge").innerText());
  await setCheckboxValue(page, "#defCtxForestEnvironment", true);
  const feyAfter = parseDiceCount(await page.locator("#defenderPoolBadge").innerText());
  expect(feyAfter).toBe(feyBaseline + 3);
  await expect(page.locator("#defenderBreakdown")).toContainText("Forest Fey in forest environment");

  await prepareManualBattle(page, {
    attackerClass: "swords",
    defenderClass: "pikes",
    attackerSize: "50",
    attackerStr: "30",
    defenderSize: "50",
    defenderStr: "30"
  });
  const pikeBaseline = parseDiceCount(await page.locator("#defenderPoolBadge").innerText());
  await setCheckboxValue(page, "#defCtxFlankedByTwoEnemies", true);
  const pikeAfter = parseDiceCount(await page.locator("#defenderPoolBadge").innerText());
  expect(pikeAfter).toBe(pikeBaseline - 1);
  await expect(page.locator("#defenderBreakdown")).toContainText("Pikes flanked by two enemies");
});

test("Bandits hidden bonus only applies to attacking bandits without enemy intel", async ({ page }) => {
  await prepareManualBattle(page, {
    attackerClass: "bandits",
    defenderClass: "swords",
    attackerSize: "50",
    attackerStr: "30",
    defenderSize: "50",
    defenderStr: "30"
  });
  const attackerBaseline = parseDiceCount(await page.locator("#attackerPoolBadge").innerText());
  await setCheckboxValue(page, "#attCtxSelfHiddenOrSurprising", true);
  const hiddenBonus = parseDiceCount(await page.locator("#attackerPoolBadge").innerText());
  expect(hiddenBonus).toBe(attackerBaseline + 1);
  await expect(page.locator("#attackerBreakdown")).toContainText("Bandits hidden attack");

  await setCheckboxValue(page, "#attCtxEnemyHasIntelOnHidden", true);
  const blockedBonus = parseDiceCount(await page.locator("#attackerPoolBadge").innerText());
  expect(blockedBonus).toBe(attackerBaseline);
  await expect(page.locator("#attackerBreakdown")).toContainText("blocked");

  await prepareManualBattle(page, {
    attackerClass: "swords",
    defenderClass: "bandits",
    attackerSize: "50",
    attackerStr: "30",
    defenderSize: "50",
    defenderStr: "30"
  });
  const defenderBaseline = parseDiceCount(await page.locator("#defenderPoolBadge").innerText());
  await setCheckboxValue(page, "#defCtxSelfHiddenOrSurprising", true);
  const defenderAfter = parseDiceCount(await page.locator("#defenderPoolBadge").innerText());
  expect(defenderAfter).toBe(defenderBaseline);
});

test("Gunners mixed dice upgrades follow the 9/10/19/20 size thresholds", async ({ page }) => {
  await setBattleWeather(page, { tag: "DRY", hour: 12, intensity: 1, autoAdvance: false, lockWeather: true });
  await prepareManualBattle(page, {
    attackerClass: "gunners",
    defenderClass: "rebels",
    attackerSize: "9",
    attackerStr: "100",
    defenderSize: "50",
    defenderStr: "30"
  });
  expect(await diceDisplay(page, "attacker")).toBe("10d6");

  await page.fill("#attackerSize", "10");
  await expect(page.locator("#attackerBreakdown")).toContainText("Gunners mixed dice");
  expect(await diceDisplay(page, "attacker")).toBe("9d6 + 1d10");

  await page.fill("#attackerSize", "19");
  expect(await diceDisplay(page, "attacker")).toBe("9d6 + 1d10");

  await page.fill("#attackerSize", "20");
  expect(await diceDisplay(page, "attacker")).toBe("8d6 + 2d10");
});

test("Vampire sunlight triggers persistent STR loss and visible reporting", async ({ page }) => {
  await page.click('.tab[data-tab="settings"]');
  await setSelectValue(page, "#showWarReportModal", "yes");
  await page.click("#saveWeatherSettings");
  await page.click('.tab[data-tab="battle"]');
  await setBattleWeather(page, { tag: "CLEAR", hour: 12, intensity: 1, autoAdvance: false, lockWeather: true });

  await prepareManualBattle(page, {
    attackerClass: "vampires",
    defenderClass: "swords",
    attackerSize: "50",
    attackerStr: "120",
    defenderSize: "50",
    defenderStr: "30"
  });
  await forceQueuedRolls(page, [6, 6, 6, 6, 6, 6, 6], [1, 1, 1, 1]);

  await page.click("#battleBtn");
  await page.click("#warReportBattleAgainBtn");

  await expect(page.locator("#attackerStr")).toHaveValue("70");
  await expect(page.locator("#attackerBreakdown")).toContainText("Sunlight exposure");
  await expect(page.locator("#resultSummary")).toContainText("Vampire sunlight aftershock");
  await expect(page.locator("#warReportOutcomeMeta")).toContainText("Vampire sunlight aftershock");
  await expect(page.locator("#warReportAttCol")).toContainText("Post-battle: Vampire sunlight aftershock");

  await page.click("#warReportClose");
  await page.click('.tab[data-tab="history"]');
  await page.evaluate(() => {
    document.querySelectorAll(".historyPage details").forEach((el) => {
      el.open = true;
    });
  });
  await expect(page.locator(".historyCard .historyDetails").first()).toContainText("Vampire sunlight aftershock");
});

test("Vampire sunlight only triggers in direct daytime sun", async ({ page }) => {
  await prepareManualBattle(page, {
    attackerClass: "vampires",
    defenderClass: "swords",
    attackerSize: "50",
    attackerStr: "120",
    defenderSize: "50",
    defenderStr: "30"
  });

  await setBattleWeather(page, { tag: "HEAT", hour: 12, intensity: 1, autoAdvance: false, lockWeather: true });
  await expect(page.locator("#attackerBreakdown")).toContainText("Sunlight exposure");

  await setBattleWeather(page, { tag: "CLOUDY", hour: 12, intensity: 1, autoAdvance: false, lockWeather: true });
  await expect(page.locator("#attackerBreakdown")).not.toContainText("Sunlight exposure");

  await setBattleWeather(page, { tag: "CLEAR", hour: 22, intensity: 1, autoAdvance: false, lockWeather: true });
  await expect(page.locator("#attackerBreakdown")).not.toContainText("Sunlight exposure");
  await expect(page.locator("#attackerBreakdown")).toContainText("Night bonus");
});

test("Snow Elves and Fire Cult bespoke matchup riders stack on top of existing matchup logic", async ({ page }) => {
  await setBattleWeather(page, { tag: "DRY", hour: 12, intensity: 1, autoAdvance: false, lockWeather: true });
  await prepareManualBattle(page, {
    attackerClass: "snow-elves",
    defenderClass: "forest-fey",
    attackerSize: "50",
    attackerStr: "30",
    defenderSize: "50",
    defenderStr: "30"
  });
  expect(parseDiceCount(await page.locator("#attackerPoolBadge").innerText())).toBe(6);
  expect(parseDiceCount(await page.locator("#defenderPoolBadge").innerText())).toBe(3);
  await expect(page.locator("#attackerBreakdown")).toContainText("Snow Elves winter rider vs");
  await expect(page.locator("#defenderBreakdown")).toContainText("Snow Elves winter rider against");

  await prepareManualBattle(page, {
    attackerClass: "snow-elves",
    defenderClass: "treants",
    attackerSize: "50",
    attackerStr: "30",
    defenderSize: "50",
    defenderStr: "30"
  });
  expect(parseDiceCount(await page.locator("#attackerPoolBadge").innerText())).toBe(6);
  expect(parseDiceCount(await page.locator("#defenderPoolBadge").innerText())).toBe(0);

  await prepareManualBattle(page, {
    attackerClass: "fire-cult",
    defenderClass: "snow-elves",
    attackerSize: "50",
    attackerStr: "30",
    defenderSize: "50",
    defenderStr: "30"
  });
  expect(parseDiceCount(await page.locator("#attackerPoolBadge").innerText())).toBe(6);
  expect(parseDiceCount(await page.locator("#defenderPoolBadge").innerText())).toBe(0);
  await expect(page.locator("#attackerBreakdown")).toContainText("Fire Cult heat rider vs");
  await expect(page.locator("#defenderBreakdown")).toContainText("Fire Cult heat rider against");
});

test("Hel’s Legion only doubles losses on its own wins and reports the amplification", async ({ page }) => {
  await page.click('.tab[data-tab="settings"]');
  await setSelectValue(page, "#resolutionMode", "quick");
  await setSelectValue(page, "#showWarReportModal", "yes");
  await page.click("#saveWeatherSettings");
  await page.click('.tab[data-tab="battle"]');

  await prepareManualBattle(page, {
    attackerClass: "hels-legion",
    defenderClass: "swords",
    attackerSize: "50",
    attackerStr: "50",
    defenderSize: "50",
    defenderStr: "50"
  });
  await forceQueuedRolls(page, [6, 6, 6, 6, 6], [1, 1, 1, 1, 1]);
  await page.click("#battleBtn");
  await page.click("#warReportBattleAgainBtn");
  await expect(page.locator("#warReportDefCol")).toContainText("20");
  await expect(page.locator("#warReportDefCol")).toContainText("30");
  await expect(page.locator("#warReportOutcomeMeta")).toContainText("Hel's Legion execution rule");
  await page.click("#warReportClose");

  await prepareManualBattle(page, {
    attackerClass: "swords",
    defenderClass: "hels-legion",
    attackerSize: "50",
    attackerStr: "50",
    defenderSize: "50",
    defenderStr: "50"
  });
  await forceQueuedRolls(page, [6, 6, 6, 6, 6], [1, 1, 1, 1, 1]);
  await page.click("#battleBtn");
  await page.click("#warReportBattleAgainBtn");
  await expect(page.locator("#warReportDefCol")).toContainText("10");
  await expect(page.locator("#warReportDefCol")).toContainText("40");
  await expect(page.locator("#warReportOutcomeMeta")).not.toContainText("Hel's Legion execution rule");
});

test("Undead victory growth only applies against eligible non-special classes and is reported", async ({ page }) => {
  await page.click('.tab[data-tab="settings"]');
  await setSelectValue(page, "#resolutionMode", "quick");
  await setSelectValue(page, "#showWarReportModal", "yes");
  await page.click("#saveWeatherSettings");
  await page.click('.tab[data-tab="battle"]');
  await setBattleWeather(page, { tag: "CLOUDY", hour: 22, intensity: 1, autoAdvance: false, lockWeather: true });

  await prepareManualBattle(page, {
    attackerClass: "undead",
    defenderClass: "swords",
    attackerSize: "50",
    attackerStr: "50",
    defenderSize: "50",
    defenderStr: "50"
  });
  await forceQueuedRolls(page, [6, 6, 6, 6, 6], [1, 1, 1, 1, 1]);
  await page.click("#battleBtn");
  await page.click("#warReportBattleAgainBtn");
  await expect(page.locator("#attackerSize")).toHaveValue("60");
  await expect(page.locator("#resultSummary")).toContainText("Undead victory growth");
  await expect(page.locator("#warReportOutcomeMeta")).toContainText("Undead victory growth");
  await expect(page.locator("#warReportAttCol")).toContainText("Undead victory growth");
  await page.click("#warReportClose");

  await page.click('.tab[data-tab="history"]');
  await page.evaluate(() => {
    document.querySelectorAll(".historyPage details").forEach((el) => {
      el.open = true;
    });
  });
  await expect(page.locator(".historyCard .historyDetails").first()).toContainText("Undead victory growth");

  await page.click('.tab[data-tab="battle"]');
  await prepareManualBattle(page, {
    attackerClass: "undead",
    defenderClass: "fiends",
    attackerSize: "100",
    attackerStr: "100",
    defenderSize: "50",
    defenderStr: "30"
  });
  await forceQueuedRolls(page, [6, 6, 6, 6, 6], [1, 1, 1, 1, 1]);
  await page.click("#battleBtn");
  await page.click("#warReportBattleAgainBtn");
  const undeadSizeAfterIneligible = Number(await page.locator("#attackerSize").inputValue());
  expect(undeadSizeAfterIneligible).toBeLessThanOrEqual(100);
  await expect(page.locator("#warReportOutcomeMeta")).not.toContainText("Undead victory growth");
});

test("Fiends conversion requires lost units, converts on d6=6, and reports the outcome", async ({ page }) => {
  await page.click('.tab[data-tab="settings"]');
  await setSelectValue(page, "#resolutionMode", "quick");
  await setSelectValue(page, "#showWarReportModal", "yes");
  await page.click("#saveWeatherSettings");
  await page.click('.tab[data-tab="battle"]');
  await setBattleWeather(page, { tag: "DRY", hour: 12, intensity: 1, autoAdvance: false, lockWeather: true });

  await prepareManualBattle(page, {
    attackerClass: "fiends",
    defenderClass: "swords",
    attackerSize: "50",
    attackerStr: "50",
    defenderSize: "50",
    defenderStr: "50"
  });
  await forceQueuedRolls(page, [6, 6, 6, 6, 6], [1, 1, 1, 1, 1]);
  await forceSpecialRuleRolls(page, { fiends_conversion: [6] });
  await page.click("#battleBtn");
  await page.click("#warReportBattleAgainBtn");
  await expect(page.locator("#warReportOutcomeMeta")).not.toContainText("Fiends conversion");
  await expect(page.locator("#attackerSize")).toHaveValue("50");
  await page.click("#warReportClose");

  await prepareManualBattle(page, {
    attackerClass: "fiends",
    defenderClass: "swords",
    attackerSize: "50",
    attackerStr: "50",
    defenderSize: "50",
    defenderStr: "50"
  });
  await forceQueuedRolls(page, [1, 1, 1, 1, 1], [6, 6, 6, 6, 6]);
  await forceSpecialRuleRolls(page, { fiends_conversion: [6] });
  await page.click("#battleBtn");
  await page.click("#warReportBattleAgainBtn");
  await expect(page.locator("#attackerSize")).toHaveValue("50");
  await expect(page.locator("#defenderSize")).toHaveValue("40");
  await expect(page.locator("#resultSummary")).toContainText("Fiends conversion roll");
  await expect(page.locator("#warReportOutcomeMeta")).toContainText("Fiends conversion roll");
  await expect(page.locator("#warReportAttCol")).toContainText("Fiends conversion roll");
});

test("Fiends conversion is blocked by enemy resistance or immunity to Fiends", async ({ page }) => {
  await page.click('.tab[data-tab="settings"]');
  await setSelectValue(page, "#resolutionMode", "quick");
  await setSelectValue(page, "#showWarReportModal", "yes");
  await page.click("#saveWeatherSettings");
  await page.click('.tab[data-tab="battle"]');

  await prepareManualBattle(page, {
    attackerClass: "fiends",
    defenderClass: "fire-cult",
    attackerSize: "50",
    attackerStr: "50",
    defenderSize: "50",
    defenderStr: "50"
  });
  await forceQueuedRolls(page, [1, 1, 1, 1, 1], [6, 6, 6, 6, 6]);
  await forceSpecialRuleRolls(page, { fiends_conversion: [6] });
  await page.click("#battleBtn");
  await page.click("#warReportBattleAgainBtn");
  await expect(page.locator("#attackerSize")).toHaveValue("40");
  await expect(page.locator("#defenderSize")).toHaveValue("50");
  await expect(page.locator("#warReportOutcomeMeta")).toContainText("Fiends conversion blocked");
  await expect(page.locator("#warReportAttCol")).toContainText("Fiends conversion blocked");
});

test("War Report and history now surface matchup-driven class effects alongside result output", async ({ page }) => {
  await page.click('.tab[data-tab="settings"]');
  await setSelectValue(page, "#resolutionMode", "quick");
  await setSelectValue(page, "#showWarReportModal", "yes");
  await page.click("#saveWeatherSettings");
  await page.click('.tab[data-tab="battle"]');

  await prepareManualBattle(page, {
    attackerClass: "cavalry",
    defenderClass: "pikes",
    attackerSize: "50",
    attackerStr: "30",
    defenderSize: "50",
    defenderStr: "30"
  });
  await forceQueuedRolls(page, [6, 6, 6], [1, 1, 1]);
  await page.click("#battleBtn");
  await page.click("#warReportBattleAgainBtn");

  await expect(page.locator("#resultSummary")).toContainText("Vulnerability vs Pikes");
  await expect(page.locator("#warReportAttCol")).toContainText("Vulnerability vs Pikes");
  await page.click("#warReportClose");

  await page.click('.tab[data-tab="history"]');
  await page.evaluate(() => {
    document.querySelectorAll(".historyPage details").forEach((el) => {
      el.open = true;
    });
  });
  await expect(page.locator(".historyCard .historyDetails").first()).toContainText("Vulnerability vs Pikes");
});

test("Shield-Brethren city bulwark, nearby aura, and represented surprise immunity are applied", async ({ page }) => {
  await setBattleWeather(page, { tag: "DRY", hour: 12, intensity: 1, autoAdvance: false, lockWeather: true });
  await prepareManualBattle(page, {
    attackerClass: "bandits",
    defenderClass: "shield-brethren",
    attackerSize: "50",
    attackerStr: "30",
    defenderSize: "50",
    defenderStr: "30"
  });
  const attackerBaseline = parseDiceCount(await page.locator("#attackerPoolBadge").innerText());
  await setCheckboxValue(page, "#attCtxSelfHiddenOrSurprising", true);
  await setCheckboxValue(page, "#defCtxCityFortChoke", true);
  const attackerAfter = parseDiceCount(await page.locator("#attackerPoolBadge").innerText());
  expect(attackerAfter).toBe(attackerBaseline - 2);
  await expect(page.locator("#attackerBreakdown")).toContainText("Bandits hidden attack ignored");
  await expect(page.locator("#attackerBreakdown")).toContainText("Shield-Brethren bulwark at city/fort/choke");

  await seedSavedArmies(page, [
    { id: "shield-nearby", name: "Bulwark Reserve", classId: "shield-brethren", size: 50, str: 50, doctrines: [] },
    { id: "treant-nearby", name: "Forest Ambushers", classId: "treants", size: 50, str: 50, doctrines: [] }
  ]);
  await prepareManualBattle(page, {
    attackerClass: "swords",
    defenderClass: "shield-brethren",
    attackerSize: "50",
    attackerStr: "30",
    defenderSize: "50",
    defenderStr: "30"
  });
  const defenderBaseline = parseDiceCount(await page.locator("#defenderPoolBadge").innerText());
  await page.evaluate(() => {
    state.defender.assistNearby = [
      sanitizeNearbyEntry({
        id: "nearby-shield-aura",
        armyId: "shield-nearby",
        range: "one_space",
        actionId: "shield_aura",
        hidden: false,
        notes: "",
        choice: {}
      })
    ];
    state.defender.hinderNearby = [
      sanitizeNearbyEntry({
        id: "nearby-treant-hinder",
        armyId: "treant-nearby",
        range: "one_space",
        actionId: "treant_hidden_surprise",
        hidden: true,
        notes: "",
        choice: {}
      })
    ];
    state.defender.assistContext = normalizeAssistContext({
      ...state.defender.assistContext,
      forestEnvironment: true
    });
    persistAssistDraft();
    render();
  });
  const defenderAfter = parseDiceCount(await page.locator("#defenderPoolBadge").innerText());
  expect(defenderAfter).toBe(defenderBaseline + 1);
  await expect(page.locator("#defenderBreakdown")).toContainText("Shield-Brethren aura");
  await expect(page.locator("#defenderBreakdown")).toContainText("ignores surprise-positioning bonuses");
});

test("Fire Cult normalizes disallowed battle weather into the dry-fire lane and reports it", async ({ page }) => {
  await page.click('.tab[data-tab="settings"]');
  await setSelectValue(page, "#resolutionMode", "quick");
  await setSelectValue(page, "#showWarReportModal", "yes");
  await page.click("#saveWeatherSettings");
  await page.click('.tab[data-tab="battle"]');
  await setBattleWeather(page, { tag: "SNOW", hour: 12, intensity: 2, autoAdvance: false, lockWeather: true });

  await prepareManualBattle(page, {
    attackerClass: "fire-cult",
    defenderClass: "swords",
    attackerSize: "50",
    attackerStr: "30",
    defenderSize: "50",
    defenderStr: "30"
  });
  await forceQueuedRolls(page, [6, 6, 6, 6], [1, 1, 1, 1]);
  await page.click("#battleBtn");
  await page.click("#warReportBattleAgainBtn");

  await expect.poll(() => currentWeatherTag(page)).toBe("HEAT");
  await expect(page.locator("#attackerBreakdown")).toContainText("Fire domain");
  await expect(page.locator("#resultSummary")).toContainText("Fire Cult weather lock: battle weather normalized");
  await expect(page.locator("#warReportOutcomeMeta")).toContainText("Fire Cult weather lock: battle weather normalized");
  await page.click("#warReportClose");

  await page.click('.tab[data-tab="history"]');
  await page.evaluate(() => {
    document.querySelectorAll(".historyPage details").forEach((el) => {
      el.open = true;
    });
  });
  await expect(page.locator(".historyCard .historyDetails").first()).toContainText("Fire Cult weather lock: battle weather normalized");
});

test("Fire Cult clamps post-battle weather drift while non-Fire-Cult battles keep the original weather flow", async ({ page }) => {
  await page.click('.tab[data-tab="settings"]');
  await setSelectValue(page, "#resolutionMode", "quick");
  await setSelectValue(page, "#showWarReportModal", "yes");
  await page.click("#saveWeatherSettings");
  await page.click('.tab[data-tab="battle"]');

  await forceAdvanceWeatherSequence(page, [
    {
      weather: { tag: "PHENOMENA", phenomena: "ASHFALL", intensity: 2, phenomenaLockRemaining: 2, source: "battle-step" },
      meta: { phenomenaTriggered: true }
    },
    {
      weather: { tag: "PHENOMENA", phenomena: "ASHFALL", intensity: 2, phenomenaLockRemaining: 2, source: "battle-step" },
      meta: { phenomenaTriggered: true }
    }
  ]);

  await setBattleWeather(page, { tag: "DRY", hour: 12, intensity: 1, autoAdvance: true, lockWeather: false });
  await prepareManualBattle(page, {
    attackerClass: "fire-cult",
    defenderClass: "swords",
    attackerSize: "50",
    attackerStr: "30",
    defenderSize: "50",
    defenderStr: "30"
  });
  await forceQueuedRolls(page, [6, 6, 6, 6], [1, 1, 1, 1]);
  await page.click("#battleBtn");
  await page.click("#warReportBattleAgainBtn");
  await expect.poll(() => currentWeatherTag(page)).toBe("HEAT");
  await expect(page.locator("#resultSummary")).toContainText("Fire Cult weather lock: post-battle drift clamped");
  await expect(page.locator("#warReportOutcomeMeta")).toContainText("Fire Cult weather lock: post-battle drift clamped");
  await page.click("#warReportClose");

  await setBattleWeather(page, { tag: "DRY", hour: 12, intensity: 1, autoAdvance: true, lockWeather: false });
  await prepareManualBattle(page, {
    attackerClass: "swords",
    defenderClass: "rebels",
    attackerSize: "50",
    attackerStr: "30",
    defenderSize: "50",
    defenderStr: "30"
  });
  await forceQueuedRolls(page, [6, 6, 6, 6], [1, 1, 1, 1]);
  await page.click("#battleBtn");
  await page.click("#warReportBattleAgainBtn");
  await expect.poll(() => currentWeatherTag(page)).toBe("PHENOMENA");
  await expect(page.locator("#warReportWeatherAfter")).toContainText("Ashfall");
  await expect(page.locator("#warReportOutcomeMeta")).not.toContainText("Fire Cult weather lock");
});

test("Fire Cult auto-advance stays within CLEAR, DRY, and HEAT across repeated rounds", async ({ page }) => {
  await page.click('.tab[data-tab="settings"]');
  await setSelectValue(page, "#resolutionMode", "quick");
  await setSelectValue(page, "#showWarReportModal", "no");
  await page.click("#saveWeatherSettings");
  await page.click('.tab[data-tab="battle"]');
  await forceAdvanceWeatherSequence(page, [
    { weather: { tag: "WIND", intensity: 1, source: "battle-step" } },
    { weather: { tag: "PHENOMENA", phenomena: "ASHFALL", intensity: 2, phenomenaLockRemaining: 2, source: "battle-step" }, meta: { phenomenaTriggered: true } },
    { weather: { tag: "CLEAR", intensity: 1, source: "battle-step" } }
  ]);
  await setBattleWeather(page, { tag: "DRY", hour: 12, intensity: 1, autoAdvance: true, lockWeather: false });
  await prepareManualBattle(page, {
    attackerClass: "fire-cult",
    defenderClass: "swords",
    attackerSize: "50",
    attackerStr: "30",
    defenderSize: "50",
    defenderStr: "30"
  });
  await forceFixedRolls(page, 4);

  await expect(page.locator("#battleBtn")).toBeEnabled();
  await page.click("#battleBtn");
  await expect.poll(() => currentWeatherTag(page)).toBe("HEAT");
  await page.click("#battleBtn");
  await expect.poll(() => currentWeatherTag(page)).toBe("HEAT");
  await page.click("#battleBtn");
  await expect.poll(() => currentWeatherTag(page)).toBe("CLEAR");
});

test("Nearby archers and mages keep current parity, including Cavalry exception and nearby Anti-Magic suppression", async ({ page }) => {
  await seedSavedArmies(page, [
    { id: "archer-cover", name: "Cover Bows", classId: "archers", size: 50, str: 30, doctrines: [] },
    { id: "archer-pressure", name: "Pressure Bows", classId: "archers", size: 50, str: 30, doctrines: [] },
    { id: "mage-ward", name: "Ward Circle", classId: "mages", size: 50, str: 30, doctrines: [] },
    { id: "anti-magic", name: "Null Guard", classId: "swords", size: 50, str: 30, doctrines: [{ doctrineId: "anti_magic" }] }
  ]);
  await page.click('.tab[data-tab="settings"]');
  await setSelectValue(page, "#resolutionMode", "quick");
  await setSelectValue(page, "#showWarReportModal", "yes");
  await page.click("#saveWeatherSettings");
  await page.click('.tab[data-tab="battle"]');
  await prepareManualBattle(page, {
    attackerClass: "cavalry",
    defenderClass: "swords",
    attackerSize: "50",
    attackerStr: "30",
    defenderSize: "50",
    defenderStr: "30"
  });

  const attackerBaseline = parseDiceCount(await page.locator("#attackerPoolBadge").innerText());
  const defenderBaseline = parseDiceCount(await page.locator("#defenderPoolBadge").innerText());
  await setNearbyState(page, "attacker", {
    hinderNearby: [
      { id: "nearby-archer-pressure", armyId: "archer-pressure", range: "two_spaces", actionId: "archer_volley", hidden: false, notes: "", choice: {} }
    ]
  });
  await setNearbyState(page, "defender", {
    assistNearby: [
      { id: "nearby-archer-cover", armyId: "archer-cover", range: "two_spaces", actionId: "archer_cover", hidden: false, notes: "", choice: {} },
      { id: "nearby-mage-ward", armyId: "mage-ward", range: "one_space", actionId: "mage_ward_screen", hidden: false, notes: "", choice: {} }
    ],
    hinderNearby: [
      { id: "nearby-anti-magic", armyId: "anti-magic", range: "one_space", actionId: "", hidden: false, notes: "", choice: {} }
    ]
  });

  expect(parseDiceCount(await page.locator("#attackerPoolBadge").innerText())).toBe(attackerBaseline - 1);
  expect(parseDiceCount(await page.locator("#defenderPoolBadge").innerText())).toBe(defenderBaseline + 2);
  await expect(page.locator("#attackerBreakdown")).toContainText("Archers pressure");
  await expect(page.locator("#attackerBreakdown")).toContainText("Cavalry exception");
  await expect(page.locator("#defenderBreakdown")).toContainText("Archers defensive cover");
  await expect(page.locator("#defenderBreakdown")).toContainText("suppressed by nearby Anti-Magic");

  await forceQueuedRolls(page, [6, 6, 6], [1, 1, 1, 1, 1, 1]);
  await page.click("#battleBtn");
  await page.click("#warReportBattleAgainBtn");
  await expect(page.locator("#warReportAttCol")).toContainText("Archers pressure");
  await expect(page.locator("#warReportDefCol")).toContainText("Archers cover");
  await expect(page.locator("#warReportDefCol")).toContainText("suppressed by nearby Anti-Magic");
});

test("Mage arcane volley keeps the Spy exception while nearby reporting remains intact", async ({ page }) => {
  await seedSavedArmies(page, [
    { id: "mage-volley", name: "Volley Circle", classId: "mages", size: 50, str: 30, doctrines: [] }
  ]);
  await prepareManualBattle(page, {
    attackerClass: "spies",
    defenderClass: "swords",
    attackerSize: "50",
    attackerStr: "30",
    defenderSize: "50",
    defenderStr: "30"
  });
  const attackerBaseline = parseDiceCount(await page.locator("#attackerPoolBadge").innerText());
  await setNearbyState(page, "attacker", {
    hinderNearby: [
      { id: "nearby-mage-volley", armyId: "mage-volley", range: "one_space", actionId: "mage_arcane_volley", hidden: false, notes: "", choice: {} }
    ]
  });
  expect(parseDiceCount(await page.locator("#attackerPoolBadge").innerText())).toBe(attackerBaseline - 1);
  await expect(page.locator("#attackerBreakdown")).toContainText("Arcane Volley");
  await expect(page.locator("#attackerBreakdown")).toContainText("Spy/Assassin exception");
});

test("Nearby roll-operation support keeps current remove-lowest and remove-highest behavior", async ({ page }) => {
  await seedSavedArmies(page, [
    { id: "spy-source", name: "Field Spies", classId: "spies", size: 50, str: 30, doctrines: [] },
    { id: "mel-source", name: "Mel Agents", classId: "mels-army", size: 50, str: 30, doctrines: [] },
    { id: "assassin-source", name: "Knife Cell", classId: "assassins", size: 50, str: 30, doctrines: [] }
  ]);
  await page.click('.tab[data-tab="settings"]');
  await setSelectValue(page, "#resolutionMode", "quick");
  await setSelectValue(page, "#showWarReportModal", "no");
  await page.click("#saveWeatherSettings");
  await page.click('.tab[data-tab="battle"]');
  await prepareManualBattle(page, {
    attackerClass: "swords",
    defenderClass: "swords",
    attackerSize: "50",
    attackerStr: "30",
    defenderSize: "50",
    defenderStr: "30"
  });
  await setNearbyState(page, "attacker", {
    assistNearby: [
      { id: "nearby-spy", armyId: "spy-source", range: "adjacent", actionId: "spy_remove_lowest", hidden: false, notes: "", choice: {} },
      { id: "nearby-mel", armyId: "mel-source", range: "adjacent", actionId: "mel_spy_benefit", hidden: false, notes: "", choice: {} }
    ],
    hinderNearby: [
      { id: "nearby-assassin", armyId: "assassin-source", range: "adjacent", actionId: "assassin_remove_highest", hidden: true, notes: "", choice: {} }
    ]
  });

  await forceQueuedRolls(page, [1, 2, 6, 6], [6, 6, 1, 1]);
  await page.click("#battleBtn");
  const rollOps = await page.evaluate(() => state.lastResult.rollOps || []);
  expect(rollOps.filter((line) => line.includes("Attacker removed lowest die")).length).toBe(2);
  expect(rollOps.some((line) => line.includes("Attacker removed highest die"))).toBe(true);
  const attackerRolls = await page.evaluate(() => state.lastResult.attRoll.rolls.map((entry) => entry.roll));
  expect(attackerRolls).toEqual([2, 6]);
});

test("Builder nearby actions keep repair math and queued siege-prep runtime behavior", async ({ page }) => {
  await seedSavedArmies(page, [
    { id: "builder-prep", name: "Prep Crew", classId: "builders", size: 50, str: 30, doctrines: [] },
    { id: "builder-repair", name: "Repair Crew", classId: "builders", size: 50, str: 30, doctrines: [] }
  ]);
  await page.click('.tab[data-tab="settings"]');
  await setSelectValue(page, "#resolutionMode", "quick");
  await setSelectValue(page, "#showWarReportModal", "yes");
  await page.click("#saveWeatherSettings");
  await page.click('.tab[data-tab="battle"]');
  await prepareManualBattle(page, {
    attackerClass: "siege",
    defenderClass: "swords",
    attackerSize: "50",
    attackerStr: "30",
    defenderSize: "50",
    defenderStr: "30"
  });
  const attackerBaseline = parseDiceCount(await page.locator("#attackerPoolBadge").innerText());
  await setNearbyState(page, "attacker", {
    assistNearby: [
      { id: "nearby-builder-prep", armyId: "builder-prep", range: "same_location", actionId: "builder_siege_prep", hidden: false, notes: "", choice: {} },
      { id: "nearby-builder-repair", armyId: "builder-repair", range: "same_location", actionId: "builder_repair", hidden: false, notes: "", choice: {} }
    ]
  });
  expect(parseDiceCount(await page.locator("#attackerPoolBadge").innerText())).toBe(attackerBaseline + 1);
  await expect(page.locator("#attackerBreakdown")).toContainText("Repair & Reinforce");
  await forceFixedRolls(page, 4);
  await page.click("#battleBtn");
  await page.click("#warReportBattleAgainBtn");
  await expect(page.locator("#warReportAttCol")).toContainText("Siege Prep queued");
  await page.click("#warReportClose");
  expect(await page.evaluate(() => !!state.attacker.assistRuntime.queuedSiegePrep)).toBe(true);

  await setNearbyState(page, "attacker", { assistNearby: [] });
  await forceFixedRolls(page, 4);
  await page.click("#battleBtn");
  await page.click("#warReportBattleAgainBtn");
  await expect(page.locator("#warReportAttCol")).toContainText("Queued Siege Prep +1");
  expect(await page.evaluate(() => !!state.attacker.assistRuntime.queuedSiegePrep)).toBe(false);
});

test("Thieves and Mel nearby STR-transfer effects keep current battle-time math and reporting", async ({ page }) => {
  await seedSavedArmies(page, [
    { id: "thief-source", name: "Thief Cell", classId: "thieves", size: 50, str: 30, doctrines: [] },
    { id: "mel-source-hinder", name: "Mel Raiders", classId: "mels-army", size: 50, str: 30, doctrines: [] }
  ]);
  await page.click('.tab[data-tab="settings"]');
  await setSelectValue(page, "#resolutionMode", "quick");
  await setSelectValue(page, "#showWarReportModal", "yes");
  await page.click("#saveWeatherSettings");
  await page.click('.tab[data-tab="battle"]');
  await prepareManualBattle(page, {
    attackerClass: "swords",
    defenderClass: "swords",
    attackerSize: "50",
    attackerStr: "50",
    defenderSize: "50",
    defenderStr: "50"
  });
  await setNearbyState(page, "attacker", {
    hinderNearby: [
      { id: "nearby-thief", armyId: "thief-source", range: "one_space", actionId: "thieves_steal_str", hidden: false, notes: "", choice: {} },
      { id: "nearby-mel-hinder", armyId: "mel-source-hinder", range: "one_space", actionId: "mel_steal_str", hidden: true, notes: "", choice: {} }
    ]
  });
  await forceRollDie(page, 4);
  await forceQueuedRolls(page, [6, 6, 6, 6], [1, 1, 1, 1]);
  await page.click("#battleBtn");
  await page.click("#warReportBattleAgainBtn");
  await expect(page.locator("#warReportAttCol")).toContainText("Thieves steal -4 STR");
  await expect(page.locator("#warReportAttCol")).toContainText("Mel steal -8 STR");
  await expect(page.locator("#warReportDefCol")).toContainText("Transfer +4 STR");
  await expect(page.locator("#warReportDefCol")).toContainText("Transfer +8 STR");
});

test("Forest Fey restore and Treant hidden surprise keep current nearby parity", async ({ page }) => {
  await seedSavedArmies(page, [
    { id: "forest-restore-source", name: "Restoration Grove", classId: "forest-fey", size: 50, str: 30, doctrines: [] },
    { id: "treant-source", name: "Hidden Treants", classId: "treants", size: 50, str: 30, doctrines: [] }
  ]);
  await prepareManualBattle(page, {
    attackerClass: "swords",
    defenderClass: "swords",
    attackerSize: "50",
    attackerStr: "30",
    defenderSize: "40",
    defenderStr: "30"
  });
  const defenderBaseline = parseDiceCount(await page.locator("#defenderPoolBadge").innerText());
  await setNearbyState(page, "defender", {
    assistNearby: [
      { id: "nearby-forest-restore", armyId: "forest-restore-source", range: "one_space", actionId: "forest_restore", hidden: false, notes: "", choice: {} }
    ],
    hinderNearby: [
      { id: "nearby-treant-hidden", armyId: "treant-source", range: "one_space", actionId: "treant_hidden_surprise", hidden: true, notes: "", choice: {} }
    ],
    assistContext: {
      forestEnvironment: true
    }
  });
  expect(parseDiceCount(await page.locator("#defenderPoolBadge").innerText())).toBe(defenderBaseline - 2);
  await expect(page.locator("#defenderBreakdown")).toContainText("Forest Fey restore");
  await expect(page.locator("#defenderBreakdown")).toContainText("Treant hidden surprise");
});

test("Battlefield Weavers and Ward-Smiths nearby actions respect doctrine gating and keep current math", async ({ page }) => {
  await seedSavedArmies(page, [
    { id: "weaver-no-doctrine", name: "Unlicensed Weaver", classId: "mages", size: 50, str: 30, doctrines: [] },
    { id: "weaver-doctrine", name: "Licensed Weaver", classId: "mages", size: 50, str: 30, doctrines: [{ doctrineId: "battlefield_weavers" }] },
    { id: "ward-doctrine", name: "Ward Smith", classId: "mages", size: 50, str: 30, doctrines: [{ doctrineId: "ward_smiths" }] }
  ]);
  await setBattleWeather(page, { tag: "SNOW", hour: 12, intensity: 1, autoAdvance: false, lockWeather: true });
  await prepareManualBattle(page, {
    attackerClass: "fire-cult",
    defenderClass: "swords",
    attackerSize: "50",
    attackerStr: "30",
    defenderSize: "50",
    defenderStr: "30"
  });
  const attackerBaseline = parseDiceCount(await page.locator("#attackerPoolBadge").innerText());
  await setNearbyState(page, "attacker", {
    assistNearby: [
      { id: "nearby-weaver-none", armyId: "weaver-no-doctrine", range: "one_space", actionId: "battlefield_weavers_zone", hidden: false, notes: "", choice: { weatherTag: "CLEAR" } },
      { id: "nearby-ward", armyId: "ward-doctrine", range: "one_space", actionId: "ward_smiths_guard", hidden: false, notes: "", choice: {} }
    ]
  });
  expect(parseDiceCount(await page.locator("#attackerPoolBadge").innerText())).toBe(attackerBaseline);

  const doctrineSetup = await page.evaluate(() => {
    const selfCls = INDEX.byId.get(state.attacker.classId);
    const currentWeather = normalizeWeatherV2(state.weather || DEFAULT_WEATHER);
    const candidateWeatherTag = Object.keys(WEATHER_META).find((tag) => {
      if (tag === currentWeather.tag) return false;
      const shiftedWeather = normalizeWeatherV2(Object.assign({}, currentWeather, { tag }));
      return weatherPreferredMod(selfCls, shiftedWeather).dice !== weatherPreferredMod(selfCls, currentWeather).dice;
    }) || "CLEAR";
    const deadlyDoctrineId = Array.from(parseDeadlyDoctrineIds(selfCls?.raw?.deadlyDoctrines || ""))[0] || "anti_magic";
    state.defender.doctrines = normalizeDoctrineList([{ doctrineId: deadlyDoctrineId }]);
    render();
    return { candidateWeatherTag, deadlyDoctrineId };
  });
  await setNearbyState(page, "attacker", {
    assistNearby: [
      { id: "nearby-weaver-yes", armyId: "weaver-doctrine", range: "one_space", actionId: "battlefield_weavers_zone", hidden: false, notes: "", choice: { weatherTag: doctrineSetup.candidateWeatherTag } },
      { id: "nearby-ward", armyId: "ward-doctrine", range: "one_space", actionId: "ward_smiths_guard", hidden: false, notes: "", choice: {} }
    ]
  });
  const expectedNearbyDelta = await page.evaluate((candidateWeatherTag) => {
    const selfCls = INDEX.byId.get(state.attacker.classId);
    const currentWeather = normalizeWeatherV2(state.weather || DEFAULT_WEATHER);
    const shiftedWeather = normalizeWeatherV2(Object.assign({}, currentWeather, { tag: candidateWeatherTag }));
    const weaverDelta = weatherPreferredMod(selfCls, shiftedWeather).dice - weatherPreferredMod(selfCls, currentWeather).dice;
    const wardDelta = 3 * deadlyDoctrineMatchCountForSide(state, "attacker");
    return { weaverDelta, wardDelta };
  }, doctrineSetup.candidateWeatherTag);
  expect(parseDiceCount(await page.locator("#attackerPoolBadge").innerText())).toBeGreaterThan(attackerBaseline);
  if (expectedNearbyDelta.weaverDelta !== 0) {
    await expect(page.locator("#attackerBreakdown")).toContainText("Battlefield Weavers zone shift");
  }
  await expect(page.locator("#attackerBreakdown")).toContainText("Ward-Smiths guard");
});

test("Blank and untouched creating sides load saved armies without false dirty prompts", async ({ page }) => {
  await seedSavedArmies(page, [
    { id: "army-cavalry", name: "Red Lancers", classId: "cavalry", size: 150, str: 120, doctrines: [] },
    { id: "army-pikes", name: "Wall of Spears", classId: "pikes", size: 100, str: 80, doctrines: [] }
  ]);

  await page.selectOption("#attLoaderSelect", "army-cavalry");
  await page.click("#attLoadBtn");
  await expect(page.getByTestId("dirty-guard-modal")).not.toHaveAttribute("open", "");
  await expect(page.locator("#attackerArmyNameDraft")).toHaveValue("Red Lancers");
  await expect(page.locator("#attackerClass")).toHaveValue("cavalry");

  await page.click("#defCreateArmyBtn");
  await page.click('.tab[data-tab="armies"]');
  await page.locator('.armyRow button', { hasText: "→ Def" }).first().click();
  await expect(page.getByTestId("dirty-guard-modal")).not.toHaveAttribute("open", "");
  await expect(page.locator("#defenderArmyNameDraft")).toHaveValue("Red Lancers");
  await expect(page.locator("#defenderClass")).toHaveValue("cavalry");
});

test("Loading a saved army clears side runtime tactical state", async ({ page }) => {
  await seedSavedArmies(page, [
    { id: "army-one", name: "First Host", classId: "cavalry", size: 150, str: 120, doctrines: [] },
    { id: "army-two", name: "Second Host", classId: "pikes", size: 100, str: 80, doctrines: [] }
  ]);

  await page.click('.tab[data-tab="armies"]');
  await page.locator('.armyRow button', { hasText: "→ Att" }).first().click();
  await page.evaluate(() => {
    state.attacker.manualDiceDelta = 1;
    state.attacker.assistContext = normalizeAssistContext({
      ...state.attacker.assistContext,
      homeTerritory: true
    });
    const commitEl = document.querySelector("#attackerCommit");
    commitEl.value = "3";
    render();
  });

  await page.click('.tab[data-tab="armies"]');
  await page.locator('.armyRow button', { hasText: "→ Att" }).nth(1).click();

  await expect(page.getByTestId("dirty-guard-modal")).not.toHaveAttribute("open", "");
  await expect(page.locator("#attackerArmyNameDraft")).toHaveValue("Second Host");
  await expect(page.locator("#attackerManualDelta")).toHaveText("0");
  await expect(page.locator("#attackerCommit")).toHaveValue("");
  await expect(page.locator("#attCtxHomeTerritory")).not.toBeChecked();
});

test("Auto-battle survives PHENOMENA weather and Stop force-finalizes a stale running session", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (err) => pageErrors.push(err.message));

  await prepareManualBattle(page, {
    attackerClass: "forest-fey",
    defenderClass: "archers",
    attackerSize: "150",
    attackerStr: "120",
    defenderSize: "150",
    defenderStr: "50"
  });
  await setPhenomenaWeather(page, "ASHFALL", 2);
  await page.click("#battleBtn");
  await page.click("#warReportAutoResolveBtn");

  await expect.poll(() => page.evaluate(() => _warReportAutoRunning), { timeout: 5000 }).toBe(false);
  expect(pageErrors).toEqual([]);

  await page.evaluate(() => {
    _warReportAutoRunning = true;
    _warReportAutoLoopActive = false;
    _warReportAutoStopRequested = false;
    _warReportAutoSession = createWarReportAutoSession(null);
    openWarReportModal({ mode: "auto-running", session: _warReportAutoSession, payload: null });
    setWarReportActionState({ result: { newAtt: 1, newDef: 1 }, stopReason: null }, "auto-running");
    setWarReportAutoStatus("Stopping auto-battle...", "warn");
  });

  await page.click("#warReportClosePrimary");
  await expect.poll(() => page.evaluate(() => _warReportAutoRunning)).toBe(false);
  await expect(page.locator("#warReportAutoStatus")).toContainText("Stopped manually");
  await expect(page.locator("#warReportClosePrimary")).toHaveText("Close");
});

test("History sessions and turns use native collapse state and expand independently", async ({ page }) => {
  const sessionId = "session-alpha";
  const sessionStartedAt = "2026-03-07T12:00:00.000Z";
  await seedHistory(page, [
    buildHistoryRecord({
      ts: "2026-03-07T12:15:00.000Z",
      sessionId,
      sessionLabel: "Battle Session — Mar 7, 2026",
      sessionStartedAt,
      turnNumber: 2,
      battleIndexInTurn: 1
    }),
    buildHistoryRecord({
      ts: "2026-03-07T12:05:00.000Z",
      sessionId,
      sessionLabel: "Battle Session — Mar 7, 2026",
      sessionStartedAt,
      turnNumber: 1,
      battleIndexInTurn: 1
    })
  ], {
    sessionId,
    sessionStartedAt,
    sessionLabel: "Battle Session — Mar 7, 2026",
    turnNumber: 2
  });

  await page.click('.tab[data-tab="history"]');
  const sessionDetails = page.locator(".historySessionGroup").first();
  const sessionSummary = sessionDetails.locator("summary").first();
  await expect(sessionDetails).not.toHaveAttribute("open", "");
  await expect(sessionDetails.locator(".historyTurnGroup").first()).toBeHidden();

  await sessionSummary.click();
  await expect(sessionDetails).toHaveAttribute("open", "");
  await expect(page.locator(".historyTurnToggle").first()).toBeVisible();
  await expect(page.locator(".historyTurnGroup").first()).not.toHaveAttribute("open", "");
  await expect(page.locator(".historyCard").first()).toBeHidden();

  const firstTurnDetails = page.locator(".historyTurnGroup").first();
  const firstTurnSummary = firstTurnDetails.locator("summary").first();
  await firstTurnSummary.click();
  await expect(firstTurnDetails).toHaveAttribute("open", "");
  await expect(firstTurnDetails.locator(".historyCard")).toHaveCount(1);

  const secondTurnDetails = page.locator(".historyTurnGroup").nth(1);
  await expect(secondTurnDetails).not.toHaveAttribute("open", "");

  await firstTurnSummary.click();
  await expect(firstTurnDetails).not.toHaveAttribute("open", "");
  await expect(firstTurnDetails.locator(".historyCard").first()).toBeHidden();
});

test("History uses page layout instead of the shared 420px inner scroller", async ({ page }) => {
  const records = [];
  for (let i = 0; i < 18; i += 1) {
    records.push(buildHistoryRecord({
      ts: `2026-03-07T12:${String(i).padStart(2, "0")}:00.000Z`,
      sessionId: `session-${Math.floor(i / 3)}`,
      sessionLabel: `Battle Session — ${Math.floor(i / 3) + 1}`,
      sessionStartedAt: `2026-03-07T0${Math.floor(i / 3)}:00:00.000Z`,
      turnNumber: (i % 3) + 1,
      battleIndexInTurn: 1,
      attackerName: `Attacker ${i + 1}`,
      defenderName: `Defender ${i + 1}`
    }));
  }
  await seedHistory(page, records, {
    sessionId: "session-5",
    sessionStartedAt: "2026-03-07T05:00:00.000Z",
    sessionLabel: "Battle Session — 6",
    turnNumber: 3
  });

  await page.click('.tab[data-tab="history"]');
  await page.evaluate(() => {
    document.querySelectorAll("#historyList details").forEach((node) => {
      node.open = true;
    });
  });
  const layout = await page.evaluate(() => {
    const historyList = document.querySelector("#historyList");
    const footer = document.querySelector("footer");
    const style = window.getComputedStyle(historyList);
    return {
      maxHeight: style.maxHeight,
      overflowY: style.overflowY,
      footerBelowViewport: footer.getBoundingClientRect().top > window.innerHeight
    };
  });

  expect(layout.maxHeight).not.toBe("420px");
  expect(layout.overflowY).not.toBe("auto");
  expect(layout.footerBelowViewport).toBe(true);
});

// ─── New regression tests added 2026-03-06 (audit-battle-flow) ─────────────

test("Battle side setup: chooser→creating→chooser DOM transitions show/hide correct wrappers", async ({ page }) => {
  // Initial state: chooser visible, setup hidden
  await expect(page.locator("#attChooserWrap")).toBeVisible();
  await expect(page.locator("#attSetupWrap")).not.toBeVisible();

  // Chooser: "or" divider is visible
  await expect(page.locator("#attChooserWrap .chooserOr")).toBeVisible();

  // Click "Create new army" → setup visible, chooser hidden
  await page.click("#attCreateArmyBtn");
  await expect(page.locator("#attChooserWrap")).not.toBeVisible();
  await expect(page.locator("#attSetupWrap")).toBeVisible();

  // In creating mode: change button says "Cancel setup"
  await expect(page.locator("#attSetupChangeBtn")).toContainText("Cancel setup");

  // Click "Cancel setup" → back to chooser
  await page.click("#attSetupChangeBtn");
  await expect(page.locator("#attChooserWrap")).toBeVisible();
  await expect(page.locator("#attSetupWrap")).not.toBeVisible();
});

test("Battle side setup: loading saved army transitions chooser→loaded and shows 'Set up another army'", async ({ page }) => {
  await seedSavedArmies(page, [
    { id: "army-alpha", name: "Alpha Legion", classId: "cavalry", size: 100, str: 80, doctrines: [] }
  ]);

  // Load the army via the chooser loader
  await page.selectOption("#attLoaderSelect", "army-alpha");
  await page.click("#attLoadBtn");

  // Setup wrap should now be visible
  await expect(page.locator("#attChooserWrap")).not.toBeVisible();
  await expect(page.locator("#attSetupWrap")).toBeVisible();

  // In loaded mode: change button says "Set up another army"
  await expect(page.locator("#attSetupChangeBtn")).toContainText("Set up another army");

  // Name draft should reflect loaded army name
  await expect(page.locator("#attackerArmyNameDraft")).toHaveValue("Alpha Legion");
});

test("War Report primary button shows 'Run Battle Again' after a result, 'Start Battle Roll' after class change", async ({ page }) => {
  await prepareManualBattle(page);

  // Before any battle: label is "Start Battle Roll"
  await expect(page.locator("#warReportBattleAgainBtn")).toHaveText("Start Battle Roll");

  // Open staging and run the battle
  await page.click("#battleBtn");
  await expect(page.locator("#warReportModal")).toHaveAttribute("open", "");
  await page.click("#warReportBattleAgainBtn");
  await expect(page.locator("#warReportOutcome")).toBeVisible();

  // Close modal and re-open staging
  await page.click("#warReportClose");
  await expect(page.locator("#warReportModal")).not.toHaveAttribute("open", "");
  await page.click("#battleBtn");
  await expect(page.locator("#warReportModal")).toHaveAttribute("open", "");

  // Should now say "Run Battle Again" since a valid preview exists
  await expect(page.locator("#warReportBattleAgainBtn")).toHaveText("Run Battle Again");

  // Close modal and change attacker class (invalidates preview)
  await page.click("#warReportClose");
  await page.selectOption("#attackerClass", "archers");

  // Re-open staging → should revert to "Start Battle Roll"
  await page.click("#battleBtn");
  await expect(page.locator("#warReportModal")).toHaveAttribute("open", "");
  await expect(page.locator("#warReportBattleAgainBtn")).toHaveText("Start Battle Roll");
});

test("War Report modal opens with focus on primary action button in staging mode", async ({ page }) => {
  await prepareManualBattle(page);
  await page.click("#battleBtn");
  await expect(page.locator("#warReportModal")).toHaveAttribute("open", "");
  // Focus must land on #warReportBattleAgainBtn, not on the close (✕) button (FINDING-005)
  await expect(page.locator("#warReportBattleAgainBtn")).toBeFocused();
  // Close the modal so subsequent tests start from clean state
  await page.click("#warReportClose");
  await expect(page.locator("#warReportModal")).not.toHaveAttribute("open", "");
});

test("warReportPreviousWrap is hidden before any battle, visible in staging after one battle", async ({ page }) => {
  await prepareManualBattle(page);

  // Open staging: no prior battle → previous wrap hidden
  await page.click("#battleBtn");
  await expect(page.locator("#warReportModal")).toHaveAttribute("open", "");
  await expect(page.locator("#warReportPreviousWrap")).not.toBeVisible();

  // Run the battle
  await page.click("#warReportBattleAgainBtn");
  await expect(page.locator("#warReportOutcome")).toBeVisible();

  // Close and re-open staging → previous wrap now visible
  await page.click("#warReportClose");
  await page.click("#battleBtn");
  await expect(page.locator("#warReportModal")).toHaveAttribute("open", "");
  await expect(page.locator("#warReportPreviousWrap")).toBeVisible();
});

test("Weather change alone does not invalidate War Report preview — 'Run Battle Again' persists", async ({ page }) => {
  await prepareManualBattle(page);

  // Run one battle
  await page.click("#battleBtn");
  await page.click("#warReportBattleAgainBtn");
  await expect(page.locator("#warReportOutcome")).toBeVisible();
  await page.click("#warReportClose");

  // Verify preview is valid before changing weather
  await page.click("#battleBtn");
  await expect(page.locator("#warReportBattleAgainBtn")).toHaveText("Run Battle Again");
  await page.click("#warReportClose");

  // Change weather tag
  await setSelectValue(page, "#weatherTagSelect", "RAIN");

  // Re-open staging → preview should still be valid (weather alone doesn't invalidate)
  await page.click("#battleBtn");
  await expect(page.locator("#warReportModal")).toHaveAttribute("open", "");
  await expect(page.locator("#warReportBattleAgainBtn")).toHaveText("Run Battle Again");
});

test("Auto-battle round limit exhaustion transitions to auto-stopped with 'Close' button restored", async ({ page }) => {
  await prepareManualBattle(page, {
    attackerSize: "200",
    attackerStr: "60",
    defenderSize: "200",
    defenderStr: "60"
  });

  await page.click("#battleBtn");
  await expect(page.locator("#warReportModal")).toHaveAttribute("open", "");

  // Set round limit to 3
  await page.selectOption("#warReportRoundLimit", "3");

  // Start auto-battle
  await page.click("#warReportAutoResolveBtn");

  // Wait for auto-battle to finish (limit exhausted or defeat)
  await expect.poll(() => page.evaluate(() => _warReportAutoRunning), { timeout: 15000 }).toBe(false);

  // Modal should still be open
  await expect(page.locator("#warReportModal")).toHaveAttribute("open", "");

  // Close/Stop button should now say "Close" (not "Stop")
  await expect(page.locator("#warReportClose")).toHaveText("✕ Close");
  await expect(page.locator("#warReportClosePrimary")).toHaveText("Close");

  // Status text confirms the session stopped (stopped by limit, defeat, or user)
  // _warReportAutoSession is nulled by openWarReportModal after finalization, so check UI instead
  await expect(page.locator("#warReportAutoStatus")).not.toBeEmpty();
});

test("Esc during simulated auto-running keeps War Report modal open and stops the session", async ({ page }) => {
  await prepareManualBattle(page);

  // Simulate auto-running state (same pattern as existing auto-battle test)
  await page.click("#battleBtn");
  await page.evaluate(() => {
    _warReportAutoRunning = true;
    _warReportAutoLoopActive = false;
    _warReportAutoStopRequested = false;
    _warReportAutoSession = createWarReportAutoSession(null);
    openWarReportModal({ mode: "auto-running", session: _warReportAutoSession, payload: null });
    setWarReportActionState({ result: { newAtt: 1, newDef: 1 }, stopReason: null }, "auto-running");
  });

  await expect(page.locator("#warReportModal")).toHaveAttribute("open", "");
  await expect(page.locator("#warReportClose")).toHaveText("Stop");

  // Press Escape — should NOT close the dialog; should stop auto-running
  await page.keyboard.press("Escape");

  // Modal must still be open
  await expect(page.locator("#warReportModal")).toHaveAttribute("open", "");

  // Auto-running should now be false (force-finalized via cancel event → closeWarReportModal → requestWarReportAutoStop)
  await expect.poll(() => page.evaluate(() => _warReportAutoRunning)).toBe(false);

  // Close button should be restored to "✕ Close"
  await expect(page.locator("#warReportClose")).toHaveText("✕ Close");
});

test("History 'Older History' group renders records without sessionId", async ({ page }) => {
  // Seed records with no sessionId (legacy records)
  await seedHistory(page, [
    buildHistoryRecord({
      ts: "2024-01-15T10:00:00.000Z",
      sessionId: undefined,
      sessionLabel: undefined,
      sessionStartedAt: undefined,
      turnNumber: 1,
      battleIndexInTurn: 1,
      attackerName: "Ancient Legion",
      defenderName: "Old Guard"
    }),
    buildHistoryRecord({
      ts: "2024-01-14T10:00:00.000Z",
      sessionId: undefined,
      sessionLabel: undefined,
      sessionStartedAt: undefined,
      turnNumber: 1,
      battleIndexInTurn: 1,
      attackerName: "Ancient Legion",
      defenderName: "Old Guard"
    })
  ]);

  await page.click('.tab[data-tab="history"]');

  // An "Older History" session group should be present
  const olderGroup = page.locator(".historySessionGroup.legacy");
  await expect(olderGroup).toBeVisible();
  // Scope to the session-level toggle summary only (not nested turn/card summaries)
  await expect(olderGroup.locator(".historySessionToggle").first()).toContainText("Older History");
});

test("Fresh load shows empty-state placeholder in history and nothing is persisted to localStorage", async ({ page }) => {
  // Fresh load: no saved history — navigating to history tab triggers renderHistoryList()
  await page.click('.tab[data-tab="history"]');

  // renderHistoryList() shows the static historyEmptyState div when no sessions exist
  await expect(page.locator(".historyEmptyState")).toBeVisible();
  await expect(page.locator(".historyEmptyState")).toContainText("Battle history will appear here");

  // Nothing should be persisted to localStorage
  const storedLength = await historyLength(page);
  expect(storedLength).toBe(0);
});

test("Battle scale line reflects Total dice and quality tag from Size and STR only", async ({ page }) => {
  await prepareManualBattle(page, {
    attackerClass: "archers",
    defenderClass: "pikes",
    attackerSize: "100",
    attackerStr: "30",
    defenderSize: "100",
    defenderStr: "30"
  });

  await expect(page.locator("#attackerScaleSummary")).toHaveText("Battle scale: Very Poor · Total dice 5");
  await expect(page.locator("#defenderScaleSummary")).toHaveText("Battle scale: Very Poor · Total dice 5");
  await expect(page.locator("#attackerSupplyWarning")).toBeHidden();

  await setSelectValue(page, "#weatherTagSelect", "RAIN");
  await page.evaluate(() => {
    state.attacker.manualDiceDelta = 3;
    render();
  });

  await expect(page.locator("#attackerScaleSummary")).toHaveText("Battle scale: Very Poor · Total dice 5");
});

test("Rebels above Poor are blocked from battle start", async ({ page }) => {
  await prepareManualBattle(page, {
    attackerClass: "rebels",
    defenderClass: "pikes",
    attackerSize: "150",
    attackerStr: "50",
    defenderSize: "100",
    defenderStr: "30"
  });

  await expect(page.locator("#attackerScaleSummary")).toHaveText("Battle scale: Modest · Total dice 8");
  await expect(page.locator("#attackerCeilingWarning")).toContainText("Army too large for standard battle scale");
  await expect(page.locator("#attackerCeilingWarning")).toContainText("Rebels cannot exceed Poor. Split or reduce before battle.");
  await expect(page.locator("#validationMsg")).toContainText("Attacker — Army too large for standard battle scale: Rebels cannot exceed Poor. Split or reduce before battle.");
  await expect(page.locator("#battleBtn")).toBeDisabled();
});

test("Special and Faction classes remain warning-only above Standard ceilings", async ({ page }) => {
  await prepareManualBattle(page, {
    attackerClass: "vampires",
    defenderClass: "pikes",
    attackerSize: "250",
    attackerStr: "100",
    defenderSize: "100",
    defenderStr: "30"
  });

  await expect(page.locator("#attackerScaleSummary")).toHaveText("Battle scale: Legendary · Total dice 15");
  await expect(page.locator("#attackerSupplyWarning")).toHaveText("Massive host. Heavy Supply strain likely in campaign play.");
  await expect(page.locator("#attackerCeilingWarning")).toBeHidden();
  await expect(page.locator("#battleBtn")).toBeEnabled();
});

test("Armies list shows total dice, quality, and warning or overflow status", async ({ page }) => {
  await seedSavedArmies(page, [
    {
      id: "army-rebels-oversized",
      name: "Oversized Rebels",
      classId: "rebels",
      size: 150,
      str: 50,
      faction: "Freefolk",
      notes: "Should be blocked before battle."
    },
    {
      id: "army-vampire-host",
      name: "Night Court Host",
      classId: "vampires",
      size: 250,
      str: 100,
      faction: "Umahim",
      notes: "Large special host."
    }
  ]);

  await page.click('.tab[data-tab="armies"]');

  const rebelsRow = page.locator(".armyRow").filter({ hasText: "Oversized Rebels" });
  await expect(rebelsRow).toContainText("Total dice 8 · Quality Modest");
  await expect(rebelsRow).toContainText("Army too large for standard battle scale");
  await expect(rebelsRow).toContainText("Rebels cannot exceed Poor. Split or reduce before battle.");

  const vampireRow = page.locator(".armyRow").filter({ hasText: "Night Court Host" });
  await expect(vampireRow).toContainText("Total dice 15 · Quality Legendary");
  await expect(vampireRow).toContainText("Massive host. Heavy Supply strain likely in campaign play.");
});

test("War Report battle-start flow respects class ceiling blocks", async ({ page }) => {
  await prepareManualBattle(page, {
    attackerClass: "archers",
    defenderClass: "pikes",
    attackerSize: "100",
    attackerStr: "30",
    defenderSize: "100",
    defenderStr: "30"
  });

  await page.click("#battleBtn");
  await expect(page.locator("#warReportModal")).toHaveAttribute("open", "");

  await page.evaluate(() => {
    state.attacker.classId = "rebels";
    state.attacker.size = 150;
    state.attacker.str = 50;
    document.getElementById("attackerClass").value = "rebels";
    document.getElementById("attackerSize").value = "150";
    document.getElementById("attackerStr").value = "50";
    render();
    openWarReportModal({ mode: "staging" });
  });

  await expect(page.locator("#warReportBattleAgainBtn")).toBeDisabled();
  const battleResult = await page.evaluate(() => runBattleRoundSafe({ source: "war-report-battle-again" }));

  await expect(page.locator("#validationMsg")).toContainText("Attacker — Army too large for standard battle scale: Rebels cannot exceed Poor. Split or reduce before battle.");
  expect(battleResult.ok).toBe(false);
  await expect.poll(() => historyLength(page)).toBe(0);
  await expect(page.locator("#warReportOutcome")).not.toBeVisible();
});

// ─── End of new regression tests ────────────────────────────────────────────

test("History snapshots battle-time army names even after later rename", async ({ page }) => {
  await prepareManualBattle(page);
  await page.fill("#attackerArmyNameDraft", "Iron Vanguard");
  await page.fill("#defenderArmyNameDraft", "Stoneward Guard");

  await page.click("#openSaveAttModal");
  await page.click("#armyModalSave");
  await page.click("#openSaveDefModal");
  await page.click("#armyModalSave");

  await setSelectValue(page, "#showWarReportModal", "no");
  await page.click("#battleBtn");

  await page.click('.tab[data-tab="history"]');
  await expect(page.locator(".historyCard .hTitle").first()).toContainText("Iron Vanguard");
  await expect(page.locator(".historyCard .hTitle").first()).toContainText("Stoneward Guard");

  await page.click('.tab[data-tab="battle"]');
  await page.click("#openSaveAttModal");
  await page.fill("#armyName", "Iron Vanguard Renamed");
  await page.click("#armyModalSave");

  await page.click('.tab[data-tab="history"]');
  await expect(page.locator(".historyCard .hTitle").first()).toContainText("Iron Vanguard · Cavalry");
  await expect(page.locator(".historyCard .hTitle").first()).not.toContainText("Iron Vanguard Renamed");
});

test("War Room nav slot, tab activation, and hash routing are wired", async ({ page }, testInfo) => {
  const tabs = await page.locator("#mainNav .tab").evaluateAll((nodes) =>
    nodes.map((node) => node.textContent.replace(/\s+/g, " ").trim())
  );
  const warRoomIndex = tabs.findIndex((label) => label.includes("War Room"));
  const battleIndex = tabs.findIndex((label) => label.includes("Battle"));
  expect(warRoomIndex).toBeGreaterThanOrEqual(0);
  expect(battleIndex).toBeGreaterThanOrEqual(0);
  expect(warRoomIndex).toBeLessThan(battleIndex);

  await page.click('.tab[data-tab="warroom"]');
  await expect(page.locator("#tab-warroom")).toHaveClass(/active/);
  await expect.poll(() => page.evaluate(() => window.location.hash)).toBe("#tab-warroom");

  await page.goto(`${appUrl(testInfo)}#tab-warroom`, { waitUntil: "domcontentloaded" });
  await expect(page.locator('.tab[data-tab="warroom"]')).toHaveClass(/active/);
  await expect(page.locator("#tab-warroom")).toHaveClass(/active/);
});

test("Legacy state migrates war defaults and original army values", async ({ page }) => {
  await page.evaluate(() => {
    const legacyPayload = {
      schemaVersion: 7,
      updatedAt: new Date().toISOString(),
      armies: [{
        id: "legacy-host",
        name: "Legacy Host",
        classId: "cavalry",
        size: 80,
        str: 30,
        faction: "Legacy Alliance",
        doctrines: []
      }],
      factions: ["Legacy Alliance"],
      battleHistory: [],
      weather: DEFAULT_WEATHER,
      settings: DEFAULT_APP_SETTINGS,
      battleDraft: { assistHinder: defaultAssistHinderDraft() }
    };
    window.localStorage.setItem("warTableState", JSON.stringify(legacyPayload));
    state.saved = loadPersisted();
    state.settings = Object.assign({}, state.saved.settings);
    state.weather = normalizeWeatherV2(state.saved.weather || DEFAULT_WEATHER);
    persist(state.saved);
    render();
  });
  const saved = await readSavedState(page);
  expect(saved.schemaVersion).toBe(8);
  expect(saved.armies[0].originalSize).toBe(80);
  expect(saved.armies[0].originalStr).toBe(30);
  expect(Object.keys(saved.war.resources).sort()).toEqual(["cp", "influence", "morale", "supply"]);
  expect(saved.war.resources.spy).toBeUndefined();
  expect(saved.war.factionRelations["legacy alliance"]).toBe("neutral");
});

test("Battle-side updates keep original values while Armies-tab GM adjust edits originals", async ({ page }) => {
  await seedSavedArmies(page, [{
    id: "gm-vanguard",
    name: "GM Vanguard",
    classId: "cavalry",
    size: 100,
    str: 40,
    originalSize: 120,
    originalStr: 60,
    faction: "Blue Banner",
    doctrines: []
  }]);

  await page.selectOption("#attLoaderSelect", "gm-vanguard");
  await page.click("#attLoadBtn");
  await page.click("#openSaveAttModal");
  await page.fill("#armySize", "70");
  await page.fill("#armyStr", "30");
  await page.click("#armyModalSave");

  let saved = await readSavedState(page);
  let army = saved.armies.find((entry) => entry.id === "gm-vanguard");
  expect(army.size).toBe(70);
  expect(army.str).toBe(30);
  expect(army.originalSize).toBe(120);
  expect(army.originalStr).toBe(60);

  await page.click('.tab[data-tab="armies"]');
  await page.locator('.armyRow').filter({ hasText: "GM Vanguard" }).getByRole("button", { name: "Edit" }).click();
  await page.locator("#armyOriginalDetails").evaluate((el) => { el.open = true; });
  await page.fill("#armyOriginalSize", "150");
  await page.fill("#armyOriginalStr", "75");
  await page.click("#armyModalSave");

  saved = await readSavedState(page);
  army = saved.armies.find((entry) => entry.id === "gm-vanguard");
  expect(army.size).toBe(70);
  expect(army.str).toBe(30);
  expect(army.originalSize).toBe(150);
  expect(army.originalStr).toBe(75);
});

test("Battle history snapshots include army ids and factions for both sides", async ({ page }) => {
  await seedSavedArmies(page, [
    { id: "snap-att", name: "North Riders", classId: "cavalry", size: 100, str: 40, faction: "Northreach", doctrines: [] },
    { id: "snap-def", name: "Stone Spear", classId: "pikes", size: 100, str: 40, faction: "Stonehold", doctrines: [] }
  ]);
  await page.selectOption("#attLoaderSelect", "snap-att");
  await page.click("#attLoadBtn");
  await page.selectOption("#defLoaderSelect", "snap-def");
  await page.click("#defLoadBtn");
  await setSelectValue(page, "#showWarReportModal", "no");
  await page.click("#battleBtn");

  const saved = await readSavedState(page);
  expect(saved.battleHistory).toHaveLength(1);
  expect(saved.battleHistory[0].attacker.armyId).toBe("snap-att");
  expect(saved.battleHistory[0].attacker.faction).toBe("Northreach");
  expect(saved.battleHistory[0].defender.armyId).toBe("snap-def");
  expect(saved.battleHistory[0].defender.faction).toBe("Stonehold");
});

test("War Room relation controls persist reassignment and survive faction rename/delete cleanup", async ({ page }) => {
  await page.evaluate(() => {
    upsertFaction("Northwatch");
    persist(state.saved);
    refreshAllSavedViews({ useArmyFilter: false });
    render();
  });

  await page.click('.tab[data-tab="warroom"]');
  await page.locator('#warRoomRelationList .warRoomRelationRow').filter({ hasText: "Northwatch" }).getByRole("button", { name: "Enemy" }).click();
  let saved = await readSavedState(page);
  expect(saved.war.factionRelations.northwatch).toBe("enemy");

  await page.click('.tab[data-tab="factions"]');
  await page.locator(".armyRow").filter({ hasText: "Northwatch" }).getByRole("button", { name: "Rename" }).click();
  await page.fill("#renameFactionInput", "Highwatch");
  await page.click("#renameFactionSave");

  saved = await readSavedState(page);
  expect(saved.war.factionRelations.highwatch).toBe("enemy");
  expect(saved.war.factionRelations.northwatch).toBeUndefined();

  await page.locator(".armyRow").filter({ hasText: "Highwatch" }).getByRole("button", { name: /Delete/ }).click();
  await page.click("#confirmOk");
  saved = await readSavedState(page);
  expect(saved.factions).not.toContain("Highwatch");
  expect(saved.war.factionRelations.highwatch).toBeUndefined();
});

test("War Room shows status cards, winning signal, and allied army degradation with records", async ({ page }) => {
  await page.evaluate(() => {
    state.saved.armies = [
      sanitizeArmyRecord({ id: "ally-blue", name: "Blue Legion", classId: "cavalry", size: 90, str: 45, originalSize: 100, originalStr: 50, faction: "Alliance of Dawn", doctrines: [] }),
      sanitizeArmyRecord({ id: "ally-gold", name: "Gold Guard", classId: "pikes", size: 95, str: 48, originalSize: 100, originalStr: 50, faction: "Alliance of Dawn", doctrines: [] }),
      sanitizeArmyRecord({ id: "neutral-march", name: "March Wardens", classId: "archers", size: 80, str: 35, originalSize: 80, originalStr: 35, faction: "Free Marches", doctrines: [] }),
      sanitizeArmyRecord({ id: "enemy-ash", name: "Ash Host", classId: "rebels", size: 0, str: 0, originalSize: 90, originalStr: 40, faction: "Dark Host", doctrines: [] }),
      sanitizeArmyRecord({ id: "enemy-iron", name: "Iron Maw", classId: "cavalry", size: 0, str: 0, originalSize: 110, originalStr: 60, faction: "Dark Host", doctrines: [] }),
      sanitizeArmyRecord({ id: "enemy-night", name: "Night Spears", classId: "pikes", size: 70, str: 25, originalSize: 100, originalStr: 40, faction: "Dark Host", doctrines: [] })
    ];
    recomputeFactions(state.saved);
    state.saved.war = normalizeWarState({
      factionRelations: {
        "alliance of dawn": "ally",
        "free marches": "neutral",
        "dark host": "enemy"
      }
    });
    state.saved.battleHistory = [
      {
        id: "hist-1",
        ts: new Date().toISOString(),
        winner: "attacker",
        attacker: { armyId: "ally-blue", faction: "Alliance of Dawn", name: "Blue Legion", class: "Cavalry", size: 100, str: 50, pool: "8d6", doctrines: [] },
        defender: { armyId: "enemy-ash", faction: "Dark Host", name: "Ash Host", class: "Rebels", size: 90, str: 40, pool: "6d6", doctrines: [] }
      },
      {
        id: "hist-2",
        ts: new Date().toISOString(),
        winner: "attacker",
        attacker: { armyId: "ally-blue", faction: "Alliance of Dawn", name: "Blue Legion", class: "Cavalry", size: 98, str: 48, pool: "8d6", doctrines: [] },
        defender: { armyId: "enemy-iron", faction: "Dark Host", name: "Iron Maw", class: "Cavalry", size: 110, str: 60, pool: "8d6", doctrines: [] }
      },
      {
        id: "hist-3",
        ts: new Date().toISOString(),
        winner: "attacker",
        attacker: { armyId: "enemy-night", faction: "Dark Host", name: "Night Spears", class: "Pikes", size: 100, str: 40, pool: "7d6", doctrines: [] },
        defender: { armyId: "ally-blue", faction: "Alliance of Dawn", name: "Blue Legion", class: "Cavalry", size: 95, str: 47, pool: "8d6", doctrines: [] }
      }
    ];
    persist(state.saved);
    refreshAllSavedViews({ useArmyFilter: false });
    render();
  });

  await page.click('.tab[data-tab="warroom"]');
  await expect(page.locator("#warRoomStatusCards")).toContainText("Allies");
  await expect(page.locator("#warRoomStatusCards")).toContainText("2 defeated armies");
  await expect(page.locator("#warRoomStatusCards")).toContainText("Enemies");
  await expect(page.locator("#warRoomStatusCards")).toContainText("3");
  await expect(page.locator("#warRoomSignalValue")).toHaveText("Winning");

  await page.locator(".warRoomAlliedFaction summary").first().click();
  await expect(page.locator("#warRoomAlliedList")).toContainText("Blue Legion");
  await expect(page.locator("#warRoomAlliedList")).toContainText("2W · 1L");
  await expect(page.locator("#warRoomAlliedList")).toContainText("90% size remaining");
  await expect(page.locator("#warRoomAlliedList")).toContainText("90% STR remaining");
});

test("War Room meters clamp and persist only cp, supply, morale, and influence", async ({ page }) => {
  await page.click('.tab[data-tab="warroom"]');
  for (let i = 0; i < 12; i++) await page.click('#warMeterCp [data-war-resource="cp"][data-war-delta="1"]');
  for (let i = 0; i < 7; i++) await page.click('#warMeterSupply [data-war-resource="supply"][data-war-delta="-1"]');
  for (let i = 0; i < 8; i++) await page.click('#warMeterMorale [data-war-resource="morale"][data-war-delta="1"]');
  for (let i = 0; i < 3; i++) await page.click('#warMeterInfluence [data-war-resource="influence"][data-war-delta="1"]');

  const saved = await readSavedState(page);
  expect(saved.war.resources).toEqual({
    cp: 10,
    supply: -5,
    morale: 5,
    influence: 3
  });
  expect(Object.keys(saved.war.resources).sort()).toEqual(["cp", "influence", "morale", "supply"]);
  await expect(page.locator("#warMeterCp")).toContainText("10");
  await expect(page.locator("#warMeterSupply")).toContainText("-5");
  await expect(page.locator("#warMeterMorale")).toContainText("+5");
});

test("War Room morale +5 applies allied-only post-usable-cap dice and advantage", async ({ page }) => {
  await seedSavedArmies(page, [
    { id: "wr-att-ally", name: "Auric Riders", classId: "cavalry", size: 100, str: 40, faction: "Dawn Pact", doctrines: [] },
    { id: "wr-def-ally", name: "Gate Wardens", classId: "pikes", size: 100, str: 40, faction: "Stone Compact", doctrines: [] }
  ]);
  await seedWarState(page, {
    factionRelations: {
      "dawn pact": "ally",
      "stone compact": "ally"
    },
    resources: { cp: 0, supply: 0, morale: 5, influence: 0 }
  });

  await page.selectOption("#attLoaderSelect", "wr-att-ally");
  await page.click("#attLoadBtn");
  await page.selectOption("#defLoaderSelect", "wr-def-ally");
  await page.click("#defLoadBtn");

  await seedWarState(page, {
    factionRelations: {
      "dawn pact": "ally",
      "stone compact": "ally"
    },
    resources: { cp: 0, supply: 0, morale: 0, influence: 0 }
  });
  const baseline = await currentPoolComputation(page);
  await seedWarState(page, {
    factionRelations: {
      "dawn pact": "ally",
      "stone compact": "ally"
    },
    resources: { cp: 0, supply: 0, morale: 5, influence: 0 }
  });
  const comp = await currentPoolComputation(page);
  expect(comp.attacker.warRoomEffects.eligible).toBe(true);
  expect(comp.attacker.usableDice).toBe(baseline.attacker.usableDice + 2);
  expect(comp.attacker.effectiveAdv).toBe(1);
  expect(comp.defender.warRoomEffects.eligible).toBe(true);
  expect(comp.defender.usableDice).toBe(baseline.defender.usableDice + 4);
  expect(comp.defender.effectiveAdv).toBe(1);
  await expect(page.locator("#attackerBreakdown")).toContainText("War Room");
  await expect(page.locator("#attackerBreakdown")).toContainText("Morale +2 dice");
  await expect(page.locator("#attackerBreakdown")).toContainText("Morale +1 advantage");
  await expect(page.locator("#defenderBreakdown")).toContainText("Morale +4 dice");
  await expect(page.locator("#defenderBreakdown")).toContainText("Morale +1 advantage");

  await page.click('.tab[data-tab="warroom"]');
  await expect(page.locator("#tab-warroom")).not.toContainText("Manual tracking");
  await expect(page.locator("#tab-warroom")).not.toContainText("Supply and Morale now affect allied loaded armies in battle");
  await expect(page.locator("#tab-warroom")).not.toContainText("Classify factions manually");
  await expect(page.locator("#warRoomActiveModifiers")).toContainText("Active Modifiers");
  await expect(page.locator("#warRoomActiveModifiers")).toContainText("Attacker");
  await expect(page.locator("#warRoomActiveModifiers")).toContainText("Morale +2 dice");
  await expect(page.locator("#warRoomActiveModifiers")).toContainText("Morale +1 advantage");
  await expect(page.locator("#warRoomActiveModifiers")).toContainText("Defender");
  await expect(page.locator("#warRoomActiveModifiers")).toContainText("Morale +4 dice");
});

test("War Room supply home-territory penalty and non-allied transparency use the post-usable-cap layer", async ({ page }) => {
  await seedSavedArmies(page, [
    { id: "wr-att-supply", name: "North Lancers", classId: "cavalry", size: 100, str: 40, faction: "Northreach", doctrines: [] },
    { id: "wr-def-enemy", name: "Ash Spears", classId: "pikes", size: 100, str: 40, faction: "Ash Host", doctrines: [] }
  ]);
  await seedWarState(page, {
    factionRelations: {
      northreach: "ally",
      "ash host": "enemy"
    },
    resources: { cp: 0, supply: -2, morale: 0, influence: -2 }
  });

  await page.selectOption("#attLoaderSelect", "wr-att-supply");
  await page.click("#attLoadBtn");
  await page.selectOption("#defLoaderSelect", "wr-def-enemy");
  await page.click("#defLoadBtn");

  await seedWarState(page, {
    factionRelations: {
      northreach: "ally",
      "ash host": "enemy"
    },
    resources: { cp: 0, supply: 0, morale: 0, influence: 0 }
  });
  const baseline = await currentPoolComputation(page);
  await seedWarState(page, {
    factionRelations: {
      northreach: "ally",
      "ash host": "enemy"
    },
    resources: { cp: 0, supply: -2, morale: 0, influence: -2 }
  });

  let comp = await currentPoolComputation(page);
  expect(comp.attacker.usableDice).toBe(baseline.attacker.usableDice - 2);
  expect(comp.defender.warRoomEffects.eligible).toBe(false);
  expect(comp.defender.warRoomSummary).toEqual([]);
  await expect(page.locator("#attackerBreakdown")).toContainText("Supply −2 dice");
  await expect(page.locator("#defenderBreakdown")).toContainText("No War Room modifiers");

  await setCheckboxValue(page, "#attCtxHomeTerritory", true);
  comp = await currentPoolComputation(page);
  expect(comp.attacker.usableDice).toBe(baseline.attacker.usableDice);
  await expect(page.locator("#attackerBreakdown")).toContainText("No War Room modifiers");
});

test("War Room influence stays out of battle math and compact War Room summaries omit report-only notes", async ({ page }) => {
  await seedSavedArmies(page, [
    { id: "wr-att-report", name: "River Guard", classId: "cavalry", size: 150, str: 80, faction: "River Accord", doctrines: [] },
    { id: "wr-def-report", name: "Raid Host", classId: "pikes", size: 100, str: 50, faction: "Raiders", doctrines: [] }
  ]);
  await seedWarState(page, {
    factionRelations: {
      "river accord": "ally",
      raiders: "enemy"
    },
    resources: { cp: 0, supply: 0, morale: 0, influence: 5 }
  });

  await page.selectOption("#attLoaderSelect", "wr-att-report");
  await page.click("#attLoadBtn");
  await page.selectOption("#defLoaderSelect", "wr-def-report");
  await page.click("#defLoadBtn");
  await seedWarState(page, {
    factionRelations: {
      "river accord": "ally",
      raiders: "enemy"
    },
    resources: { cp: 0, supply: 0, morale: 0, influence: 0 }
  });
  const baseline = await currentPoolComputation(page);
  await seedWarState(page, {
    factionRelations: {
      "river accord": "ally",
      raiders: "enemy"
    },
    resources: { cp: 0, supply: 0, morale: 0, influence: 5 }
  });
  const preBattleComp = await currentPoolComputation(page);
  expect(preBattleComp.attacker.usableDice).toBe(baseline.attacker.usableDice);
  expect(preBattleComp.attacker.effectiveAdv).toBe(0);
  expect(preBattleComp.attacker.warRoomSummary).toEqual([]);
  await page.click('.tab[data-tab="warroom"]');
  await expect(page.locator("#warRoomActiveModifiers")).toContainText("No active battle modifiers");
  await expect(page.locator("#warRoomActiveModifiers")).not.toContainText("Influence");
  await page.click('.tab[data-tab="battle"]');
  await setSelectValue(page, "#showWarReportModal", "yes");
  await forceFixedRolls(page, 3);
  await page.click("#battleBtn");
  await expect(page.locator("#warReportModal")).toHaveAttribute("open", "");
  await page.click("#warReportBattleAgainBtn");

  await expect(page.locator("#warReportAttCol")).not.toContainText("Campaign Effects");
  await expect(page.locator("#warReportAttCol")).not.toContainText("Influence");
  await expect(page.locator("#warReportAttCol")).not.toContainText("War Room");
  await expect(page.locator("#warReportDefCol")).not.toContainText("Campaign Effects");
  await expect(page.locator("#warReportDefCol")).not.toContainText("War Room");

  const saved = await readSavedState(page);
  expect(saved.battleHistory[0].warRoomEffects.attacker.summaryLines).toEqual([]);
  expect(saved.battleHistory[0].warRoomEffects.defender.summaryLines).toEqual([]);
});

test("Weather history logs per turn and new session resets only session-scoped war weather history", async ({ page }) => {
  await seedWarState(page, {
    factionRelations: { dawnwatch: "ally" },
    resources: { cp: 3, supply: 1, morale: 2, influence: -1 },
    weatherHistory: []
  });
  await page.evaluate(() => {
    upsertFaction("Dawnwatch");
    persist(state.saved);
    render();
  });

  await page.click("#turnBtn");
  await page.click('.tab[data-tab="warroom"]');
  await expect(page.locator("#warRoomWeatherHistory")).not.toContainText("Advance turns to build a weather recap");
  const savedAfterTurn = await readSavedState(page);
  expect(savedAfterTurn.war.weatherHistory.length).toBe(1);
  expect(savedAfterTurn.war.resources.cp).toBe(3);
  expect(savedAfterTurn.war.factionRelations.dawnwatch).toBe("ally");

  await page.click('.tab[data-tab="battle"]');
  await page.click("#newBattleSessionBtn");

  const savedAfterSession = await readSavedState(page);
  expect(savedAfterSession.war.weatherHistory).toEqual([]);
  expect(savedAfterSession.war.resources).toEqual({
    cp: 3,
    supply: 1,
    morale: 2,
    influence: -1
  });
  expect(savedAfterSession.war.factionRelations.dawnwatch).toBe("ally");

  await page.click('.tab[data-tab="warroom"]');
  await expect(page.locator("#warRoomWeatherHistory")).toContainText("Advance turns to build a weather recap");
});
