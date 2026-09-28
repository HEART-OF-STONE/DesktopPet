# v0.9.4 公开发布验证

时间：2026-09-28。用户验收托盘预览并授权发布。

- 发布源码：`be78aaccb05824bf4efa29182849a2193973a9af`；main 与带注释标签 `v0.9.4` 原子推送，未覆盖旧标签或附件。
- [DesktopPet v0.9.4](https://github.com/HEART-OF-STONE/DesktopPet/releases/tag/v0.9.4) 已公开，非草稿、非预发布，设为 Latest。
- 本地 95 项前端测试、56 项 Rust 测试、TypeScript / Vite 构建全部通过；源码敏感信息检查、检查器自测与真实暂存内容检查通过。
- 本轮包含托盘动态显示 / 隐藏、找回宠物、免打扰勾选、菜单分组、左键打开管理面板、悬停提示以及全屏避让说明。三项托盘测试覆盖状态组合、名称与偏好恢复、Windows 原生菜单结构；发布前隔离预览已验收。
- 五个公开附件为 NSIS 安装包、`.exe.sig`、便携 ZIP、SHA-256 清单及 `latest.json`。上传 digest 与无认证重新下载的哈希全部一致；ZIP 使用十个分发文件的允许列表，不包含开发 Todo、日志、账户数据或签名私钥。
- 安装包大小：8,244,339 字节。SHA-256：`28b4dc19f08f2c3f98b7f3f3685f972aea0cc0a85807adde9e91bcc71169f5b1`。公开下载的安装包通过应用内置公钥验证。
- 无认证 Releases/latest 与 latest/download/latest.json 均指向 0.9.4。
- 使用当前源码编译的独立身份、0.9.3 版本号测试程序，以独立数据及 WebView 目录启动，关闭全部 Agent 联动，成功从 GitHub 检查、下载和验签 v0.9.4，状态为 `ready`，界面显示“签名验证通过”与“安装并重启”。这是更新逻辑探针，不是旧版正式二进制测试；停在安装前，日常桌宠仍正常运行。截图位于被忽略的 `output/playwright/published-update094-ready.png`。
- GitHub [标签源码检查](https://github.com/HEART-OF-STONE/DesktopPet/actions/runs/36435742738) 与 [主线源码检查](https://github.com/HEART-OF-STONE/DesktopPet/actions/runs/36435742554) 在本次记录时仍运行；云端签名构建保持未启用，本次使用本机签名产物。

## 验证边界

本次未替换日常安装。完整 GitHub 下载 → 安装器接管 → 自动重启以及干净 Windows 环境仍需后续实机验收。安装目录保持沿用 v0.9.3 已验证的实现，相关隔离跨版本安装记录见 `dev/install-location-qa.md`。
