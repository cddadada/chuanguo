import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const storageKey = "cg_drum_scan_checkin_registration_v3";

function pageUrl(fileName, query = "") {
  return `${pathToFileURL(path.join(rootDir, fileName)).href}${query}`;
}

function read(fileName) {
  return fs.readFileSync(path.join(rootDir, fileName), "utf8");
}

function extractInlineScripts(html) {
  return [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map((match) => match[1]);
}

async function resetDemoState(page) {
  await page.goto(pageUrl("index.html"));
  await page.evaluate((key) => window.localStorage.removeItem(key), storageKey);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  try {
    await resetDemoState(page);

    await page.goto(pageUrl("upload.html"));
    await page.locator("#orderCode").fill("410503");
    await page.waitForTimeout(650);
    await assertInputValue(page, "#itemName", "鞍山华泰新石项目250t/h干熄焦余热炉");
    await assertCount(page, ".drum-row", 2);
    await assertInputValue(page, ".drum-row:nth-child(1) .drum-drawing", "410503.001.0");
    await assertInputValue(page, ".drum-row:nth-child(2) .drum-drawing", "410503.002.0");
    await assertInputValue(page, ".drum-row:nth-child(1) .company-plan-date", "2026-06-18");

    await page.goto(pageUrl("upload.html"));
    await page.locator("#orderCode").fill("EVAL-001");
    await page.locator("#itemName").fill("评估脚本专用锅筒项目");
    await page.locator(".drum-row:nth-child(1) .drum-drawing").fill("EVAL-001.001.0");
    await page.locator(".drum-row:nth-child(1) .plate-count").fill("3");
    await page.locator(".drum-row:nth-child(1) .company-plan-date").fill("2026-07-01");
    await page.locator(".drum-row:nth-child(1) [data-process-quantity='备料']").fill("3");
    await page.locator("#addDrumBtn").click();
    await page.locator(".drum-row:nth-child(2) .drum-drawing").fill("EVAL-001.002.0");
    await page.locator(".drum-row:nth-child(2) .plate-count").fill("3");
    await page.locator(".drum-row:nth-child(2) .company-plan-date").fill("2026-07-02");
    await page.locator(".drum-row:nth-child(2) [data-process-quantity='备料']").fill("3");
    await page.locator("#submitBtn").click();
    await expectText(page, "#msg", "保存成功：已登记 EVAL-001 2 个锅筒。");

    const firstDrumCode = await page.evaluate(() => {
      const drum = window.DrumDemo.loadState().drums.find((item) => item.production_order_no === "EVAL-001" && item.drawing_no === "EVAL-001.001.0");
      return drum?.drum_code;
    });
    assert.ok(firstDrumCode, "手工登记后应能拿到第一只锅筒二维码编码");

    await page.goto(pageUrl("printer.html"));
    await page.locator("#printSearch").fill("EVAL-001");
    await assertCount(page, ".print-drum-options button", 2);
    await expectText(page, ".print-drum-options", "EVAL-001.001.0");
    await expectText(page, ".print-drum-options", "EVAL-001.002.0");

    await page.goto(pageUrl("checkin.html", `?id=${encodeURIComponent(firstDrumCode)}`));
    await expectText(page, "#summaryCard", "生产令号：EVAL-001");
    await page.locator(".progress-row").first().click();
    await page.locator("#sheetQuantity").fill("2");
    await page.locator("[data-confirm-finish]").click();
    await expectText(page, "#resultMsg", "备料 今天已记录 2 张");
    await page.waitForTimeout(250);
    await expectTextContains(page, ".progress-row", "2/3 张");

    await page.goto(pageUrl("dashboard.html"));
    await page.locator("#trackingStatus").selectOption("在制");
    await page.locator("#trackingOrderSelect").selectOption("EVAL-001");
    await assertCount(page, ".drum-board-card", 2);
    await expectText(page, "#boardHead", "EVAL-001 进度");
    await expectText(page, ".drum-board-card", "公司计划完工");
    await expectText(page, ".drum-board-card", "打卡记录");
    await expectText(page, ".drum-board-card", "计划调整");
    assert.equal(await page.locator(".process-name", { hasText: "备料" }).count() > 0, true, "看板应显示工序名称");

    checkInlineScriptSyntax();
    checkOldWordingRemoved();

    assert.deepEqual(pageErrors, [], `页面运行不应出现错误：${pageErrors.join("; ")}`);
    console.log("eval-regression: all checks passed");
  } finally {
    await browser.close();
  }
}

async function assertInputValue(page, selector, expected) {
  await assert.equal(await page.locator(selector).inputValue(), expected, `${selector} 应为 ${expected}`);
}

async function assertCount(page, selector, expected) {
  await assert.equal(await page.locator(selector).count(), expected, `${selector} 数量应为 ${expected}`);
}

async function expectText(page, selector, expected) {
  await page.locator(selector).filter({ hasText: expected }).first().waitFor({ timeout: 3000 });
}

async function expectTextContains(page, selector, expected) {
  const text = await page.locator(selector).first().innerText();
  assert.ok(text.includes(expected), `${selector} 应包含 ${expected}`);
}

function checkInlineScriptSyntax() {
  const htmlFiles = ["index.html", "sop.html", "upload.html", "printer.html", "checkin.html", "workstation.html", "dashboard.html"];
  for (const fileName of htmlFiles) {
    const scripts = extractInlineScripts(read(fileName));
    scripts.forEach((script, index) => {
      try {
        new Function(script);
      } catch (error) {
        throw new Error(`${fileName} 第 ${index + 1} 段内联脚本语法错误：${error.message}`);
      }
    });
  }
}

function checkOldWordingRemoved() {
  const files = ["upload.html", "printer.html", "checkin.html", "dashboard.html"];
  const forbidden = ["撤回上次数量", "不能小于当前已记录数量", "卷制/纵缝"];
  for (const fileName of files) {
    const content = read(fileName);
    for (const phrase of forbidden) {
      assert.equal(content.includes(phrase), false, `${fileName} 不应残留旧口径：${phrase}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
