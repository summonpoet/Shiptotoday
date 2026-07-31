# Ship to Today · Capacitor iOS MVP

## 第一阶段当前范围

- 复用浏览器与 Windows 版本的 HTML/CSS/JavaScript 核心。
- 使用 Capacitor 8 原生 iOS 容器，最低系统版本为 iOS 15。
- 使用 iOS 本地通知预排下一个 Check-in 或任务结束提醒。
- 活动任务、Away、Check-in 和休息状态保存在本地；应用进程被暂停或回收后，可按墙上时间恢复。
- iOS 后台时间不计为自动 Away。自动 Away 只根据应用前台两分钟无触控/键盘输入判定；手动 Pause 仍记为 Away。
- 使用安全区域和 44pt 最小触控目标适配 iPhone。

## 本地命令

```powershell
npm.cmd install
npm.cmd test
npm.cmd run serve
npm.cmd run ios:sync
```

根目录的 `dingding_zones.html`、`src/` 和 `vendor/` 是唯一产品源码。
`npm test` 和公开网站的 `dev/build/test` 命令都会先把它同步到
`web-easy/public/app/`。Windows 与 iOS 也从同一份源码生成，不应直接编辑
`dist/`、`dist-ios/`、`web-easy/public/app/` 或 `ios/App/App/public/`。

Windows 可以生成和同步 Xcode 工程，但不能运行 Xcode 编译。原生编译由
`codemagic.yaml` 中的 macOS 云端工作流完成。

## 无 Apple 账号验证

将仓库连接到 Codemagic 后运行：

`Ship to Today · iOS simulator validation`

该工作流不签名、不上传 TestFlight，只验证 Xcode、Swift Package Manager、
Capacitor App 生命周期插件和 Local Notifications 插件可以共同编译，并产出
`App.app` 模拟器包。

## 第二阶段才需要的账号操作

TestFlight 签名与上传配置将在 Apple Developer Program、Bundle ID 和
App Store Connect API Key 就绪后加入。当前 Bundle ID 暂定为：

`com.summonpoet.shiptotoday`

在 App Store Connect 创建应用记录之前仍可修改。
