# 第三方技术与资源

LitThread 项目代码使用根目录的 [AGPL-3.0-only](../LICENSE)。第三方依赖、字体、代码片段和研究方法资源保留各自声明；项目许可不替代这些声明。

## 主要运行时依赖

以下版本和许可读取自 2026-10-13 按锁文件安装的包元数据。完整依赖版本以 `pnpm-lock.yaml`、`Cargo.lock` 为准，完整许可文本见相应发行包。

| 技术 | 已安装版本 | 包声明许可 | 在项目中的用途 |
| --- | --- | --- | --- |
| React / React DOM | 19.2.7 | MIT | 界面与交互 |
| Tauri JavaScript API | 2.11.1 | Apache-2.0 OR MIT | 原生接口调用 |
| Plate | 53.2.4 | MIT | Markdown 编辑器 |
| Dockview | 7.0.4 | MIT | 文档标签和分屏 |
| EmbedPDF core / PDFium 包装包 | 2.14.4 | MIT | PDF 阅读与渲染接入；PDFium 本体保留其分发声明 |
| shadcn | 4.13.0 | MIT | 界面组件工具 |
| AI SDK | 7.0.26 | Apache-2.0 | AI 消息与流式界面支持 |
| ONNX Runtime Web | 1.27.0 | MIT | 浏览器端推理运行时 |
| Geist 字体 | 5.2.9 | OFL-1.1 | 界面字体 |

Rust 和原生依赖的版本由 `Cargo.lock` 固定。构建时下载的 PDFium、OCR 与版面模型也使用其发行方的许可和使用条件；这些模型及引擎不作为团队训练成果申报。

## 随源码保留的来源说明

- `src/components/ai-elements/prompt-input.tsx` 保留 AI Elements 输入组件的本地 fork 说明。
- `src-tauri/src/features/agent/registry/lifecycle.rs` 保留 CC Switch 工具生命周期模式的来源注释。
- `patches/` 中的依赖补丁保留在源码中，并由 pnpm 锁文件关联。
- `templates/vault/.agents/skills/idea-evaluator` 与 `deep-research` 的研究方法资源来自 HKUSTDial/Supervisor-Skills，署名 Yuyu Luo 等，许可为 **CC BY-NC-SA 4.0**。该许可独立于项目代码许可，详见[技能说明及许可文本](../templates/vault/.agents/skills/README.md)。

## 参赛演示材料

参赛视频中的两份 PDF 是 Ustinian5 署名的自编功能演示样本，明确标注“非研究论文”，不包含真实用户数据，不用于证明研究效果。视频所用 Codex ACP 适配器为单独安装的测试工具，不随本次源码提交分发；模型服务按用户配置运行。实际演示环境、验证范围和作品材料见[参赛说明](competition.md)。
