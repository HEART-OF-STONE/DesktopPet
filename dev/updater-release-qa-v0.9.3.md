# v0.9.3 公开发布验证

时间：2026-09-28。用户授权发布新版本并生成安装包。

- 发布源码：`cfb247f0c44ee3cd72a168429cb1281412d5083a`；main 与带注释标签 `v0.9.3` 正常原子推送，未覆盖旧标签或旧附件。
- [DesktopPet v0.9.3](https://github.com/HEART-OF-STONE/DesktopPet/releases/tag/v0.9.3) 已公开，非草稿、非预发布，设为 Latest。
- 本地 95 项前端测试、53 项 Rust 测试、TypeScript / Vite 构建全部通过；源码检查器自测和真实暂存内容检查通过。
- 隔离测试安装器完成 0.9.2 → 0.9.3 跨版本安装：中文及空格目录保留，手动更新恢复原目录，显式目录覆盖过期记录，不落到默认目录，无关文件保留。原生安装向导已验证默认目录可编辑。完整说明见 `dev/install-location-qa.md`。
- 正式成品以独立数据目录验证版本号、设置页显示的程序位置，以及三种布局各七种任务状态、旧轮次排除、历史保留和活跃计数。Agent 采集全部关闭，不读取真实日志。
- 五个公开附件为 NSIS 安装包、`.exe.sig`、便携 ZIP、SHA-256 清单及 `latest.json`。上传端 digest 核对与无认证重新下载哈希核对均通过；ZIP 仅包含程序、用户指南、连接脚本和许可证。
- 安装包大小：8,225,255 字节。SHA-256：`f979546d07b31876830c65e1fc52119b8aeb358a421acbfae7fe57c4000e3e56`。公开下载的安装包通过应用内置公钥验证；签名私钥保持在仓库外。
- 无认证 Releases/latest 和 latest/download/latest.json 均指向 0.9.3。
- 用保留的真实 v0.9.2 正式程序，在独立数据和 WebView 目录启动，关闭全部 Agent 联动，成功从 GitHub 检查、下载和验签 v0.9.3，状态为 `ready`。停在“安装并重启”前，没有替换用户安装；截图在被忽略的 `output/playwright/published-update093-ready.png`。
- GitHub 独立 [Source checks](https://github.com/HEART-OF-STONE/DesktopPet/actions/runs/36403254564) 已成功完成，主线对应检查也已通过。云端签名构建保持未启用，本次使用本机签名产物。

## 使用提示

希望从 C 盘迁移：退出桌宠，卸载时保留用户数据，再运行新安装包并选择目标目录。不要直接移动已安装目录。升级不会自动搬迁已有安装；从 v0.9.3 发起的后续应用内更新明确绑定当前程序目录。

完整 GitHub 下载 → 安装器接管 → 自动重启的生产安装链路、干净 Windows 环境仍属于后续实机验收，不以本次隔离跨版本测试代替。
