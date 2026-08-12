# Artifact Patch 清单与冻结规则

## 结论

CoCo `v0.5.2` 的 `scripts/apply-coco-identity-patch.mjs` 有 1111 行，包含 8 个独立 `patch*` 写入函数和一个总编排函数。它已经不只是品牌补丁，而是承担了主题、汉化、模型列表、登录流程、设置展示、输入提示和视觉系统。

机器可读清单位于 `resources/patch-inventory.v1.json`。`node scripts/verify-architecture-contracts.mjs` 会扫描实际 `patch*` 函数；新增函数没有登记时返回 `UNREGISTERED_PATCH_FUNCTION`。

## 冻结规则

1. 不允许把新的战略产品能力加入 monolithic artifact patch。
2. 紧急兼容补丁必须登记 owner、测试、迁移目标和移除条件。
3. 一个 patch domain 未迁移前，可以维护已发布行为，但不能扩张职责。
4. 通用修复优先准备上游贡献；CoCo 特有行为进入 CoCo source layer。
5. Patch 失败必须 fail closed，不允许在未知 anchor 上猜测写入。

## 当前域

| 域 | 函数 | 风险 | 迁移目标 |
|---|---|---|---|
| Identity/startup/runtime | `applyCocoIdentityPatch` | Critical | Source-owned identity、startup 和 model visibility |
| Themes | `patchRuntimeDefaultTheme`、`patchBuiltinThemeRegistry` | High | Package-owned theme registry |
| Secret input | `patchSecretExtensionInput` | High | Typed native secret input |
| Localization | `patchUiLanguage`、`patchSettingsValueDisplay`、`patchAutocompleteSourceLabels` | Critical | Stable-key typed i18n |
| Visual system | `patchTuiVisualSystem`、`patchInputPrompt` | High | TUI primitives 和 semantic tokens |

## 已确认风险

- 初始 patch 在内存中预处理，但后置 patch 逐个写入，不是一个文件系统事务。
- tracked `dist`、bundled coding-agent 和 nested pi-tui 的覆盖范围不一致。
- Localization 多处以 import 存在作为完成标记，不能证明每个替换都成功。
- 部分视觉替换找不到 anchor 时会静默不修改。
- `patchAutocompleteSourceLabels` 找不到方法边界时直接返回。
- Secret input 的运行时 JS 支持 `secret`，但声明文件未同步该类型。
- Upstream version 精确到 `0.82.1`，但没有 source commit provenance。

## 迁移次序

1. Product manifest 和 Provider lifecycle。
2. Stable-key i18n。
3. TUI theme/primitives。
4. Model visibility、login routing 和 startup composition。
5. 删除剩余 identity-only patch。

目标：6 个月减少 60%，12 个月减少 85%。
