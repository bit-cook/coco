# CoCo 2026-2027 产品与工程路线图

> 研究基线：CoCo `v0.5.2`、MiMo-Code `main`（研究快照 `332d7b0`）、公开 OpenCode/Pi 资料。研究日期：2026-08-12。

## 执行摘要

CoCo 的下一阶段不应继续围绕“再加几个功能”展开，而应先解决产品能力、源码所有权和维护模型之间的错位。

CoCo 已经拥有一组有价值、且比普通 CLI 包装器更扎实的能力：本地优先、持久任务、进程身份、事务化状态、worktree、MCP、控制服务、VS Code 入口、执行证据、离线包、运行时完整性和严格发布门禁。近期 `0.3.x-0.5.2` 的连续修复也揭示了同一个系统性问题：产品行为分散在 installer、bootstrap、持久状态、tracked `dist`、bundled runtime、嵌套依赖和 live runtime 之间。

最佳方案不是立刻完整 fork，也不是继续无限扩张编译产物 patch，而是采用混合下游模式：

1. 所有新产品行为默认进入 CoCo 自有源码和数据层。
2. 需要上游内部能力的战略改动进入一个小型、持续同步的选择性源码 fork。
3. 编译产物 patch 只保留为短期兼容机制，并持续缩小。
4. Provider、模型、语言、主题、版本和发布元数据变成独立、可验证的数据契约。
5. 路线图使用命名里程碑和能力轨道，不再把未来能力绑定到 `v0.x` 版本号。

未来 12 个月的北极星是：

> 把 CoCo 建设为一个中文优先、终端原生、可恢复、可验证、可扩展，并能持续吸收上游创新的本地 Agent 工作系统。

## 研究方法与证据边界

本报告基于：

- CoCo `v0.5.2` 源码、测试、发布脚本、设计文档、历史 changelog 和实际发布问题。
- MiMo-Code 公开仓库的 README、LICENSE、package layout、TUI、i18n、provider、memory、workflow、测试、CI、release 和相关提交。
- OpenCode/Pi 的公开架构和发布模式，用于判断 fork、overlay 和上游同步策略。

本报告严格区分：

- **已验证事实**：可从代码、测试、Release 或真实运行结果直接确认。
- **强推断**：由多个代码信号支持，但不视为仓库明确承诺。
- **建议**：结合 CoCo 约束给出的产品与工程决策。

MiMo-Code 的品牌、文案、主题资产、Logo 和小米专属服务不属于可复制对象。可学习的是架构边界、交互方法、质量方法和维护制度。

## 当前能力基线

### CoCo 已经做对的事情

1. **本地状态安全**：私有目录、权限检查、symlink 拒绝、事务日志、原子写入和恢复。
2. **持久任务内核**：task snapshot、append-only events、日志、receipt、诊断、取消和进程树管理。
3. **明确的执行边界**：`isolated-required` 和 `host-explicit` 分离，隔离不可用时不静默回退。
4. **Provider 数据治理**：registry、transformation、seed、LKG catalog、hash、origin 和 size/timeout 限制。
5. **发布工程**：closure、secret scan、checksum、offline bundle、VSIX、安装/卸载和公网回归。
6. **终端产品意识**：原生 scrollback、深浅配对主题、中文环境跟随、窄屏 PTY 和 256 色验证。

这些能力必须保留。重构不能以牺牲 fail-closed、安全边界和离线能力为代价。

### 当前最重要的结构性问题

1. **1111 行 artifact patch 承载过多产品行为**：品牌、汉化、TUI、模型可见性和交互都依赖编译后字符串替换。
2. **同一行为存在多个运行时副本**：tracked `dist`、bundled Pi、nested pi-tui、installer、bootstrap 和 live runtime 可能不同步。
3. **两套汉化系统**：结构化语言包和 display-string patch 并存，后者无法保证完整性。
4. **模型生命周期缺少统一服务**：seed、remote catalog、models.json、认证、可见、ready、选中和当前 session 激活相互分离。
5. **产品元数据重复**：版本、Provider ID、环境变量、默认模型、主题和 Release 名称散落多处。
6. **公开 roadmap 已失真**：旧文档将已经发布的能力仍规划为未来 `v0.3-v0.7`，且版本号与真实发布线冲突。
7. **上游同步风险上升**：CoCo 固定 Pi `0.82.1`，战略功能越多，升级 anchor 修复成本越高。

## MiMo-Code 深度研究结论

### 值得学习的部分

#### 1. 把 TUI 当作源码级产品

MiMo-Code 使用 TypeScript、SolidJS 和 OpenTUI，把 feature components、dialogs、routes、contexts 和 UI primitives 分层。主题、视觉模式、模型选择、Provider 登录、任务树和 workflow 都是可测试源码，而不是发布后 patch。

CoCo 应学习：

- 组件和基础 UI primitive 分离。
- 语义主题 token，而不是散落 raw colors。
- visual mode 作为偏好，必须有低成本、低动画模式。
- dialog 的 visibility、selectability 和 renderability 使用同一个 predicate。
- 鼠标 press/release gating，避免 scrollbar drag release 误触。

CoCo 不应学习：

- 为了“高级感”默认引入动画、星空或全屏 transcript。
- 放弃原生 terminal scrollback。
- 复制其配色、Logo、背景和产品术语。

#### 2. 汉化使用稳定 key 和 typed contract

MiMo-Code 的 TUI i18n 使用 TypeScript locale modules，覆盖英语、简中、繁中、日语、法语、西语和俄语，并单独处理 slash command 和 skill 描述。它的覆盖面明显优于只替换少量标签的方案。

可学习：

- English canonical schema。
- 所有 UI 通过 `t(key)` 获取文案。
- slash alias、skill 描述和普通 UI 文案分域。
- Locale fallback 和语言标签规范化。

需要比 MiMo-Code 做得更好：

- 注册 locale 与实际 payload 必须一一对应。
- CI 检测硬编码用户可见字符串。
- key parity、placeholder、CJK width、伪语言扩张测试。
- 每个 Release 生成翻译覆盖报告。

#### 3. 长任务依赖持久记忆和 checkpoint，而非无限 context

MiMo-Code 将 `MEMORY.md`、checkpoint、notes、task progress 和 SQLite FTS5 作为一等能力，并支持按模型配置 context budget。这说明长期 Agent 的可靠性来自状态重建，而不是无限堆 token。

CoCo 应吸收：

- Project memory 与 session checkpoint 分层。
- Memory write 可以关闭，但 read 保持可用。
- Context budget 使用 absolute、percentage 和 provider/model wildcard。
- Footer/status 展示有效 context budget。
- Compaction 前后验证 task、model、tools 和 pending state 不丢失。

#### 4. Provider 能力是 metadata + capability + transform

MiMo-Code 将 provider auth、model catalog、capability registry、transform、error 和 modality 分离。模型是否在列表中不等于可用；模型能力和请求转换必须独立表达。

CoCo `v0.5.2` 的 idepub 修复已经证明这个方向必要。下一步应把 provider 生命周期统一为：

`declared → catalogued → authenticated → compatible → ready → selected → active`

#### 5. 测试要验证边界不变量

MiMo-Code 多个安全修复使用“flip-verified”方法：临时去掉 guard，确认测试一定失败。值得应用到：

- 凭据环境清理。
- session visibility/renderability。
- dangerous operation classification。
- provider readiness。
- TUI mouse release gating。
- compaction context preservation。

### MiMo-Code 不应直接照搬的部分

1. 全量 monorepo 和所有 web/desktop/console surface。
2. 大规模 memory/workflow/actor 同时上线。
3. 小米 OAuth、托管服务和 MiMo 专属模型策略。
4. 未经 CoCo 用户验证的动画和高密度模式。
5. 快速 fork 后长期不明确上游 divergence ledger。

## 战略选择

### 选项 A：继续 artifact patch

短期便宜，长期会继续出现“改了源码副本但真实 runtime 没改”的问题。只适用于小范围品牌替换和紧急兼容修复，不适合作为主架构。

### 选项 B：立即完整 fork Pi

源码控制最好，但 CoCo 当前维护规模不足以立刻承担全部 runtime、安全更新和跨平台构建。一次性迁移会中断产品迭代并制造巨大 merge debt。

### 选项 C：纯 extension/wrapper

维护成本最低，但无法满足 CoCo 对核心 TUI、模型 runtime、startup 和 session 语义的深度改造。

### 最佳方案：混合下游模式

采用三层所有权：

1. **CoCo source layer**：Provider、语言、产品配置、任务、memory、workflow、TUI components、installer、release。
2. **Selective upstream fork**：必须修改 Pi 内部的 model runtime、TUI seams、session lifecycle 和 startup composition。
3. **Compatibility patches**：短期、版本限定、fail-closed、有 owner 和 removal condition。

## 产品支柱

### A. 中文优先的终端体验

- 核心 TUI 100% stable-key i18n。
- 简中为一等内建 locale，繁中作为下一内建 locale。
- 保留橙墨/橙纸视觉身份，建立语义 token 和组件规范。
- 桌面、80 列、48 列、CJK、IME、256 色、screen/tmux/SSH 为正式矩阵。
- 动画默认不进入 CoCo；未来 visual mode 必须 opt-in 且尊重 reduced motion。

### B. Provider 和模型可靠性

- 一个 Provider lifecycle service。
- Catalog visibility 与 readiness 分离。
- LKG、freshness、health 和 minimal live probe。
- 每个模型记录 capability、protocol、reasoning、modality 和 transform。
- OpenAI-compatible custom provider 不应被限制为“一 host 一 provider”。

### C. 可恢复的长任务

- Project memory、session checkpoint、task progress 分层。
- Memory 默认透明、可审计、可关闭写入。
- Context budget 可配置、可见、可测试。
- Compaction 不丢失模型、工具、任务和未决审批。

### D. 可验证的执行与工作流

- 继续强化 task event、receipt、diagnosis、plan/edit/verify。
- Sandbox backend 必须有 OS 强制边界，guard 不冒充 sandbox。
- Workflow 先确定性、后自治；先 read/test/review 并行，后受控写并行。
- 每个 worker 独立 worktree、预算、权限和取消域。

### E. 可持续的上游与发布工程

- 每周 upstream intake、每月 merge attempt、安全更新立即处理。
- 一个 product manifest 生成版本和公共元数据。
- Linux/macOS/Windows CI 和 release smoke 分级覆盖。
- 产物 provenance、SBOM、签名或 GitHub attestation。
- Tag 资产不可 clobber，Release 必须可回滚。

## 12 个月路线图

路线图使用命名里程碑，不绑定语义版本。版本号由实际兼容性和用户价值决定。

### M0：Truth & Freeze（0-2 周）

目标：建立真实能力基线，冻结新的大 patch。

交付：

- Patch inventory：domain、anchor、owner、tests、removal condition。
- Capability matrix：contract / experimental / production / platform-supported。
- 当前 roadmap 和 landscape 归档，公开新页面。
- Product manifest RFC。
- Upstream compatibility dashboard 初版。

退出门禁：所有产品行为都有明确 source-of-truth；新功能不得无审批进入 artifact patch。

### M1：Foundation（2-8 周）

目标：建立 CoCo 自有源码产品层。

交付：

- `packages/coco-core` 或等价源码层。
- product manifest 生成版本、Provider、默认值和 Release asset names。
- Provider lifecycle service 初版。
- installer/bootstrap 使用同一 state reconciler。
- artifact patch 按 identity/i18n/tui/model-runtime 拆分。

退出门禁：新增 Provider 或默认模型只改一个声明；clean bootstrap、install、reinstall 和 live session 使用同一 reconciliation contract。

### M2：Language & Design System（第 2-4 月）

目标：达到中文优先、源码级、可验证的 TUI。

交付：

- 全 TUI stable-key i18n，移除 display-string regex 翻译。
- 简中 key coverage 100%，繁中 beta。
- hardcoded user-facing string scanner。
- CoCo semantic theme schema 和 UI primitives。
- selector/dialog/message/tool/footer/editor golden matrix。
- pseudo-locale、CJK width、IME 和 mouse gating 测试。

退出门禁：核心 TUI 不再通过 artifact patch 注入翻译；所有新增 UI 文案缺 key 时 CI 失败。

### M3：Runtime Ownership（第 3-6 月）

目标：把战略 runtime 改动迁到选择性源码 fork。

交付：

- 明确 Pi base tag/commit 和 divergence ledger。
- model visibility/readiness、startup composition、TUI registration 源码化。
- 每月 upstream merge train。
- generic fix upstream contribution 流程。
- patched build 与 source build 的行为对照测试。

退出门禁：核心 TUI 和 model runtime 变化可 typecheck、unit test；artifact patch 缩减至少 60%。

### M4：Memory & Context（第 5-8 月）

目标：让长任务可恢复、可控成本。

交付：

- Project memory、session checkpoint、task progress 数据模型。
- Memory write disable、审计、清理和 export。
- SQLite FTS 或经过基准验证的本地索引。
- per-model context budget 和 footer/status 可视化。
- compaction preservation tests。

退出门禁：checkpoint 恢复不覆盖用户并发修改；memory 注入可解释；长任务基准成功率不退化，token/latency 改善有 paired 证据。

### M5：Controlled Workflows（第 7-10 月）

目标：从“多个 agent”升级为受控工作系统。

交付：

- Explorer/Worker/Reviewer 角色。
- Deterministic workflow DSL 或 JavaScript workflow API。
- child task、budget、wait/cancel、result aggregation。
- read/test/review 默认可并行。
- 写并行仅限独立 worktree 和静态 ownership。

退出门禁：冲突或越界写入 fail closed；相对单 Agent 的质量、成本和墙钟时间通过预注册 paired experiment。

### M6：Isolation & Distribution（第 9-12 月）

目标：完成生产级隔离和跨平台发布闭环。

交付：

- Linux bwrap/container production backend。
- 网络、secret、workspace 和 resource policy。
- macOS/Windows 明确能力等级，不虚假声称等价 sandbox。
- 跨平台 installer/offline bundle smoke。
- SBOM、attestation、immutable release assets 和 rollback channel。

退出门禁：escape、symlink、socket、credential、process tree 和 resource exhaustion 测试全部通过；不允许静默 host fallback。

## 90 天执行计划

### Sprint 1：真相和边界（第 1-2 周）

- 发布本报告和能力矩阵。
- 冻结新增 monolithic patch。
- 为每个 patch domain 建 issue 和 owner。
- 建立 upstream version watcher。

### Sprint 2：单一产品声明（第 3-4 周）

- 新增 product manifest。
- 生成 version/default/theme/provider/release metadata。
- 删除重复 provider ID 和环境变量声明。

### Sprint 3：模型生命周期（第 5-6 周）

- 实现 provider lifecycle state machine。
- readiness probe、health、freshness 和 LKG UI。
- installer/bootstrap/custom wizard/live runtime 使用一个 reconcile API。

### Sprint 4：i18n 基础（第 7-8 周）

- 生成 canonical message inventory。
- stable key adapter 和 hardcoded-string scanner。
- 将设置、模型、登录、会话四个高频面板迁出 regex patch。

### Sprint 5：TUI primitives（第 9-10 周）

- Theme tokens、Dialog、Selector、Message、ToolSurface、Footer、Prompt。
- 48/80/120、深浅、en/zh、256 色 golden matrix。

### Sprint 6：选择性源码 fork 试点（第 11-12 周）

- 选 model runtime 或 TUI registration 作为第一个 source-owned vertical slice。
- 与现有 patched runtime 做差分行为验证。
- 输出迁移成本和后续 6 个月 burn-down。

## 质量门禁

### 架构

- 新产品行为不进入 monolithic patch。
- 每个 patch 有 owner、upstream range、test 和 removal condition。
- 上游 lag 目标小于 30 天；安全修复不受常规窗口限制。

### 汉化与 UI

- 简中核心 key coverage 100%。
- hardcoded user-visible string 为 0。
- `48/80/120 × dark/light × en/zh × truecolor/256` 全矩阵通过。
- IME、grapheme、CJK width、mouse drag release 和 reduced motion 通过。

### Provider

- visible 不等于 ready，状态必须分开显示。
- seed/catalog/auth/capability/probe/select/active 全生命周期有测试。
- Provider 目录失败保留 LKG，不以空目录覆盖。
- 真实 provider smoke 使用隔离 secret，结果脱敏且不进入仓库。

### 长任务

- Completed 必须有 receipt 或明确 waived reason。
- checkpoint 恢复不覆盖并发用户改动。
- cancel 后无遗留进程树。
- memory 的来源、时间和注入范围可审计。

### 发布

- Actual packed artifact lifecycle，而不是只测 worktree。
- closure、secret、checksum、integrity、install、upgrade、uninstall 全部通过。
- Release asset 不允许 `--clobber`。
- 每个产物记录 source commit、upstream baseline、lock hash 和 build environment。

## 核心指标

1. **Artifact patch burn-down**：6 个月减少 60%，12 个月减少 85%。
2. **Upstream lag**：稳定 baseline 小于 30 天。
3. **Release escape rate**：installer/runtime/model 默认值类 hotfix 趋近 0。
4. **Translation coverage**：简中 100%，繁中 beta 大于 95%。
5. **Provider readiness accuracy**：列表显示 ready 但 live probe 失败率小于 1%。
6. **Long-task recovery**：可恢复任务大于 95%，且无并发用户修改覆盖。
7. **Install success**：支持平台 clean install/upgrade/uninstall 大于 99%。
8. **Task evidence coverage**：completed receipt 覆盖 100%。

## 明确不做

- 不进行大规模 Go/Rust 重写。
- 不立即复制 OpenCode/MiMo-Code 全 monorepo。
- 不把动画和全屏模式当作质量提升本身。
- 不把 provider `/models` 返回值直接等同于可用模型。
- 不让 guard、approval 或 command classifier 冒充 OS sandbox。
- 不在隔离失败后自动回退 host。
- 不开放无限 swarm 和无预算自治。
- 不复制 MiMo-Code 的品牌、视觉资产或小米专属服务。

## 最终决策

CoCo 的竞争力不应来自“比别人多几个功能”，而应来自五个组合优势：

1. 中文优先但不牺牲技术标识准确性。
2. 终端原生但具备现代设计系统。
3. Provider 开放但 readiness 诚实。
4. 长任务自治但状态可恢复、执行可验证。
5. 深度定制但上游同步可持续。

未来 90 天最重要的工作不是 memory、workflow 或动画，而是先建立 CoCo 自有源码产品层、统一 Provider 生命周期、stable-key i18n 和选择性 fork 机制。完成这些基础后，再吸收 MiMo-Code 在 memory、context budget、workflow 和 interaction hardening 上的优秀实践，才能避免重演 `0.3.x-0.5.x` 的多运行时修复链。

## 主要资料

- CoCo repository：<https://github.com/bit-cook/coco>
- CoCo `DESIGN.md`
- CoCo `scripts/apply-coco-identity-patch.mjs`
- CoCo provider/state/release/test modules
- MiMo-Code repository：<https://github.com/XiaomiMiMo/MiMo-Code>
- MiMo-Code README、LICENSE、`packages/opencode/src`、TUI i18n、provider、memory、workflow、CI 和 Releases
- OpenCode：<https://github.com/anomalyco/opencode>
- Pi releases：<https://github.com/earendil-works/pi/releases>

MiMo-Code 为 MIT 许可的 OpenCode 衍生项目，并保留 OpenCode attribution。CoCo 仅研究其公开工程方法；任何未来源码复用必须单独进行 license、NOTICE、attribution 和商标审查。
