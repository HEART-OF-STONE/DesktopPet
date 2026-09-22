# v0.9.2 公开发布验证

时间：2026-09-22。用户验收通过并授权检查后提交、上传。

- 源码提交：`93e4be71c565cea020603c3e5200ea4868417705`。main 与带注释标签 `v0.9.2` 正常原子推送，没有强制覆盖。
- 稳定版：[DesktopPet v0.9.2](https://github.com/HEART-OF-STONE/DesktopPet/releases/tag/v0.9.2)，非草稿、非预发布，设为 Latest。
- 本地 91 项前端测试、52 项 Rust 测试、TypeScript / Vite 构建通过。公开源码规则检查、暂存内容检查与拦截器自测通过；只提交明确列出的源码、测试与文档。
- 发布标签的 [GitHub Source checks](https://github.com/HEART-OF-STONE/DesktopPet/actions/runs/35683429246) 已全部通过，对应上述发布提交。
- 五个附件为签名 NSIS 安装包、对应 `.sig`、便携 ZIP、SHA-256 清单及 `latest.json`，全部远端 SHA-256 与本地一致。ZIP 按允许列表检查，不包含 TODO、开发资料、日志、账户或运行配置。
- 安装包 SHA-256：`3841e815682b15625530e1ee80769375a0cee25522a822b0dae52be3350b7b78`。更新签名通过内置公钥验证，与 v0.9.1 公钥一致。私钥始终保留在仓库外，没有上传。
- 无认证访问 Releases/latest 与最新 `latest.json` 均返回 v0.9.2；版本、下载地址和签名与本地清单相符。
- 隔离测试程序使用 0.9.1 版本号和本次源码中的更新器，关闭 Codex / DeepSeek / 本地事件联动，独立数据和 WebView 目录。实际从官方 GitHub 检查到 v0.9.2，下载 8,230,536 字节，Tauri 更新器验签通过，状态为 `ready`，显示“安装并重启”。截图保存在被忽略的 `output/playwright/published-update092-ready.png`。
- 未执行安装，没有替换日常桌宠。旧安装的覆盖安装、重启及配置保留仍需实机验收。
- 云端签名构建维持未启用；本次使用本机签名产物，用户在线更新不依赖云端签名任务。

## 更新方式

已有支持签名更新的版本：偏好设置 → 启动与更新 → 检查更新 → 下载更新 → 安装并重启。刚检查过时等待一分钟再试；也可从 Release 手动下载安装包或便携 ZIP。
