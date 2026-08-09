# CoCo 终端 UI 设计契约

本文档约束 CoCo 交互式 TUI 的所有修复和扩展。CoCo 使用现有的 pi-tui 组件模型：组件渲染有宽度限制的 ANSI 行，接收主题语义，并在主题变化时使缓存的主题输出失效。

## 1. 产品意图和布局

- CoCo 是安静、紧凑的终端编码代理，不是记录查看器。
- 启动后直接进入编辑器，只显示必要的页眉、编辑器和页脚区域。它不会在终端中打印横幅、帮助面板、最近活动或解释性记录。
- 详细帮助和折叠的工具输出属于按需披露内容，不属于启动内容。`Ctrl+O` 展开或折叠工具输出；其提示应位于上下文帮助中，而不是持久的启动记录中。
- 概念上的屏幕区域固定不变：顶部是页眉，编辑器上方的流中是记录，底部是编辑器和页脚。重新渲染必须保持这一组成，不得把终端已保存的历史当作一个区域。

## 2. 颜色基础

所有主题值均为规范 Solarized 颜色。实现只能通过命名主题变量和语义化 pi 主题令牌使用这些值。

| 令牌 | 值 | 作用 |
|---|---|---|
| `base03` | `#002b36` | 最深的深色背景 |
| `base02` | `#073642` | 深色抬高/背景表面 |
| `base01` | `#586e75` | 深色强调/弱化边框 |
| `base00` | `#657b83` | 深色弱化文本 |
| `base0` | `#839496` | 深色主要文本 |
| `base1` | `#93a1a1` | 浅色弱化文本 |
| `base2` | `#eee8d5` | 浅色抬高/背景表面 |
| `base3` | `#fdf6e3` | 浅色页面背景 |
| `yellow` | `#b58900` | 警告/标题 |
| `orange` | `#cb4b16` | 待处理/注意 |
| `red` | `#dc322f` | 错误/移除 |
| `magenta` | `#d33682` | 高思考级别 |
| `violet` | `#6c71c4` | 自定义标签/超高思考 |
| `blue` | `#268bd2` | 强调/链接/低思考级别 |
| `cyan` | `#2aa198` | 已选中/中等思考级别 |
| `green` | `#859900` | 成功/添加 |

深色模式使用 `base03` 作为底色，使用 `base02` 作为抬高表面，使用 `base0` 作为文本，使用 `base01`/`base00` 表示弱化层次。浅色模式使用 `base3` 作为底色，使用 `base2` 作为抬高表面，使用 `base00` 作为文本，使用 `base01`/`base1` 表示弱化层次。

## 3. 语义主题映射

| 语义令牌 | 深色 | 浅色 |
|---|---|---|
| `text`, `toolTitle` | `base0` | `base00` |
| `muted`, `thinkingText`, `toolOutput` | `base01` | `base01` |
| `dim` | `base00` | `base1` |
| `accent`, `borderAccent`, `mdCode`, `mdListBullet` | `cyan` | `cyan` |
| `border`, `mdLink`, `syntaxKeyword` | `blue` | `blue` |
| `borderMuted`, `mdQuoteBorder`, `mdHr` | `base01` | `base1` |
| `success`, `toolDiffAdded`, `syntaxString` | `green` | `green` |
| `bashMode` | `orange` | `orange` |
| `warning`, `mdHeading`, `syntaxFunction` | `yellow` | `yellow` |
| `error`, `toolDiffRemoved` | `red` | `red` |
| `customMessageLabel`, `thinkingXhigh` | `violet` | `violet` |
| `syntaxNumber`, `thinkingHigh` | `magenta` | `magenta` |
| `syntaxType`, `syntaxVariable` | `blue` | `blue` |
| `syntaxComment`, `syntaxPunctuation`, `syntaxOperator` | `base01` | `base01` |
| `mdLinkUrl`, `mdQuote`, `toolDiffContext` | `base00` | `base1` |
| `thinkingOff`, `thinkingMinimal` | `base00` | `base1` |
| `thinkingLow`, `thinkingMedium` | `blue`, `cyan` | `blue`, `cyan` |
| `thinkingMax` | `red` | `red` |

`selectedBg`、`userMessageBg`、`customMessageBg`、`toolPendingBg`、`toolSuccessBg` 和 `toolErrorBg` 在深色模式使用 `base02`，在浅色模式使用 `base2`。现有组件 API 要求这些中性的背景令牌，前景色、标题色和边框色继续表达工具状态。

## 4. 字体和密度

- 字体是终端继承的等宽字体、大小、粗细、行高和回退行为。CoCo 不设置网页字体、自定义字体大小或图形化字号层级。
- 内容使用普通终端文本，只对有助于快速浏览的标签使用 ANSI 粗体，并用语义前景色表达层次。不得只用颜色传达状态。
- 保持组件系统紧凑的单字符水平内边距和有宽度限制的行渲染。使用 ANSI 安全的辅助函数截断或换行；任何一行都不得超过给定终端宽度。

## 5. 组件契约

- **页眉：** 单行紧凑的身份/状态行。可以显示活动模型或会话上下文，但绝不能是引导横幅。强调色为 `cyan`，次要详情使用 `muted` 或 `dim`。
- **记录和终端回滚：** 对话和工具输出在正常终端流中渲染。终端模拟器负责回滚、选择、复制和历史导航。CoCo 不创建鼠标报告模式、应用内记录视口、滚动条或另一套回滚模型。
- **编辑器边框：** 编辑器保持稳定的底部区域。空闲时使用 `borderMuted`，聚焦或选中时使用 `borderAccent`，思考级别使用配置的思考语义，`!` 模式使用 `bashMode`。边框表达模式，但不应与输入文本争夺注意力。
- **页脚：** 概念上固定在编辑器下方，保持紧凑，并且只使用前景色。页脚元数据使用 `dim` 前景文本，只有在上下文阈值有意义时才使用语义 `warning` 或 `error`。不得设置绿色、不透明或其他有色背景。
- **消息和工具：** 用户/自定义消息使用语义消息令牌，助手文本继承 `text`。工具标题、输出、差异、待处理、成功和错误表面使用对应语义令牌。工具详情默认折叠，`Ctrl+O` 是展开控制。不要输出隐藏的启动工具记录。

## 6. 渲染、输入和动效

- 全量重绘可以清除可见视口，但绝不能擦除或重写终端模拟器已经保存到回滚中的行。
- 渲染出的 ANSI 行独立重置样式。缓存主题字符串的组件必须在主题变化后的 `invalidate()` 中重建它们。
- 键盘是唯一必需的交互表面。不要启用鼠标报告来实现记录导航或视口。保留终端正常的选择和滚轮/键盘回滚行为。
- 这是终端 UI：不使用装饰性动画、定时视觉效果或非必要移动。流式输出和状态变化只能更新内容。

## 7. 无障碍和兼容性

- 使用 Solarized 设计的深色（`base0` 位于 `base03` 上）和浅色（`base00` 位于 `base3` 上）组合保持高对比度。不要使用 `green` 作为页脚/默认文本，也不要只依赖色相来表示警告、错误、成功、选中或思考状态。
- 每个交互动作都必须能通过键盘发现，并保留终端和 IME 光标行为。按键提示必须是简洁的纯文本。
- Netcatty 是一项一等终端约束：启动过程保持安静，模拟器保留原生回滚，CoCo 避免鼠标协议/报告以及会捕获普通滚动的内部记录视口。
- 在可用时支持真彩色，否则使用 pi-tui 的终端颜色回退。绝不要假设特定终端字体、单元格大小、光标形状或硬件光标可见性。

## 8. 已接受的债务和交付边界

- CoCo 依赖上游 Bun/pi-tui 生成的构建产物。定向修复可以修改或包装已发布产物，但在存在受维护的源代码流水线之前，重新生成和上游源码归属不在本契约范围内。
- 原生终端回滚有意交给终端模拟器处理。CoCo 无法统一回滚容量、保留策略、选择行为或终端特定的重绘问题，只能避免破坏它们。
- 仅限 Web 的设计原语、鼠标驱动的记录控件、图形滚动条或自定义字体假设都不属于本 TUI 契约。
