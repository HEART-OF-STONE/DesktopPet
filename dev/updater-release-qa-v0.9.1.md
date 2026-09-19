# v0.9.1 公开发布验证

时间：2026-09-19。用户已授权发布。

- 源码提交：`164c827fe1c3680e857b0e5c86b8c12721cb3d1b`，正常快进推送 main，无强制推送。
- 稳定版：[DesktopPet v0.9.1](https://github.com/HEART-OF-STONE/DesktopPet/releases/tag/v0.9.1)，非草稿、非预发布，设置为 Latest。
- [GitHub Source checks](https://github.com/HEART-OF-STONE/DesktopPet/actions/runs/35435639505) 全部通过。
- 发布前暂存内容检查通过；广义源码/历史检查中的候选项为测试样例、系统路径、公开许可证署名等，没有发现规则识别的真实私钥或访问令牌。规则扫描不能保证识别所有秘密。
- 发布附件严格限定为 NSIS、对应 `.sig`、ZIP、SHA256 清单和 `latest.json`。GitHub 返回的五个附件 SHA256 与本地一致。
- 安装包 SHA256：`b6f99e9bbe7c1e8943f805cca81c54d3bbd98db34f81057bd618f808876d6d8f`。
- 以普通用户无认证请求访问 Releases/latest 与 latest.json，均返回 0.9.1 和正确附件地址。
- 隔离测试应用配置为 0.9.0，使用独立数据和 WebView 目录，关闭 Codex、DeepSeek 和事件通道。通过真实应用命令从官方 GitHub 检查到 v0.9.1，下载 8,195,662 字节，Tauri 更新器验签成功，状态为 `ready`，出现“安装并重启”。
- 截图：`output/playwright/published-update-ready.png`。本次未触发安装，不替换用户日常桌宠；真实安装和重启仍待验收。
- 签名私钥未上传 GitHub。首版使用本机签名产物发布；云端签名构建保持未启用，待发布者另行配置环境 Secrets 和仓库变量。

## 用户升级

v0.9.0：偏好设置 → 启动与更新 → 检查更新 → 下载更新 → 安装并重启。

v0.8.0 或更早：先从 Release 手动下载并安装 v0.9.1，后续版本再使用应用内更新。刚刚检查过时，需等待一分钟后重试。
