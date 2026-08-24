import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

const root = join(import.meta.dirname, "..");

test("user instruction archive preserves explicit conversation requests", async () => {
  const archive = await readFile(join(root, "docs", "USER_INSTRUCTIONS.md"), "utf8");
  const page = await readFile(join(root, "site", "instructions.html"), "utf8");
  const zhPage = await readFile(join(root, "site", "instructions-zh-CN.html"), "utf8");
  for (const value of ["What did we do so far?", "Continue if you have next steps", "llm api 服务已恢复，继续", "把我发给你的所有指令汇总进一个文件"]) assert.ok(archive.includes(value), value);
  assert.match(page, /docs\/USER_INSTRUCTIONS\.md/);
  assert.match(zhPage, /docs\/USER_INSTRUCTIONS\.md/);
  assert.match(page, /Internal reasoning, tool logs, credentials/);
  assert.match(zhPage, /内部思考、工具日志、凭据/);
});
