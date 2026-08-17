# Prime Agent 与 DeepSeek Harness 源码研究报告

最后审查：2026-08-17

本文在固定源码提交上研究两个外部Agent系统，并评估哪些机制值得加入CoCo。本文不是集成公告。本次研究没有把任何外部源码或依赖加入CoCo。

## 研究基线

| 项目 | 提交 | 状态 | 许可证 |
|---|---|---|---|
| Prime Agent | `849c92114b0b4372fa272281b87cdbe8f7c9ed8d` | active beta，快速演进 | MIT |
| DeepSeek Harness | `99f6f02fecdb7dff40c3fbc9470f5907c29f74ca` | `0.1.0-rc.7`，developer preview | MIT |

可复现源码清单记录在`development/research/prime-agent-deepseek-harness-snapshot.md`。

## 总体决策

CoCo不应整体嵌入任何一个runtime。

- Prime Agent在长任务daemon、命令恢复、递归Agent lineage和可回滚harness refinement方面很强；但持久Python执行和当前authority缺口与CoCo现阶段containment及global-only规则不兼容。
- DeepSeek Harness在event-sourced模型上下文、durability fence、有序工具执行、provider generation、原子reload和插件生命周期方面很强；但整体Cordis架构、248-package粒度、developer-preview API、无认证LAN姿态和不完整sandbox不适合作为CoCo基础。

正确路线是通过CoCo自己的contract和测试吸收机制，而不是导入框架。

## Prime Agent架构

Prime Agent分离UI client、daemon supervisor、worker、root/child Agent session、持久IPython kernel和JSONL/artifact状态。Supervisor负责路由、attachment、worker generation、恢复、Agent消息和权威RLM spawn ledger；每个worker负责一个root session family。

模型主要只有一个可编程IPython工具。文件、shell、skill、memory和递归subagent都通过持久Python环境进入。Continual harness保存补充prompt note、memory、skill描述和subagent spec，并保留refinement历史与rollback。

### 值得采用的机制

1. **Host continuation policy**：模型准备停止时，由host根据用户follow-up、goal、预算和quality gate决定是否继续。CoCo应统一goal、loop、schedule和durable task continuation。
2. **Steering/follow-up双队列**：steering只在在途tool边界后进入；follow-up只在Agent准备停止时进入，为用户输入、heartbeat和Agent消息提供确定性边界。
3. **Command recovery journal**：执行前持久化command receipt，响应前持久化result；重复ID返回durable result，未知副作用进入明确`uncertain`而不是重放。
4. **Worker generation fencing**：恢复worker使用新generation；旧worker不能提交结果；孤儿进程被协调，不确定工作产生可见中断标记。
5. **PID加进程启动身份lease**：抵抗PID reuse，并支持stale owner原子接管。
6. **权威lineage ledger**：child topology是supervisor拥有的append-only状态，不从transcript推导。
7. **可审查continual harness**：小型、证据支持、可回滚的提案有价值，但CoCo中必须经过授权和事务提交。

### 风险与拒绝项

- IPython按用户权限执行，不是sandbox。
- 示例shell sandbox不能限制Python文件、网络、环境变量或subprocess。
- Global harness修改缺少CoCo要求的授权与provenance。
- Harness整文件更新需要更强的锁、CAS、atomic rename和fsync。
- 研究到的Jupyter接收路径存在HMAC验证疑点。
- Recursive child必须有硬并发、速率、token、时间和费用总预算。
- 在真实containment和secret isolation完成前，暂缓持久Python kernel。
- 在有界redaction和逐次明确同意前，暂缓完整trace upload。

## DeepSeek Harness架构

DeepSeek Harness几乎把一切组合成Cordis plugin。Profile通过bundle和patch组成plugin tree。Host、Agent和Client平面使用scoped service、typed event、可逆effect和per-agent isolation。

Session是append-only event log。Turn、step、模型输入输出、tool call/result和stop reason都是durable event。模型请求从日志派生，并由runtime invariant强制“model-visible means logged”。

### 值得采用的机制

1. **模型输入ledger invariant**：模型看到的每个byte都必须能从durable session state重建；CoCo应比较真实request projection与持久证据。
2. **外部副作用前durability fence**：调用provider、Bash或MCP前先flush intent；持久化失败时外部调用次数必须为0。
3. **Tool-call闭合**：每个已接纳tool call恰好有一个terminal result，取消或恢复也生成带原因的synthetic result。
4. **有界有序tool pool**：只有显式safe工具可并行；exclusive工具形成barrier；result按请求顺序提交。
5. **Provider generation snapshot**：在途request绑定一个已验证provider/config/credential generation，新请求原子采用下一代。
6. **MCP两阶段reload**：先拉取并验证完整tool generation，再发布；失败保留last-good集合。
7. **Last-good配置和revision CAS**：写入串行并比较revision；非法外部修改不能替换live配置。
8. **事务式Agent发布**：prepare/setup全部成功后才发布live handle；失败清理所有部分注册。
9. **Runtime invariant registry**：用稳定错误码和生命周期绑定检查增强诊断，不必耦合core loop。

### 风险与拒绝项

- 项目明确是developer preview。
- 引入Cordis和248-package分解会显著放大CoCo所有权、构建与发布风险。
- 无强认证的LAN访问与CoCo loopback/token策略冲突。
- 复杂schema下secret redaction可能fail-open。
- MCP stdio是本地代码执行，可能绕开统一subprocess/sandbox。
- 文件effect sandbox不等于网络或进程containment。
- 通用module HMR和plugin-owned settings UI仍不成熟；CoCo只应采用已验证配置generation。

## CoCo适配分析

CoCo已有必须保持权威的生产基础：

- runtime和package integrity；
- durable task、worktree provisioning、supervisor authorization/outcome、terminal evidence、log和receipt；
- managed/custom provider和global MCP；
- goal/session状态及execution evidence对象模型；
- global-only project-resource policy。

真正缺口是：pre-authorization确定性恢复、真实process containment、真实adapter执行、command级幂等、model-input evidence、所有外部副作用前durability fence，以及原子provider/MCP配置generation。

## 采用矩阵

| 机制 | 决策 | 最早阶段 |
|---|---|---|
| Command recovery journal与明确uncertain结果 | 通过CoCo state transaction采用 | RUN-001后，`0.6.x` |
| Model-visible-means-logged invariant | 在session/task evidence中原型 | `0.7.0` |
| Model/Bash/MCP前durability fence | 采用 | `0.7.0` |
| 有序、有界safe-tool并行 | 以显式capability metadata原型 | `0.7.0` |
| Provider generation snapshot | 采用 | `0.7.0` |
| MCP原子last-good reload | 原型 | `0.7.0` |
| Config revision CAS和last-good state | 采用 | `0.7.0` |
| 权威parent/child lineage ledger | task recovery完成后原型 | `0.7.0` |
| Steering/follow-up双队列 | durable inbox设计后原型 | `0.7.0` |
| 可审查harness proposal | 授权/provenance完成前仅研究 | `0.8.0+` |
| 持久Python RLM kernel | 暂缓 | containment和secret isolation后 |
| 整体迁移Cordis | 拒绝 | 不计划 |
| 无认证LAN Web control | 拒绝 | 不兼容 |
| 把文件sandbox当完整安全边界 | 拒绝 | 不兼容 |

## 对开发计划的修改

研究新增五个`development/work-items/0.7.0/`候选工作包：

- `EVID-001-model-input-ledger.md`
- `EVID-002-durability-fence.md`
- `TOOL-001-ordered-tool-pool.md`
- `CFG-001-provider-mcp-generations.md`
- `ORCH-001-lineage-and-continuation.md`

这些工作包均为`pending`，并受`0.6.2` P0发布/恢复工作阻塞。本文不授权任何外部runtime、dependency、project-local skill或plugin。

## 采用硬门槛

任何外部机制或源码提案必须提供：

```text
固定源码commit和许可证provenance
依赖与发布closure
global-only安装，禁止project-local自动加载
明确workspace/network/secret/process capability声明
supervisor authorization、outcome、receipt和crash recovery
有界output、并发、时间、token和费用
containment声明不得强于平台证据
rollback和last-good行为
聚焦fault test及完整CoCo门禁
```

任何一项不满足，提案直接拒绝，不能用功能评分抵消。
