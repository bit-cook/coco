# 终端设置

Pi 使用 [Kitty 键盘协议](https://sw.kovidgoyal.net/kitty/keyboard-protocol/)可靠地检测修饰键。大多数现代终端都支持此协议，但有些终端需要配置。

## Kitty、iTerm2

开箱即用。

## Apple Terminal

Pi 会在可用时启用增强按键报告。如果 Terminal.app 对 `Shift+Enter` 仍发送普通 Return，pi 会使用本地 macOS 修饰键回退机制，将该 Return 识别为 `Shift+Enter`。

此回退机制只有在 pi 与 Terminal.app 运行于同一台 Mac 时才有效。通过远程 SSH 时，它无法检测本地键盘。

## Ghostty

添加到 Ghostty 配置中（macOS 为 `~/Library/Application Support/com.mitchellh.ghostty/config`，Linux 为 `~/.config/ghostty/config`）：

```
keybind = alt+backspace=text:\x1b\x7f
```

较早版本的 Claude Code 可能添加过以下 Ghostty 映射：

```
keybind = shift+enter=text:\n
```

该映射会发送原始换行字节。在 pi 中，它无法与 `Ctrl+J` 区分，因此 tmux 和 pi 将无法再看到真正的 `shift+enter` 按键事件。

如果你添加该映射的唯一原因是 Claude Code 2.x 或更新版本，可以删除它。但如果你想在 tmux 中使用 Claude Code，则仍需要该 Ghostty 映射。

Pi 将 `Ctrl+J` 绑定为默认换行别名，因此通过该重新映射，`Shift+Enter` 在 tmux 中无需额外的 pi 配置也能继续工作。

## WezTerm

WezTerm 通常通过 xterm modifyOtherKeys 开箱即用地支持 `Shift+Enter`。如需明确使用 Kitty 键盘协议，请创建 `~/.wezterm.lua`：

```lua
local wezterm = require 'wezterm'
local config = wezterm.config_builder()
config.enable_kitty_keyboard = true
return config
```

在 macOS 上，WezTerm 默认将 `Option+Enter` 绑定为全屏。要将 `Option+Enter` 用于 pi 的后续排队，请添加以下按键覆盖：

```lua
local wezterm = require 'wezterm'
local config = wezterm.config_builder()
config.keys = {
  {
    key = 'Enter',
    mods = 'ALT',
    action = wezterm.action.SendString('\x1b[13;3u'),
  },
}
return config
```

如果已有 `config.keys` 表，请将该条目添加进去。

在 WSL 上，WezTerm 可能需要可见的硬件光标来定位 IME 候选窗口。如果 CJK IME 候选项不跟随文本光标，请在运行 pi 前设置 `PI_HARDWARE_CURSOR=1`，或在设置中将 `showHardwareCursor` 设为 `true`。

## Alacritty

Alacritty 通常可以开箱即用地支持 `Shift+Enter`。在 macOS 上，`Option+Enter` 可能会作为普通 `Enter` 到达。要将 `Option+Enter` 用于 pi 的后续排队，请添加到 `~/.config/alacritty/alacritty.toml`：

```toml
[[keyboard.bindings]]
key = "Enter"
mods = "Alt"
chars = "\u001b[13;3u"
```

修改配置后重启 Alacritty。

## VS Code（集成终端）

VS Code 1.109.5 及更高版本默认在集成终端中启用 Kitty 键盘协议，因此 `Shift+Enter` 应该可以开箱即用。

低于 1.109.5 的 VS Code 版本需要为 `Shift+Enter` 明确设置终端键绑定。

`keybindings.json` 的位置：
- macOS：`~/Library/Application Support/Code/User/keybindings.json`
- Linux：`~/.config/Code/User/keybindings.json`
- Windows：`%APPDATA%\\Code\\User\\keybindings.json`

添加到 `keybindings.json`：

```json
{
  "key": "shift+enter",
  "command": "workbench.action.terminal.sendSequence",
  "args": { "text": "\u001b[13;2u" },
  "when": "terminalFocus"
}
```

## Windows Terminal

添加到 `settings.json`（Ctrl+Shift+，或“设置 → 打开 JSON 文件”），以转发 pi 使用的带修饰键 Enter：

```json
{
  "actions": [
    {
      "command": { "action": "sendInput", "input": "\u001b[13;2u" },
      "keys": "shift+enter"
    },
    {
      "command": { "action": "sendInput", "input": "\u001b[13;3u" },
      "keys": "alt+enter"
    }
  ]
}
```

- `Shift+Enter` 插入换行。
- Windows Terminal 默认将 `Alt+Enter` 绑定为全屏，这会阻止 pi 收到用于后续排队的 `Alt+Enter`。
- 将 `Alt+Enter` 重新映射到 `sendInput`，会将真实的按键组合转发给 pi。

如果已有 `actions` 数组，请将这些对象添加进去。如果旧的全屏行为仍然存在，请完全关闭并重新打开 Windows Terminal。

## xfce4-terminal、terminator

这些终端对转义序列的支持有限。带修饰键的 Enter，例如 `Ctrl+Enter` 和 `Shift+Enter`，无法与普通 `Enter` 区分，因此自定义键绑定（例如 `submit: ["ctrl+enter"]`）无法工作。

为了获得最佳体验，请使用支持 Kitty 键盘协议的终端：
- [Kitty](https://sw.kovidgoyal.net/kitty/)
- [Ghostty](https://ghostty.org/)
- [WezTerm](https://wezfurlong.org/wezterm/)
- [iTerm2](https://iterm2.com/)
- [Alacritty](https://github.com/alacritty/alacritty)（需要编译时支持 Kitty 协议）

## IntelliJ IDEA（集成终端）

内置终端对转义序列的支持有限。在 IntelliJ 的终端中，Shift+Enter 无法与 Enter 区分。

如果希望显示硬件光标，请在运行 pi 前设置 `PI_HARDWARE_CURSOR=1`（为兼容性考虑，默认禁用）。

为了获得最佳体验，可以考虑使用专用终端模拟器。
