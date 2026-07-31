> pi 可以帮助你创建 pi 包。让它打包你的扩展、技能、提示词模板或主题。

# Pi 包

Pi 包将扩展、技能、提示词模板和主题打包，以便通过 npm 或 git 分享。包可以在 `package.json` 的 `pi` 键下声明资源，或使用约定目录。

## 目录

- [安装和管理](#安装和管理)
- [包来源](#包来源)
- [创建 Pi 包](#创建-pi-包)
- [包结构](#包结构)
- [依赖](#依赖)
- [包筛选](#包筛选)
- [启用和禁用资源](#启用和禁用资源)
- [作用域和去重](#作用域和去重)

## 安装和管理

> **安全性：** Pi 包以完整系统访问权限运行。扩展会执行任意代码，技能可以指示模型执行包括运行可执行文件在内的任何操作。安装第三方包前请审查源代码。

```bash
pi install npm:@foo/bar@1.0.0
pi install git:github.com/user/repo@v1
pi install https://github.com/user/repo  # 原始 URL 同样可用
pi install /absolute/path/to/package
pi install ./relative/path/to/package

pi remove npm:@foo/bar
pi list                     # 显示设置中的已安装包
pi update                   # 仅更新 pi
pi update --all             # 更新 pi、更新包，并协调固定的 git ref
pi update --extensions      # 仅更新包并协调固定的 git ref
pi update --models          # 仅刷新模型目录
pi update --self            # 仅更新 pi
pi update --self --force    # 即使当前版本已是最新，也重新安装 pi
pi update npm:@foo/bar      # 更新一个包
pi update --extension npm:@foo/bar
```

这些命令管理 pi 包，而 `pi update` 可以更新 pi CLI 安装。要卸载 pi 本身，请参阅[快速入门](quickstart.md#uninstall)。

默认情况下，`install` 和 `remove` 写入用户设置（`~/.pi/agent/settings.json`）。使用 `-l` 改为写入项目设置（`.pi/settings.json`）。项目设置可与团队共享；项目受信任后，pi 会在启动时自动安装缺少的包。

要在不安装的情况下试用包，请使用 `--extension` 或 `-e`。这只会为当前运行安装到临时目录：

```bash
pi -e npm:@foo/bar
pi -e git:github.com/user/repo
```

## 包来源

Pi 在设置和 `pi install` 中接受三种来源类型。

### npm

```
npm:@scope/pkg@1.2.3
npm:pkg
```

- 带版本的规格会被固定，包更新（`pi update --extensions`、`pi update --all`）会跳过它们。
- 用户安装位于 `~/.pi/agent/npm/`。
- 项目安装位于 `.pi/npm/`。
- 在 `settings.json` 中设置 `npmCommand`，可将 npm 包查询和安装操作固定到如 `mise` 或 `asdf` 的特定包装命令。

示例：

```json
{
  "npmCommand": ["mise", "exec", "node@20", "--", "npm"]
}
```

### git

```
git:github.com/user/repo@v1
git:git@github.com:user/repo@v1
https://github.com/user/repo@v1
ssh://git@github.com/user/repo@v1
```

- 没有 `git:` 前缀时，仅接受协议 URL（`https://`、`http://`、`ssh://`、`git://`）。
- 带有 `git:` 前缀时，可接受简写格式，包括 `github.com/user/repo` 和 `git@github.com:user/repo`。
- 同时支持 HTTPS 和 SSH URL。
- SSH URL 自动使用已配置的 SSH 密钥（遵守 `~/.ssh/config`）。
- 对于非交互运行（例如 CI），可设置 `GIT_TERMINAL_PROMPT=0` 以禁用凭据提示，并设置 `GIT_SSH_COMMAND`（例如 `ssh -o BatchMode=yes -o ConnectTimeout=5`）以快速失败。
- ref 是固定的标签或提交。`pi update --extensions` 和 `pi update --all` 不会将其移动到较新的 ref，但会将现有克隆协调到配置的 ref。
- 使用 `pi install git:host/user/repo@new-ref` 更新设置，并将现有包移动到新的固定 ref。
- 克隆到 `~/.pi/agent/git/<host>/<path>`（全局）或 `.pi/git/<host>/<path>`（项目）。
- 协调改变检出内容时，pi 会重置并清理克隆；如果存在 `package.json`，再运行 `npm install`。

**SSH 示例：**
```bash
# git@host:path 简写（需要 git: 前缀）
pi install git:git@github.com:user/repo

# ssh:// 协议格式
pi install ssh://git@github.com/user/repo

# 带版本 ref
pi install git:git@github.com:user/repo@v1.0.0
```

### 本地路径

```
/absolute/path/to/package
./relative/path/to/package
```

本地路径指向磁盘上的文件或目录，并会在不复制的情况下添加到设置。相对路径相对于它们所在的设置文件解析。如果路径是文件，则加载为单个扩展；如果是目录，则 pi 使用包规则加载资源。

## 创建 Pi 包

在 `package.json` 中添加 `pi` 清单，或使用约定目录。加入 `pi-package` 关键字以便发现。

```json
{
  "name": "my-package",
  "keywords": ["pi-package"],
  "pi": {
    "extensions": ["./extensions"],
    "skills": ["./skills"],
    "prompts": ["./prompts"],
    "themes": ["./themes"]
  }
}
```

路径相对于包根目录。数组支持 glob 模式和 `!exclusions`。

### 图库元数据

[包图库](https://pi.dev/packages)显示标记为 `pi-package` 的包。添加 `video` 或 `image` 字段以显示预览：

```json
{
  "name": "my-package",
  "keywords": ["pi-package"],
  "pi": {
    "extensions": ["./extensions"],
    "video": "https://example.com/demo.mp4",
    "image": "https://example.com/screenshot.png"
  }
}
```

- **video**：仅 MP4。在桌面端，悬停时自动播放。点击会打开全屏播放器。
- **image**：PNG、JPEG、GIF 或 WebP。显示为静态预览。

若两者都设置，视频优先。

## 包结构

### 约定目录

如果不存在 `pi` 清单，pi 会从这些目录自动发现资源：

- `extensions/` 加载 `.ts` 和 `.js` 文件
- `skills/` 递归查找 `SKILL.md` 文件夹，并将顶层 `.md` 文件作为技能加载
- `prompts/` 加载 `.md` 文件
- `themes/` 加载 `.json` 文件

## 依赖

第三方运行时依赖属于 `package.json` 中的 `dependencies`。不注册扩展、技能、提示词模板或主题的依赖也属于 `dependencies`。pi 从 npm 或 git 安装包时会运行 `npm install`，因此会自动安装这些依赖。

Pi 为扩展和技能捆绑核心包。如果导入这些包中的任何一个，请在 `peerDependencies` 中以 `"*"` 范围列出它们，且不要捆绑它们：`@earendil-works/pi-ai`、`@earendil-works/pi-agent-core`、`@earendil-works/pi-coding-agent`、`@earendil-works/pi-tui`、`typebox`。

其他 pi 包必须捆绑在你的 tarball 中。将它们添加到 `dependencies` 和 `bundledDependencies`，然后通过 `node_modules/` 路径引用其资源。Pi 使用独立模块根目录加载包，因此不同安装不会冲突或共享模块。

示例：

```json
{
  "dependencies": {
    "shitty-extensions": "^1.0.1"
  },
  "bundledDependencies": ["shitty-extensions"],
  "pi": {
    "extensions": ["extensions", "node_modules/shitty-extensions/extensions"],
    "skills": ["skills", "node_modules/shitty-extensions/skills"]
  }
}
```

## 包筛选

在设置中使用对象形式筛选包加载的内容：

```json
{
  "packages": [
    "npm:simple-pkg",
    {
      "source": "npm:my-package",
      "extensions": ["extensions/*.ts", "!extensions/legacy.ts"],
      "skills": [],
      "prompts": ["prompts/review.md"],
      "themes": ["+themes/legacy.json"]
    }
  ]
}
```

`+path` 和 `-path` 是相对于包根目录的精确路径。

- 省略键会加载该类型的全部内容。
- 使用 `[]` 不加载该类型的任何内容。
- `!pattern` 排除匹配项。
- `+path` 强制包含精确路径。
- `-path` 强制排除精确路径。
- 筛选器叠加在清单之上。它们会缩小已允许加载的内容。

## 启用和禁用资源

使用 `pi config` 从已安装包和本地目录中启用或禁用扩展、技能、提示词模板和主题。`pi config` 在全局设置（`~/.pi/agent/settings.json`）中启动；按 Tab 可在全局和项目本地模式之间切换。使用 `pi config -l` 在项目覆盖设置（`.pi/settings.json`）中启动，其中继承的全局资源会显示为淡色。

## 作用域和去重

包可以同时出现在全局和项目设置中。若相同包同时出现，项目条目优先，除非项目条目具有 `autoload: false`，此时它会作为全局条目上的增量应用。身份由以下内容确定：

- npm：包名
- git：不含 ref 的仓库 URL
- 本地：解析后的绝对路径
