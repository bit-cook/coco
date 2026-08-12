# RFC：Product Manifest v1

## 状态

`Draft / additive / verification-only`

当前文件：`resources/product-manifest.v1.json`。

## 目标

统一当前重复的产品元数据：

- 产品和命令身份。
- CoCo 版本。
- Pi package/version baseline。
- Managed Provider IDs 和 credential environment names。
- 默认 provider/model/thinking/theme。
- Installer、offline 和 VSIX asset templates。
- Installer、offline builder 和实际发布 target。

## v1 非目标

- 不包含密钥、credential asset、digest 或 token。
- 不替代 `provider-model-seeds.v1.json`。
- 不替代 `provider-transformations.v1.json`。
- 不包含主题 palette。
- 不生成整个 `package.json` 或 `install.sh`。
- 不修改现有 runtime 行为。

## 迁移阶段

1. **Additive contract**：manifest + verifier，只检测 drift。
2. **Tests consume manifest**：测试不再重复版本和 Provider 常量。
3. **Generate leaf artifacts**：生成 identity module 和 provider registry。
4. **Runtime consumption**：state/auth/provider/bootstrap 使用 generated constants。
5. **Installer template**：只在生命周期测试证明 byte-equivalent 后迁移嵌入状态逻辑。

## 当前门禁

`scripts/verify-architecture-contracts.mjs` 校验：

- package、lock、VS Code、runtime identity、installer 和 capability matrix 版本一致。
- Pi dependency、lock integrity、patch inventory baseline 一致。
- Manifest Provider IDs 与 registry/seeds 一致。
- 默认模型存在于 seed。
- Bootstrap/installer 包含相同默认 provider/model/thinking/theme。
- Patch registry 和 capability evidence 完整。

该阶段故意不让生产 runtime 读取 manifest，以降低首次引入风险。
