# v0.1.0 实现与验证记录

日期：2026-09-15。范围：用户确认的静态图片加程序变形、逐帧 2D 与本地陪伴原型。**此记录不等于完成 V1 发布验收。**

## 1. 可运行交付

- `output/DesktopPet/DesktopPet.exe`：Windows x64 release 优化构建，内嵌前端和演示素材。
- `src-tauri/target/debug/desktop-pet.exe`：用于本次 WebView2 集成测试的 debug 构建。
- `src/` 与 `src-tauri/`：完整前后端源码。
- `examples/png-sequence/` 与 `examples/sprite-sheet/`：可直接导入的角色包，含原创 PNG。
- `output/playwright/`：管理界面、衣橱、偏好设置及桌面 WebView 截图。

产品暂名「桌边」，演示角色暂名「豆包」。二者均未要求用户承诺最终名称。没有接入 AI、账户、云后端或 Live2D。

## 2. 当前行为

| 模块 | 已实现 | 尚待完善 |
|---|---|---|
| 桌面宿主 | 透明小窗口、管理窗口、单实例插件、托盘菜单、隐藏/找回、置顶 | 实际鼠标与焦点、托盘点击、完整退出人工验收 |
| 鼠标与位置 | Alpha 命中区域、空白穿透切换、拖动阈值、边缘吸附、物理位置保存、断屏找回 | 高速点击、跨屏 DPI、负坐标屏幕、RDP、休眠的实测 |
| 角色 | 静态 PNG、独立 PNG 序列、PNG 精灵图；六种动作与待机降级 | 最终角色美术、创作者编辑器 |
| 皮肤与导入 | 两套内置配色，1–4 皮肤清单，本地图片/清单导入、限制检查、移除 | 原子资源目录、批量管理、迁移及长期内存趋势 |
| 陪伴 | 摸头、零食、休息、庆祝、短气泡、相邻台词去重、可选提示音 | 目前 13 条台词；完整优先级和气泡排队、主动行为 |
| 计时 | 1–180 分钟、暂停/继续/结束、保存截止时间、宿主到期转态 | 真机休眠与应用重启提醒、系统时钟变化处理 |
| 偏好 | 缩放、音量、音效、免打扰、置顶、吸附、设置导出 | 设置导入 UI、完整迁移/修复流程 |
| 发布 | 前端构建、Rust 检查、debug/release 可执行文件 | 安装包、签名、干净环境、自动更新、8 小时稳定性 |

补充行为边界：

- 管理窗口的翻转按钮只翻转预览；桌宠方向尚未持久化。
- `drag` 动作在拖动结束后反馈；拖动中保持按压姿态。
- 目前用户新动作会直接替换旧动作，尚未实现提醒优先级队列。
- 免打扰下计时完成仍可显示视觉气泡，音效保持关闭。
- 桌宠隐藏时的 WebView 可见性行为需真机确认；渲染器检测 `document.hidden` 后跳过绘制。
- JSON 内嵌图片适合小规模原型，保存设置时会写入整个状态。正式支持更多角色前应拆分资源存储。

## 3. 已执行的验证

| 验证 | 结果 | 实际覆盖 |
|---|---|---|
| `npm test` | 7 项通过 | 经过时间选帧、循环/单次、倒计时暂停/恢复/过期、输入限制、角色清单验证 |
| `npm run build` | 通过 | TypeScript 与 Vite 生产构建 |
| `npm run desktop:check` | 2 项通过 | Rust 工程编译、计时转换与时长/缩放限制 |
| debug / release `--no-bundle` | 通过 | Windows x64 应用构建；未生成安装包 |
| `scripts/browser-smoke.js` | 通过 | 摸头反馈、逐帧画面变化、换肤、计时暂停后刷新恢复、免打扰保存、单 PNG 导入/移除、窄屏布局 |
| `scripts/native-smoke.js` | 通过 | 两个实际 Tauri WebView，native bridge、角色同步、互动同步、计时暂停后 WebView 刷新恢复、免打扰 |
| `scripts/import-smoke.js` | 通过 | 精灵图与中文文件名 PNG 序列导入、动画变化、缺动作回退、刷新恢复、拒绝 Live2D 类型且保留角色 |

浏览器与 native 测试以独立临时数据运行；native 测试通过本机 WebView2 调试连接触发页面交互。**这类输入不等于真实系统鼠标，不能证明窗口穿透或 Win32 拖动正确。**

本次尝试通过 Computer Use 自动执行实际桌面拖拽，但打开应用的授权等待超时，未执行该项操作。未把这些项目标为通过。

完整进程重启、系统休眠、托盘菜单操作、8 小时运行和 CPU/内存预算尚未通过。不要把 WebView 刷新恢复写成已通过应用进程重启验收。

## 4. 测试环境与复现

本机构建使用 Node 24.13.1、PowerShell 7.6.5、Rust stable 1.98.1、Visual Studio 2022 C++ 构建工具。依赖精确版本见 `package-lock.json` / `src-tauri/Cargo.lock`；本次 Rust Tauri 解析为 2.11.5。

一般检查：

```powershell
npm test
npm run build
npm run desktop:check
npm run desktop:build -- --no-bundle
```

界面冒烟脚本供 Playwright CLI 的 `run-code --filename` 调用，不是应用运行时依赖；当前样例文件路径按本工作区固定，迁移工作区需更新脚本根目录。启动 `npm run dev` 后，在新的独立测试浏览器中运行：

```powershell
npx --yes --package @playwright/cli playwright-cli -s=desktop-import open http://127.0.0.1:1420
npx --yes --package @playwright/cli playwright-cli -s=desktop-import run-code --filename scripts/import-smoke.js
npx --yes --package @playwright/cli playwright-cli -s=desktop-import close
```

native 脚本还需：debug 可执行文件、干净的 `DESKTOPPET_DATA_DIR`、隔离的 WebView2 用户数据目录，及本次测试约定的 `--remote-debugging-port=9223`。日常使用无需开启调试端口；release 产物不为测试自动开启调试。

## 5. 下一轮验收顺序

1. 真实点击、拖动、透明区域穿透和输入焦点；检查系统托盘完整退出。
2. 100% / 150% / 200% DPI、负坐标副屏、断屏、睡眠/唤醒和计时到期。
3. 静态和逐帧空闲 CPU、所有关联 WebView2 进程内存、隐藏时占用、连续换角色及 8 小时运行。
4. 完善动作优先级和气泡队列，分离图片存储、加入迁移与恢复检查。
5. 确定名称、美术与分发方式，制作安装包并验证签名/更新方案。

M4 AI 与 M5 Live2D 保持后续范围，不影响当前两种 2D 角色包使用。
