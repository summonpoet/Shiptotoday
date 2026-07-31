# DingDing Zones — Windows Tauri MVP

## 直接运行

双击：

`release/DingDing-Zones-MVP.exe`

应用使用 Windows WebView2，数据保存在桌面应用自己的本地存储中，与浏览器版数据相互独立。

## 开发模式

```powershell
npm.cmd run desktop:dev
```

## 重新生成 Release

```powershell
npm.cmd test
npm.cmd run desktop:build
```

构建产物位于：

`src-tauri/target/release/dingding-zones.exe`

## 当前 MVP 范围

- 复用现有 HTML/CSS/JavaScript 产品代码
- 420 × 780 的紧凑 Windows 窗口
- 浏览器版与桌面版共用计时、计划、历史和 Dashboard 逻辑
- Windows 原生 check-in 通知
- WebView 本地持久化
- 独立 Windows 图标
