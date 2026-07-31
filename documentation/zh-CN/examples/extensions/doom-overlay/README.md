# DOOM 覆盖层演示

在 pi 中以覆盖层运行 DOOM。演示覆盖层系统能够以 35 FPS 处理实时游戏渲染。

## 用法

```bash
pi --extension ./examples/extensions/doom-overlay
```

然后运行：
```
/doom-overlay
```

共享软件 WAD 文件（约 4MB）会在首次运行时自动下载。

## 控制

| 操作 | 按键 |
|--------|------|
| 移动 | WASD 或方向键 |
| 奔跑 | Shift + WASD |
| 开火 | F or Ctrl |
| 使用/打开 | Space |
| 武器 | 1-7 |
| 地图 | Tab |
| 菜单 | Escape |
| 暂停/退出 | Q |

## 工作原理

DOOM 以从 [doomgeneric](https://github.com/ozkl/doomgeneric) 编译得到的 WebAssembly 运行。每一帧均以半块字符（▀）和 24 位颜色渲染，其中上方像素为前景色、下方像素为背景色。

覆盖层使用：
- `width: "90%"`：终端宽度的 90%
- `maxHeight: "80%"`：终端高度的最大 80%
- `anchor: "center"`：在终端中居中

高度根据宽度计算，以保持 DOOM 的 3.2:1 宽高比（已考虑半块渲染）。

## 致谢

- [id Software](https://github.com/id-Software/DOOM)：原始 DOOM
- [doomgeneric](https://github.com/ozkl/doomgeneric)：可移植的 DOOM 实现
- [pi-doom](https://github.com/badlogic/pi-doom)：原始 pi 集成
