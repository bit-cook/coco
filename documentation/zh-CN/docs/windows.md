# Windows 设置

Pi 在 Windows 上需要 bash shell。检查位置如下，按顺序排列：

1. 来自 `~/.pi/agent/settings.json` 的自定义路径
2. Git Bash（`C:\Program Files\Git\bin\bash.exe`）
3. PATH 上的 `bash.exe`（Cygwin、MSYS2、WSL）

对大多数用户来说，[Git for Windows](https://git-scm.com/download/win) 已经足够。

## 自定义 Shell 路径

```json
{
  "shellPath": "C:\\cygwin64\\bin\\bash.exe"
}
```
