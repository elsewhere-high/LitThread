# 开发与验证

## 工具链

前端使用 Node.js 与项目指定的 pnpm 版本。Rust workspace 包括 `src-tauri`、`cli`、`crates/litthread-core`；使用 Rust stable，安装 rustfmt 与 clippy。OCR 原生依赖需要 CMake。macOS 使用 Xcode；Windows 使用 MSVC 和 WebView2；Linux 需要 Tauri/WebKitGTK 的平台开发依赖。

`scripts/toolchain.mjs` 优先使用 `.toolchains/cargo` 与 `.toolchains/rustup`，否则使用调用者的 PATH。该目录不提交到 Git。macOS 默认部署目标与应用配置一致，为 12.0；调用者可以显式覆盖环境变量。项目不依赖 Python；如果后续加入 Python 工具，统一在 Conda 环境内运行。

```sh
pnpm install --frozen-lockfile
pnpm tauri dev
```

开发前端地址为 `http://localhost:1420`。独立设置窗口使用 `?window=settings&section=general`，独立文档与功能窗口由桌面管理。`?mobilePreview=1` 可在浏览器检查移动配对界面，但不能替代真机连接验证。

## 常用工作流

| 命令 | 范围 |
| --- | --- |
| `pnpm format` | Biome 与 rustfmt |
| `pnpm lint` | Biome、workspace clippy；Rust 警告视为错误 |
| `pnpm typecheck` | TypeScript 类型检查 |
| `pnpm test` | Vitest 功能与数据契约测试 |
| `pnpm test:rs` | Cargo workspace 测试，遵守锁文件 |
| `pnpm deps:check` | 前端依赖分层 |
| `pnpm build` | TypeScript 与 Vite 生产资源 |
| `pnpm cli:bundle` | 构建并暂存本机 CLI |
| `pnpm tauri build --debug --bundles app` | macOS 本地应用包 |

使用 `pnpm demo:vault -- ./tmp/reading-desk` 生成独立测试资料，使用 `pnpm demo:vault:verify -- ./tmp/reading-desk` 检查结构。生成器不会覆盖已有目录；真实知识库不得作为清理或删除测试对象。

## 验证要点

代码检查之后，用原生窗口验证建库、导入、检索、PDF、Markdown 保存、弹窗和重启后的内容。外部集成分别记录是否实际连接，不用本地界面渲染代替 Agent、同步、远程设备或线上下载的成功证据。

改动中英文界面时同时维护 `src/i18n/locales/en` 和 `zh-CN`。更改运行时技能时递增其整数 `version`，并核对新建知识库与已存在用户文件的保护逻辑。不要修改依赖补丁的锁定校验来掩盖不兼容。

## 打包

项目许可由根目录 `LICENSE` 定义；Rust 各 crate 继承 workspace 的 MIT 标识，前端清单与 Tauri 打包配置保持一致。公共资源映射将项目许可放在 `licenses/LICENSE`，研究技能的第三方声明放在 `licenses/Supervisor-Skills.txt`。平台配置合并时保留此映射；Windows/Linux 追加 PDFium 资源，macOS 使用 Frameworks，移动端不携带桌面 PDFium。

`pnpm pdfium:stage` 下载与解析依赖一致的 PDFium 并复制到原生资源目录。macOS 将动态库装入 `Contents/Frameworks`；其他桌面平台使用 bundle resources。CLI 默认单独构建。发行签名、移动平台证书和更新通道没有预设，需要维护者独立配置。

从源码目录之外启动构建的 `.app` 和 CLI，验证模板和 PDFium 不依赖构建时的绝对路径。二进制中的调试源码路径属于编译信息，不应作为运行时文件来源。
