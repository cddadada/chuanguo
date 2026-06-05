import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const files = ["upload.html", "printer.html", "checkin.html", "dashboard.html"];
const forbidden = ["撤回上次数量", "不能小于当前已记录数量", "卷制/纵缝"];

for (const fileName of files) {
  const content = fs.readFileSync(path.join(rootDir, fileName), "utf8");
  for (const phrase of forbidden) {
    assert.equal(content.includes(phrase), false, `${fileName} 不应残留旧口径：${phrase}`);
  }
}

console.log("docs-check: no forbidden UI wording found");
