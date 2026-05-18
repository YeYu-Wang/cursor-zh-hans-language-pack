# Cursor 简体中文全局汉化包

这是一个在 Cursor 中由 AI Agent 自驱动修改、构建和整理的 Cursor 兼容 VS Code Language Pack 扩展，目标是把 Cursor 的主界面和可本地化扩展资源切换为简体中文。

项目已尽量把语言包、可逆补丁、开源说明和第三方来源整理成可复用形式，方便其他 Cursor 用户安装、二次验证和继续改进。

## 交流互助

使用中如果遇到安装、补丁、界面残留英文或版本兼容问题，可以扫码加入 QQ 群互助交流。

<p align="center">
  <img src="assets/qq-group-426949658.jpg" alt="Cursor 交流 QQ 群二维码" width="220" />
</p>

- 群名：Cursor交流
- 群号：426949658
- 说明：有问题可以互助交流，欢迎反馈不同 Cursor 版本中的未汉化文案。

## 能做什么

- 贡献 `zh-cn` 全局语言包，安装后可在 Cursor 的显示语言中选择 `中文(简体)`。
- 同步官方 VS Code 简体中文语言包资源，覆盖主界面、内置 Git、编辑器、设置、调试、终端等 NLS 文案。
- 提供可逆的 Cursor 扩展清单汉化补丁命令，用于处理部分 Anysphere/Cursor 扩展中写死在 `package.json` 的英文标题和描述。
- 提供可逆的 Cursor Agent/Composer 主界面补丁命令，用于处理标准语言包无法覆盖的主程序硬编码文案。

## 构建

```bash
npm install
npm run build
```

构建产物位于：

```text
dist/cursor-zh-hans-language-pack.vsix
```

## 安装

方式一：Cursor 命令行可用时执行：

```bash
cursor --install-extension dist/cursor-zh-hans-language-pack.vsix
```

方式二：在 Cursor 中打开扩展面板，选择“从 VSIX 安装...”，选中 `dist/cursor-zh-hans-language-pack.vsix`。

安装后运行命令面板中的 `Configure Display Language` 或本扩展命令 `Cursor 简体中文: 打开显示语言设置`，选择 `zh-cn`，然后重启 Cursor。

## 可逆清单补丁

部分 Cursor 专属扩展把标题、配置说明直接写在 `package.json`，不会被标准语言包接管。本扩展提供两个命令：

- `Cursor 简体中文: 应用 Cursor 扩展清单汉化补丁`
- `Cursor 简体中文: 恢复 Cursor 扩展清单原文`

补丁只处理当前用户的 Cursor 扩展目录，并为每个被修改的 `package.json` 生成同目录备份：`package.json.cursor-zh-hans.bak`。

## 可逆 Agent/Composer 主界面补丁

Cursor 的 Agent、Composer、工具调用卡片、自动运行菜单里有一部分文案直接写进主程序 bundle，不走 VS Code NLS，所以和官方 `Chinese (Simplified)` 语言包同时安装时看起来几乎没有差异。本扩展新增三个命令：

- `Cursor 简体中文: 检查 Cursor Agent/Composer 主界面汉化补丁`
- `Cursor 简体中文: 应用 Cursor Agent/Composer 主界面汉化补丁`
- `Cursor 简体中文: 恢复 Cursor Agent/Composer 主界面原文`

补丁目标是 Cursor 的 `resources/app/out/vs/workbench/workbench.desktop.main.js`，会在同目录生成备份：`workbench.desktop.main.js.cursor-zh-hans-workbench.bak`。应用或恢复后需要完整重启 Cursor。

如果自动定位失败，可以在设置里指定 `cursorZhHans.cursorAppRoot`，值应指向 Cursor 的 `resources/app` 目录。

## 维护翻译资源

重新同步本机资源：

```bash
npm run sync
npm run validate
```

同步来源默认是：

```text
%USERPROFILE%\.cursor\extensions\ms-ceintl.vscode-language-pack-zh-hans-*
```

默认只同步官方 VS Code 简体中文语言包资源。若你明确确认本机其他扩展的 `package.nls.zh-cn.json` 允许再分发，可临时设置环境变量 `CURSOR_ZH_HANS_INCLUDE_EXTERNAL_NLS=1` 后再运行同步脚本；公开发布前应重新检查对应扩展许可证。

## 开源与第三方来源

本项目代码、补丁脚本、补丁表和项目文档以 MIT License 开源。项目内翻译资源主要来自 Microsoft 官方 VS Code 简体中文语言包，相关文件保留了 Microsoft 的版权和 MIT License 头部声明。

本项目不是 Cursor、Anysphere、Microsoft 或 Visual Studio Code 的官方项目；`Cursor`、`Visual Studio Code` 等名称仅用于说明兼容目标和上游来源。完整第三方来源和许可证说明见 `THIRD_PARTY_NOTICES.md`。

## 边界

标准语言包只能覆盖 Cursor/VS Code 通过 NLS 机制暴露的文案。Webview、远端服务输出、模型返回内容、硬编码字符串以及 Marketplace 在线内容不一定能被语言包完整接管；这些需要单独补丁或上游改造。