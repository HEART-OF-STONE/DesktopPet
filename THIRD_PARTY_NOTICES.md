# 第三方声明

本项目自行实现的代码、文档，以及由 `scripts/generate-pets.mjs` 和
`scripts/generate-examples.mjs` 生成的演示猫、图标与示例，按根目录 MIT LICENSE 提供。
第三方组件保留各自许可；本项目 MIT 不替代这些许可，也不适用于用户导入的角色。

## 参考项目

DeepSeek-Balance-Whale-Widget，Copyright (c) 2026 MeteorNOX。
来源：https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget
核实版本：`83fc01a5aa9d002ea70f5d30d102bd9f65f1ec42`（2026-09-19）。

本项目参考其拖动吸附、交互反馈、气泡、余额和用量展示思路，使用 React / Tauri
重新实现。没有把该插件声明为运行时依赖。保守保留其完整 MIT 声明于
`licenses/DeepSeek-Balance-Whale-Widget-MIT.txt`（发布包中为同名根目录文件），不表示其素材获得了 MIT 授权。

上游 `PROVENANCE.md` 明确说明图片、动图、音效不在 MIT 范围内，且不授予再许可；
本项目不分发其鲸鱼图片、泡泡动图、Minecraft 音效或其他音频资源。
以后复用代码必须保留其版权和许可；复用素材必须逐项获得明确的分发许可。

## 依赖

完整版本清单、原始版权与许可文本见 `THIRD_PARTY_LICENSES.txt`。
清单根据 npm 锁文件、实际安装包和 Cargo 锁定的 Windows 依赖生成，包含构建工具，
以免将构建时依赖误认为本项目原创或遗漏声明。

- React / React DOM / scheduler：MIT。
- Tauri 及多数 Rust 组件：保留各包声明，常见为 MIT OR Apache-2.0。
- Lucide：ISC；由 Feather 派生的图标另保留 Cole Bemis 的 MIT 声明。
- Rust 的 Unicode / ICU、TLS 和系统接口组件：按逐包声明保留相应许可。
- Sharp 及其原生图像工具仅在开发时生成 PNG；不把 Sharp/libvips 二进制放入安装包。
  libvips 等构建工具的许可不能笼统标成 MIT。
- WebView2 由系统或微软安装程序提供，适用微软条款，不适用本项目 MIT。

更新依赖后重新运行 `node scripts/generate-license-notices.mjs` 并审查清单。
发布安装包和便携包必须携带 LICENSE、本声明、完整依赖许可文本及参考项目 MIT 声明。

MPL-2.0 依赖（如 cssparser、selectors）的原始源码按各自 MPL-2.0 许可提供，精确版本
下载地址列于完整清单的 Source 字段。本项目不修改这些依赖；未来如修改须保留相应
源文件许可及可获取的修改后源码。MPL 的文件级义务不把本项目独立源文件改为 MPL。
参见 https://www.mozilla.org/en-US/MPL/2.0/FAQ/ 。

测试工具的间接依赖 stackback 0.0.2 仅在包元数据声明 MIT，没有单独的上游许可文本；
清单如实保留该声明、作者和精确源码地址。其代码不进入用户发布包；若以后分发该工具，
须先补核其版权与许可文本。非当前平台的可选 npm 包只登记，不作为已分发二进制。
