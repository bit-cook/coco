# CoCo 全面工程审查与开发计划

最后审查：2026-08-16

本文记录 CoCo `0.6.1` 发布后的全面工程审查，以及由风险和收益决定的后续开发顺序。本文是风险与执行计划，不表示其中列出的改进已经全部实现。

## 已验证基线

本次审查基于已提交、已发布的版本：

```text
版本: 0.6.1
提交: b88190b4433c292f6adeb01273d60cb284deb45a
标签: v0.6.1
发布 workflow: 通过
发布资产: 9/9 齐全
npm 发布: 未执行
```

发布证据包括：完整 core `472/472`、integrity `37/37`、175 个 manifest 的 package closure、发布 scanner clean、在线安装生命周期、离线包和 VS Code 资产，以及 SHA-256 清单。

在发布候选主机上，`coco --list-models` 的启动性能从冷启动约 15.74 秒、热启动约 6.19 秒，改善到冷启动 9.37 秒、热启动 2.18 秒。

## 审查决策

下一周期不应先增加普通用户功能。收益最高的路线是先发布安全与可靠性修复版，再处理长期运行扩展性，最后明确平台支持策略。

建议版本顺序：

```text
0.6.2  发布安全与任务恢复
0.7.0  长期状态、保留策略与 Control 扩展性
0.8.0  平台交付闭包（如果决定扩大平台支持）
```

## P0：发布安全

### 隔离发布凭据

当前 release job 在 checkout、安装依赖、build 和测试期间一直持有 `contents: write`。必须拆为：

1. 只读的 build-and-verify job，并禁止 checkout 持久化凭据。
2. 最小权限 publish job，只下载与 digest 绑定的资产，不执行仓库代码或依赖安装。

验收标准：

- build 和测试步骤无法读取仓库写 token。
- publish job 不运行 `npm ci`、build、测试或 package script。
- 发布前验证 build job 输出的精确 artifact digest。

### 原子、不可变发布

发布必须 draft-first，禁止使用 `--clobber`。

验收标准：

- 失败的发布只能保留为私有 draft。
- 资产名称和数量必须精确匹配预期清单。
- 公开前重新下载并验证size和SHA-256。
- 在线安装、离线全新安装、卸载和VSIX结构验证全部完成后才能公开。
- workflow重跑不能替换已有tag/version下的资产。

### 绑定离线包与公开主包

当前offline builder会再次执行一次`npm pack`。它必须改为只消费已经验证的公开tarball。

验收标准：

```text
SHA256(公开 coco-<version>.tgz)
  == SHA256(离线 ZIP / coco-package.tgz)
```

offline builder必须显式接收tarball路径和预期digest。

### 收紧package和archive验证

- 强制要求`package-lock.json`，不能把无关`ENOENT`误判为lock可缺失。
- 分别验证每个直接bundled dependency。
- 要求离线`SHA256SUMS`具有精确成员闭包。
- 离线tar解压前检查canonical path、重复项、类型和prefix conflict。
- 增加独立npm token等高置信scanner规则。
- 验证Node签名checksum，或在仓库中固定Node archive digest。

## P0：任务恢复与Containment

### Durable supervisor launch FSM

持久化完整启动序列：

```text
prepared -> registered -> authorized -> outcome
                         -> revoked
prepared/registered -> abandoned
```

未授权且进程不存在的run必须abandon，并使用新run ID重排。已授权但进程消失且没有outcome的run必须保持`EXECUTION_OUTCOME_IN_DOUBT`，禁止自动重复执行。

故障测试必须在每个transition后杀死runner或supervisor，并证明最终收敛、不会重复执行、不会永久停留在`running`。

### 真实进程Containment

进程组不是完整的containment边界，因为child可以detached或创建新session。

建议实现：

- Linux：每个run使用独立cgroup v2，通过`cgroup.kill`终止。
- Windows：Job Object。
- macOS和其他POSIX：显式后代追踪，或明确声明更弱的保证。

只有containment为空时，才能报告终止成功。

### 恢复webhook dispatch

Webhook acceptance和task queueing已经持久化，但runner dispatch还需要持久outbox：

```text
delivery accepted -> task queued -> dispatchPending
runner ownership observed -> dispatchPending cleared
```

相同delivery重试时，如果task仍queued，必须幂等重试dispatch。

### 隔离坏任务

无效或不存在的`cwd`、非Git worktree请求和永久provisioning错误只能block或fail当前任务，不能终止全局runner或让后续任务饥饿。

### 修复stop和输出恢复

- 使用一个严格的stopping barrier schema：`ownerPid`、`ownerIdentity`和`operationId`。
- 只有barrier owner可以清除它。
- 非法UTF-8应确定性替换并记录encoding loss，不能反复阻塞terminal recovery。
- 无人值守任务进程使用最小环境allowlist。

## P1：长期运行能力（`0.7.0`）

### 状态保留策略

- 分离active task和terminal history。
- 按时间和数量归档terminal task。
- 增加`coco task prune`和认证后的Control操作。
- 对task、log、receipt、supervisor artifact、worktree、branch和compile cache使用统一retention policy。
- 轮转`runner.log`和`control.log`。

系统在超过10,000条历史任务后仍必须能创建新任务。

### Control扩展性

- Task summary分页。
- 只在用户展开task时读取detail。
- 用单个可取消、不可重入的刷新循环替代重叠的3秒轮询。
- 显示连接错误和最后成功刷新时间。
- 增加100、1,000和10,000条任务的基准。

### 运维可见性

`coco doctor`应显示task数量、state bytes、runtime和compile-cache用量、保留的worktree、磁盘和inode余量、pending dispatch以及恢复阻塞。

## P2：平台闭包（`0.8.0`或独立平台版本）

产品必须明确选择，而不是通过部分代码路径暗示支持。

### 方案A：只支持Linux和macOS

- 在安装器、npm preflight和文档中明确Windows不受支持。
- 增加macOS全新安装、升级、Control lifecycle、任务取消和卸载smoke。

### 方案B：完整支持Windows

- 增加PowerShell安装与卸载流程。
- 发布并测试Windows离线包。
- 使用Job Object实现任务containment。
- 增加Windows Control、runner、升级和cleanup生命周期测试。

无论选择哪种方案，CI都应覆盖最低支持Node版本、installer固定Node版本和当前LTS，并覆盖每个受支持操作系统。

## 暂缓的工作

以下工作不能挤占P0批次：

- Dashboard视觉重做。
- 新Agent能力或编排模式。
- 没有具体用户需求的新provider。
- 在没有installer和生命周期证据前扩大Windows支持声明。
- 任何削弱integrity或race检测的进一步启动捷径。

## 执行顺序

1. 将`0.6.2`范围冻结为发布安全和确定性任务恢复。
2. 实现release凭据隔离和draft-first发布。
3. 实现supervisor launch recovery、stopping barrier修复、webhook dispatch outbox、无效任务隔离和UTF-8恢复。
4. 决定Linux cgroup containment进入`0.6.2`，还是紧随其后的`0.6.3`。
5. 运行聚焦crash和supply-chain测试。
6. 只生成一次governed assets。
7. 运行完整core、integrity、package、offline、VSIX和lifecycle门禁。
8. 只从committed bytes发布，并且只在draft资产生命周期通过后公开。

## 发布退出标准

`0.6.2`只有在以下条件全部满足时才可发布：

```text
release build不持有写凭据
发布失败不能暴露部分release
release资产不能被覆盖
offline和公开tarball digest完全一致
所有pre-authorization crash状态最终收敛
单个无效任务不能毒化队列
重复webhook可以恢复pending dispatch
并发stop只能选出一个owner
非法UTF-8不能阻止terminal evidence
完整core、integrity、package和lifecycle门禁通过
```
