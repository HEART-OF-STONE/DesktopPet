# Windows 发布流程

开发专用，不进入安装包、免安装包或角色包。

## 产物与版本

- 同步 package.json / package-lock.json、Cargo.toml / Cargo.lock、tauri.conf.json 和界面版本。
- 正式构建使用 `com.desktop-pet.companion`；不传测试配置，不设置 WebView 调试端口，不携带测试数据目录。
- 用户安装包与 ZIP 均只包含主程序、两个接入脚本、三份用户指南和四份许可声明。NSIS 自带卸载器属于安装管理文件。
- 正式发布前补做 Todo 中的系统兼容、长期运行和真实账户验收。

在项目根目录使用 PowerShell 7：

```powershell
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true
npm ci
node scripts/generate-license-notices.mjs
npm test
npm run desktop:check
npm run desktop:build -- --bundles nsis
./scripts/package-release.ps1
```

输出 `output/DesktopPet-v版本/`、免安装 ZIP、`-setup.exe` 和 `-SHA256SUMS.txt`。发布脚本拒绝覆盖已有产物，发布后发现问题应使用新版本。校验和用于完整性核对，不能替代代码签名。

## 自动化验收

```powershell
npm run desktop:build -- --debug --no-bundle --config scripts/fixtures/tauri-test-config.json
./scripts/test-agent-native.ps1 -P1Only
./scripts/test-agent-native.ps1
npm run desktop:build -- --bundles nsis --config scripts/fixtures/tauri-installer-test.json
./scripts/test-installer.ps1
```

原生脚本使用独立应用标识、临时数据与专用注册表启动项。安装测试只操作 `DesktopPet Installer Test`，验证静默安装、资源清单、升级、自启动修复和卸载数据保留；需要当前用户注册表、快捷方式和进程权限。测试之后必须重新执行不带测试配置的正式构建，再打包。

## GitHub 更新源与签名

正式仓库确定为 `HEART-OF-STONE/DesktopPet`；源码首次上传须先完成隐私与完整历史检查。当前没有验收通过的公开 Release 或签名证书；本地安装包未签名。真实项目远端更新闭环仍待验收。

首次正式构建前设置 `$env:DESKTOPPET_RELEASE_REPOSITORY='HEART-OF-STONE/DesktopPet'` 作为默认来源。已有用户设置保留，用户也可以从偏好设置中修改。GitHub Release 使用稳定标签 `v0.5.0` 这类三段数字版本，附上安装包、ZIP、校验清单和面向用户的更新说明。不要把开发测试截图、缓存、日志或个人备份发布出去。未完成 Todo 验收前，不创建 Release 或版本标签。

更新指南或许可文本后必须重建 NSIS，发布脚本会拒绝比资源更旧的安装包。依赖升级后重建第三方清单并复核新增许可；源码中的开发资料经隐私检查可以公开，但不能进入用户发布包。

更新检查使用 [GitHub 最新稳定发布 API](https://docs.github.com/en/rest/releases/releases#get-the-latest-release)，只在用户点击时访问固定 HTTPS GitHub API；不需要 GitHub Token，不自动下载安装。失败保留上次成功结果并显示错误；发布内容按纯文本呈现。

签名证书和发布账号准备好后，再配置构建签名、签名验证和发布权限。不得将测试构建当成正式版，也不得将未验证的远端更新或代码签名标为完成。
