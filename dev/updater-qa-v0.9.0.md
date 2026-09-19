# v0.9.0 更新功能验收

日期：2026-09-19。结果按验证范围记录，未发布任何远端版本。

## 已通过

- `npm test`：87 项测试、27 个文件通过；TypeScript 与 Vite 构建通过。
- `npm run desktop:check`：45 项 Rust 测试通过，新增检查节流、旧设置兼容、仓库地址规范化、下载地址边界、本地真实签名下载与篡改拒绝。
- 签名测试用本机临时 HTTP 服务器，不访问模型或账号；公开夹具只有文本与签名，不包含私钥。
- `npm run security:check`：检查当前跟踪及未忽略的候选源码，未发现规则命中的秘密；忽略目录不读取。历史审计另有原有 `scripts/audit-source.mjs`，本轮未重复审计 Git 历史。
- `npm run security:test`：普通公开内容及签名通过；合成凭据、编码私钥、私有运行路径被拦截；暂存内容仍含敏感值时不能由干净工作区掩盖；错误输出不包含秘密值。
- 隔离原生测试（测试应用身份、独立数据目录）：默认官方仓库、自动检查开关、网址保存、恢复官方来源、首次检查记录、一分钟节流、重启设置保留。
- 宠物窗口不能下载/安装；管理窗口缺少已验证包也不能安装。通过 UI 测试事件伪造“可安装”状态后，Rust 后端仍拒绝安装。
- UI 模拟事件覆盖新版本说明、下载字节与进度、工作中按钮禁用、安装入口。模拟版本 0.9.1 未发布，仅用于渲染测试。
- 原生截图：`output/playwright/updater-settings.png`、`output/playwright/updater-download.png`。已人工查看，无裁切和重叠。
- 生产 NSIS 和签名构建成功，`verify-update` 工具使用应用内公钥验签成功。生成 `latest.json`、安装包、签名、ZIP 和 SHA256 清单。
- ZIP 允许列表为 10 个文件，只含 EXE、四份许可证/声明、三份用户指南及两个连接脚本。无 TODO、开发资料、用户日志或凭据。

## 未验证的外部条件

- 官方公开 Releases/latest 接口返回 404，不能据此区分未公开仓库与未发布稳定版本；当前没有取得可用于升级的公开稳定 Release。
- GitHub 工作流已编写，尚未提交/推送或在远端运行；发布环境 Secrets 未配置。
- 未在本轮执行真实跨版本安装和重启，也未触碰日常使用的桌宠数据。下载/验签使用真实插件，原生下载进度用模拟事件，不能等同于完整远端安装验收。
- Windows Authenticode 签名未接入；Tauri 更新签名已接入，两者用途不同。

## 本地交付

- `output/DesktopPet-v0.9.0-windows-x64-setup.exe`
- `output/DesktopPet-v0.9.0-windows-x64-setup.exe.sig`
- `output/DesktopPet-v0.9.0-windows-x64.zip`
- `output/DesktopPet-v0.9.0-SHA256SUMS.txt`
- `output/updater-v0.9.0/latest.json`

私钥仅在用户本机 AppData 的独立签名目录内，需安全备份，不进入 Git 和分发附件。发布步骤见 `dev/RELEASING.md`。
