# CoCo 0.5.3 迁移与断点恢复日志

最后更新：2026-08-16

本文档是人类开发者和协作 Agent 的长期交接记录。任何新 Agent 在修改代码前，必须先阅读根目录 `AGENTS.md` 和本文档。

本文是稳定迁移指南。实时命令、测试结果、阻塞和最新恢复检查点保存在不进入发布包的 `.opencode/memory/DEVELOPMENT_JOURNAL.md`。日常推进只更新 live journal；只有架构或长期规则变化时才修改本文。

## 当前交接状态（覆盖下方历史检查点）

下方带日期的早期检查点只作为迁移历史保留，不是当前执行指令。当前执行真相依次是`AGENTS.md`和`DEVELOPMENT_PLAN.md`。

最新审查状态：已发布版本`0.6.1`；当前分支`candidate/v0.6.2`；审查提交`1db5610`；工作树clean；完整备份和恢复演练已通过。PERF-001在未打tag候选上测得`--list-models`冷启动约7.14秒、热启动p50约1.22秒，但后续打包文档变更后完整core/integrity证据已stale，发布前必须重跑。当前最优路线是REL-004 → REL-003 → REL-005 → REL-001 → REL-002，同时推进RUN-001恢复和必做的CON-002 Linux containment。

## 历史检查点：最初的0.5.3迁移

日期：2026-08-15

目标：在不覆盖上游能力的前提下，把旧 `0.2.1` 来源中已经验证的安全和终态证据能力迁移到完整 `0.5.3` 基线。

唯一正确工作目录：

```text
/root/coco-tmp/coco-v053-migration
基线 6ec5dd3d2105cacbed2e6ea795d74b9eb2155118
版本 0.5.3
detached HEAD
```

当前有意修改的文件：

```text
AGENTS.md
中英文 docs.json 与迁移日志
scripts/coco-bootstrap.cjs
scripts/coco-launcher.mjs
scripts/publication-secret-scanner.mjs
scripts/runtime-integrity.mjs
scripts/task-state.mjs
scripts/verify-package-closure.mjs
对应 launcher/startup/scanner/release/integrity 测试
```

验证证据：

```text
publication-secret-scanner.test.mjs: 11/11 通过
nonce bypass 源码测试: 通过
变更文件语法检查: 通过
git diff --check: 并行批次结束时通过
launcher/startup: 因当前 worktree 缺少 node_modules 而阻塞
package contract: 因缺少 node_modules/npm/package.json 而阻塞
完整 integrity suite: 未运行
asset map 和 runtime manifest: 受治理文件变化后已过期
```

并行 Agent 结果：

- Archive Agent 只修改指定四个文件，保留 `0.5.3` pi-tui metadata，scanner 测试通过。
- Integrity Agent 只修改指定六个文件，删除 bypass，语法和 nonce 源码测试通过；依赖测试阻塞。
- Log Agent 只返回计划，没有修改 `scripts/task-logs.mjs`，不能把日志迁移视为完成。

当前阻塞：`0.5.3` 日志 store 仍没有可验证 O(1) index 和不可变 seal，因此 runner 还不能安全接入 terminal evidence recovery。

下一条可执行动作：迁移 `scripts/task-logs.mjs` 和测试，运行日志单元、崩溃、并发、seal、性能窄测，然后集成 `scripts/task-runner.mjs` 的 terminal evidence。

在上述受治理文件冻结前不要生成 manifest。没有核对 pinned package-input 工作流前，不要直接运行 `npm install`。

### 检查点：日志 store 与 runner terminal evidence 集成

日期：2026-08-15

当前状态：

- `scripts/task-logs.mjs` 已完成迁移。
- 日志测试 `11/11` 通过，覆盖 index append、崩溃尾部恢复、完整非法尾记录 fail closed、独立 store 锁、不可变 seal、空日志物化和性能。
- `scripts/task-runner.mjs` 已在 seal、receipt 和 terminal event 之前持久化 terminal evidence。
- Terminal evidence 已持久化的任务不能被 cancel 覆盖。
- Task command 和 Control API 投影不会暴露内部 `terminalEvidence`。
- 已增加 receipt 故障后重启零重执行测试。

实际命令：

```bash
node --test test/task-logs.test.mjs test/task-logs-perf.test.mjs test/task-receipts.test.mjs test/task-control-state.test.mjs test/control-service.test.mjs
```

结果：

```text
task logs/performance/receipts: 13/13 通过
task-control-state.test.mjs: 模块加载阶段阻塞
control-service.test.mjs: 模块加载阶段阻塞
原因: dist/utils/child-process.js 导入 cross-spawn 时 ERR_MODULE_NOT_FOUND
runner/control 断言: 未执行
```

语法检查和 `git diff --check` 通过。

已发现完整依赖来源 `/root/coco-tmp/coco-v030-release/node_modules`，其中包含 npm `11.18.0`、Pi core `0.82.1`、pi-tui `0.82.1`、MCP `1.30.0`。物化前必须核对来源 worktree commit 和 package-lock hash与当前候选一致。使用物理副本，不创建可变依赖 symlink，并把命令和 hash 记录到日志。

下一条可执行动作：验证并物化依赖，然后重跑 runner/control 和 terminal-evidence 故障注入测试。

### 检查点：依赖物化与终态流水线验证完成

日期：2026-08-15

依赖物化证据：

```text
来源: /root/coco-tmp/coco-v030-release/node_modules
来源 commit: 6ec5dd3
候选 commit: 6ec5dd3
两边 package.json SHA-256: d81d3614843af274db13e095f18ea0cd01c9b39e315f2f93ea13a3bdb0deae7a
两边 package-lock.json SHA-256: 1e472f39fcfcda90c4e7da5cbd6656bbbf6c0aa536b70fd0616c09ca6a834607
方式: 物理 `cp -a`，没有 symlink
安装树 lock SHA-256: 7633d03d2ea10d041777a35763c62ebb5c8a69269e1fe6d97b1cd7ed5fd23dd9
```

关键固定版本：npm `11.18.0`、cross-spawn `7.0.6`、Pi core `0.82.1`、pi-tui `0.82.1`、MCP `1.30.0`。

`npm run verify:closure` 通过，共验证 175 个 package manifest。

Runner 已集成：

- Receipt/event 前持久化 terminal evidence。
- Receipt 故障后重启零 child 重执行。
- Receipt 前不可变日志 seal。
- `StringDecoder` UTF-8 capture。
- 精确 stdout/stderr 内存上限。
- FIFO 日志写入和高低水位 pause/resume。
- 日志写故障可观测。
- 日志容量饱和时保留真实 child 成功结果。
- 持久 `logsTruncated`。

验证：

```text
task/control/log/performance/receipt: 39/39 通过
语法检查: 通过
git diff --check: 通过
```

此前 Control fixture 的 `TASK_RECEIPT_INVALID` 是因为把新增的 `describe.latestAt` 传入严格 receipt v1。现在 fixture 只选择 `bytes`、`records`、`ref`、`sha256`；生产 schema 没有放宽。

Launcher/startup 仍因受治理代码和文档变化后的 stale integrity assets 阻塞，这是预期中间态，不是 runtime 回归。Diagnosis 优化完成前不要生成资产。

下一条可执行动作：Diagnosis 改用轻量尾部元数据，并在观察后重新验证 task snapshot。

### 检查点：Diagnosis 优化完成，受治理代码冻结

日期：2026-08-15

已实现：

- `logs.latestAt()` 验证 index，只读取一个有界尾记录。
- Diagnosis 不再 hash 或解析完整 JSONL。
- Control 先观察 task、event/log metadata 和进程 identity，再重新读取 task，比较 status、active run ID、PID 和 process identity。
- Snapshot 第一次变化会重试；第二次变化返回 HTTP 409 和 `STATE_CHANGED_DURING_DIAGNOSIS`。

验证：

```text
logs/control/diagnosis/runner: 37/37 通过
feature typecheck: 通过
git diff --check: 通过
```

Task/terminal/archive/integrity 实现批次现在冻结。Product identity、asset map 和 runtime manifest 已过期，重新生成前不能宣称 launcher、startup、package、core 或完整 integrity 通过。

下一条可执行动作：一次性执行仓库生成命令，记录全部派生文件，然后运行 launcher/startup/package，再运行 core 和一次完整 integrity suite。

### 检查点：派生资产与 core 前门禁通过

日期：2026-08-15

生成命令：

```bash
npm run build
```

结果：通过。Product identity 返回 `changed: false`；identity patch、package asset map 和 runtime integrity manifest 成功重新生成。

生成后证据：

```text
runtime integrity probe: approved，20,655 entries
launcher/startup: 3/3 通过
真实 npm pack public package contract: 1/1 通过
完整 typecheck: 通过
package closure: approved，175 个 package manifest
全仓 secret scan: clean
git diff --check: 通过
```

当前 checkpoint 的派生资产是最新的。之后任何受治理代码或文档变化都会让上述 launcher/startup/package 证据过期，必须重新生成。

下一条可执行动作：串行运行 `npm run test:core`；通过后记录结果，并运行一次 `npm run test:integrity`。

## 当前唯一正确的开发目录

```text
/root/coco-tmp/coco-v053-migration
HEAD: 6ec5dd3d2105cacbed2e6ea795d74b9eb2155118
版本: 0.5.3
状态: detached worktree，暂不提交
```

`/root/coco` 仍基于旧提交 `2970165`，版本为 `0.2.1`。其中包含已经通过测试的安全和任务系统改动，但它只是迁移来源，不是产品版本真相，也不能作为发布候选。

## 为什么需要迁移

CoCo 的远端主线和标签已经推进到 `0.5.3`：

```text
origin/main: 6ec5dd3
v0.5.3 tag: ac92c9c2f5a387adf3f8055f362e21d305b719c9
0.5.3 发布准备提交: 783a54d
```

此前为了保护旧工作树中的大量未提交改动，没有直接 pull、rebase 或覆盖 checkout。后续安全改动因此被叠加在 `0.2.1` 基线上。正确处理方式不是直接修改版本号，而是把行为按语义迁移到完整 `0.5.3` 基线。

## 安全约束

- 禁止 reset、clean、覆盖 checkout、rebase 或 pull 旧工作树。
- 禁止删除 `/root/coco` 的未跟踪文件和 profiler 日志。
- 禁止未经明确授权 commit、push、tag、发布、上传或修改远程状态。
- 禁止把旧工作树文件整份覆盖到 `0.5.3`；必须保留上游 execution evidence、provider、TUI、model panel 和产品身份能力。
- 每批代码冻结后才能生成 asset map 和 runtime integrity manifest。
- 所有测试命令、结果、阻塞原因必须记录到英文主日志或本文档。

## 已完成的迁移批次

### 独立 0.5.3 worktree

已完成：

- 从 `origin/main@6ec5dd3` 创建专用 detached worktree。
- 确认 `package.json` 版本为 `0.5.3`。
- 确认上游已有 task events、logs、receipts、diagnosis、control API、execution evidence、provider lifecycle、TUI 和 model panel。

### Task state schema

已实现但尚未完成 runner 集成：

- 增加向后兼容 `logsTruncated`。
- 增加向后兼容 `terminalEvidence`。
- 旧状态加载时分别补 `false` 和 `null`。
- Terminal evidence 只允许存在于 `running + activeRunId + 无 pendingRunEvent` 的任务。
- Evidence 只保存有界终态元数据，不保存 prompt、日志正文、环境变量、凭据或 PID。

### Archive 与 package hardening

代码迁移已完成：

- 私有归档 snapshot。
- `O_NOFOLLOW`。
- 路径 canonicalization。
- duplicate、alias 和 prefix conflict 拒绝。
- 严格 ZIP EOCD、local/central header、range、CRC 检查。
- Tar timeout、大小和成员数限制。
- Tarball source bytes/mode 绑定。
- 保留 `0.5.3` 的 pi-tui bundled dependency。

测试证据：

```text
publication-secret-scanner: 11/11 通过
语法检查: 通过
git diff --check: 通过
```

Package contract 因当前 worktree 缺少 `node_modules/npm/package.json` 而未进入打包阶段，不能标记为通过。

### Runtime integrity cache

代码迁移已完成：

- 删除 `COCO_INTEGRITY_VERIFIED` 跳过路径。
- CJS/ESM 统一 schema v2。
- 统一六字段 snapshot。
- 增加目录 snapshot 和 warm-cache 回归测试。
- 保留 `0.5.3` 的 Pi core、pi-ai、pi-tui、MCP、产品身份和 dispatch 逻辑。

测试证据：

```text
语法检查: 通过
伪造 nonce 防回归测试: 通过
```

Launcher/startup/full-integrity 因缺少 node_modules 阻塞。

## 尚未完成的 P0

### Task log store

日志迁移 Agent 只完成了接口审查，没有修改文件。当前 `0.5.3` 仍在每次 append 时重写完整 JSONL，也没有 seal。

必须迁移：

- O(1) append 与可验证 index。
- short-write 循环和 datasync。
- stale/corrupt index 恢复。
- EOF partial-tail 恢复。
- 完整但非法 JSON fail closed 且不修改原文件。
- UTF-8 和 canonical JSON 验证。
- 全局 state lock。
- `describe()` 最新元数据。
- 不可变 seal。
- 空日志物化。
- Seal 后 append 返回 `TASK_LOG_SEALED`。
- 每次读取 seal 时重新校验实际日志 bytes、records、latestAt 和 SHA-256。

### Runner terminal evidence 状态机

当前 `0.5.3` 顺序仍是：

```text
child exit -> logs.describe -> receipt.write -> finish
```

必须迁移为：

```text
child exit
  -> 持久化 terminalEvidence（不可重执行点）
  -> seal log
  -> 幂等写 receipt
  -> 持久化 terminal event intent 与 task projection
  -> 幂等发布 terminal event
  -> 清除 activeRunId
```

重启时必须先恢复 terminal evidence，再处理普通 interrupted run。Evidence 存在的 run 永远不能再次执行。

## 依赖阻塞

当前迁移 worktree 没有 `node_modules`。不要盲目运行 `npm install`，因为项目使用固定版本、bundled dependency 和 patched runtime 输入。

必须先核对：

- `package-lock.json`
- package input scripts
- package asset map
- runtime manifest
- 干净 reference worktree 的依赖来源和 hash

恢复依赖后，把完整命令、来源和 hash 写入日志。

## 断点恢复命令

```bash
cd /root/coco-tmp/coco-v053-migration
git status --short --branch
node -p "require('./package.json').version"
git diff --check
```

预期版本必须是 `0.5.3`。

随后：

```bash
node --check scripts/task-state.mjs
node --test test/publication-secret-scanner.test.mjs
```

在 task logs 和 runner 状态机完成前，不要重新生成 manifest。

## 精确下一步

1. 完成 task log store 迁移。
2. 运行日志恢复、并发、seal 和性能窄测。
3. 在不覆盖上游 execution evidence 的前提下集成 terminal evidence。
4. 增加 receipt 故障和重启零重执行测试。
5. Diagnosis 改用轻量尾部元数据，避免全量日志扫描。
6. 安全恢复依赖。
7. 运行 typecheck 和子系统测试。
8. 代码冻结后一次性生成 asset map 和 manifest。
9. 运行 launcher、startup、package contract。
10. 最后运行 core suite 和一次长 integrity suite。

## 发布状态

当前仍是 **No-Go**：

- 迁移未完成。
- 依赖测试阻塞。
- worktree 为 detached 且未提交。
- 尚无干净候选提交。
- 受治理代码已变化，派生资产尚未最终生成。
- `0.5.3` 之后的新版本号尚未由用户或发布策略确定。
