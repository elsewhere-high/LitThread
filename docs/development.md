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

项目许可由根目录 `LICENSE` 定义；Rust 各 crate 继承 workspace 的 `AGPL-3.0-only` 标识，前端清单与 Tauri 打包配置保持一致，项目版权主体为 GitHub 用户 Ustinian5。公共资源映射将项目许可放在 `licenses/LICENSE`，研究技能的第三方声明放在 `licenses/Supervisor-Skills.txt`。平台配置合并时保留此映射；Windows/Linux 追加 PDFium 资源，macOS 使用 Frameworks，移动端不携带桌面 PDFium。

`pnpm pdfium:stage` 下载与解析依赖一致的 PDFium 并复制到原生资源目录。macOS 将动态库装入 `Contents/Frameworks`；其他桌面平台使用 bundle resources。CLI 默认单独构建。发行签名、移动平台证书和更新通道没有预设，需要维护者独立配置。

从源码目录之外启动构建的 `.app` 和 CLI，验证模板和 PDFium 不依赖构建时的绝对路径。二进制中的调试源码路径属于编译信息，不应作为运行时文件来源。

## 2026-10-12 参赛准备重构验证

新增问题与证据工作台，集中虚拟视图规则和原生界面适配，改为保留源码的元数据属性编辑。类型检查、Biome、依赖分层与生产构建通过；Vitest 为 138 个文件通过、1 个文件跳过，1181 项通过、5 项跳过。Biome 仍有 6 个既有警告与 1 条信息，Vite 保留现有大分块提示。

使用独立应用标识 local.litthread.refactorqa 与 .qa/evidence-vault 完成桌面实测：中英文资源显示、中文输入、支持/反证计数、预览、原生 Markdown 新文件创建、关闭证据标签后的草稿恢复、打开对应论文与待发送的 AI 提示词。属性表单把 status 从 reading 改为 done 后，磁盘上的中文注释、其他字段引号与列表形式保留。未发送 AI 请求，未验证模型回答质量或远程知识库的证据笔记保存。

原生开发构建通过；测试日志、截图与演示知识库位于忽略的 .qa/，不纳入源码。参赛定位与来源说明集中维护在 [参赛准备](competition.md)，本轮未推送或发布。

### 同日第二轮：版面归属与发现页通信

将版面合并拆为规则、几何、图块、公式和执行器，执行器按页隔离并记录结果所使用的检测框。图块图遍历明确隔离页面；同分配对保持稳定；公式排序后再选基线。底层阈值与部分图块规则保留，不把文件迁移当成原创贡献。

发现页新增当前 iframe 身份和完整消息字段校验，Cool Papers 与 ModelScope 入库回执关联请求 ID；Cool Papers 适配器独立为 JavaScript，支持列表整体替换及中英文按钮。代理限定来源重定向、请求与响应大小及超时；HTML 只修改相关属性，保留正文、注释和脚本。移除 release 配置中没有本项目测量记录支持的历史体积注释，保留实际编译配置。

最终验证：类型、Biome、依赖分层、生产构建和 workspace Clippy 通过；Biome 保留 6 个既有警告与 1 条信息，Vite 保留现有分块提示。Vitest 为 141 个文件通过、1 个文件跳过，1196 项通过、5 项跳过；Rust workspace 为 892 项通过、13 项忽略。首次并行检查触发既有目录筛选性能门槛，降低并发重跑通过，未调整业务算法或性能门槛。Rust 初次检查发现引导模板数量断言仍为 3，更新为 4 并验证用户编辑过的证据指南不被覆盖；测试服务器按完整请求头读取，Clippy 的读取量检查未豁免。

隔离跨域 iframe 页面实测覆盖等待、旧回执拒绝、失败重试、成功回执、中英文切换、整段列表替换和编号链接与论文标题分离。查看当日公开列表结构，确认编号来源链接与标题元素；未完成三家上游服务的原生代理端到端验证。逐页结果与归属记录使用检测样例展示，不宣称重新测量真实论文版面准确率；未执行真实入库或 AI 请求。截图、页面样例与检查日志位于忽略的 .qa/。许可和 Git 历史保持不变，未提交、推送或发布。

### 同日第三轮：保留外观的小幅美化与图注整体分配

保留导航、布局和纸色主题，文献长标题改为两行，证据卡片增加轻微层次、关系边线和双语空状态。下拉框与页码输入统一高度。原生实测发现恢复标签后内容区需缩放才显示，在程序同步后的动画帧中按当前容器强制布局；隔离应用重启后自动显示已验证。

图注候选改用整体分配，先最大化可行配对数量，再优化总亲和分；位置、类别与阻隔门槛保留。新增冲突样例及覆盖 512 种小图的独立穷举对照，共新增 6 项测试。完整 Vitest 为 1202 项通过、5 项跳过；类型、格式、依赖分层与生产构建通过，保留既有构建分块提示。原生演示库完成中文浅色、英文深色、两行标题、文献选择、反证边线与重启恢复检查，截图及日志位于 .qa/。本轮未改 Rust、项目许可、技能许可或 Git 历史，未推送。

## 2026-10-13 去重、缩放与路径边界重构

版面去重先验证检测值，再按页与类别稳定排序并计算交集；同分候选不随输入顺序改变，零阈值也不抑制不相交的框。PDF 滚轮缩放保留小幅输入，单帧最多执行 32 步，重置和销毁可中断过期批次；无效 WebKit 缩放值不更新基线。Rust 双链路径保留未抵消的父级分量，统一 Windows 分隔符，阻止越界路径回退为库内同名文档。文献目录筛选把固定路径归一化与前缀计算移出逐行循环。

新增 19 项前端回归和 4 项 Rust 回归；Rust 越界测试遍历 5 种来源深度、5 种超出层数和两种链接语法。全量检查发现交叉引用测试样例缺少 `PdfLayoutRegion` 必需的 label、rect 和 readingOrder，已补齐样例，保留输入校验。初次全量运行中 PDF 解析超时，按原超时单独复测通过；目录筛选连续触发 100 ms 门槛，优化重复计算后原性能测试通过。没有调整超时、性能门槛或跳过配置。

最终 `pnpm exec vitest run --maxWorkers=1 --reporter=dot` 为 142 个文件通过、1 个文件跳过，1221 项通过、5 项跳过。TypeScript、Biome、依赖分层、Rust workspace 测试、rustfmt、Clippy 和生产构建通过。Biome 保留 6 个既有警告与 1 条信息，Vite 保留现有大分块提示，Vitest 有 Node localStorage 实验性提示。

使用独立标识 `local.litthread.refactor20261013` 和 `.qa/refactor-2026-10-13/vault` 实测原生界面：papers/nlp 筛选从 5 篇变为 3 篇，演示 PDF 与中文 Markdown 笔记正常显示。实际触控板捏合、线上 Agent 与远程服务未实测，不以单元测试代替这些结果。演示库、构建和测试日志在忽略的 `.qa/refactor-2026-10-13/` 中。项目署名沿用 Ustinian5，参赛材料记录具体贡献；第三方声明、项目许可和 Git 历史保留，未推送或发布。

## 2026-10-13 参赛视频实机验证

macOS 内置录屏对独立应用窗口捕获，剪辑并配中文说明旁白和字幕。独立知识库中完成两份自编中文 PDF 的导入、阅读、支持与反证录入、提示词检查、ACP / Codex 实际审查、Markdown 新文件保存、双链打开来源笔记及 PDF 复核。Agent 核实两条摘录和第 1 页，并指出功能样本不构成研究效果验证。Agent 未修改源资料；本次未评测模型准确率。

实测发现全中文文件名被压缩为同一 `paper` 标识，导致不同文献误合并。标识生成改为保留 Unicode 字母与数字，保留分隔符清理和长度限制；core 测试 413 项通过、3 项既有忽略，rustfmt、core Clippy 与原生构建通过。重新在空演示知识库导入，确认两个独立条目及对应 PDF。原始录屏、隔离环境和日志保存在忽略的 `.qa/contest2026/`，导出材料不提交源码；公开发布由用户明确授权。
