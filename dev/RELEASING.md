# 签名更新与公开发布

官方仓库：`HEART-OF-STONE/DesktopPet`。公开仓库只保存更新公钥，位于 `src-tauri/tauri.conf.json`。应用固定验证该公钥，拒绝不匹配的版本、下载来源或签名。

## 一次性配置

1. 本机私钥已保存在 `%LOCALAPPDATA%\DesktopPet\signing\updater.key`，公钥副本为 `.pub`。将私钥备份到安全位置；不要把私钥、密码、API Key、Codex 登录文件、个人用量或日志粘贴到 Issue、聊天记录、源码或发布附件。丢失私钥会使已有安装无法验证后续更新，不应为普通发布重新生成密钥。
2. 在 GitHub 仓库 Settings → Environments 建立 `release` 环境，建议只允许版本标签部署，并设置发布审核者。
3. 在该环境的 Secrets 中添加 `TAURI_SIGNING_PRIVATE_KEY`，值为上述私钥文件的完整内容。此本机生成的密钥使用空密码，`TAURI_SIGNING_PRIVATE_KEY_PASSWORD` 可不配置；如以后迁移加密保管，设置对应密码。
4. Secrets 不放入 Variables。公钥可以公开，更新签名私钥不能公开。更新签名与 Windows Authenticode 证书是两回事：当前能验证更新包来源，Windows 仍可能提示未知发布者。
5. 如需由 GitHub Actions 构建签名包，完成上述密钥配置后，再将仓库 Actions Variable `SIGNED_RELEASES_ENABLED` 设为 `true`。未启用时签名构建任务跳过，可直接发布已在本机签名的附件；用户在线更新不依赖这个开关。

## 本机发布包

使用 PowerShell 7，在项目根目录执行：

```powershell
./scripts/build-signed-release.ps1
```

脚本从仓库外读取私钥，先运行公开源码检查、生成许可证清单，再构建 NSIS 及签名。`output/` 不进入 Git。不要直接打包整个工作目录。

版本号须同步 `package.json`、`package-lock.json`、`src-tauri/Cargo.toml`、`src-tauri/Cargo.lock`、`src-tauri/tauri.conf.json`，发布说明放在 `dev/releases/v版本号.md`。`package-release.ps1` 拒绝覆盖已存在的同版本产物。

产物允许列表：安装包 `.exe`、对应 `.exe.sig`、便携 `.zip`、`SHA256SUMS.txt`、`output/updater-v版本号/latest.json`。JSON 上传到 Release 后附件名必须是 `latest.json`，签名字段是 `.sig` 内容。ZIP 只含程序、用户说明、连接脚本和许可证；开发文档和 TODO 不进入用户分发包。

## GitHub 流程

1. 本地检查 `npm run security:check`；暂存后可用 `node scripts/check-public-source.mjs --staged` 检查真实暂存内容。该检查按规则拦截常见凭据和私有运行文件，不能保证识别所有秘密，也不审计已存在的 Git 历史。
2. 完成测试、审查差异并提交，推送对应 `v主版本.次版本.修订号` 标签。不要为发布强制覆盖已有标签或附件。
3. `Signed Windows release` 工作流测试并构建签名包，生成 **草稿 Release**。手动运行也必须选择匹配版本的标签。普通推送和 PR 只运行无发布密钥的检查工作流。
4. 核对草稿说明与五个附件，确认后发布稳定版，并设为 Latest。发布前应用不会看到草稿，预发布也不参与自动升级。
5. 用上一版已安装程序验证：检查 → 说明 → 下载进度 → 验签 → 安装重启 → 版本号、角色、设置和自启动保留。首个支持更新的版本需要手动安装；未实际发布前不能宣称公开远端闭环已验收。

首次公开发布使用本机签名包，签名私钥继续留在本机。发布者启用云端签名构建前，再配置 GitHub 环境密钥和上述开关。

## 故障处理

- 没有稳定 Release：源码已公开仍可能出现此提示，需发布带附件的稳定版本。
- 清单不可用：检查 `latest.json` 附件名、版本和安装包链接，国内访问 GitHub 失败也会有提示。
- 验签失败：禁止安装，重新生成同一构建的清单与签名；已发布文件不要原地替换，使用新的修订版本。
- 每 6 小时最多自动检查一次；失败也保留节流时间。无新版本只查询一次 GitHub API，有新版本再读更新清单。不上传日志、角色、账户数据或凭据。
