# 桌边 · DesktopPet

一个本地运行、可更换角色的 Windows 桌面伙伴。

**当前交付：v0.1.1 可运行原型，新增昵称与默认名字编辑。** 首版方向已确定为静态 PNG + 程序变形、逐帧 2D 两种表现；AI 和 Live2D 留在后续阶段。公开发布前仍需完成实际鼠标穿透、多屏与长时间运行验收。

![改名界面](docs/images/rename-dialog.png)

## 直接体验

双击本次构建的 [DesktopPet.exe](output/DesktopPet-v0.1.1/DesktopPet.exe)。先从托盘退出旧版，再启动新版。它是 Windows x64 可执行文件，界面和内置素材已打包，需要本机有 WebView2 运行时。当前提供免安装原型，尚未制作和验证安装包。`output/` 不纳入 Git，其他开发机请按下方构建命令生成程序。

打开后会出现管理界面和独立桌宠：

- **我的伙伴**：摸头、零食、休息、庆祝；专注计时支持 1–180 分钟、暂停和继续。
- **角色衣橱**：切换静态/动画角色，或导入自己的 PNG / 角色包。
- **今日装扮**：内置奶油白、鼠尾草两套配色。
- **偏好设置**：宠物大小、置顶、吸附、免打扰、音量、移回主屏和设置导出。
- **桌宠窗口**：按住角色拖动，右键打开管理界面；下方按钮可打开管理界面或隐藏宠物。
- **系统托盘**：显示宠物、打开桌边、移回主屏、切换免打扰和退出。关闭管理窗口会收回托盘，完全退出请使用托盘菜单。

默认关闭音效。免打扰会关闭互动闲聊气泡和音效，计时完成的视觉提醒仍显示。应用完全退出后不会唤醒系统提醒；重新打开时恢复保存的计时状态。

### 改名与默认名字

在「我的伙伴」名称旁或「角色衣橱」卡片上点击 **改名**：

- **伙伴名字**：修改当前昵称，支持 1–24 个字符，保存时去除首尾空白。
- 展开 **修改默认名字**：设置自己的默认名字。例如默认名设为「年糕」、昵称设为「小年糕」，以后「恢复默认名」会恢复成「年糕」，不会固定回到「豆包」。
- 尚未设置昵称时，修改默认名字会同步改变当前显示；已有昵称会保留。
- 内置角色和导入角色都能改名，各自保存；换皮肤、切换角色和重启不会清除名字。主页、衣橱、桌宠标签及桌宠窗口标题同步更新。

「豆包」仅是演示素材最初的临时名字。名称设置与素材 ID 分开保存，不会修改原始图片或角色包文件。

## 自定义角色

在「角色衣橱 → 导入角色」选择：

1. **单张 PNG**：自动生成静态角色，推荐使用透明背景。
2. **PNG 序列**：同时选择一个 `pet.json` 和所有帧图片。
3. **PNG 精灵图**：同时选择一个 `pet.json` 和其引用的图片。

可直接试用 [PNG 序列示例](examples/png-sequence/pet.json) 和 [精灵图示例](examples/sprite-sheet/pet.json)：打开相应文件夹，在导入对话框中全选该文件夹的 JSON 与 PNG。

清单协议、限制与皮肤制作见 [角色包说明](docs/04-character-packs.md)。当前不支持 ZIP、GIF 或 Live2D 导入。

## 开发

本次环境：Windows x64、PowerShell 7、Node 24、Rust stable、Visual Studio C++ 构建工具、WebView2。

```powershell
npm ci
npm run desktop:dev
```

仅调试管理界面可运行 `npm run dev`，打开 `http://127.0.0.1:1420`。浏览器预览不提供系统悬浮、穿透和托盘能力，数据与桌面版分开保存。

```powershell
npm test
npm run build
npm run desktop:check
npm run desktop:build -- --no-bundle
```

最后一个命令生成 `src-tauri/target/release/desktop-pet.exe`。`desktop:check` 执行 Rust 测试；`build` 包含 TypeScript 检查与前端构建。`npm run assets` 重新生成原创演示角色，`npm run examples` 生成导入示例。

本机缺少 Rust 时，已将工具链放入工作区 `.tools/cargo` 和 `.tools/rustup`；`scripts/tauri.mjs` 会优先使用它们，没有修改系统 PATH。其他开发机可使用正常安装的 Rust 工具链。依赖缓存和构建产物不计入源码。

## 数据与备份

桌面版默认数据目录为 `%APPDATA%\com.desktop-pet.companion`：

- `state.json`：偏好、计时和导入图片数据，带协议版本。
- `state.backup.json`：上次保存的副本，主文件无法解析时尝试恢复。
- `position.json`：桌宠最近位置。

原型暂用 JSON；SQLite、资源独立存储及正式迁移工具仍在后续计划。备份时退出应用并复制整个数据目录。界面中的「导出设置」只导出偏好，不包含导入图片，也尚未提供设置导入界面。开发测试可通过 `DESKTOPPET_DATA_DIR` 指定隔离目录。

## 规划与验证

- [产品规划和参考项目分析](docs/01-product-plan.md)
- [技术架构与当前实现差异](docs/02-architecture.md)
- [开发路线和任务状态](docs/03-roadmap.md)
- [角色包协议及示例](docs/04-character-packs.md)
- [本次实现、验证结果和待验证项](docs/05-implementation-status.md)
- [Agent 联动与余额/额度看板补充计划](docs/06-agent-integration.md)：已提升为 V1 核心工作，当前原型尚未接入 Codex 或真实余额数据。

参考项目 [DeepSeek-Balance-Whale-Widget](https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget) 的角色主要使用静态 PNG 加 CSS 变形。此项目的代码和演示猫「豆包」重新实现，未复制参考项目角色图片；豆包可由仓库内脚本完整再生成。名称与演示形象均可后续替换。

## 本地版本管理

项目已初始化本地 Git 仓库，主分支为 `main`。本地提交不需要 GitHub；之后添加 GitHub 远端即可推送已有历史。当前未配置远端，也未上传任何内容。
